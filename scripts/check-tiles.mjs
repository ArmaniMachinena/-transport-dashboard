// Проверка всех подложек и слоёв из каталога: запрашивает по одному тайлу над Казахстаном,
// печатает статус и собирает контрольный лист из тайлов (shots/tiles.jpg).
// Использование: node scripts/check-tiles.mjs [папка для тайлов]
import { CATALOG, defaultGibsDate } from "../_src/assets/layers.js";
import { writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";

const OUT = process.argv[2] || "tiles";
await mkdir(OUT, { recursive: true });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const REF = process.env.SITE_URL || "https://armanimachinena.github.io/-transport-dashboard/";
const KEYS = { carto: process.env.CARTO_KEY, owm: process.env.OWM_KEY, tomtom: process.env.TOMTOM_KEY, thunderforest: process.env.TF_KEY, stadia: process.env.STADIA_KEY };
const date = process.env.GIBS_DATE || defaultGibsDate();

const tileXY = (lat, lon, z) => { const n = 2 ** z; const x = Math.floor(((lon + 180) / 360) * n); const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n); return [x, y]; };

// RainViewer: пути последних кадров
let rv = {};
try {
  const j = await (await fetch("https://api.rainviewer.com/public/weather-maps.json")).json();
  rv.radar = j.radar?.past?.at(-1)?.path; rv.ir = j.satellite?.infrared?.at(-1)?.path;
  console.log("RainViewer:", JSON.stringify({ host: j.host, keys: Object.keys(j), radar: rv.radar, ir: rv.ir, radarCount: j.radar?.past?.length, irCount: j.satellite?.infrared?.length }));
} catch (e) { console.log("RainViewer: ошибка", e.message); }

// NASA GIBS: какие слои реально есть (ищем по ключевым словам в GetCapabilities)
try {
  const xml = await (await fetch("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml")).text();
  const want = /Land_Surface_Temp|Snow_Cover|Thermal_Anomalies_375m|Aerosol|DayNightBand|Sea_Surface_Temperature|CorrectedReflectance_TrueColor|IMERG|Surface_Air_Temperature|Coastlines|BlueMarble|Cloud_Top_Temp|Precipitation_Rate/;
  const layers = [...xml.matchAll(/<Layer>([\s\S]*?)<\/Layer>/g)].map((m) => m[1]);
  console.log(`GIBS: слоёв всего ${layers.length}; подходящие:`);
  for (const l of layers) {
    const id = l.match(/<ows:Identifier>([^<]+)<\/ows:Identifier>/)?.[1];
    if (!id || !want.test(id)) continue;
    const tms = l.match(/<TileMatrixSet>([^<]+)<\/TileMatrixSet>/)?.[1], fmt = l.match(/<Format>([^<]+)<\/Format>/)?.[1];
    const dim = l.match(/<Dimension>[\s\S]*?<Default>([^<]*)<\/Default>[\s\S]*?<\/Dimension>/)?.[1] ?? "static";
    console.log(`  ${id} | ${tms} | ${fmt} | default time: ${dim}`);
  }
} catch (e) { console.log("GIBS capabilities: ошибка", e.message); }

const rows = [], files = [];
for (const L of CATALOG) {
  if (!L.url) continue;
  if (L.key && !KEYS[L.key]) { rows.push([L.id, "ключ не задан", "", ""]); continue; }
  // точка и зум для теста
  let [lat, lon] = [44.5, 76.2]; // Алматинская область: горы, снег, дороги
  let z = Math.min(L.native ?? 12, 7);
  if (/sst|openseamap|ocean/.test(L.id)) { [lat, lon] = [42.9, 50.9]; z = Math.min(L.native ?? 9, 8); }
  if (/^rv-/.test(L.id)) z = 5;
  if (/traffic|tomtom|g-roads/.test(L.id)) { [lat, lon] = [43.24, 76.9]; z = 12; }
  if (/^orm|opnv|cyclosm|esri-transport|esri-places|eox-overlay/.test(L.id)) { [lat, lon] = [43.3, 76.9]; z = 9; }
  const [x, y] = tileXY(lat, lon, z);
  const url = L.url.replace("{s}", (L.sub || "a")[0]).replace("{z}", z).replace("{x}", x).replace("{y}", y).replace("{r}", "").replace("{date}", date).replace("{key}", KEYS[L.key] || "").replace("{rv}", rv[L.rv] || "");
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: REF, Accept: "image/*,*/*" }, signal: AbortSignal.timeout(30000) });
    const ct = r.headers.get("content-type") || "", buf = Buffer.from(await r.arrayBuffer());
    const ok = r.ok && /image\//.test(ct) && buf.length > 0;
    rows.push([L.id, r.status, ct.split(";")[0], buf.length]);
    if (ok) { const f = `${OUT}/${L.id}.${/png/.test(ct) ? "png" : "jpg"}`; await writeFile(f, buf); files.push([L.id, f]); }
    else if (!r.ok) rows[rows.length - 1].push(buf.toString("utf8").slice(0, 120).replace(/\s+/g, " "));
  } catch (e) { rows.push([L.id, "ошибка", e.message, ""]); }
  await new Promise((r) => setTimeout(r, 150));
}
console.log("\nРезультаты (id | статус | тип | байт):");
for (const r of rows) console.log("  " + r.join(" | "));

// Контрольный лист
try {
  const args = files.map(([id, f]) => `-label '${id}' '${f}'`).join(" ");
  execSync(`montage ${args} -tile 6x -geometry 170x170+6+6 -background '#223' -fill '#fff' -pointsize 13 ${OUT}/sheet.png && convert ${OUT}/sheet.png -quality 70 ${OUT}/sheet.jpg`, { stdio: "inherit", shell: "/bin/bash" });
  console.log("Контрольный лист собран:", `${OUT}/sheet.jpg`);
} catch (e) { console.log("montage не удался:", e.message); }

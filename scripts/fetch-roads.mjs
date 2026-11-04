// Загрузка реальной геометрии магистральных дорог РК из OpenStreetMap (Overpass API).
// Запускается раз в неделю, результат сохраняется в data/roads.json.
import { writeFile, mkdir } from "node:fs/promises";

const OUT = process.argv[2] || "data/roads.json";
const Q = `[out:json][timeout:300];
area["ISO3166-1"="KZ"][admin_level=2]->.kz;
way["highway"~"^(motorway|trunk|primary)$"](area.kz);
out tags geom;`;
const HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

// Упрощение линии (Дуглас – Пекер), допуск в градусах
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

let data, used;
for (const h of HOSTS) {
  try {
    const r = await fetch(h, { method: "POST", body: new URLSearchParams({ data: Q }), headers: { "User-Agent": "mintrans-dashboard/1.0" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    data = await r.json(); used = h; break;
  } catch (e) { console.log("✗", h, e.message); }
}
if (!data) { console.error("Overpass недоступен"); process.exit(1); }

const rank = { motorway: 0, trunk: 0, primary: 1 };
const ways = [];
for (const el of data.elements) {
  if (el.type !== "way" || !el.geometry) continue;
  const pts = simplify(el.geometry.map((g) => [g.lat, g.lon]), 0.003).map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);
  if (pts.length < 2) continue;
  const t = el.tags || {};
  ways.push([(t.ref || "").split(";")[0].trim(), rank[t.highway] ?? 1, (t["name:ru"] || t.name || "").slice(0, 80), pts.flat()]);
}
await mkdir(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
await writeFile(OUT, JSON.stringify({ t: Math.round(Date.now() / 1000), src: used, ways }));
console.log(`Сохранено ${ways.length} участков дорог из ${used}`);

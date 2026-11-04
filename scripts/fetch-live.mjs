// Сбор живых данных для дашборда. Запускается в GitHub Actions каждые ~10 минут.
// Каждый источник независим: если один упал, остальные всё равно сохраняются.
// Использование: node scripts/fetch-live.mjs <папка вывода>
import { writeFile, mkdir } from "node:fs/promises";
import { AIRPORTS, BBOX, weatherPoints } from "../assets/config.js";

const OUT = process.argv[2] || "_site/data";
const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");
const UA = "mintrans-dashboard/1.0 (+https://github.com)";
const status = { generated: new Date().toISOString(), sources: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = true, timeout = 30000, headers = {}, method, body } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { method, body, signal: c.signal, headers: { "User-Agent": UA, ...headers } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return json ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
async function save(name, data) { await writeFile(`${OUT}/${name}`, JSON.stringify(data)); }
async function source(name, file, fn) {
  const t0 = Date.now();
  try {
    const info = (await fn()) || {};
    status.sources[name] = { ok: true, at: new Date().toISOString(), ms: Date.now() - t0, ...info };
    console.log(`✓ ${name}`, info);
  } catch (e) {
    status.sources[name] = { ok: false, at: new Date().toISOString(), error: String(e.message || e) };
    console.log(`✗ ${name}: ${e.message || e}`);
    const p = await previous(file); // оставляем последние удачные данные
    if (p) { await save(file, p); status.sources[name].kept = p.t; }
  }
}
// Прошлый файл с опубликованного сайта (чтобы не дёргать API чаще, чем нужно)
async function previous(name) {
  if (!SITE) return null;
  try { return await get(`${SITE}/data/${name}?t=${Date.now()}`, { timeout: 15000 }); } catch { return null; }
}
const inBox = (lat, lon) => lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax;

await mkdir(OUT, { recursive: true });

// ---------- 1. Самолёты: OpenSky + adsb.lol + adsb.fi ----------
await source("flights", "flights.json", async () => {
  const ac = new Map(); // hex -> запись
  const used = [], errors = [];
  const put = (a) => { if (!inBox(a.lat, a.lon)) return; const o = ac.get(a.hex); if (!o || a.t > o.t) ac.set(a.hex, a); };

  // OpenSky (анонимно или с ключом OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET)
  try {
    const headers = {};
    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      const tok = await get("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.OPENSKY_CLIENT_ID, client_secret: process.env.OPENSKY_CLIENT_SECRET })
      });
      headers.Authorization = `Bearer ${tok.access_token}`;
    }
    const d = await get(`https://opensky-network.org/api/states/all?lamin=${BBOX.latMin}&lomin=${BBOX.lonMin}&lamax=${BBOX.latMax}&lomax=${BBOX.lonMax}&extended=1`, { headers, timeout: 40000 });
    for (const s of d.states || []) {
      if (s[5] == null || s[6] == null) continue;
      put({ hex: s[0], cs: (s[1] || "").trim(), lat: s[6], lon: s[5], alt: s[13] ?? s[7], gs: s[9], trk: s[10], vr: s[11], gnd: !!s[8], cty: s[2], sq: s[14], t: s[3] || d.time, src: "OpenSky" });
    }
    used.push("OpenSky");
  } catch (e) { errors.push("OpenSky: " + e.message); }

  // Сообщества ADS-B: круги радиусом 250 морских миль, покрывающие РК
  const centers = [[51,51],[46.5,52.5],[43.5,53],[50.5,58],[46,60],[53,64],[45,66],[49.5,66.5],[43,70.5],[51.5,70],[47.5,72.5],[53,76],[44,76.5],[48,78.5],[50,83],[45.5,82.5]];
  for (const [host, label] of [["https://api.adsb.lol/v2", "adsb.lol"], ["https://opendata.adsb.fi/api/v2", "adsb.fi"]]) {
    let ok = 0;
    for (const [la, lo] of centers) {
      try {
        const d = await get(`${host}/lat/${la}/lon/${lo}/dist/250`, { timeout: 20000 });
        const now = (d.now || Date.now()) / 1000;
        for (const a of d.ac || d.aircraft || []) {
          if (a.lat == null || a.lon == null) continue;
          const gnd = a.alt_baro === "ground";
          put({ hex: a.hex, cs: (a.flight || "").trim(), lat: a.lat, lon: a.lon, alt: gnd ? 0 : (a.alt_geom ?? a.alt_baro ?? 0) * 0.3048,
            gs: a.gs != null ? a.gs * 0.514444 : null, trk: a.track ?? a.true_heading ?? null, vr: a.baro_rate != null ? a.baro_rate * 0.00508 : null,
            gnd, reg: a.r, type: a.t, sq: a.squawk, t: Math.round(now - (a.seen_pos || 0)), src: label });
        }
        ok++;
      } catch (e) { if (!ok) { errors.push(`${label}: ${e.message}`); break; } }
      await sleep(1100);
    }
    if (ok) used.push(label);
  }
  if (!used.length) throw new Error(errors.join("; "));
  const list = [...ac.values()];
  await save("flights.json", { t: Math.round(Date.now() / 1000), sources: used, ac: list });
  return { count: list.length, used: used.join(", "), errors: errors.length ? errors.join("; ") : undefined };
});

// ---------- 2. METAR по аэропортам (aviationweather.gov, NOAA) ----------
await source("metar", "metar.json", async () => {
  const ids = AIRPORTS.map((a) => a.icao).join(",");
  const d = await get(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json&hours=3`);
  const last = {};
  for (const m of d) { const id = m.icaoId; const t = m.obsTime || Date.parse(m.reportTime) / 1000; if (!last[id] || t > last[id].obsTime) last[id] = { ...m, obsTime: t }; }
  const out = Object.values(last).map((m) => ({ icao: m.icaoId, t: m.obsTime, temp: m.temp, dewp: m.dewp, wdir: m.wdir, wspd: m.wspd, wgst: m.wgst,
    visib: m.visib, wx: m.wxString || "", clouds: (m.clouds || []).map((c) => [c.cover, c.base]), vv: m.vertVis ?? null, raw: m.rawOb, cat: m.fltCat || null }));
  await save("metar.json", { t: Math.round(Date.now() / 1000), metar: out });
  return { count: out.length };
});

// ---------- 3. Погода по сетке и городам (Open-Meteo) ----------
await source("weather", "weather.json", async () => {
  const prev = await previous("weather.json");
  if (prev && Date.now() / 1000 - prev.t < 25 * 60) { await save("weather.json", prev); return { count: prev.points.length, reused: true }; }
  const pts = weatherPoints();
  const vars = "temperature_2m,relative_humidity_2m,precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,visibility";
  const out = [];
  for (let i = 0; i < pts.length; i += 60) {
    const chunk = pts.slice(i, i + 60);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${chunk.map((p) => p.lat).join(",")}&longitude=${chunk.map((p) => p.lon).join(",")}&current=${vars}&wind_speed_unit=ms`;
    let d = await get(url, { timeout: 40000 });
    if (!Array.isArray(d)) d = [d];
    d.forEach((r, k) => { const c = r.current || {}; out.push({ id: chunk[k].id, lat: chunk[k].lat, lon: chunk[k].lon,
      T: c.temperature_2m, rh: c.relative_humidity_2m, pr: c.precipitation, sn: c.snowfall, wc: c.weather_code, ws: c.wind_speed_10m, wg: c.wind_gusts_10m, vis: c.visibility }); });
    await sleep(500);
  }
  await save("weather.json", { t: Math.round(Date.now() / 1000), points: out });
  return { count: out.length };
});

// ---------- 4. Землетрясения (USGS) ----------
await source("quakes", "quakes.json", async () => {
  const d = await get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson");
  const q = d.features.filter((f) => { const [lon, lat] = f.geometry.coordinates; return lat > 37 && lat < 58 && lon > 44 && lon < 90; })
    .map((f) => ({ id: f.id, mag: f.properties.mag, place: f.properties.place, t: Math.round(f.properties.time / 1000), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2], url: f.properties.url }));
  await save("quakes.json", { t: Math.round(Date.now() / 1000), quakes: q });
  return { count: q.length };
});

// ---------- 5. Суда на Каспии (aisstream.io, нужен бесплатный ключ AISSTREAM_KEY) ----------
await source("ships", "ships.json", async () => {
  const key = process.env.AISSTREAM_KEY;
  if (!key) { await save("ships.json", { t: Math.round(Date.now() / 1000), ships: [], note: "нет ключа AISSTREAM_KEY" }); return { count: 0, note: "нет ключа" }; }
  const ships = new Map();
  await new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    const stop = setTimeout(() => { ws.close(); resolve(); }, 60000);
    ws.onopen = () => ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[36.5, 46.5], [47.5, 55.5]]], FilterMessageTypes: ["PositionReport", "ShipStaticData"] }));
    ws.onerror = (e) => { clearTimeout(stop); reject(new Error("websocket error")); };
    ws.onmessage = async (ev) => {
      const m = JSON.parse(typeof ev.data === "string" ? ev.data : await ev.data.text());
      const meta = m.MetaData || {}; const id = meta.MMSI; if (!id) return;
      const s = ships.get(id) || { mmsi: id };
      s.name = (meta.ShipName || s.name || "").trim();
      if (m.MessageType === "PositionReport") { const p = m.Message.PositionReport; Object.assign(s, { lat: p.Latitude, lon: p.Longitude, sog: p.Sog, cog: p.Cog, t: Math.round(Date.parse(meta.time_utc) / 1000) || Math.round(Date.now() / 1000) }); }
      if (m.MessageType === "ShipStaticData") { const p = m.Message.ShipStaticData; s.type = p.Type; s.dest = (p.Destination || "").trim(); }
      ships.set(id, s);
    };
  });
  const list = [...ships.values()].filter((s) => s.lat != null);
  await save("ships.json", { t: Math.round(Date.now() / 1000), ships: list });
  return { count: list.length };
});

await save("status.json", status);
console.log("Готово:", Object.entries(status.sources).map(([k, v]) => `${k}:${v.ok ? "ok" : "fail"}`).join(" "));

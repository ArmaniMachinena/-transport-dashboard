// Ситуационный центр Минтранса — клиентская часть.
import { AIRPORTS, CITIES, PORTS, BORDERS, PIPES, ROAD_CORRIDORS, CLOSED_SOURCES, GRID, dataBases } from "./config.js";

// ================= утилиты =================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const now = () => Date.now() / 1000;
const TZ = "Asia/Almaty";
const fmtT = (sec) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(sec * 1000));
const fmtDT = (sec) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(sec * 1000));
const ago = (sec) => { if (!sec) return "—"; const m = Math.round((now() - sec) / 60); return m < 1 ? "только что" : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`; };
const sgn = (t) => (t == null ? "—" : (t > 0 ? "+" : "") + Math.round(t) + "°");
const km = (a, b, c, d) => { const R = 6371, p = Math.PI / 180, x = (d - b) * p * Math.cos(((a + c) / 2) * p), y = (c - a) * p; return R * Math.hypot(x, y); };
const store = { get(k, d) { try { const v = localStorage.getItem("mt_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem("mt_" + k, JSON.stringify(v)); } catch {} } };
const SEVC = ["var(--s0)", "var(--s1)", "var(--s2)", "var(--s3)"];
const SEVHEX = ["#4cc38a", "#c8c64e", "#e8973a", "#ef5b4c"];
const sevColor = (s) => (s < 0 ? "var(--sx)" : SEVC[s]);
const pill = (s, text) => `<span class="pill ${s < 0 ? "px" : "p" + s}">${esc(text)}</span>`;

const WMO = { 0: "ясно", 1: "преимущественно ясно", 2: "переменная облачность", 3: "пасмурно", 45: "туман", 48: "туман с изморозью", 51: "слабая морось", 53: "морось", 55: "сильная морось", 56: "ледяная морось", 57: "ледяная морось", 61: "слабый дождь", 63: "дождь", 65: "сильный дождь", 66: "ледяной дождь", 67: "сильный ледяной дождь", 71: "слабый снег", 73: "снег", 75: "сильный снег", 77: "снежные зёрна", 80: "ливень", 81: "ливень", 82: "сильный ливень", 85: "снегопад", 86: "сильный снегопад", 95: "гроза", 96: "гроза с градом", 99: "гроза с градом" };

// Оценка условий на дороге по погоде в точке
function risk(p) {
  if (!p || p.T == null) return { sev: -1, label: "нет данных" };
  const wc = p.wc, g = p.wg ?? p.ws ?? 0;
  const snowy = [71, 73, 75, 77, 85, 86].includes(wc) || p.sn > 0;
  const freezing = [56, 57, 66, 67].includes(wc);
  const wet = p.pr > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(wc);
  if (snowy && g >= 15) return { sev: 3, label: "метель" };
  if (freezing) return { sev: 3, label: "ледяной дождь" };
  if (p.vis != null && p.vis < 300) return { sev: 3, label: "густой туман" };
  if (p.T <= 1 && p.T >= -5 && (wet || snowy || p.rh >= 96)) return { sev: 2, label: "риск гололёда" };
  if (snowy) return { sev: 2, label: "снегопад" };
  if (g >= 20) return { sev: 2, label: "сильный ветер" };
  if ((p.vis != null && p.vis < 1500) || wc === 45 || wc === 48) return { sev: 1, label: "туман" };
  if (p.T <= -25) return { sev: 1, label: "сильный мороз" };
  if (wet) return { sev: 1, label: "осадки" };
  if (g >= 14) return { sev: 1, label: "ветер" };
  return { sev: 0, label: "норма" };
}

// Категория аэродрома по METAR
function metarInfo(m) {
  if (!m) return { sev: -1, cat: "—", label: "нет сводки" };
  let vis = typeof m.visib === "string" ? parseFloat(m.visib.replace("+", "")) : m.visib;
  let ceil = Infinity;
  for (const [cov, base] of m.clouds || []) if (["BKN", "OVC", "OVX"].includes(cov) && base != null) ceil = Math.min(ceil, base);
  if (m.vv != null) ceil = Math.min(ceil, m.vv < 60 ? m.vv * 100 : m.vv);
  let cat = m.cat;
  if (!cat) cat = vis < 1 || ceil < 500 ? "LIFR" : vis < 3 || ceil < 1000 ? "IFR" : vis <= 5 || ceil <= 3000 ? "MVFR" : "VFR";
  const sev = { VFR: 0, MVFR: 1, IFR: 2, LIFR: 3 }[cat] ?? -1;
  const label = { VFR: "норма", MVFR: "ограниченная видимость", IFR: "полёты по приборам", LIFR: "ниже метеоминимумов" }[cat] || "—";
  const stale = now() - m.t > 3 * 3600;
  return { sev: stale ? -1 : sev, cat, label: stale ? "сводка устарела" : label, visKm: vis != null && !isNaN(vis) ? vis * 1.609 : null, ceilM: isFinite(ceil) ? ceil * 0.3048 : null, stale };
}
const tempColor = (t) => {
  const st = [[-30, [59, 76, 192]], [-15, [106, 139, 239]], [-5, [159, 195, 245]], [0, [223, 231, 238]], [10, [243, 201, 139]], [20, [238, 138, 84]], [32, [200, 64, 47]]];
  if (t <= st[0][0]) return `rgb(${st[0][1]})`; if (t >= st[st.length - 1][0]) return `rgb(${st[st.length - 1][1]})`;
  for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const [a, ca] = st[i - 1], [b, cb] = st[i], f = (t - a) / (b - a); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * f))})`; }
};

// ================= данные =================
const D = { flights: null, metar: null, weather: null, quakes: null, ships: null, status: null, roads: null };
const planes = new Map(); // hex -> {..., marker}
let direct = { tried: false, ok: false, at: 0 };
const DATA_BASES = dataBases();
let dataFrom = "";
async function getJSON(name) {
  let err;
  for (const b of name === "roads.json" ? ["data/"] : DATA_BASES) {
    try { const r = await fetch(`${b}${name}?t=${Date.now()}`, { cache: "no-store" }); if (!r.ok) throw new Error(r.status); const j = await r.json(); if (name === "status.json") dataFrom = b; return j; }
    catch (e) { err = e; }
  }
  throw err;
}

// ================= карта =================
const map = L.map("map", { preferCanvas: true, zoomSnap: 0.25, minZoom: 3, maxZoom: 14, attributionControl: true });
map.fitBounds([[40.6, 46.5], [55.4, 87.3]]);
const canvas = L.canvas({ padding: 0.3 });
const svgR = L.svg({ padding: 0.3 });
const BASES = {
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19, attribution: "© OpenStreetMap, © CARTO" }),
  sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "Esri World Imagery" }),
  osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" })
};
let base = store.get("base", "dark"); if (!BASES[base]) base = "dark"; BASES[base].addTo(map);

const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const LAYERS = {
  planes: { name: "Самолёты", group: L.layerGroup(), on: true },
  airports: { name: "Аэропорты", group: L.layerGroup(), on: true },
  roads: { name: "Дороги", group: L.layerGroup(), on: true },
  temp: { name: "Температура", group: L.layerGroup(), on: false },
  rail: { name: "ЖД", group: L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", { subdomains: "abc", maxZoom: 19, opacity: 0.75, attribution: "OpenRailwayMap" }), on: false },
  nasa: { name: "Снимок NASA", group: L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, { maxNativeZoom: 9, maxZoom: 14, opacity: 0.85, attribution: "NASA GIBS / VIIRS" }), on: false },
  pipes: { name: "Трубопроводы", group: L.layerGroup(), on: false },
  quakes: { name: "Сейсмика", group: L.layerGroup(), on: true },
  ships: { name: "Суда", group: L.layerGroup(), on: true },
  borders: { name: "Границы", group: L.layerGroup(), on: true },
  traffic: { name: "Пробки", group: null, on: false }
};
const saved = store.get("layers", null);
if (saved) for (const k in LAYERS) if (k in saved) LAYERS[k].on = saved[k];
const cityLayer = L.layerGroup().addTo(map);
function trafficLayer() {
  const key = store.get("tomtom", "");
  if (!key) return null;
  if (!LAYERS.traffic.group || LAYERS.traffic.key !== key) {
    LAYERS.traffic.group = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`, { maxZoom: 18, opacity: 0.9, attribution: "TomTom Traffic" });
    LAYERS.traffic.key = key;
  }
  return LAYERS.traffic.group;
}
function applyLayers() {
  for (const [k, l] of Object.entries(LAYERS)) {
    const g = k === "traffic" ? trafficLayer() : l.group;
    if (!g) continue;
    if (l.on && !map.hasLayer(g)) g.addTo(map);
    if (!l.on && map.hasLayer(g)) map.removeLayer(g);
  }
  store.set("layers", Object.fromEntries(Object.entries(LAYERS).map(([k, l]) => [k, l.on])));
  renderLayerBar(); renderLegend();
}
function renderLayerBar() {
  $("layers").innerHTML = Object.entries(LAYERS).map(([k, l]) => `<button type="button" data-layer="${k}" aria-pressed="${l.on}">${l.name}</button>`).join("") +
    `<span class="sep"></span>` + [["dark", "Схема"], ["sat", "Спутник"], ["osm", "OSM"]].map(([k, n]) => `<button type="button" data-base="${k}" aria-pressed="${base === k}">${n}</button>`).join("");
}
function renderLegend() {
  const parts = [];
  if (LAYERS.roads.on) parts.push(`<span>Дороги по погоде:</span><span><i style="background:var(--s0)"></i>норма</span><span><i style="background:var(--s1)"></i>осадки/ветер</span><span><i style="background:var(--s2)"></i>гололёд/снег</span><span><i style="background:var(--s3)"></i>метель/лёд</span>`);
  if (LAYERS.airports.on) parts.push(`<span>Аэропорты: кольцо по METAR</span>`);
  if (LAYERS.temp.on) parts.push(`<span><i style="background:linear-gradient(90deg,${tempColor(-25)},${tempColor(0)},${tempColor(25)})"></i>−25° … +25°</span>`);
  if (LAYERS.rail.on) parts.push(`<span><i style="background:#ff8100"></i>ЖД магистрали (OpenRailwayMap)</span>`);
  $("legend").innerHTML = parts.join("") || "<span>Слои выключены</span>";
  $("legend").hidden = !parts.length;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-layer]");
  if (b) {
    const k = b.dataset.layer;
    if (k === "traffic" && !store.get("tomtom", "")) { go({ sector: "sources" }); setTimeout(() => $("tomtomKey")?.focus(), 50); return; }
    LAYERS[k].on = !LAYERS[k].on; applyLayers(); return;
  }
  const bb = e.target.closest("[data-base]");
  if (bb) { map.removeLayer(BASES[base]); base = bb.dataset.base; BASES[base].addTo(map); BASES[base].bringToBack(); store.set("base", base); renderLayerBar(); }
});
map.on("zoomend", () => document.body.classList.toggle("zoom-low", map.getZoom() < 5));
document.body.classList.toggle("zoom-low", map.getZoom() < 5);

// ---------- статичные слои ----------
PIPES.forEach((p) => {
  L.polyline(p.pts, { renderer: svgR, color: "#b98cf0", weight: 2.4, opacity: 0.85, className: "pipe-flow" })
    .bindTooltip(`${esc(p.name)} · ${p.kind} (схема)`, { className: "tip", sticky: true }).addTo(LAYERS.pipes.group);
});
BORDERS.forEach((b, i) => {
  L.marker([b.lat, b.lon], { icon: L.divIcon({ className: "", html: '<div class="diamond"></div>', iconSize: [12, 12] }), keyboard: false })
    .bindTooltip(`Пункт пропуска ${esc(b.name)} · ${esc(b.cty)}`, { className: "tip" }).on("click", () => go({ sector: "borders", obj: { type: "border", i } })).addTo(LAYERS.borders.group);
});
PORTS.forEach((p, i) => {
  L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: '<div class="portmk"></div>', iconSize: [12, 12] }) })
    .bindTooltip(esc(p.name), { className: "tip" }).on("click", () => go({ sector: "sea", obj: { type: "port", i } })).addTo(LAYERS.ships.group);
});

// ================= слой погоды и дорог =================
let W = { byId: {}, grid: {} };
function indexWeather() {
  W = { byId: {}, grid: {}, list: D.weather?.points || [] };
  for (const p of W.list) { p.risk = risk(p); W.byId[p.id] = p; if (p.id.startsWith("g")) W.grid[p.id] = p; }
}
function nearestWeather(lat, lon) {
  const i = Math.round((lat - 41) / GRID.dLat), j = Math.round((lon - 47) / GRID.dLon);
  let best = null, bd = Infinity;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const p = W.grid[`g${41 + (i + di) * GRID.dLat}_${47 + (j + dj) * GRID.dLon}`];
    if (p) { const d = km(lat, lon, p.lat, p.lon); if (d < bd) { bd = d; best = p; } }
  }
  for (const c of CITIES) { const p = W.byId[c.id]; if (!p) continue; const d = km(lat, lon, p.lat, p.lon); if (d < bd * 0.8 && d < 60) { bd = d; best = p; } }
  if (!best) for (const p of W.list) { const d = km(lat, lon, p.lat, p.lon); if (d < bd) { bd = d; best = p; } }
  return best;
}
function drawTemp() {
  LAYERS.temp.group.clearLayers();
  for (const p of W.list) {
    if (!p.id.startsWith("g") || p.T == null) continue;
    L.rectangle([[p.lat - GRID.dLat / 2, p.lon - GRID.dLon / 2], [p.lat + GRID.dLat / 2, p.lon + GRID.dLon / 2]], { renderer: canvas, stroke: false, fillColor: tempColor(p.T), fillOpacity: 0.38, interactive: true })
      .bindTooltip(`${sgn(p.T)} · ${WMO[p.wc] || ""} · ветер ${Math.round(p.ws ?? 0)} м/с`, { className: "tip", sticky: true })
      .on("click", () => go({ sector: "weather", obj: { type: "wpt", id: p.id } })).addTo(LAYERS.temp.group);
  }
}
function drawCities() {
  cityLayer.clearLayers();
  for (const c of CITIES) {
    const w = W.byId[c.id], r = w ? w.risk : { sev: -1 };
    L.marker([c.lat, c.lon], { icon: L.divIcon({ className: "", html: `<div class="city ${c.big ? "big" : ""}"><b>${esc(c.name)}</b><span class="t r${Math.max(0, r.sev)}">${w ? sgn(w.T) : ""}${r.sev >= 2 ? " · " + r.label : ""}</span></div>`, iconSize: [0, 0] }), keyboard: false })
      .on("click", () => go({ sector: "weather", obj: { type: "wpt", id: c.id } })).addTo(cityLayer);
    L.circleMarker([c.lat, c.lon], { renderer: canvas, radius: c.big ? 3 : 2, color: "#e3ecec", weight: 0, fillColor: "#e3ecec", fillOpacity: 1, interactive: false }).addTo(cityLayer);
  }
}

// Дороги: каждая трасса режется на куски по ячейкам погоды и красится по риску
let ROADS = { refs: new Map(), total: 0, fromOSM: false };
let roadHL = null;
function buildRoads() {
  LAYERS.roads.group.clearLayers();
  const refs = new Map();
  const addRef = (ref, name) => { const k = ref || name || "без номера"; if (!refs.has(k)) refs.set(k, { ref: k, name: name || "", km: [0, 0, 0, 0], reasons: {}, pieces: [], hot: [], bounds: null }); return refs.get(k); };
  const ways = [];
  if (D.roads?.ways?.length) {
    ROADS.fromOSM = true;
    for (const [ref, rank, name, flat] of D.roads.ways) { const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]); ways.push({ ref, rank, name, pts }); }
  } else {
    ROADS.fromOSM = false;
    const C = Object.fromEntries(CITIES.map((c) => [c.id, c]));
    for (const [name, ids] of ROAD_CORRIDORS) ways.push({ ref: name.split(" ")[0], rank: 0, name: name.replace(/^\S+\s/, ""), pts: ids.map((id) => [C[id].lat, C[id].lon]) });
  }
  let total = 0;
  for (const w of ways) {
    if (!w.ref && w.rank > 0) w.ref = ""; // безномерные второстепенные
    const R0 = addRef(w.ref, w.name);
    if (!R0.name && w.name) R0.name = w.name;
    // для резервной схемы вставим промежуточные точки, чтобы погода менялась вдоль трассы
    let pts = w.pts;
    if (!ROADS.fromOSM) { const dense = []; for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]]; const n = Math.max(1, Math.round(km(a[0], a[1], b[0], b[1]) / 40)); for (let k = 0; k < n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } dense.push(pts[pts.length - 1]); pts = dense; }
    let cur = null, chunk = [], curW = null;
    const flush = () => {
      if (chunk.length < 2) return;
      const r = curW ? curW.risk : { sev: -1, label: "нет данных" };
      let L0 = 0; for (let i = 1; i < chunk.length; i++) L0 += km(chunk[i - 1][0], chunk[i - 1][1], chunk[i][0], chunk[i][1]);
      total += L0; if (r.sev >= 0) { R0.km[r.sev] += L0; R0.reasons[r.label] = (R0.reasons[r.label] || 0) + L0; }
      if (r.sev >= 2 && curW && !R0.hot.includes(curW)) R0.hot.push(curW);
      const line = L.polyline(chunk, { renderer: canvas, color: r.sev < 0 ? "#6b7f84" : SEVHEX[r.sev], weight: w.rank === 0 ? 3 : 1.8, opacity: w.rank === 0 ? 0.95 : 0.75 })
        .bindTooltip(`${esc(R0.ref)}${R0.name ? " · " + esc(R0.name) : ""}<br>${esc(r.label)}${curW ? " · " + sgn(curW.T) + ", ветер " + Math.round(curW.wg ?? curW.ws ?? 0) + " м/с" : ""}`, { className: "tip", sticky: true })
        .on("click", () => go({ sector: "roads", obj: { type: "road", ref: R0.ref } }));
      line.addTo(LAYERS.roads.group); R0.pieces.push(line);
    };
    for (const p of pts) {
      const wp = W.list.length ? nearestWeather(p[0], p[1]) : null;
      const key = wp ? wp.id : "none";
      if (key !== cur) { if (chunk.length) { chunk.push(p); flush(); chunk = [p]; } else chunk.push(p); cur = key; curW = wp; }
      else chunk.push(p);
    }
    flush();
  }
  for (const r of refs.values()) { const b = L.latLngBounds([]); r.pieces.forEach((l) => b.extend(l.getBounds())); r.bounds = b; r.total = r.km.reduce((a, b) => a + b, 0); r.worst = r.km[3] > 1 ? 3 : r.km[2] > 1 ? 2 : r.km[1] > 1 ? 1 : 0; }
  ROADS = { refs, total, fromOSM: ROADS.fromOSM };
}
function highlightRoad(ref) {
  if (roadHL) { map.removeLayer(roadHL); roadHL = null; }
  const r = ROADS.refs.get(ref); if (!r) return;
  roadHL = L.layerGroup(r.pieces.map((l) => L.polyline(l.getLatLngs(), { renderer: svgR, color: "#5cc8d6", weight: 7, opacity: 0.5, className: "road-sel", interactive: false }))).addTo(map);
}

// ================= аэропорты =================
const aptMarkers = {};
let M = {};
function drawAirports() {
  LAYERS.airports.group.clearLayers();
  M = Object.fromEntries((D.metar?.metar || []).map((m) => [m.icao, m]));
  for (const a of AIRPORTS) {
    const info = metarInfo(M[a.icao]);
    const c = info.sev < 0 ? "#6b7f84" : SEVHEX[info.sev];
    const mk = L.circleMarker([a.lat, a.lon], { renderer: svgR, radius: a.size === 3 ? 8 : a.size === 2 ? 6.5 : 5, color: c, weight: 2.5, fillColor: "#101d22", fillOpacity: 0.9, className: info.sev >= 2 ? "road-sel" : "" })
      .bindTooltip(`${esc(a.name)} ${a.iata} · ${info.cat} · ${esc(info.label)}`, { className: "tip" })
      .on("click", () => go({ sector: "air", obj: { type: "airport", icao: a.icao } }));
    mk.addTo(LAYERS.airports.group); aptMarkers[a.icao] = mk;
    L.marker([a.lat, a.lon], { icon: L.divIcon({ className: "", html: `<div class="apt" style="transform:translate(calc(-100% - 9px),-7px)">${a.iata}</div>`, iconSize: [0, 0] }), interactive: false }).addTo(LAYERS.airports.group);
  }
}

// ================= самолёты =================
const PLANE_SVG = '<svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';
let selPlane = null;
const EMG = { "7500": "угон", "7600": "отказ связи", "7700": "бедствие" };
function mergeFlights(list, srcT) {
  for (const a of list) {
    if (a.lat == null) continue;
    const o = planes.get(a.hex);
    if (o && o.t >= a.t) continue;
    const p = o || { hex: a.hex };
    Object.assign(p, a, { lat0: a.lat, lon0: a.lon, t: a.t || srcT });
    planes.set(a.hex, p);
  }
}
function planePos(p, t) {
  const dt = Math.min(Math.max(0, t - p.t), 600);
  if (p.gnd || !p.gs || p.gs < 30 || p.trk == null) return [p.lat0, p.lon0];
  const d = p.gs * dt / 1000, br = p.trk * Math.PI / 180;
  return [p.lat0 + (d * Math.cos(br)) / 111.2, p.lon0 + (d * Math.sin(br)) / (111.2 * Math.cos(p.lat0 * Math.PI / 180))];
}
function tickPlanes() {
  const t = now();
  for (const [hex, p] of planes) {
    const age = t - p.t;
    if (age > 1200) { if (p.marker) LAYERS.planes.group.removeLayer(p.marker); planes.delete(hex); if (selPlane === hex) selPlane = null; continue; }
    const pos = planePos(p, t);
    const cls = `plane${p.gnd ? " gnd" : ""}${selPlane === hex ? " sel" : ""}${EMG[p.sq] ? " emg" : ""}${age > 600 ? " old" : ""}`;
    if (!p.marker) {
      p.marker = L.marker(pos, { icon: L.divIcon({ className: "", html: `<div class="${cls}">${PLANE_SVG}</div>`, iconSize: [20, 20] }), keyboard: false })
        .bindTooltip(() => `${esc(p.cs || p.hex)} · ${p.gnd ? "на земле" : Math.round((p.alt || 0) / 10) * 10 + " м, " + Math.round((p.gs || 0) * 3.6) + " км/ч"}`, { className: "tip" })
        .on("click", () => go({ sector: "air", obj: { type: "plane", hex } }));
      p.marker.addTo(LAYERS.planes.group);
    } else p.marker.setLatLng(pos);
    const el = p.marker.getElement();
    if (el) { const d = el.firstChild; if (d.className !== cls) d.className = cls; const s = d.firstChild; const rot = `rotate(${p.trk || 0}deg)`; if (s.style.transform !== rot) s.style.transform = rot; }
  }
}
// Прямой опрос adsb.lol из браузера (если сервис разрешает), между обновлениями сервера
const CENTERS = [[51, 51], [46.5, 52.5], [43.5, 53], [50.5, 58], [46, 60], [53, 64], [45, 66], [49.5, 66.5], [43, 70.5], [51.5, 70], [47.5, 72.5], [53, 76], [44, 76.5], [48, 78.5], [50, 83], [45.5, 82.5]];
const DIRECT_HOSTS = [["https://api.adsb.lol/v2", "adsb.lol"], ["https://opendata.adsb.fi/api/v2", "adsb.fi"], ["https://api.airplanes.live/v2", "airplanes.live"]];
async function directPoll() {
  if (direct.tried && !direct.ok) return;
  direct.tried = true;
  const hosts = direct.host ? [direct.host] : DIRECT_HOSTS;
  for (const host of hosts) {
    let got = 0;
    for (const [la, lo] of CENTERS) {
      try {
        const r = await fetch(`${host[0]}/lat/${la}/lon/${lo}/dist/250`); if (!r.ok) throw 0;
        const d = await r.json(); const t0 = (d.now || Date.now()) / 1000;
        mergeFlights((d.ac || d.aircraft || []).filter((a) => a.lat != null).map((a) => { const gnd = a.alt_baro === "ground"; return { hex: a.hex, cs: (a.flight || "").trim(), lat: a.lat, lon: a.lon, alt: gnd ? 0 : (a.alt_geom ?? a.alt_baro ?? 0) * 0.3048, gs: a.gs != null ? a.gs * 0.514444 : null, trk: a.track ?? null, vr: a.baro_rate != null ? a.baro_rate * 0.00508 : null, gnd, reg: a.r, type: a.t, sq: a.squawk, t: Math.round(t0 - (a.seen_pos || 0)), src: host[1] + " (из браузера)" }; }));
        got++;
      } catch { if (!got) break; }
      await new Promise((r) => setTimeout(r, 350));
    }
    if (got) { direct.ok = true; direct.host = host; direct.at = now(); return; }
  }
  direct.ok = false;
}

// ================= сейсмика и суда =================
function drawQuakes() {
  LAYERS.quakes.group.clearLayers();
  for (const q of D.quakes?.quakes || []) {
    const fresh = now() - q.t < 86400;
    L.circleMarker([q.lat, q.lon], { renderer: svgR, radius: 3 + q.mag * 2, color: "#ff8a65", weight: fresh ? 2 : 1, fillColor: "#ff8a65", fillOpacity: fresh ? 0.35 : 0.12, className: fresh ? "road-sel" : "" })
      .bindTooltip(`M${q.mag.toFixed(1)} · ${esc(q.place)} · ${ago(q.t)}`, { className: "tip" })
      .on("click", () => go({ sector: "quakes", obj: { type: "quake", id: q.id } })).addTo(LAYERS.quakes.group);
  }
}
const SHIP_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2l5 14-5 6-5-6z"/></svg>';
function drawShips() {
  LAYERS.ships.group.eachLayer((l) => { if (l.options.ship) LAYERS.ships.group.removeLayer(l); });
  for (const s of D.ships?.ships || []) {
    L.marker([s.lat, s.lon], { ship: true, icon: L.divIcon({ className: "", html: `<div class="ship" style="transform:rotate(${s.cog || 0}deg)">${SHIP_SVG}</div>`, iconSize: [14, 14] }) })
      .bindTooltip(`${esc(s.name || s.mmsi)} · ${s.sog ?? "—"} уз`, { className: "tip" })
      .on("click", () => go({ sector: "sea", obj: { type: "ship", mmsi: s.mmsi } })).addTo(LAYERS.ships.group);
  }
}

// ================= панель =================
const SECTORS = [["all", "Обзор"], ["air", "Авиа"], ["roads", "Дороги"], ["weather", "Погода"], ["rail", "ЖД"], ["sea", "Каспий"], ["borders", "Границы"], ["quakes", "Сейсмика"], ["sources", "Источники"]];
const SNAME = Object.fromEntries(SECTORS);
const SECTOR_LAYERS = { air: ["planes", "airports"], roads: ["roads"], weather: ["temp"], rail: ["rail"], sea: ["ships"], borders: ["borders"], quakes: ["quakes"] };
let view = { sector: "all", obj: null };
function go(v) {
  view = { sector: v.sector || "all", obj: v.obj || null };
  for (const k of SECTOR_LAYERS[view.sector] || []) if (!LAYERS[k].on) { LAYERS[k].on = true; applyLayers(); }
  if (view.obj?.type === "plane") selPlane = view.obj.hex; else selPlane = null;
  if (view.obj?.type === "road") highlightRoad(view.obj.ref); else if (roadHL) { map.removeLayer(roadHL); roadHL = null; }
  render(); $("dbody").scrollTop = 0;
}
const row = (color, name, sub, metric, act) => `<button type="button" class="row" data-go='${esc(JSON.stringify(act))}'><span class="st" style="background:${color}"></span><span class="n">${esc(name)}<small>${esc(sub || "")}</small></span><span class="m">${metric}</span></button>`;
const fact = (l, v, color) => `<div class="fact"><div class="l">${esc(l)}</div><div class="v"${color ? ` style="color:${color}"` : ""}>${v}</div></div>`;
document.addEventListener("click", (e) => {
  const r = e.target.closest("[data-go]"); if (r) { go(JSON.parse(r.dataset.go)); return; }
  const t = e.target.closest("[data-sector]"); if (t) { go({ sector: t.dataset.sector }); return; }
  const f = e.target.closest("[data-fit]"); if (f) { const rr = ROADS.refs.get(f.dataset.fit); if (rr?.bounds?.isValid()) map.fitBounds(rr.bounds, { padding: [30, 30] }); return; }
  const fl = e.target.closest("[data-fly]"); if (fl) { const [a, b, z] = fl.dataset.fly.split(",").map(Number); map.flyTo([a, b], z || 9, { duration: 0.8 }); }
});

function airborne() { return [...planes.values()].filter((p) => !p.gnd && now() - p.t < 900); }
function planesNear(lat, lon, rkm) { return [...planes.values()].filter((p) => { const [a, b] = planePos(p, now()); return km(lat, lon, a, b) < rkm; }); }

function alertsList() {
  const items = [];
  for (const a of AIRPORTS) { const i = metarInfo(M[a.icao]); if (i.sev >= 2) items.push([i.sev + 0.5, row(SEVC[i.sev], `Аэропорт ${a.name} (${a.iata})`, `${i.cat}: ${i.label}${i.visKm != null ? ", видимость " + i.visKm.toFixed(1) + " км" : ""}`, i.cat, { sector: "air", obj: { type: "airport", icao: a.icao } })]); }
  for (const r of ROADS.refs.values()) { const bad = r.km[3] + r.km[2]; if (bad > 20 && r.ref !== "без номера") { const top = Object.entries(r.reasons).filter(([k]) => !["норма", "осадки", "ветер", "туман", "сильный мороз"].includes(k)).sort((a, b) => b[1] - a[1])[0]; items.push([r.worst + bad / 10000, row(SEVC[r.worst], `Трасса ${r.ref}${r.name ? " · " + r.name : ""}`, `${top ? top[0] : "сложные условия"} на ${Math.round(bad)} км`, Math.round(bad) + " км", { sector: "roads", obj: { type: "road", ref: r.ref } })]); } }
  for (const p of planes.values()) if (EMG[p.sq] && now() - p.t < 900) items.push([4, row("var(--s3)", `Борт ${p.cs || p.hex}: код ${p.sq}`, EMG[p.sq], "SQUAWK", { sector: "air", obj: { type: "plane", hex: p.hex } })]);
  for (const q of D.quakes?.quakes || []) if (q.mag >= 4 && now() - q.t < 3 * 86400) items.push([2.2, row("var(--quake)", `Землетрясение M${q.mag.toFixed(1)}`, `${q.place}, ${ago(q.t)}`, "M" + q.mag.toFixed(1), { sector: "quakes", obj: { type: "quake", id: q.id } })]);
  for (const c of CITIES) { const w = W.byId[c.id]; if (w && w.risk.sev >= 3) items.push([w.risk.sev, row(SEVC[w.risk.sev], c.name, `${w.risk.label}, ${sgn(w.T)}, порывы ${Math.round(w.wg ?? 0)} м/с`, sgn(w.T), { sector: "weather", obj: { type: "wpt", id: c.id } })]); }
  for (const [k, s] of Object.entries(D.status?.sources || {})) if (!s.ok && !(k === "ships" && /ключ/.test(s.error || ""))) items.push([0.5, row("var(--sx)", `Источник «${SRCNAME[k] || k}» не ответил`, s.error, s.kept ? "старые" : "нет", { sector: "sources" })]);
  return items.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

function viewSector(s) {
  if (s === "all") {
    const list = alertsList();
    return `<div><h2>Требует внимания</h2><p class="sub">${list.length ? list.length + " позиций" : "Серьёзных проблем нет"} · данные на ${D.status ? fmtT(Date.parse(D.status.generated) / 1000) : "—"}</p></div><div class="rows">${list.join("") || '<p class="sub">Все аэропорты в норме, опасной погоды на трассах нет.</p>'}</div>
    <p class="note">Состояние дорог — оценка по погоде (Open-Meteo), не официальные данные КазАвтоЖол. Аэропорты — по сводкам METAR.</p>`;
  }
  if (s === "air") {
    const air = airborne();
    const list = AIRPORTS.map((a) => ({ a, i: metarInfo(M[a.icao]) })).sort((x, y) => y.i.sev - x.i.sev || y.a.size - x.a.size);
    return `<div><h2>Авиация</h2><p class="sub">${air.length} бортов в воздухе, ${[...planes.values()].filter((p) => p.gnd).length} на земле. Позиции по ADS-B: ${esc((D.flights?.sources || []).join(", ") || "нет данных")}${direct.ok ? ", плюс прямой опрос раз в минуту" : ""}.</p></div>
    <div class="sec-h">Аэропорты по METAR</div><div class="rows">${list.map(({ a, i }) => row(sevColor(i.sev), `${a.name} · ${a.iata}`, `${i.cat} · ${i.label}${M[a.icao] ? ", " + ago(M[a.icao].t) : ""}`, M[a.icao] ? sgn(M[a.icao].temp) : "—", { sector: "air", obj: { type: "airport", icao: a.icao } })).join("")}</div>
    <div class="sec-h">Борты в воздухе</div><div class="rows">${air.sort((a, b) => (b.alt || 0) - (a.alt || 0)).slice(0, 60).map((p) => row("var(--plane)", p.cs || p.hex, `${p.type || ""} ${p.reg || ""} ${p.cty || ""}`.trim() || p.src, `${Math.round((p.alt || 0) / 100) / 10} км`, { sector: "air", obj: { type: "plane", hex: p.hex } })).join("") || '<p class="sub">Нет данных о бортах.</p>'}</div>`;
  }
  if (s === "roads") {
    const refs = [...ROADS.refs.values()].filter((r) => r.ref !== "без номера").sort((a, b) => b.worst - a.worst || (b.km[3] + b.km[2]) - (a.km[3] + a.km[2]) || b.total - a.total);
    const bad = refs.reduce((a, r) => a + r.km[2] + r.km[3], 0);
    return `<div><h2>Автодороги</h2><p class="sub">${Math.round(ROADS.total).toLocaleString("ru-RU")} км магистралей${ROADS.fromOSM ? " (OpenStreetMap)" : " (упрощённая схема, геометрия OSM ещё загружается)"}; в зоне риска ${Math.round(bad).toLocaleString("ru-RU")} км.</p></div>
    <div class="rows">${refs.slice(0, 80).map((r) => row(SEVC[r.worst], r.ref, r.name || "", `${Math.round(r.km[2] + r.km[3])} / ${Math.round(r.total)} км`, { sector: "roads", obj: { type: "road", ref: r.ref } })).join("")}</div>
    <p class="note">Справа: км в зоне риска / вся длина. Пробки — слой «Пробки» (нужен ключ TomTom во вкладке «Источники»).</p>`;
  }
  if (s === "weather") {
    const list = CITIES.map((c) => ({ c, w: W.byId[c.id] })).filter((x) => x.w).sort((a, b) => (b.w.risk.sev - a.w.risk.sev) || (a.w.T - b.w.T));
    return `<div><h2>Погода по городам</h2><p class="sub">Open-Meteo, обновлено ${D.weather ? ago(D.weather.t) : "—"}. Сортировка: сначала опасная погода.</p></div><div class="rows">${list.map(({ c, w }) => row(sevColor(w.risk.sev), c.name, `${WMO[w.wc] || ""}, ветер ${Math.round(w.ws ?? 0)}–${Math.round(w.wg ?? 0)} м/с · ${w.risk.label}`, sgn(w.T), { sector: "weather", obj: { type: "wpt", id: c.id } })).join("")}</div>`;
  }
  if (s === "rail") {
    return `<div><h2>Железная дорога</h2><p class="sub">На карте — реальная сеть ЖД из OpenRailwayMap: магистрали, станции, электрификация.</p></div>
    <p class="sub">Движение поездов, задержки и погрузка есть только у КТЖ — это закрытый источник (см. «Источники»).</p>
    <div class="sec-h">Погода на ключевых ЖД-узлах</div><div class="rows">${[["Достык", 45.25, 82.48], ["Алтынколь", 44.2, 80.3], ["Актогай", 46.95, 79.5], ["Мойынты", 47.2, 73.4], ["Бейнеу", 45.3, 55.2], ["Кандыагаш", 49.5, 56.9], ["Шу", 43.6, 73.6]].map(([n, a, b]) => { const w = nearestWeather(a, b); return row(sevColor(w ? w.risk.sev : -1), n, w ? `${WMO[w.wc] || ""} · ${w.risk.label}` : "нет данных", w ? sgn(w.T) : "—", { sector: "weather", obj: { type: "wpt", id: w?.id } }); }).join("")}</div>`;
  }
  if (s === "sea") {
    const ships = D.ships?.ships || [];
    return `<div><h2>Каспий и порты</h2><p class="sub">${ships.length ? ships.length + " судов по AIS" : "Суда по AIS: " + esc(D.ships?.note || "нет данных")}</p></div>
    <div class="rows">${PORTS.map((p, i) => { const w = nearestWeather(p.lat, p.lon); return row(w && (w.wg ?? 0) >= 15 ? "var(--s2)" : "var(--s0)", p.name, w ? `ветер ${Math.round(w.ws ?? 0)}, порывы ${Math.round(w.wg ?? 0)} м/с` : "", w ? sgn(w.T) : "—", { sector: "sea", obj: { type: "port", i } }); }).join("")}</div>
    ${ships.length ? `<div class="sec-h">Суда</div><div class="rows">${ships.map((s) => row("var(--ship)", s.name || s.mmsi, s.dest ? "→ " + s.dest : "", (s.sog ?? "—") + " уз", { sector: "sea", obj: { type: "ship", mmsi: s.mmsi } })).join("")}</div>` : ""}`;
  }
  if (s === "borders") {
    return `<div><h2>Пункты пропуска</h2><p class="sub">Очереди есть только в CarGoRuqsat и у КГД (закрытый источник). Здесь — погода на подходах.</p></div><div class="rows">${BORDERS.map((b, i) => { const w = nearestWeather(b.lat, b.lon); return row(sevColor(w ? w.risk.sev : -1), b.name, `${b.cty}${w ? " · " + w.risk.label : ""}`, w ? sgn(w.T) : "—", { sector: "borders", obj: { type: "border", i } }); }).join("")}</div>`;
  }
  if (s === "quakes") {
    const q = [...(D.quakes?.quakes || [])].sort((a, b) => b.t - a.t);
    return `<div><h2>Сейсмика за 7 дней</h2><p class="sub">USGS, магнитуда от 2,5 в регионе. Важно для мостов, тоннелей и ЖД на юге и востоке.</p></div><div class="rows">${q.map((x) => row("var(--quake)", `M${x.mag.toFixed(1)} · ${x.place}`, `${fmtDT(x.t)}, глубина ${Math.round(x.depth)} км`, ago(x.t), { sector: "quakes", obj: { type: "quake", id: x.id } })).join("") || '<p class="sub">Событий нет.</p>'}</div>`;
  }
  if (s === "sources") {
    const st = D.status?.sources || {};
    return `<div><h2>Источники данных</h2><p class="sub">Сервер (GitHub Actions) собирает данные каждые ~5 минут и кладёт в ветку live-data; страница перечитывает их каждые 5 минут${dataFrom ? " (сейчас читает из " + (dataFrom.startsWith("http") ? "ветки live-data" : "папки сайта") + ")" : ""}.</p></div>
    <table class="src"><thead><tr><th>Источник</th><th>Статус</th><th>Обновлено</th></tr></thead><tbody>
    ${Object.entries(SRCNAME).map(([k, n]) => { const s = st[k]; return `<tr><td>${n}<div class="note">${SRCDESC[k]}</div></td><td>${s ? (s.ok ? pill(0, s.count != null ? s.count + " шт." : "ok") : pill(3, "ошибка")) : pill(-1, "нет")}${s && !s.ok ? `<div class="note">${esc(s.error)}</div>` : ""}</td><td>${s ? ago(Date.parse(s.at) / 1000) : "—"}</td></tr>`; }).join("")}
    <tr><td>Дороги OSM<div class="note">Геометрия магистралей, раз в неделю</div></td><td>${D.roads ? pill(0, D.roads.ways.length + " уч.") : pill(-1, "схема")}</td><td>${D.roads ? ago(D.roads.t) : "—"}</td></tr>
    <tr><td>ADS-B из браузера<div class="note">Самолёты раз в минуту напрямую${direct.host ? ": " + direct.host[1] : ""}</div></td><td>${direct.ok ? pill(0, "работает") : direct.tried ? pill(-1, "недоступно") : pill(-1, "проверка")}</td><td>${direct.at ? ago(direct.at) : "—"}</td></tr>
    <tr><td>Подложки<div class="note">CARTO, Esri, OpenRailwayMap, NASA GIBS</div></td><td>${pill(0, "тайлы")}</td><td>онлайн</td></tr>
    </tbody></table>
    <div class="sec-h">Пробки (TomTom)</div><p class="sub">Бесплатный ключ: developer.tomtom.com (2 500 запросов в сутки). Ключ хранится только в этом браузере.</p>
    <input class="key" id="tomtomKey" placeholder="Вставьте ключ TomTom" value="${esc(store.get("tomtom", ""))}"><div class="act"><button class="btn" type="button" id="saveKey">Сохранить ключ</button><button class="btn" type="button" id="clearKey">Удалить</button></div>
    <div class="sec-h">Закрытые источники</div><div class="rows">${CLOSED_SOURCES.map(([o, d, h]) => `<div class="row"><span class="st" style="background:var(--sx)"></span><span class="n">${esc(o)}<small>${esc(d)}</small></span><span class="m" style="white-space:normal;max-width:130px;font-size:11px;color:var(--muted)">${esc(h)}</span></div>`).join("")}</div>`;
  }
}
const SRCNAME = { flights: "Самолёты ADS-B", metar: "METAR аэропортов", weather: "Погода Open-Meteo", quakes: "Сейсмика USGS", ships: "Суда AIS" };
const SRCDESC = { flights: "OpenSky, adsb.lol, adsb.fi", metar: "NOAA aviationweather.gov", weather: "Сетка ~150 точек по РК", quakes: "earthquake.usgs.gov", ships: "aisstream.io (нужен ключ)" };

function viewObj(o) {
  if (o.type === "airport") {
    const a = AIRPORTS.find((x) => x.icao === o.icao), m = M[o.icao], i = metarInfo(m), near = planesNear(a.lat, a.lon, 30);
    return { crumb: "air", title: `${a.name} ${a.iata}`, fly: [a.lat, a.lon, 10], html: `<div><h2>Аэропорт ${esc(a.name)} <span style="color:var(--muted);font-weight:400">${a.iata} / ${a.icao}</span></h2><p class="sub">${pill(i.sev, i.cat)} ${esc(i.label)}${m ? " · сводка " + fmtT(m.t) + " (" + ago(m.t) + ")" : ""}</p></div>
      ${m ? `<div class="facts">${fact("Видимость", i.visKm != null ? (i.visKm >= 16 ? "10+ км" : i.visKm.toFixed(1) + " км") : "—", i.sev >= 2 ? SEVC[i.sev] : "")}${fact("Нижняя кромка", i.ceilM != null ? Math.round(i.ceilM) + " м" : "нет")}${fact("Ветер", m.wspd != null ? `${Math.round(m.wspd * 0.514)}${m.wgst ? "–" + Math.round(m.wgst * 0.514) : ""} м/с` : "—")}${fact("Температура", sgn(m.temp))}</div>
      ${m.wx ? `<p class="sub">Явления: ${esc(m.wx)}</p>` : ""}<div class="raw">${esc(m.raw)}</div>` : '<p class="sub">Сводки METAR нет.</p>'}
      <div class="sec-h">Борты в радиусе 30 км</div><div class="rows">${near.map((p) => row("var(--plane)", p.cs || p.hex, p.gnd ? "на земле" : `${Math.round(p.alt || 0)} м, ${Math.round((p.gs || 0) * 3.6)} км/ч`, p.type || "", { sector: "air", obj: { type: "plane", hex: p.hex } })).join("") || '<p class="sub">Нет.</p>'}</div>
      <p class="note">Закрытие аэропорта (НОТАМ) и расписание — закрытые источники.</p>` };
  }
  if (o.type === "plane") {
    const p = planes.get(o.hex);
    if (!p) return { crumb: "air", title: o.hex, html: '<p class="sub">Борт пропал с радаров (нет свежих данных).</p>' };
    const [la, lo] = planePos(p, now());
    return { crumb: "air", title: p.cs || p.hex, fly: [la, lo, 8], html: `<div><h2>${esc(p.cs || "без позывного")} <span style="color:var(--muted);font-weight:400">${esc(p.hex)}</span></h2><p class="sub">${esc([p.type, p.reg, p.cty].filter(Boolean).join(" · "))}</p></div>
      ${EMG[p.sq] ? `<p>${pill(3, "SQUAWK " + p.sq)} ${EMG[p.sq]}</p>` : ""}
      <div class="facts">${fact("Высота", p.gnd ? "на земле" : Math.round(p.alt || 0).toLocaleString("ru-RU") + " м")}${fact("Скорость", Math.round((p.gs || 0) * 3.6) + " км/ч")}${fact("Курс", p.trk != null ? Math.round(p.trk) + "°" : "—")}${fact("Вертикальная", p.vr != null ? (p.vr > 0 ? "+" : "") + p.vr.toFixed(1) + " м/с" : "—")}</div>
      <p class="sub">Источник: ${esc(p.src)}, позиция ${ago(p.t)}. Между обновлениями положение рассчитывается по курсу и скорости.</p>
      <div class="act"><a href="https://globe.adsb.lol/?icao=${esc(p.hex)}" target="_blank" rel="noopener">Трек на globe.adsb.lol</a>${p.cs ? `<a href="https://www.flightradar24.com/${esc(p.cs)}" target="_blank" rel="noopener">Flightradar24</a>` : ""}</div>` };
  }
  if (o.type === "road") {
    const r = ROADS.refs.get(o.ref);
    if (!r) return { crumb: "roads", title: o.ref, html: '<p class="sub">Нет данных.</p>' };
    const reasons = Object.entries(r.reasons).sort((a, b) => b[1] - a[1]);
    return { crumb: "roads", title: r.ref, html: `<div><h2>Трасса ${esc(r.ref)}</h2><p class="sub">${esc(r.name)} · ${Math.round(r.total)} км в данных</p></div>
      <div class="kmbar">${r.km.map((v, i) => `<span style="width:${(v / (r.total || 1)) * 100}%;background:${SEVC[i]}"></span>`).join("")}</div>
      <div class="facts">${fact("Норма", Math.round(r.km[0]) + " км", SEVC[0])}${fact("Осадки, ветер", Math.round(r.km[1]) + " км", SEVC[1])}${fact("Гололёд, снег", Math.round(r.km[2]) + " км", SEVC[2])}${fact("Метель, лёд", Math.round(r.km[3]) + " км", SEVC[3])}</div>
      <div class="act"><button class="btn" type="button" data-fit="${esc(r.ref)}">Показать на карте</button></div>
      <div class="sec-h">Условия по длине</div><div class="rows">${reasons.map(([k, v]) => `<div class="row"><span class="st" style="background:var(--muted)"></span><span class="n">${esc(k)}</span><span class="m">${Math.round(v)} км</span></div>`).join("")}</div>
      ${r.hot.length ? `<div class="sec-h">Опасные точки</div><div class="rows">${r.hot.map((w) => row(SEVC[w.risk.sev], w.name || `${w.lat.toFixed(1)}° с.ш., ${w.lon.toFixed(1)}° в.д.`, `${w.risk.label} · ${WMO[w.wc] || ""}`, sgn(w.T), { sector: "weather", obj: { type: "wpt", id: w.id } })).join("")}</div>` : ""}
      <p class="note">Оценка по погоде Open-Meteo. Официальное закрытие трасс — у КазАвтоЖол и МЧС.</p>` };
  }
  if (o.type === "wpt") {
    const w = W.byId[o.id];
    if (!w) return { crumb: "weather", title: "Точка", html: '<p class="sub">Нет данных.</p>' };
    const name = w.name || `${w.lat}° с.ш., ${w.lon}° в.д.`;
    return { crumb: "weather", title: name, fly: [w.lat, w.lon, 8], html: `<div><h2>${esc(name)}</h2><p class="sub">${esc(WMO[w.wc] || "")} · ${pill(w.risk.sev, w.risk.label)}</p></div>
      <div class="facts">${fact("Температура", sgn(w.T))}${fact("Ветер / порывы", `${Math.round(w.ws ?? 0)} / ${Math.round(w.wg ?? 0)} м/с`)}${fact("Видимость", w.vis != null ? (w.vis >= 10000 ? "10+ км" : (w.vis / 1000).toFixed(1) + " км") : "—")}${fact("Влажность", (w.rh ?? "—") + "%")}${fact("Осадки за час", (w.pr ?? 0) + " мм")}${fact("Снег за час", (w.sn ?? 0) + " см")}</div>
      <p class="note">Open-Meteo, ${D.weather ? ago(D.weather.t) : ""}. Для участков дорог берётся ближайшая точка сетки.</p>` };
  }
  if (o.type === "quake") {
    const q = (D.quakes?.quakes || []).find((x) => x.id === o.id);
    if (!q) return { crumb: "quakes", title: "Событие", html: "" };
    return { crumb: "quakes", title: "M" + q.mag.toFixed(1), fly: [q.lat, q.lon, 7], html: `<div><h2>Землетрясение M${q.mag.toFixed(1)}</h2><p class="sub">${esc(q.place)}</p></div><div class="facts">${fact("Время (Астана)", fmtDT(q.t))}${fact("Глубина", Math.round(q.depth) + " км")}</div><a href="${esc(q.url)}" target="_blank" rel="noopener">Подробно на USGS</a>` };
  }
  if (o.type === "border") {
    const b = BORDERS[o.i], w = nearestWeather(b.lat, b.lon);
    return { crumb: "borders", title: b.name, fly: [b.lat, b.lon, 10], html: `<div><h2>Пункт пропуска ${esc(b.name)}</h2><p class="sub">Граница с: ${esc(b.cty)}</p></div>
      ${w ? `<div class="facts">${fact("Погода", sgn(w.T))}${fact("Условия", esc(w.risk.label))}</div>` : ""}
      <p class="sub">Очередь грузовиков и время ожидания — CarGoRuqsat (КГД), закрытый источник. Подключается через Smart Bridge.</p>` };
  }
  if (o.type === "port") {
    const p = PORTS[o.i], w = nearestWeather(p.lat, p.lon);
    return { crumb: "sea", title: p.name, fly: [p.lat, p.lon, 11], html: `<div><h2>${esc(p.name)}</h2></div>${w ? `<div class="facts">${fact("Ветер", Math.round(w.ws ?? 0) + " м/с")}${fact("Порывы", Math.round(w.wg ?? 0) + " м/с", (w.wg ?? 0) >= 15 ? "var(--s2)" : "")}${fact("Температура", sgn(w.T))}${fact("Видимость", w.vis != null ? (w.vis / 1000).toFixed(1) + " км" : "—")}</div>` : ""}<p class="sub">Суда у причалов, перевалка, паромы — данные операторов портов (закрыто).</p>` };
  }
  if (o.type === "ship") {
    const s = (D.ships?.ships || []).find((x) => x.mmsi === o.mmsi);
    if (!s) return { crumb: "sea", title: "Судно", html: "" };
    return { crumb: "sea", title: s.name || s.mmsi, fly: [s.lat, s.lon, 9], html: `<div><h2>${esc(s.name || "Судно")}</h2><p class="sub">MMSI ${esc(s.mmsi)}${s.dest ? " · → " + esc(s.dest) : ""}</p></div><div class="facts">${fact("Скорость", (s.sog ?? "—") + " уз")}${fact("Курс", (s.cog ?? "—") + "°")}</div><p class="note">AIS, ${ago(s.t)}</p>` };
  }
}

function render() {
  $("tabs").innerHTML = SECTORS.map(([k, n]) => `<button type="button" data-sector="${k}" aria-current="${view.sector === k}">${n}</button>`).join("");
  let crumbs = [["all", "Обзор"]], html;
  if (view.sector !== "all") crumbs.push([view.sector, SNAME[view.sector]]);
  if (view.obj) { const v = viewObj(view.obj); if (v) { crumbs.push([null, v.title]); html = v.html; if (v.fly && !view.flown) { view.flown = true; map.flyTo([v.fly[0], v.fly[1]], Math.max(map.getZoom(), v.fly[2] - 2), { duration: 0.8 }); } } }
  if (!html) html = viewSector(view.sector);
  $("crumbs").innerHTML = crumbs.map((c, i) => i === crumbs.length - 1 ? `<span class="cur">${esc(c[1])}</span>` : `<button type="button" data-sector="${c[0]}">${esc(c[1])}</button><span>›</span>`).join("");
  $("dbody").innerHTML = html;
  window.__mt = { roads: ROADS.refs.size, roadPieces: [...ROADS.refs.values()].reduce((a, r) => a + r.pieces.length, 0), roadKm: Math.round(ROADS.total), fromOSM: ROADS.fromOSM, planes: planes.size, metar: Object.keys(M).length, weather: (W.list || []).length };
  const sk = $("saveKey"); if (sk) sk.onclick = () => { store.set("tomtom", $("tomtomKey").value.trim()); LAYERS.traffic.on = !!$("tomtomKey").value.trim(); applyLayers(); push("var(--ui)", "Ключ TomTom сохранён, слой пробок включён"); render(); };
  const ck = $("clearKey"); if (ck) ck.onclick = () => { store.set("tomtom", ""); LAYERS.traffic.on = false; if (LAYERS.traffic.group) map.removeLayer(LAYERS.traffic.group); applyLayers(); render(); };
  renderKpis();
}

function renderKpis() {
  const air = airborne().length, gnd = [...planes.values()].filter((p) => p.gnd).length;
  const ai = AIRPORTS.map((a) => metarInfo(M[a.icao])); const aBad = ai.filter((i) => i.sev >= 2).length, aOk = ai.filter((i) => i.sev === 0 || i.sev === 1).length, aNo = ai.filter((i) => i.sev < 0).length;
  let bad = 0, worst = 0; for (const r of ROADS.refs.values()) { bad += r.km[2] + r.km[3]; worst = Math.max(worst, r.km[3]); }
  let cold = null; for (const c of CITIES) { const w = W.byId[c.id]; if (w && w.T != null && (!cold || w.T < cold.w.T)) cold = { c, w }; }
  const danger = CITIES.filter((c) => (W.byId[c.id]?.risk.sev ?? 0) >= 2).length;
  const q = D.quakes?.quakes || []; const qmax = q.reduce((m, x) => Math.max(m, x.mag), 0);
  const st = Object.values(D.status?.sources || {}); const ok = st.filter((s) => s.ok).length;
  const K = [
    ["air", "Бортов в воздухе", air, `${gnd} на земле · ADS-B`, ""],
    ["air", "Аэропорты в норме", AIRPORTS.length - aNo ? `${aOk}/${AIRPORTS.length - aNo}` : "—", [aBad ? `${aBad} IFR/LIFR` : "", aNo ? `${aNo} без сводки` : ""].filter(Boolean).join(" · ") || "по METAR", aBad ? "alert" : ""],
    ["roads", "Трассы в зоне риска", Math.round(bad).toLocaleString("ru-RU") + " км", worst > 1 ? `метель/лёд: ${Math.round(worst)} км` : `из ${Math.round(ROADS.total).toLocaleString("ru-RU")} км`, worst > 1 ? "alert" : bad > 50 ? "warn" : ""],
    ["weather", "Опасная погода", danger + " гор.", danger ? "гололёд, снег, метель" : "в городах спокойно", danger ? "warn" : ""],
    ["weather", "Холоднее всего", cold ? sgn(cold.w.T) : "—", cold ? cold.c.name : "", ""],
    ["quakes", "Сейсмика, 7 дней", q.length, q.length ? `макс. M${qmax.toFixed(1)}` : "событий нет", qmax >= 5 ? "warn" : ""],
    ["sources", "Источники", `${ok}/${st.length || 5}`, D.status ? `сервер: ${ago(Date.parse(D.status.generated) / 1000)}` : "нет связи", ok < st.length ? "warn" : ""]
  ];
  $("kpis").innerHTML = K.map((k) => `<button type="button" class="kpi ${k[4]}" data-sector="${k[0]}"><span class="l">${k[1]}</span><span class="v">${k[2]}</span><span class="s">${esc(k[3])}</span></button>`).join("");
}

// ================= лента событий =================
const feed = store.get("feed", []).filter((f) => now() - f.t < 86400);
function push(color, text, act) { feed.unshift({ c: color, x: text, t: now(), a: act || null }); if (feed.length > 60) feed.pop(); store.set("feed", feed); renderFeed(); }
function renderFeed() {
  $("feed").innerHTML = feed.map((f) => `<li><span class="b" style="background:${f.c}"></span><span class="t">${fmtT(f.t)}</span>${f.a ? `<button type="button" data-go='${esc(JSON.stringify(f.a))}'>${esc(f.x)}</button>` : `<span>${esc(f.x)}</span>`}</li>`).join("");
  $("feedCount").textContent = feed.length;
}
let prevSnap = store.get("snap", null);
function diffEvents() {
  const snap = { apt: {}, road: {}, quakes: [], emg: [] };
  for (const a of AIRPORTS) snap.apt[a.icao] = metarInfo(M[a.icao]).sev;
  for (const r of ROADS.refs.values()) if (r.ref !== "без номера") snap.road[r.ref] = r.worst;
  snap.quakes = (D.quakes?.quakes || []).map((q) => q.id);
  snap.emg = [...planes.values()].filter((p) => EMG[p.sq]).map((p) => p.hex);
  const P = prevSnap;
  for (const a of AIRPORTS) {
    const s = snap.apt[a.icao], o = P?.apt?.[a.icao], i = metarInfo(M[a.icao]);
    if (P && o !== undefined && s !== o && s >= 0 && o >= 0) push(s > o ? SEVC[s] : "var(--s0)", `Аэропорт ${a.name}: ${s > o ? "ухудшение" : "улучшение"} до ${i.cat} (${i.label})`, { sector: "air", obj: { type: "airport", icao: a.icao } });
    else if (!P && s >= 2) push(SEVC[s], `Аэропорт ${a.name}: ${i.cat}, ${i.label}`, { sector: "air", obj: { type: "airport", icao: a.icao } });
  }
  for (const [ref, s] of Object.entries(snap.road)) {
    const o = P?.road?.[ref];
    if (s >= 2 && (o === undefined ? !P : s > o)) { const r = ROADS.refs.get(ref); if (r && r.km[2] + r.km[3] > 20) push(SEVC[s], `Трасса ${ref}: ${s === 3 ? "опасно" : "сложные условия"} на ${Math.round(r.km[2] + r.km[3])} км`, { sector: "roads", obj: { type: "road", ref } }); }
    else if (P && o >= 2 && s < 2) push("var(--s0)", `Трасса ${ref}: условия улучшились`, { sector: "roads", obj: { type: "road", ref } });
  }
  for (const q of D.quakes?.quakes || []) if (P && !P.quakes?.includes(q.id)) push("var(--quake)", `Землетрясение M${q.mag.toFixed(1)}: ${q.place}`, { sector: "quakes", obj: { type: "quake", id: q.id } });
  for (const hex of snap.emg) if (!P?.emg?.includes(hex)) { const p = planes.get(hex); push("var(--s3)", `Борт ${p.cs || hex}: код ${p.sq} (${EMG[p.sq]})`, { sector: "air", obj: { type: "plane", hex } }); }
  prevSnap = snap; store.set("snap", snap);
}

// ================= цикл обновления =================
const PERIOD = 300;
let next = 0, loading = false;
async function refresh() {
  if (loading) return; loading = true;
  const res = await Promise.allSettled(["status", "flights", "metar", "weather", "quakes", "ships", "roads"].map((k) => getJSON(`${k}.json`).then((d) => (D[k] = d))));
  const okCount = res.filter((r) => r.status === "fulfilled").length;
  indexWeather();
  if (D.flights) mergeFlights(D.flights.ac || [], D.flights.t);
  drawAirports(); drawTemp(); drawCities(); buildRoads(); drawQuakes(); drawShips(); tickPlanes();
  if (view.obj?.type === "road") highlightRoad(view.obj.ref);
  diffEvents();
  const gen = D.status ? Date.parse(D.status.generated) / 1000 : 0;
  const lb = $("liveBadge");
  lb.className = "live " + (gen && now() - gen < 1800 ? "ok" : okCount ? "warn" : "");
  $("liveText").textContent = gen ? `данные ${fmtT(gen)}` : okCount ? "частично" : "нет данных с сервера";
  push("var(--faint)", `Обновлено: ${airborne().length} бортов в воздухе, ${Object.keys(M).length} сводок METAR`);
  next = now() + PERIOD; loading = false;
  const keepFlown = view.flown; render(); view.flown = keepFlown;
}
$("refreshNow").addEventListener("click", () => { refresh(); directPoll(); });
$("fullscreen").addEventListener("click", () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} });
function clock() {
  $("clock").textContent = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  const left = Math.max(0, next - now());
  $("countdown").textContent = Math.floor(left / 60) + ":" + String(Math.floor(left) % 60).padStart(2, "0");
  $("ringArc").setAttribute("stroke-dashoffset", (94.25 * (1 - left / PERIOD)).toFixed(1));
  if (next && left <= 0) refresh();
  tickPlanes();
}
// перерисовка панели авиации раз в 15 с, чтобы списки бортов были свежими
setInterval(() => { if (["air"].includes(view.sector) && !document.activeElement?.matches?.("input")) { const f = view.flown; render(); view.flown = f; } }, 15000);

applyLayers(); renderFeed(); render();
await refresh();
setInterval(clock, 1000); clock();
directPoll(); setInterval(directPoll, 60000);

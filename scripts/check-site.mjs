// Самопроверка опубликованного сайта: открывает дашборд в headless-браузере,
// ждёт загрузки данных, кликает по объектам и печатает отчёт в журнал.
// Использование: node scripts/check-site.mjs <URL сайта> [папка для скриншотов]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = (process.argv[2] || "").replace(/\/$/, "") + "/";
const SHOTS = process.argv[3] || "shots";
await mkdir(SHOTS, { recursive: true });

const problems = [], notes = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const failed = [], tiles = { ok: 0, fail: 0 };
page.on("pageerror", (e) => problems.push("Ошибка скрипта: " + e.message));
const seen = new Set();
page.on("console", (m) => { if (m.type() === "error") { const t = m.text().slice(0, 120); if (!seen.has(t)) { seen.add(t); notes.push("console: " + t); } } });
page.on("response", (r) => {
  const u = r.url();
  if (/cartocdn|arcgisonline|openrailwaymap|gibs\.earthdata|tile\.openstreetmap/.test(u)) { r.ok() ? tiles.ok++ : tiles.fail++; return; }
  if (!r.ok() && !/adsb\.lol/.test(u)) failed.push(`${r.status()} ${u}`);
});

// Для локальной проверки без интернета: LEAFLET_DIR=путь к node_modules/leaflet/dist
if (process.env.LEAFLET_DIR) await page.route(/leaflet\.min\.(js|css)$/, (r) => r.fulfill({ path: `${process.env.LEAFLET_DIR}/leaflet.${r.request().url().endsWith(".css") ? "css" : "js"}` }));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#kpis .kpi", { timeout: 60000 });
await page.waitForTimeout(6000);

const text = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => "");
const count = (sel) => page.$$eval(sel, (es) => es.length).catch(() => 0);

const live = await text("#liveText");
const kpis = await page.$$eval("#kpis .kpi", (es) => es.map((e) => [...e.querySelectorAll("span")].map((s) => s.textContent.trim()).join(" | ")));
const nPlanes = await count(".plane"), nCities = await count(".city"), nAlerts = await count("#dbody .row");
const mt = (await page.evaluate(() => window.__mt).catch(() => null)) || {};
await page.screenshot({ path: `${SHOTS}/1-overview.png` });

console.log("Сайт:", URL);
console.log("Статус данных:", live);
console.log("Показатели:"); kpis.forEach((k) => console.log("  •", k));
console.log(`На карте: самолётов ${nPlanes}, городов ${nCities}, трасс ${mt.roads} (${mt.roadPieces} участков, ${mt.roadKm} км, ${mt.fromOSM ? "геометрия OSM" : "упрощённая схема"}), сводок METAR ${mt.metar}, точек погоды ${mt.weather}, строк «Требует внимания» ${nAlerts}`);
console.log(`Подложка: тайлов загружено ${tiles.ok}, ошибок ${tiles.fail}`);

if (!/данные \d/.test(live)) problems.push("Страница не получила данные с сервера: " + live);
if (!(mt.roadPieces > 50)) problems.push("Дороги не отрисованы: участков " + mt.roadPieces);
if (!(mt.weather > 100)) problems.push("Погода не загрузилась: точек " + mt.weather);
if (!(mt.metar > 5)) problems.push("Мало сводок METAR: " + mt.metar);
if (nCities < 20) problems.push("Нет подписей городов");
if (tiles.ok === 0) problems.push("Картографическая подложка не загрузилась");

// Проваливание: дороги → первая трасса
await page.click('.tabs [data-sector="roads"]');
await page.waitForTimeout(500);
const roadRows = await count("#dbody .row");
if (roadRows) { await page.click("#dbody .row"); await page.waitForTimeout(1500); }
const roadTitle = await text("#dbody h2"), crumbs = await text("#crumbs");
console.log(`Дороги: ${roadRows} трасс в списке; открыта «${roadTitle}»; путь: ${crumbs.replace(/\s+/g, " ")}`);
if (!roadRows) problems.push("Список трасс пуст");
await page.screenshot({ path: `${SHOTS}/2-road.png` });

// Авиа → первый аэропорт
await page.click('.tabs [data-sector="air"]');
await page.waitForTimeout(500);
const airRows = await count("#dbody .row");
if (airRows) { await page.click("#dbody .row"); await page.waitForTimeout(1500); }
const aptTitle = await text("#dbody h2"), metarRaw = await text("#dbody .raw");
console.log(`Авиа: ${airRows} строк; открыт «${aptTitle}»; METAR: ${metarRaw.slice(0, 80)}`);
if (!metarRaw) problems.push("У аэропорта нет сводки METAR");
await page.screenshot({ path: `${SHOTS}/3-airport.png` });

// Погода, источники
await page.click('.tabs [data-sector="weather"]');
await page.waitForTimeout(400);
const wRows = await count("#dbody .row");
console.log(`Погода: ${wRows} городов`);
if (wRows < 20) problems.push("Погода по городам не загрузилась");
await page.click('.tabs [data-sector="sources"]');
await page.waitForTimeout(400);
const srcTable = await page.$$eval("table.src tbody tr", (trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.firstChild?.textContent?.trim() || td.textContent.trim().slice(0, 30)).join(" | ")));
console.log("Источники:"); srcTable.forEach((r) => console.log("  •", r));
await page.screenshot({ path: `${SHOTS}/4-sources.png` });

// Телефон
await page.setViewportSize({ width: 400, height: 850 });
await page.click('.tabs [data-sector="all"]');
await page.waitForTimeout(800);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
if (overflow) problems.push("На телефоне страница прокручивается по горизонтали");
await page.screenshot({ path: `${SHOTS}/5-phone.png`, fullPage: true });

if (failed.length) notes.push("Неудачные запросы: " + failed.slice(0, 8).join("; "));
console.log("");
notes.forEach((n) => console.log("Замечание:", n));
if (problems.length) { console.log("\nПРОБЛЕМЫ:"); problems.forEach((p) => console.log("  ✗", p)); }
else console.log("ИТОГ: всё работает ✓");
await browser.close();
process.exit(problems.length ? 1 : 0);

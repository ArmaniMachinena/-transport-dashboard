// Презентационные скриншоты дашборда (для описаний, презентаций, README).
// Открывает сайт в headless-браузере 1920×1080, ждёт загрузки тайлов и данных,
// снимает обзор, проваливание в трассу и аэропорт, панель слоёв, погоду, телефон.
// Использование: node scripts/shots.mjs <URL> [папка вывода]
// Если сайт под паролем — SITE_PASSWORD в окружении.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = (process.argv[2] || "http://localhost:8000").replace(/\/$/, "") + "/";
const OUT = process.argv[3] || "shots";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "ru-RU", timezoneId: "Asia/Almaty" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("Ошибка скрипта страницы:", e.message));
const shot = async (name, opts = {}) => { await page.screenshot({ path: `${OUT}/${name}.png`, ...opts }); console.log("снято:", name); };
const settle = (ms) => page.waitForTimeout(ms);
// ждём, пока догрузятся тайлы карты (не дольше max мс)
async function tiles(max = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    const pending = await page.$$eval("img.leaflet-tile", (imgs) => imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).length).catch(() => 0);
    if (pending === 0) break;
    await settle(500);
  }
  await settle(800);
}
const mt = (fn) => page.evaluate(fn);

// Для локальной проверки без интернета: LEAFLET_DIR=путь к node_modules/leaflet/dist
if (process.env.LEAFLET_DIR) await page.route(/leaflet\.min\.(js|css)$/, (r) => r.fulfill({ path: `${process.env.LEAFLET_DIR}/leaflet.${r.request().url().endsWith(".css") ? "css" : "js"}` }));

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
if (await page.$("#pw")) {
  const pw = (process.env.SITE_PASSWORD || "").trim();
  if (!pw) { console.log("Сайт под паролем, SITE_PASSWORD не задан"); await shot("0-gate"); await browser.close(); process.exit(1); }
  await page.fill("#pw", pw); await page.click("#go");
}
await page.waitForSelector("#kpis .kpi", { timeout: 90000 });
await page.waitForFunction(() => window.__mt && window.__mt.weather > 0, null, { timeout: 60000 }).catch(() => console.log("погода не дождалась"));
await settle(2000);

// 1. Обзор: панель слоёв закрыта, вкладка «Обзор», вся страна
await mt(() => { __mt.setLp(false); __mt.go({ sector: "all" }); __mt.map.fitBounds([[40.6, 46.5], [55.4, 87.3]]); });
await tiles(20000);
await shot("1-overview");

// 2. Крупнее: юго-восток (Алматы, Хоргос, горы) — видны самолёты, аэропорты, трассы
await mt(() => { __mt.map.flyTo([44.3, 76.5], 7.25, { animate: false }); });
await tiles(20000);
await shot("2-southeast");

// 3. Дороги → первая трасса в списке (проваливание)
await mt(() => __mt.go({ sector: "roads" }));
await settle(600);
if (await page.$("#dbody .row")) { await page.click("#dbody .row"); await settle(1500); }
await tiles(12000);
await shot("3-road-detail");

// 4. Авиа → аэропорт Астана
await mt(() => __mt.go({ sector: "air", obj: { type: "airport", icao: "UACC" } }));
await settle(1500); await tiles(12000);
await shot("4-airport-detail");

// 5. Панель слоёв: спутник Google + ЖД + температура поверхности NASA
await mt(() => { __mt.map.fitBounds([[40.6, 46.5], [55.4, 87.3]]); __mt.go({ sector: "all" }); __mt.setLp(true); __mt.setBase("esri-sat"); __mt.setLayer("orm", true); __mt.setLayer("gibs-lst", true); });
await settle(1000); await tiles(25000);
await shot("5-layers");

// 6. Погода: температурная сетка на тёмной схеме
await mt(() => { __mt.setLayer("orm", false); __mt.setLayer("gibs-lst", false); __mt.setBase("esri-dark"); __mt.setLp(false); __mt.go({ sector: "weather" }); });
await settle(1000); await tiles(15000);
await shot("6-weather");

// 7. Источники
await mt(() => { __mt.setLayer("temp", false); __mt.go({ sector: "sources" }); });
await settle(800);
await shot("7-sources");

// 8. Телефон
await mt(() => __mt.go({ sector: "all" }));
await page.setViewportSize({ width: 430, height: 932 });
await settle(1500); await tiles(15000);
await shot("8-phone");

console.log("Готово:", OUT);
await browser.close();

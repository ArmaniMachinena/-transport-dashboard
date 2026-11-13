// Сборка сайта под паролем.
// Собирает index.html + assets в одну страницу, сжимает (gzip), шифрует (AES-256-GCM,
// ключ из пароля через PBKDF2-SHA256, 600 000 итераций) и кладёт в <вывод>/app.bin.
// Страница-«калитка» <вывод>/index.html расшифровывает приложение в браузере.
// Использование: SITE_PASSWORD=... node scripts/build-app.mjs <папка вывода>   (корень репозитория: ".")
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes, webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";

const OUT = process.argv[2] || "_site";
const pw = (process.env.SITE_PASSWORD || "").trim();
if (!pw) { console.error("Не задан SITE_PASSWORD"); process.exit(2); }
if (pw.length < 8) { console.error("Пароль короче 8 символов"); process.exit(2); }
await mkdir(OUT, { recursive: true });

// 1. Одна страница: стили и собранный скрипт внутри
const { build } = await import("esbuild"); // npm i --no-save esbuild
const bundle = await build({ entryPoints: ["_src/assets/app.js"], bundle: true, format: "esm", minify: true, target: "es2022", write: false, logLevel: "warning" });
const js = bundle.outputFiles[0].text;
const css = await readFile("_src/assets/style.css", "utf8");
let html = await readFile("_src/index.html", "utf8");
html = html.replace('<link rel="stylesheet" href="assets/style.css">', `<style>${css}</style>`);
html = html.replace('<script type="module" src="assets/app.js"></script>', `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`);
if (/assets\/(app|style)/.test(html)) throw new Error("ссылки на assets остались в странице");

// 2. gzip + AES-GCM
const plain = gzipSync(Buffer.from(html, "utf8"), { level: 9 });
const salt = randomBytes(16), iv = randomBytes(12), iter = 600000, aad = new TextEncoder().encode("kz-transport-v1");
const base = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const enc = Buffer.from(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plain));
await writeFile(`${OUT}/app.bin`, enc);

// 3. Калитка с параметрами шифрования
const cfg = JSON.stringify({ salt: salt.toString("base64"), iv: iv.toString("base64"), iter, size: enc.length });
const gate = (await readFile("_src/gate.html", "utf8")).replace("__CFG__", cfg);
if (!gate.includes(cfg)) throw new Error("в gate.html нет метки __CFG__");
await writeFile(`${OUT}/index.html`, gate);
console.log(`Собрано: страница ${(html.length / 1024).toFixed(0)} КБ → app.bin ${(enc.length / 1024).toFixed(0)} КБ; калитка index.html`);

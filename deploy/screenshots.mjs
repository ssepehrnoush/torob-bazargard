// Walks the demo flow in headless Chrome at phone size and saves a screenshot per screen.
//   node deploy/screenshots.mjs [baseUrl] [outDir]
// Needs the app running (default http://localhost:8077) with an LLM provider configured.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:8077";
const OUT = process.argv[3] || "docs/screens";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9339;
mkdirSync(OUT, { recursive: true });

const proc = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "bz-"))}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=390,844", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("chrome did not start");
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

async function waitFor(expr, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await js(`!!(${expr})`)) return true;
    await sleep(300);
  }
  console.warn("timeout waiting for", expr);
  return false;
}
const clickText = (text, sel = "button") => js(`(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim().includes(${JSON.stringify(text)}));
  if (el) { el.scrollIntoView({ block: "center" }); el.click(); return true } return false })()`);
const scrollTo = (sel, block = "start") => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { el.scrollIntoView({ block: "${block}" }); return true } return false })()`);

async function shot(name) {
  await sleep(700);
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log("saved", name);
}

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp("Page.navigate", { url: `${BASE}/?demo=1` });
await sleep(1500);
await js("localStorage.clear(); location.reload(); true");
await sleep(2000);
await shot("01-home");

// 1) "I don't know which model" -> chip questions
await js(`(() => { const i = document.querySelector('.composer input');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(i, 'یه گوشی سامسونگ با دوربین خوب می‌خوام ولی نمی‌دونم کدوم مدل، تا ۲۰۰ میلیون، قسطی');
  i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.composer form').requestSubmit(); return true })()`);
await waitFor("document.querySelector('.ask')");
await scrollTo(".ububble");
await shot("02-ask-chips");

// answer the first option of every open question until products arrive
for (let round = 0; round < 3; round++) {
  if (await js("document.querySelectorAll('.pcard').length >= 2")) break;
  await js(`(() => { const asks = [...document.querySelectorAll('.ask')]; const a = asks[asks.length - 1];
    if (!a) return false; a.querySelectorAll('.opts').forEach((o) => o.querySelector('.opt')?.click());
    const go = [...a.querySelectorAll('button')].find((b) => b.textContent.includes('ادامه')); go?.click(); return true })()`);
  await waitFor("document.querySelectorAll('.pcard').length >= 2 || (document.querySelectorAll('.ask').length > " + (round + 1) + ")", 30000);
}
await scrollTo(".agent:last-of-type .amsg");
await shot("03-products");
await scrollTo(".pcard:nth-of-type(2)", "center");
await shot("04-product-cards");

// 2) compare two products
await js(`(() => { const b = [...document.querySelectorAll('.pcard button')].filter((x) => x.textContent.includes('مقایسه')); b[0]?.click(); b[1]?.click(); return b.length })()`);
await sleep(400);
await clickText("مقایسه کن");
await waitFor("document.querySelector('.sheet .compare-table') && !document.querySelector('.sheet .insight .shimmer')");
await shot("05-compare");

// 3) shops for the first compared product
await js(`(() => { const b = [...document.querySelectorAll('.sheet button')].find((x) => x.textContent.trim() === 'فروشگاه‌ها'); b?.click(); return !!b })()`);
await waitFor("document.querySelectorAll('.scard').length >= 1 && !document.querySelector('.insight .shimmer')");
await shot("06-shops");
await scrollTo(".scard", "start");
await js("window.scrollBy(0, -70); true");
await shot("07-shop-cards");
await clickText("نمایش همه");
await waitFor("document.querySelectorAll('.scard').length >= 3");
await clickText("نقشه");
await waitFor("document.querySelector('.leaflet-container')");
await sleep(2500);
await scrollTo(".mapbox", "center");
await shot("08-map");
await clickText("فهرست");

// shop sheet with in-mall guide: first card whose mall line mentions a passage
await js(`(() => { const c = [...document.querySelectorAll('.scard')].find((s) => /پاساژ|مجتمع/.test(s.textContent) && /طبقه/.test(s.textContent)) || document.querySelector('.scard');
  [...c.querySelectorAll('button')].find((b) => b.textContent.includes('جزئیات'))?.click(); return true })()`);
await waitFor("document.querySelector('.sheet .hours')");
await js(`(() => { const g = [...document.querySelectorAll('.sheet .bold')].find((b) => b.textContent.includes('مسیر داخل پاساژ')); g?.scrollIntoView({ block: 'start' }); return !!g })()`);
await shot("09-mall-guide");
await js(`(() => { const g = [...document.querySelectorAll('.sheet .bold')].find((b) => b.textContent.includes('ساعت کاری')); g?.scrollIntoView({ block: 'start' }); return !!g })()`);
await shot("10-shop-hours");
await js("document.querySelector('.backdrop')?.click(); true");
await sleep(400);

// 4) inquiry with demo scenarios: confirmed / price change / no answer
await js("window.scrollTo(0, 0); true");
await js(`(() => { const b = [...document.querySelectorAll('.sticky-cta button')][0]; b?.click(); return !!b })()`);
await waitFor("document.querySelectorAll('.scenario').length >= 1");
await js(`(() => { const rows = [...document.querySelectorAll('.scenario')];
  const pick = (row, label) => [...row.querySelectorAll('button')].find((b) => b.textContent === label)?.click();
  if (rows[0]) pick(rows[0], 'موجود'); if (rows[1]) pick(rows[1], 'تغییر قیمت'); if (rows[2]) pick(rows[2], 'بی‌پاسخ'); return rows.length })()`);
await shot("11-inquiry-draft");
await clickText("ارسال و استعلام");
await waitFor("document.querySelectorAll('.bubble-in').length >= 1", 20000);
await shot("12-inquiry-replies");
await waitFor("[...document.querySelectorAll('.insight h3')].some((h) => h.textContent.includes('جمع‌بندی'))", 40000);
await js(`(() => { const h = [...document.querySelectorAll('.insight h3')].find((x) => x.textContent.includes('جمع‌بندی')); h?.closest('.insight').scrollIntoView({ block: 'start' }); window.scrollBy(0, -150); return true })()`);
await shot("13-inquiry-summary");

// visit plan
await clickText("برنامهٔ مراجعه با فروشگاه‌های تأییدشده");
await waitFor("document.querySelector('.timeline')");
await sleep(2500);
await shot("14-visit-map");
await scrollTo(".timeline", "start");
await js("window.scrollBy(0, -140); true");
await shot("15-visit-timeline");

// about sheet
await js(`document.querySelector('[aria-label="دربارهٔ داده و روش کار"]').click(); true`);
await waitFor("document.querySelector('.sheet')");
await shot("16-about");

// desktop
await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
await js("document.querySelector('.backdrop')?.click(); window.scrollTo(0,0); true");
await shot("17-desktop");

ws.close();
proc.kill();
process.exit(0);

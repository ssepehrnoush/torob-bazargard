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
await waitFor("document.querySelector('.ask') || document.querySelectorAll('.pcard').length >= 2");
await sleep(900);
await shot("02-ask-chips");

// answer the first option of every open question until products arrive (one tap per question, like a person)
for (let round = 0; round < 4; round++) {
  if (await js("document.querySelectorAll('.pcard').length >= 2")) break;
  const nq = await js("(() => { const a = [...document.querySelectorAll('.ask')].pop(); return a ? a.querySelectorAll('.chips').length : 0 })()");
  for (let q = 0; q < nq; q++) {
    await js(`(() => { const a = [...document.querySelectorAll('.ask')].pop(); a?.querySelectorAll('.chips')[${q}]?.querySelector('.chip')?.click(); return true })()`);
    await sleep(250);
  }
  await js(`(() => { const a = [...document.querySelectorAll('.ask')].pop(); const go = a && [...a.querySelectorAll('button')].find((b) => b.textContent.trim() === 'ادامه'); go?.click(); return true })()`);
  await waitFor("document.querySelectorAll('.pcard').length >= 2 || (document.querySelectorAll('.ask').length > " + (round + 1) + " && !document.querySelector('.agent .typing'))", 40000);
  await sleep(600);
}
await sleep(1200); // the view scrolls itself to the top of the answer
await shot("03-products");
await scrollTo(".pcard:nth-of-type(2)", "center");
await shot("04-product-cards");

// 2) compare two products
await js(`(() => { const b = [...document.querySelectorAll('.pcard .checkline')]; b[0]?.click(); setTimeout(() => b[1]?.click(), 120); return b.length })()`);
await sleep(600);
await clickText("مقایسه کن");
await waitFor("document.querySelector('.sheet .table') && !document.querySelector('.sheet .ainote .shimmer')");
await shot("05-compare");

// 3) shops for the first compared product
await js(`(() => { const b = [...document.querySelectorAll('.sheet .cmpcol button')].find((x) => x.textContent.trim() === 'فروشگاه‌ها'); b?.click(); return !!b })()`);
await waitFor("document.querySelectorAll('.scard').length >= 1 && !document.querySelector('.ainote .shimmer')");
await sleep(800);
await shot("06-shops");
await clickText("نمایش همه");
await waitFor("document.querySelectorAll('.scard').length >= 3");
await sleep(800);
await scrollTo(".listhead", "start");
await js("window.scrollBy(0, -110); true");
await shot("07-shop-cards");
await js("document.querySelector('.mapbtn')?.click(); true");
await waitFor("document.querySelector('.leaflet-container')");
await sleep(2500);
await scrollTo(".mapbox", "center");
await shot("08-map");
await js("document.querySelector('.mapbtn')?.click(); true");

// shop sheet with in-mall guide: first row whose place mentions a passage and a floor
await js(`(() => { const c = [...document.querySelectorAll('.scard')].find((s) => /پاساژ|مجتمع/.test(s.textContent) && /طبقه/.test(s.textContent)) || document.querySelector('.scard');
  c.querySelector('.scard-main')?.click(); return true })()`);
await waitFor("document.querySelector('.sheet .folds')");
await sleep(600);
await js(`(() => { const g = document.querySelector('.sheet .folds'); const b = document.querySelector('.sheet .sheetbody'); b.scrollTop = g.offsetTop - 8; return true })()`);
await shot("09-mall-guide");
await js(`(() => { const f = [...document.querySelectorAll('.sheet .fold-head')].find((b) => b.textContent.includes('ساعت کاری')); f?.click(); setTimeout(() => f?.scrollIntoView({ block: 'start' }), 50); return !!f })()`);
await sleep(500);
await shot("10-shop-hours");
await js("document.querySelector('.backdrop')?.click(); true");
await sleep(400);

// 4) inquiry with demo scenarios: confirmed / price change / no answer
await js("window.scrollTo(0, 0); true");
await js(`(() => { const b = document.querySelector('.sticky-cta .btn'); b?.click(); return !!b })()`);
await waitFor("document.querySelectorAll('.scenario').length >= 1 && document.querySelector('.bubble-out')");
await js(`(() => { const rows = [...document.querySelectorAll('.scenario')];
  const pick = (row, label) => [...row.querySelectorAll('button')].find((b) => b.textContent === label)?.click();
  if (rows[0]) pick(rows[0], 'موجود'); if (rows[1]) pick(rows[1], 'تغییر قیمت'); if (rows[2]) pick(rows[2], 'بی‌پاسخ'); return rows.length })()`);
await sleep(300);
await shot("11-inquiry-draft");
await js("document.querySelector('.sticky-cta .btn')?.click(); true");
await waitFor("document.querySelectorAll('.bubble-in').length >= 2", 20000);
await shot("12-inquiry-replies");
await waitFor("[...document.querySelectorAll('.ainote-title')].some((h) => h.textContent.includes('جمع‌بندی'))", 40000);
await js(`(() => { const h = [...document.querySelectorAll('.ainote-title')].find((x) => x.textContent.includes('جمع‌بندی')); h?.closest('.ainote').scrollIntoView({ block: 'start' }); window.scrollBy(0, -110); return true })()`);
await shot("13-inquiry-summary");

// visit plan, then the shopping stroll
await clickText("برنامهٔ رفتن با");
await waitFor("document.querySelector('.timeline')");
await sleep(2500);
await js("window.scrollTo(0, 0); true");
await shot("14-visit-map");
await scrollTo(".timeline", "start");
await js("window.scrollBy(0, -110); true");
await shot("15-visit-timeline");
await js("document.querySelector('.strollcta')?.click(); true");
await waitFor("document.querySelector('.sheet .strollrow') || document.querySelector('.sheet .empty')", 20000);
await sleep(2000);
await shot("16-stroll");
await js("document.querySelector('.backdrop')?.click(); true");
await sleep(400);

// time range and travel mode: Tajrish by metro, nothing within 20 minutes -> far-away bargain
await js("document.querySelector('.placechip')?.click(); true");
await waitFor("document.querySelector('.sheet .segmented')");
await sleep(400);
await shot("17-route-sheet");
await js(`(() => { const q = (t) => [...document.querySelectorAll('.sheet button')].find((b) => b.textContent.includes(t));
  q('با مترو')?.click(); setTimeout(() => q('محلهٔ دیگر')?.click(), 100); setTimeout(() => q('میدان تجریش')?.click(), 250); setTimeout(() => q('نمایش نتیجه')?.click(), 400); return true })()`);
await sleep(800);
await clickText("فروشگاه‌ها", ".jstep");
await waitFor("document.querySelector('.bargain') || document.querySelectorAll('.scard').length", 20000);
await sleep(1200);
await js("window.scrollTo(0, 0); true");
await shot("18-bargain");
await js("document.querySelector('.bargain .btn')?.click(); true");
await sleep(1500);
await shot("19-bargain-shop");
await js(`(() => { const r = [...document.querySelectorAll('.scard')].find((s) => s.querySelector('.line-dot')); r?.querySelector('.scard-main')?.click(); return !!r })()`);
await waitFor("document.querySelector('.sheet .folds')");
await sleep(600);
await shot("20-metro-route");
await js("document.querySelector('.backdrop')?.click(); true");
await sleep(300);

// about sheet
await js(`document.querySelector('[aria-label="دربارهٔ داده و روش کار"]').click(); true`);
await waitFor("document.querySelector('.sheet')");
await sleep(400);
await shot("21-about");

// desktop
await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
await js("document.querySelector('.backdrop')?.click(); window.scrollTo(0,0); true");
await shot("22-desktop");

ws.close();
proc.kill();
process.exit(0);

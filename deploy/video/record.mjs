// Records the demo from a real run of the live app at phone size: drives the UI in headless Chrome, captures
// frames with the DevTools screencast, speeds up the waits for the AI, shows a soft dot where each tap lands,
// and times every scene to its voice clips (from voice.py). Every tap, request and answer is real.
//   node deploy/video/record.mjs [baseUrl] [--scenes home,ask,...]
//   then: python -I deploy/video/build.py
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "https://bazargard.liara.run";
const OUT = join(ROOT, "_video", "rec");
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9341;
const W = 390, H = 844, DPR = 1.25; // 488x1055 frames: a little above the size the phone has in the video

const narration = JSON.parse(readFileSync(join(HERE, "narration.json"), "utf8")).scenes;
const voice = JSON.parse(readFileSync(join(ROOT, "_video", "voice", "manifest.json"), "utf8"));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "frames"), { recursive: true });
const log = (...a) => { const line = [new Date().toISOString().slice(11, 19), ...a].join(" "); console.log(line); appendFileSync(join(OUT, "log.txt"), `${line}\n`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- chrome + cdp
const proc = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "bzv-"))}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });
async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page");
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
const handlers = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method && handlers.has(m.method)) handlers.get(m.method)(m.params);
});
// every request has a deadline: one lost reply must not freeze the whole recording
const cdp = (method, params = {}, ms = 15000) => new Promise((res, rej) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method}: no reply in ${ms} ms`)); }, ms);
  pending.set(id, (m) => { clearTimeout(timer); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr) => {
  try { return (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value; }
  catch (e) { log("js failed:", e.message, expr.slice(0, 60)); return undefined; }
};

// ---------------------------------------------------------------- virtual clock and frames
// Waits for the AI run at 4x in the final video; everything else is real time.
const rec = { frames: [], cues: [], scenes: [], vt: 0, last: Date.now(), speed: 1, n: 0 };
const tick = () => { const now = Date.now(); rec.vt += (now - rec.last) / rec.speed; rec.last = now; return rec.vt; };
const setSpeed = (s) => { tick(); rec.speed = s; };
// Steady screenshots (~15 per second) instead of the DevTools screencast, which stops sending frames after a
// while in headless Chrome and sends nothing at all while the page is still.
let capturing = false;
async function captureLoop() {
  while (capturing) {
    const began = Date.now();
    const t = tick();
    try {
      const { data } = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 84 }, 4000);
      if (!rec.frames.length || t - rec.frames.at(-1).t >= 33) { // at most ~30 fps of final video
        const file = `f${String(++rec.n).padStart(6, "0")}.jpg`;
        writeFileSync(join(OUT, "frames", file), Buffer.from(data, "base64"));
        rec.frames.push({ t: Math.round(t), file });
      }
    } catch { /* page busy navigating: next round */ }
    await sleep(Math.max(0, 66 - (Date.now() - began)));
  }
}
const hold = async (sec) => { setSpeed(1); await sleep(sec * 1000); tick(); };

// ---------------------------------------------------------------- narration timing
let scene = null;
let voiceEnd = 0; // virtual ms when the last clip that was started ends
function beginScene(id) {
  scene = narration.find((s) => s.id === id);
  if (!scene) throw new Error(`no scene ${id}`);
  scene.lineIx = 0;
  rec.scenes.push({ id, title: scene.title, step: scene.step, start: Math.round(tick()) });
  log("SCENE", id);
}
async function say() {
  // the next line starts when the previous clip has finished (plus a breath)
  const wait = voiceEnd + 250 - tick();
  if (wait > 0) await hold(wait / 1000);
  const lid = `${scene.id}-${scene.lineIx++}`;
  const v = voice[lid];
  if (!v) throw new Error(`no voice clip for ${lid}`);
  const start = tick();
  rec.cues.push({ id: lid, scene: scene.id, start: Math.round(start), dur: v.dur, file: v.file, text: v.text });
  voiceEnd = start + v.dur * 1000;
  log("SAY", lid, v.text.slice(0, 40));
}
async function endScene(pad = 0.5) {
  const wait = voiceEnd + pad * 1000 - tick();
  if (wait > 0) await hold(wait / 1000);
  rec.scenes.at(-1).end = Math.round(tick());
}

// ---------------------------------------------------------------- page helpers
async function waitFor(expr, ms = 60000, fast = true) {
  if (fast) setSpeed(4);
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < ms) {
    if (await js(`!!(${expr})`)) { ok = true; break; }
    await sleep(250);
  }
  setSpeed(1);
  if (!ok) log("timeout waiting for", expr);
  return ok;
}
const TAP_CSS = `.__tap{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(233,30,51,.28);
  border:2px solid rgba(233,30,51,.55);pointer-events:none;z-index:2147483647;animation:__tap .6s ease-out forwards}
  @keyframes __tap{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.5);opacity:0}}`;
async function tapEl(expr, { scroll = true } = {}) {
  const ok = await js(`(() => { const el = ${expr}; if (!el) return false;
    ${scroll ? "el.scrollIntoView({ block: 'center', behavior: 'smooth' });" : ""} return true })()`);
  if (!ok) { log("missing", expr.slice(0, 80)); return false; }
  if (scroll) await hold(0.45);
  await js(`(() => { const el = ${expr}; const r = el.getBoundingClientRect();
    if (!document.getElementById('__tapcss')) { const s = document.createElement('style'); s.id = '__tapcss'; s.textContent = ${JSON.stringify(TAP_CSS)}; document.head.append(s); }
    const d = document.createElement('div'); d.className = '__tap'; d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height / 2) + 'px';
    document.body.append(d); setTimeout(() => d.remove(), 700); return true })()`);
  await hold(0.18);
  await js(`(() => { ${expr}?.click(); return true })()`);
  await hold(0.3);
  return true;
}
const byText = (text, sel = "button") =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim().includes(${JSON.stringify(text)}))`;
async function type(text) {
  // type like a person: a few characters at a time into the React-controlled input
  for (let i = 2; i <= text.length + 1; i += 2) {
    await js(`(() => { const el = document.querySelector('.composer input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}.slice(0, ${i}));
      el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`);
    await sleep(45);
  }
  tick();
}
async function smoothScroll(dy, sec = 1.2, sel = null) {
  const steps = Math.max(1, Math.round(sec * 30));
  for (let i = 0; i < steps; i++) {
    await js(`(() => { const el = ${sel ? `document.querySelector(${JSON.stringify(sel)})` : "null"};
      (el || window).scrollBy(0, ${dy / steps}); return true })()`);
    await sleep(1000 / 30);
  }
  tick();
}

// ---------------------------------------------------------------- start
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
await cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
await cdp("Page.navigate", { url: `${BASE}/?demo=1` });
await sleep(1500);
await js("localStorage.clear(); location.reload(); true");
await sleep(3000);
rec.last = Date.now();
capturing = true;
const capture = captureLoop();
await hold(0.4);

// 1) home
beginScene("home");
await say();
await hold(1.5);
await smoothScroll(260, 1.4);
await say();
await hold(2.0);
await smoothScroll(-260, 1.0);
await say();
await endScene(0.3);

// 2) "I don't know which model"
beginScene("ask");
await tapEl("document.querySelector('.composer input')", { scroll: false });
await say();
await type("یه گوشی سامسونگ با دوربین خوب می‌خوام، تا ۲۰۰ میلیون، قسطی. اورجینال باشه");
await hold(0.4);
await tapEl("document.querySelector('.composer .sendbtn')", { scroll: false });
await js("document.querySelector('.composer form')?.requestSubmit(); true");
await waitFor("document.querySelector('.ask') || document.querySelectorAll('.pcard').length >= 2");
await hold(0.8);
await say();
await hold(1.0);
await say();
await endScene();

// 3) products with reasons
beginScene("products");
await say();
for (let round = 0; round < 4; round++) {
  if (await js("document.querySelectorAll('.pcard').length >= 2")) break;
  const nq = await js("(() => { const a = [...document.querySelectorAll('.ask')].pop(); return a ? a.querySelectorAll('.chips').length : 0 })()");
  for (let q = 0; q < nq; q++) {
    await tapEl(`[...document.querySelectorAll('.ask')].pop()?.querySelectorAll('.chips')[${q}]?.querySelector('.chip')`);
  }
  await tapEl(`(() => { const a = [...document.querySelectorAll('.ask')].pop(); return a && [...a.querySelectorAll('button')].find((b) => b.textContent.trim() === 'ادامه') })()`);
  await waitFor(`document.querySelectorAll('.pcard').length >= 2 || (document.querySelectorAll('.ask').length > ${round + 1} && !document.querySelector('.agent .typing'))`);
  await hold(0.6);
}
await hold(1.2); // the view scrolls itself to the top of the answer
await say();
await hold(1.5);
await smoothScroll(420, 2.2);
await endScene();

// 4) compare two
beginScene("compare");
await say();
await tapEl("document.querySelectorAll('.pcard .checkline')[0]");
await tapEl("document.querySelectorAll('.pcard .checkline')[1]");
await tapEl(byText("مقایسه کن"));
await waitFor("document.querySelector('.sheet .table') && !document.querySelector('.sheet .ainote .shimmer')");
await hold(0.6);
await say();
await hold(2.0);
await smoothScroll(260, 1.5, ".sheet .sheetbody");
await endScene();

// 5) shops: route sheet, ranking, freshness, map
beginScene("shops");
await say();
await tapEl("[...document.querySelectorAll('.sheet .cmpcol button')].find((x) => x.textContent.trim() === 'فروشگاه‌ها')");
await waitFor("document.querySelectorAll('.scard').length >= 1 && !document.querySelector('.ainote .shimmer')");
await hold(0.6);
await tapEl("document.querySelector('.placechip')", { scroll: false });
await waitFor("document.querySelector('.sheet .segmented')", 10000, false);
await say();
await hold(1.2);
await tapEl("document.querySelector('.sheet .filtersrow')");
await waitFor("[...document.querySelectorAll('.sheet h3')].some((h) => h.textContent.includes('کی می‌روید'))", 10000, false);
await hold(0.4);
await tapEl(byText("فردا صبح", ".sheet button"));
await say();
await hold(0.8);
await tapEl(byText("نمایش نتیجه", ".sheet button"), { scroll: false });
await waitFor("!document.querySelector('.sheet') && document.querySelectorAll('.scard').length >= 1 && !document.querySelector('.ainote .shimmer')");
await tapEl(byText("نمایش همه"));
await waitFor("document.querySelectorAll('.scard').length >= 3", 15000);
await js("window.scrollTo({ top: 0, behavior: 'smooth' }); true");
await say();
await hold(0.8);
await tapEl(byText("ارزان‌ترین"));
await hold(1.2);
await tapEl(byText("نزدیک‌ترین"));
await hold(1.2);
await tapEl(byText("پیشنهادی"));
await smoothScroll(300, 1.4);
await say();
await hold(1.0);
await tapEl("document.querySelector('.mapbtn')");
await waitFor("document.querySelector('.leaflet-container')", 15000, false);
await hold(0.5);
await js("document.querySelector('.mapbox')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); true");
await hold(2.5);
await tapEl("document.querySelector('.mapbtn')");
await endScene();

// 6) finding the shop inside the passage
beginScene("mall");
await tapEl(`(() => { const c = [...document.querySelectorAll('.scard')].find((s) => /پاساژ|مجتمع/.test(s.textContent) && /طبقه/.test(s.textContent)) || document.querySelector('.scard'); return c?.querySelector('.scard-main') })()`);
await waitFor("document.querySelector('.sheet .folds')", 15000, false);
await say();
await hold(0.8);
await js(`(() => { const g = document.querySelector('.sheet .folds'); const b = document.querySelector('.sheet .sheetbody'); b.scrollTo({ top: g.offsetTop - 8, behavior: 'smooth' }); return true })()`);
await say();
await hold(1.0);
await tapEl(byText("ساعت کاری", ".sheet .fold-head"));
await say();
await hold(0.8);
await smoothScroll(220, 1.2, ".sheet .sheetbody");
await endScene();
await tapEl("document.querySelector('.backdrop')", { scroll: false });

// 7) inquiry with demo scenarios: confirmed / price change / no answer
beginScene("inquiry");
await js("window.scrollTo({ top: 0, behavior: 'smooth' }); true");
await hold(0.5);
for (let i = 0; i < 6; i++) {
  if ((await js("document.querySelectorAll('.scard .selbox.on').length")) >= 3) break;
  await tapEl("[...document.querySelectorAll('.scard .selbox')].find((b) => !b.classList.contains('on'))");
}
await say();
await tapEl("document.querySelector('.sticky-cta .btn')", { scroll: false });
await waitFor("document.querySelectorAll('.scenario').length >= 1 && document.querySelector('.bubble-out')", 20000, false);
await hold(0.6);
for (const [ix, label] of [[0, "موجود"], [1, "تغییر قیمت"], [2, "بی‌پاسخ"]]) {
  await tapEl(`(() => { const row = document.querySelectorAll('.scenario')[${ix}]; return row && [...row.querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(label)}) })()`);
}
await js("document.querySelector('.bubble-out')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); true");
await say();
await hold(1.0);
await say();
await tapEl("document.querySelector('.sticky-cta .btn')", { scroll: false });
await waitFor("document.querySelectorAll('.bubble-in').length >= 2", 30000, false);
await say();
await hold(1.0);
await waitFor("[...document.querySelectorAll('.ainote-title')].some((h) => h.textContent.includes('جمع‌بندی'))", 60000);
await js(`(() => { const h = [...document.querySelectorAll('.ainote-title')].find((x) => x.textContent.includes('جمع‌بندی')); h?.closest('.ainote').scrollIntoView({ block: 'start', behavior: 'smooth' }); return true })()`);
await hold(0.8);
await say();
await hold(1.0);
await smoothScroll(320, 1.6);
await endScene();

// 8) visit plan and the shopping stroll
beginScene("visit");
await tapEl(byText("برنامهٔ رفتن با"));
await waitFor("document.querySelector('.timeline')", 20000, false);
await hold(1.5);
await js("window.scrollTo({ top: 0, behavior: 'smooth' }); true");
await say();
await hold(1.2);
await js("document.querySelector('.timeline')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); true");
await hold(1.0);
await say();
await js(`(() => { const b = [...document.querySelectorAll('a, button')].find((x) => x.textContent.includes('مسیریابی با نشان')); b?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return true })()`);
await hold(1.2);
await say();
await tapEl("document.querySelector('.strollcta')");
await waitFor("document.querySelector('.sheet .strollrow') || document.querySelector('.sheet .empty')", 20000, false);
await hold(2.0);
await smoothScroll(380, 2.0, ".sheet .sheetbody");
await endScene();
await tapEl("document.querySelector('.backdrop')", { scroll: false });

// 9) Tajrish by metro, nothing within 20 minutes -> far-away offer and its route
beginScene("bargain");
await js("window.scrollTo(0, 0); true");
await tapEl("document.querySelector('.placechip')", { scroll: false });
await waitFor("document.querySelector('.sheet .segmented')", 10000, false);
await say();
await tapEl(byText("با مترو", ".sheet button"));
await tapEl(byText("محلهٔ دیگر", ".sheet button"));
await tapEl(byText("میدان تجریش", ".sheet button"));
await hold(0.5);
await tapEl(byText("نمایش نتیجه", ".sheet button"), { scroll: false });
await hold(0.6);
await tapEl(byText("فروشگاه‌ها", ".jstep"), { scroll: false });
await waitFor("document.querySelector('.bargain') || document.querySelectorAll('.scard').length", 20000);
await js("window.scrollTo({ top: 0, behavior: 'smooth' }); true");
await say();
await hold(1.5);
await tapEl("document.querySelector('.bargain .btn')");
await hold(1.2);
await tapEl(`(() => { const r = [...document.querySelectorAll('.scard')].find((s) => s.querySelector('.line-dot')) || document.querySelector('.scard.flash') || document.querySelector('.scard'); return r?.querySelector('.scard-main') })()`);
await waitFor("document.querySelector('.sheet .folds')", 15000, false);
await say();
await hold(0.8);
await smoothScroll(200, 1.2, ".sheet .sheetbody");
await endScene();
await tapEl("document.querySelector('.backdrop')", { scroll: false });

// 10) transparency page
beginScene("outro");
await tapEl(`document.querySelector('[aria-label="دربارهٔ داده و روش کار"]')`, { scroll: false });
await waitFor("document.querySelector('.sheet')", 10000, false);
await say();
await hold(1.5);
await smoothScroll(360, 2.0, ".sheet .sheetbody");
await say();
await endScene(1.0);

capturing = false;
await capture;
const end = Math.round(tick());
writeFileSync(join(OUT, "timeline.json"), JSON.stringify({ frames: rec.frames, cues: rec.cues, scenes: rec.scenes, end }, null, 1));
log(`recorded ${rec.frames.length} frames, ${(end / 1000).toFixed(1)} s, ${rec.cues.length} voice cues -> ${OUT}`);
ws.close();
proc.kill();
process.exit(0);

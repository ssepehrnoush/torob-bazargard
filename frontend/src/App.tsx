import { useCallback, useEffect, useRef, useState } from "react";
import { get, stream } from "./api";
import { CompareSheet, ProductSheet } from "./components/Products";
import { AboutSheet } from "./components/AboutSheet";
import { ContextBar } from "./components/ContextBar";
import { DesktopAside } from "./components/DesktopAside";
import { RadishLogo } from "./components/Logo";
import { AgentBlock, Feed } from "./components/Feed";
import { InquiryView, type InquiryState } from "./components/InquiryView";
import { ShopSheet } from "./components/ShopSheet";
import { ShopsView } from "./components/ShopsView";
import { VisitView } from "./components/VisitView";
import { fa } from "./fmt";
import { Icon } from "./icons";
import type { Ctx, FeedItem, Meta, ProductCard } from "./types";

type Step = "discover" | "shops" | "inquiry" | "visit";
type AgentItem = Extract<FeedItem, { kind: "agent" }>;
type SheetState = null | { kind: "shop"; sid: number } | { kind: "product"; pid: number } | { kind: "compare" } | { kind: "about" };

const DEFAULT_CTX: Ctx = {
  lat: 35.6998, lon: 51.4197, place: "میدان فردوسی", radius_km: 5, budget_min: null, budget_max: null,
  visit: "now", installments_only: false, torob_pay_only: false, open_only: false,
};
const STEPS: { key: Step; label: string }[] = [
  { key: "discover", label: "انتخاب کالا" },
  { key: "shops", label: "فروشگاه‌ها" },
  { key: "inquiry", label: "استعلام" },
  { key: "visit", label: "مراجعه" },
];
const PLACEHOLDER: Record<Step, string> = {
  discover: "مثلاً: گوشی تا ۲۰ میلیون با باتری قوی",
  shops: "مثلاً: فقط قسطی‌ها رو نشون بده",
  inquiry: "سؤالی دربارهٔ این فروشگاه‌ها دارید؟",
  visit: "مثلاً: فردا صبح می‌رم، دوباره بچین",
};

function loadCtx(): Ctx {
  try {
    const raw = localStorage.getItem("bazargard.ctx");
    if (raw) return { ...DEFAULT_CTX, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_CTX;
}

let seq = 0;
const nid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ctx, setCtxState] = useState<Ctx>(loadCtx);
  const [step, setStep] = useState<Step>("discover");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [pid, setPid] = useState<number | null>(null);
  const [shopPicks, setShopPicks] = useState<{ sid: number; why: string }[]>([]);
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  const [compare, setCompare] = useState<number[]>([]);
  const [inq, setInq] = useState<InquiryState | null>(null);
  const [visit, setVisit] = useState<{ pid: number | null; sids: number[]; confirmed: Record<number, unknown> | null } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [input, setInput] = useState("");
  const session = useRef<string | null>(null);
  const ctxRef = useRef<Ctx>(ctx);
  const [productsKey, setProductsKey] = useState<string | null>(null);
  const firstNeed = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const demo = new URLSearchParams(window.location.search).has("demo");
  const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const speech = !!SR;
  const [listening, setListening] = useState(false);
  const listen = () => {
    if (!SR || listening) return;
    const rec = new SR();
    rec.lang = "fa-IR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const t = e.results?.[0]?.[0]?.transcript as string | undefined;
      if (t) send(t);
    };
    rec.onerror = () => toast("صدا تشخیص داده نشد؛ تایپ کنید");
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  useEffect(() => {
    get<Meta>("/api/meta").then(setMeta).catch(() => {});
  }, []);

  const setCtx = useCallback((c: Ctx) => {
    ctxRef.current = c;
    setCtxState(c);
    try {
      localStorage.setItem("bazargard.ctx", JSON.stringify(c));
    } catch {
      /* ignore */
    }
  }, []);

  const toast = useCallback((s: string) => {
    setToastMsg(s);
    window.setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const go = (s: Step) => {
    setStep(s);
    setOverlay(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openShops = (p: number, picks: { sid: number; why: string }[] = [], msg: string | null = null) => {
    setPid(p);
    setShopPicks(picks);
    setShopMsg(msg);
    setSheet(null);
    go("shops");
  };
  const startInquiry = (p: number, sids: number[]) => {
    setInq({ pid: p, sids, started: false, shops: [], replies: {}, summary: null, callScript: [], notice: "", product: null });
    setSheet(null);
    go("inquiry");
  };
  const startVisit = (p: number | null, sids: number[], confirmed: Record<number, unknown> | null) => {
    setVisit({ pid: p, sids, confirmed });
    setSheet(null);
    go("visit");
  };

  const prefKey = (c: Ctx) => [c.lat, c.lon, c.radius_km, c.budget_min, c.budget_max, c.installments_only].join("|");

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    if (!firstNeed.current) firstNeed.current = text;
    setInput("");
    setAskOpen(false);
    const aid = nid();
    const uid = nid();
    const t0 = performance.now();
    setFeed((f) => [...f, { kind: "user", id: uid, text }, { kind: "agent", id: aid, steps: [], pending: true }]);
    if (step === "discover") {
      window.setTimeout(() => document.querySelector(`[data-id="${uid}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
    if (step !== "discover") setOverlay(aid);
    setBusy(true);
    const patch = (fn: (a: AgentItem) => AgentItem) =>
      setFeed((f) => f.map((x) => (x.id === aid && x.kind === "agent" ? fn(x) : x)));
    try {
      await stream("/api/chat", { session_id: session.current, text, ctx, ui: { step, pid, compare } }, (ev) => {
        switch (ev.type) {
          case "session":
            session.current = ev.session_id;
            break;
          case "status":
            patch((a) => ({ ...a, status: ev.text }));
            break;
          case "step_start":
            patch((a) => ({ ...a, steps: [...a.steps, { id: ev.id, tool: ev.tool, label: ev.label, done: false }] }));
            break;
          case "step":
            patch((a) => {
              const id = ev.id ?? nid();
              const exists = a.steps.some((s) => s.id === id);
              const s = { id, tool: ev.tool, label: ev.label, detail: ev.detail, done: true };
              return { ...a, steps: exists ? a.steps.map((x) => (x.id === id ? s : x)) : [...a.steps, s] };
            });
            break;
          case "ctx":
            setCtx(ev.ctx);
            break;
          case "ask":
            patch((a) => ({ ...a, message: ev.message, ask: ev.questions }));
            break;
          case "products":
            patch((a) => ({ ...a, message: ev.message, products: ev.items, suggestions: ev.suggestions, notice: ev.notice }));
            setProductsKey(prefKey(ctxRef.current));
            if (step !== "discover") go("discover");
            break;
          case "shops":
            patch((a) => ({ ...a, message: ev.message, shopsPid: ev.pid, suggestions: ev.suggestions }));
            openShops(ev.pid, ev.picks ?? [], ev.message);
            setOverlay(null);
            break;
          case "inquiry":
            patch((a) => ({ ...a, message: ev.message, inquiry: { pid: ev.pid, sids: ev.sids } }));
            startInquiry(ev.pid, ev.sids);
            setOverlay(null);
            break;
          case "message":
            patch((a) => ({ ...a, message: ev.text, suggestions: ev.suggestions }));
            break;
          case "error":
            patch((a) => ({ ...a, error: ev.text }));
            break;
        }
      });
    } catch {
      patch((a) => ({ ...a, error: "ارتباط با سرور برقرار نشد؛ دوباره امتحان کنید." }));
    }
    patch((a) => ({ ...a, pending: false, elapsed: (performance.now() - t0) / 1000 }));
    setBusy(false);
  };

  const reset = () => {
    if (busy) return;
    session.current = null;
    firstNeed.current = null;
    setFeed([]);
    setCompare([]);
    setPid(null);
    setShopPicks([]);
    setShopMsg(null);
    setInq(null);
    setVisit(null);
    setSheet(null);
    setProductsKey(null);
    setCtx(DEFAULT_CTX);
    go("discover");
    toast("از اول شروع کنیم");
  };

  const toggleCompare = (p: number) => {
    setCompare((c) => {
      if (c.includes(p)) return c.filter((x) => x !== p);
      if (c.length >= 3) {
        toast("حداکثر ۳ کالا را می‌شود مقایسه کرد");
        return c;
      }
      return [...c, p];
    });
  };

  const reachable: Record<Step, boolean> = { discover: true, shops: pid != null, inquiry: inq != null, visit: visit != null };
  const overlayItem = overlay ? (feed.find((f) => f.id === overlay) as AgentItem | undefined) : undefined;
  const handlers = {
    ctx,
    compare,
    busy,
    onSend: send,
    onShops: (p: ProductCard) => openShops(p.pid),
    onCompare: toggleCompare,
    onDetails: (p: number) => setSheet({ kind: "product", pid: p }),
    onAnswered: (id: string) => setFeed((f) => f.map((x) => (x.id === id && x.kind === "agent" ? { ...x, answered: true } : x))),
    onOpenShops: (p: number) => openShops(p, shopPicks, shopMsg),
    onOpenInquiry: () => go("inquiry"),
  };

  return (
    <div className="app">
      <DesktopAside />
      <header className="top">
        <div className="brandrow">
          <div className="wordmark">
            <RadishLogo size={30} />
            <b>ترب</b>
            <i className="sep" />
            <span>خرید حضوری</span>
          </div>
          <div className="spacer" />
          {meta && !meta.llm.available && <span className="pill amber">حالت ساده</span>}
          {(feed.length > 0 || pid != null) && (
            <button className="iconbtn" onClick={reset} aria-label="شروع دوباره">
              <Icon name="refresh" size={19} />
            </button>
          )}
          <button className="iconbtn" onClick={() => setSheet({ kind: "about" })} aria-label="دربارهٔ داده و روش کار">
            <Icon name="info" size={20} />
          </button>
        </div>
        <nav className="journey" aria-label="مراحل خرید">
          {STEPS.map((s, i) => {
            const idx = STEPS.findIndex((x) => x.key === step);
            return (
              <button key={s.key} className={"jstep" + (s.key === step ? " active" : i < idx ? " done" : "")} disabled={!reachable[s.key]} onClick={() => go(s.key)}>
                <span className="bar" />
                <span>{fa(i + 1)}. {s.label}</span>
              </button>
            );
          })}
        </nav>
        <ContextBar ctx={ctx} setCtx={setCtx} meta={meta} toast={toast} />
      </header>

      <main>
        {step === "discover" && (
          <>
            <Feed items={feed} meta={meta} {...handlers}
              stale={!busy && productsKey != null && productsKey !== prefKey(ctx)}
              onRefresh={() => send("ترجیحاتم را عوض کردم؛ با شرایط جدید دوباره پیشنهاد بده")} />
            <div ref={endRef} />
          </>
        )}
        {step === "shops" && pid != null && (
          <ShopsView
            pid={pid}
            ctx={ctx}
            setCtx={setCtx}
            picks={shopPicks}
            agentMsg={shopMsg}
            onOpenShop={(sid) => setSheet({ kind: "shop", sid })}
            onInquiry={(sids) => startInquiry(pid, sids)}
            onVisit={(sids) => startVisit(pid, sids, null)}
            onProduct={(p) => openShops(p.pid)}
            onBack={() => go("discover")}
          />
        )}
        {step === "inquiry" && inq && (
          <InquiryView
            key={`${inq.pid}:${inq.sids.join(",")}`}
            st={inq}
            setSt={(f) => setInq((s) => (s ? f(s) : s))}
            ctx={ctx}
            demo={demo}
            toast={toast}
            onOpenShop={(sid) => setSheet({ kind: "shop", sid })}
            onVisit={(sids, confirmed) => startVisit(inq.pid, sids, confirmed)}
            onRestart={(sids) => startInquiry(inq.pid, sids)}
            onProduct={(p) => openShops(p.pid)}
          />
        )}
        {step === "visit" && visit && (
          <VisitView pid={visit.pid} sids={visit.sids} confirmed={visit.confirmed} ctx={ctx} toast={toast} onOpenShop={(sid) => setSheet({ kind: "shop", sid })} />
        )}
      </main>

      {step === "discover" && compare.length > 0 && (
        <div className="comparebar fadein">
          <Icon name="compare" />
          <span className="grow small">{fa(compare.length)} کالا برای مقایسه</span>
          <button className="small" style={{ color: "#bbb" }} onClick={() => setCompare([])}>پاک کردن</button>
          <button className="btn sm" disabled={compare.length < 2} onClick={() => setSheet({ kind: "compare" })}>مقایسه کن</button>
        </div>
      )}

      {step === "discover" ? (
        <div className="composer">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "در حال شنیدن…" : PLACEHOLDER[step]} enterKeyHint="send" aria-label="پیام به دستیار" />
            {speech && !input.trim() ? (
              <button type="button" className={"sendbtn" + (listening ? " rec" : "")} onClick={listen} disabled={busy} aria-label="گفتن با صدا"><Icon name="mic" size={20} /></button>
            ) : (
              <button className="sendbtn" type="submit" disabled={busy || !input.trim()} aria-label="ارسال"><Icon name="send" size={20} /></button>
            )}
          </form>
        </div>
      ) : (
        <>
          {overlayItem && (
            <div className="sheet" style={{ maxHeight: "60dvh", bottom: 70, borderRadius: 18, width: "min(456px, calc(100vw - 24px))", boxShadow: "0 10px 40px rgba(0,0,0,.2)", zIndex: 40 }}>
              <div className="sheethead">
                <h2 style={{ fontSize: 14 }}>پاسخ دستیار</h2>
                <button className="iconbtn" onClick={() => setOverlay(null)} aria-label="بستن"><Icon name="x" /></button>
              </div>
              <div className="sheetbody"><AgentBlock it={overlayItem} {...handlers} /></div>
            </div>
          )}
          {askOpen ? (
            <div className="composer" style={{ zIndex: 41 }}>
              <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
                <button type="button" className="iconbtn" onClick={() => setAskOpen(false)} aria-label="بستن"><Icon name="x" /></button>
                <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder={PLACEHOLDER[step]} enterKeyHint="send" />
                <button className="sendbtn" type="submit" disabled={busy || !input.trim()} aria-label="ارسال"><Icon name="send" size={20} /></button>
              </form>
            </div>
          ) : (
            <button className="btn blue fab" onClick={() => setAskOpen(true)}>
              <Icon name="spark" size={16} /> از دستیار بپرس
            </button>
          )}
        </>
      )}

      {sheet?.kind === "shop" && (
        <ShopSheet sid={sheet.sid} pid={step === "visit" ? visit?.pid ?? pid : step === "inquiry" ? inq?.pid ?? pid : pid} ctx={ctx}
          onClose={() => setSheet(null)}
          onInquiry={(sid) => pid != null && startInquiry(inq?.pid ?? pid, [sid])}
          onVisit={(sid) => startVisit(pid, [sid], null)}
          onOpenShop={(sid) => setSheet({ kind: "shop", sid })} />
      )}
      {sheet?.kind === "product" && (
        <ProductSheet pid={sheet.pid} ctx={ctx} onClose={() => setSheet(null)} onShops={() => openShops(sheet.pid)} />
      )}
      {sheet?.kind === "compare" && (
        <CompareSheet pids={compare} ctx={ctx} need={firstNeed.current} onClose={() => setSheet(null)}
          onShops={(p) => openShops(p)} onRemove={(p) => setCompare((c) => c.filter((x) => x !== p))} />
      )}
      {sheet?.kind === "about" && <AboutSheet meta={meta} onClose={() => setSheet(null)} />}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

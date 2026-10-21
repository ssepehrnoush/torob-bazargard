import { useEffect, useRef, useState } from "react";
import { api, stream } from "../api";
import { fa, short, toman } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, InquiryShop, InquirySummary, ProductCard as PC, Reply } from "../types";
import { Img, availability, } from "./Products";
import { ShopCard } from "./ShopsView";

const OUTCOME: Record<Reply["outcome"], { label: string; tone: string; icon: string }> = {
  confirmed: { label: "موجود، تأیید شد", tone: "green", icon: "check" },
  price_changed: { label: "قیمت تغییر کرده", tone: "amber", icon: "refresh" },
  out_of_stock: { label: "ناموجود", tone: "red", icon: "x" },
  no_answer: { label: "بی‌پاسخ", tone: "gray", icon: "hourglass" },
  closed: { label: "بسته بود", tone: "gray", icon: "clock" },
};
const SCENARIOS: [string, string][] = [["", "خودکار"], ["confirmed", "موجود"], ["price_changed", "تغییر قیمت"], ["out_of_stock", "ناموجود"], ["no_answer", "بی‌پاسخ"]];

export type InquiryState = {
  pid: number;
  sids: number[];
  started: boolean;
  shops: InquiryShop[];
  replies: Record<number, Reply>;
  summary: InquirySummary | null;
  callScript: string[];
  notice: string;
  product: { pid: number; title: string; image: string | null; price_min: number | null } | null;
};

export function InquiryView({ st, setSt, ctx, demo, onOpenShop, onVisit, onRestart, onProduct, toast }: {
  st: InquiryState;
  setSt: (f: (s: InquiryState) => InquiryState) => void;
  ctx: Ctx;
  demo: boolean;
  onOpenShop: (sid: number) => void;
  onVisit: (sids: number[], confirmed: Record<number, unknown>) => void;
  onRestart: (sids: number[]) => void;
  onProduct: (p: PC) => void;
  toast: (s: string) => void;
}) {
  const [forced, setForced] = useState<Record<number, string>>({});
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<{ shops: InquiryShop[]; callScript: string[]; notice: string } | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const ran = useRef<string>("");
  const key = `${st.pid}:${st.sids.join(",")}`;

  // Drafts are shown (and can be reviewed) before anything is sent.
  useEffect(() => {
    if (st.started || ran.current === key) return;
    ran.current = key;
    setPreview(null);
    api.draft(st.pid, st.sids, ctx).then((ev) => {
      setPreview({ shops: ev.shops, callScript: ev.call_script, notice: ev.notice });
      setSt((s) => ({ ...s, product: ev.product }));
    }).catch(() => toast("آماده‌سازی پیام ناموفق بود"));
  }, [key]); // eslint-disable-line

  const start = async () => {
    setRunning(true);
    setSt((s) => ({ ...s, started: true, replies: {}, summary: null }));
    const f: Record<number, string> = {};
    for (const [k, v] of Object.entries(forced)) if (v) f[+k] = v;
    try {
      await stream("/api/inquiry", { pid: st.pid, sids: st.sids, ctx, forced: Object.keys(f).length ? f : null }, (ev) => {
        if (ev.type === "inquiry_start") setSt((s) => ({ ...s, shops: ev.shops, callScript: ev.call_script, notice: ev.notice, product: ev.product }));
        else if (ev.type === "reply") setSt((s) => ({ ...s, replies: { ...s.replies, [ev.sid]: ev as Reply } }));
        else if (ev.type === "summary") setSt((s) => ({ ...s, summary: ev as InquirySummary }));
        else if (ev.type === "error") toast(ev.text);
      });
    } catch {
      toast("ارتباط قطع شد؛ دوباره تلاش کنید");
    }
    setRunning(false);
  };

  const shops = st.started ? st.shops : preview?.shops ?? [];
  const sum = st.summary;
  const confirmedMap: Record<number, unknown> = {};
  for (const r of Object.values(st.replies)) if (r.in_stock) confirmedMap[r.sid] = { confirmed_price: r.confirmed_price, hold_until: r.hold_until };

  return (
    <>
      {!st.started && <img className="art-banner" src="/img/inquiry.webp" alt="" style={{ aspectRatio: "12 / 5" }} />}

      {!st.started && (
        <div className="card pad stack">
          <div className="bold">از {fa(st.sids.length)} فروشگاه قیمت و موجودی بپرسم؟</div>
          {st.product && <div className="tiny muted ellipsis">{st.product.title}</div>}
          {!preview && <div className="shimmer" style={{ height: 80 }} />}
          {preview?.shops[0] && (
            <button className={"bubble-out" + (showDraft ? "" : " clamp3")} style={{ textAlign: "right" }} onClick={() => setShowDraft(!showDraft)}>
              {preview.shops[0].draft}
            </button>
          )}
          <button className="btn block" onClick={start} disabled={!preview || running}>
            <Icon name="send" size={16} style={{ transform: "scaleX(-1)" }} /> بپرس
          </button>
          <div className="row between">
            <span className="tiny muted"><Icon name="info" size={12} /> پاسخ فروشگاه‌ها شبیه‌سازی می‌شود</span>
            <button className="linkbtn" onClick={() => setShowScript(!showScript)}><Icon name="phone" size={14} /> متن تماس تلفنی</button>
          </div>
          {showScript && preview && (
            <ol className="small" style={{ margin: 0, paddingRight: 18 }}>
              {preview.callScript.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          )}
        </div>
      )}

      <div className="card iqlist">
        {shops.map((s) => {
          const r = st.replies[s.sid];
          const waiting = st.started && !r;
          const o = r ? OUTCOME[r.outcome] : null;
          return (
            <div key={s.sid} className="iqrow fadein">
              <div className="row">
                <button className="grow" style={{ textAlign: "right", minWidth: 0 }} onClick={() => onOpenShop(s.sid)}>
                  <div className="bold ellipsis">{s.name}</div>
                  <div className="tiny muted">ثبت‌شده: {s.price ? toman(s.price) : "بدون قیمت"}</div>
                </button>
                {waiting && <span className="typing small-typing"><i /><i /><i /></span>}
                {o && <span className={"tag " + (o.tone === "green" ? "green" : o.tone === "amber" ? "amber" : o.tone === "red" ? "red" : "gray")}>{o.label}</span>}
              </div>
              {demo && !st.started && (
                <div className="scenario">
                  {SCENARIOS.map(([k, l]) => (
                    <button key={k} className={(forced[s.sid] ?? "") === k ? "on" : ""} onClick={() => setForced({ ...forced, [s.sid]: k })}>{l}</button>
                  ))}
                </div>
              )}
              {r && (r.text ? (
                <div className="bubble-in">{r.text}</div>
              ) : (
                <div className="tiny muted">{r.note}</div>
              ))}
              {r?.in_stock && (
                <div className="confirmed-line">
                  <Icon name="check" size={14} /> تأییدشده: <b>{toman(r.confirmed_price)}</b>
                  {!!r.price_delta && <span style={{ color: r.price_delta > 0 ? "var(--red)" : "var(--green)" }}> ({r.price_delta > 0 ? "+" : "−"}{short(Math.abs(r.price_delta))})</span>}
                  {r.hold_until && <span className="muted">، نگه می‌دارند {r.hold_until}</span>}
                </div>
              )}
              {r?.outcome === "out_of_stock" && r.restock && <div className="tiny muted">فروشنده گفت {r.restock} می‌تواند تهیه کند.</div>}
            </div>
          );
        })}
        {st.started && <div className="tiny muted simnote"><Icon name="info" size={12} /> پاسخ‌ها شبیه‌سازی‌شده‌اند؛ شماره‌های داده ساختگی‌اند.</div>}
      </div>

      {st.started && !sum && Object.keys(st.replies).length === shops.length && shops.length > 0 && (
        <div className="typing"><i /><i /><i /> <span style={{ marginRight: 6 }}>در حال جمع‌بندی</span></div>
      )}

      {sum && (
        <>
          <div className="insight fadein">
            <div className="ico"><Icon name="spark" /></div>
            <div className="grow">
              <h3>جمع‌بندی دستیار</h3>
              <p>{sum.text}</p>
            </div>
          </div>
          {sum.alternatives.length > 0 && (
            <>
              <div className="sectiontitle">جایگزین‌های آماده</div>
              {sum.alternatives.map((a, idx) => (
                <ShopCard key={a.sid} i={a} rank={idx === 0 ? 0 : -1} pick={false} selected={false} onToggle={() => onRestart([a.sid])} onOpen={() => onOpenShop(a.sid)} />
              ))}
              <button className="btn soft" onClick={() => onRestart(sum.alternatives.map((a) => a.sid))}>
                <Icon name="chat" size={16} /> استعلام از {fa(sum.alternatives.length)} جایگزین
              </button>
            </>
          )}
          {sum.similar.length > 0 && (
            <>
              <div className="sectiontitle">کالای مشابه در نزدیکی</div>
              {sum.similar.map((p) => (
                <button key={p.pid} className="card pad row" style={{ textAlign: "right" }} onClick={() => onProduct(p)}>
                  <Img src={p.image} />
                  <div className="grow">
                    <div className="small bold clamp2">{p.title}</div>
                    <div className="tiny muted">{availability(p, ctx.radius_km)}</div>
                  </div>
                </button>
              ))}
            </>
          )}
          {sum.leads.length > 0 && (
            <div className="card pad stack">
              <div className="bold">شاید این‌ها هم داشته باشند (تأیید نشده)</div>
              {sum.leads.map((l) => (
                <button key={l.sid} className="row between small" onClick={() => onOpenShop(l.sid)}>
                  <span>{l.name}</span><span className="muted">{l.distance_label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {st.started && !running && (
        <div className="sticky-cta">
          <button className="btn grow" disabled={!Object.keys(confirmedMap).length}
            onClick={() => onVisit(sum?.confirmed_sids?.length ? sum.confirmed_sids : Object.keys(confirmedMap).map(Number), confirmedMap)}>
            <Icon name="route" size={17} /> برنامهٔ مراجعه با فروشگاه‌های تأییدشده
          </button>
          <button className="btn secondary" onClick={() => onRestart(st.sids)} aria-label="استعلام دوباره"><Icon name="refresh" size={17} /></button>
        </div>
      )}
    </>
  );
}

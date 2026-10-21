import { useEffect, useRef, useState } from "react";
import { api, stream } from "../api";
import { fa, short, toman } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, InquiryShop, InquirySummary, ProductCard as PC, Reply } from "../types";
import { Img, availability, } from "./Products";
import { ShopCard, freshTone } from "./ShopsView";

const OUTCOME: Record<Reply["outcome"], { label: string; tone: string; icon: string }> = {
  confirmed: { label: "موجود · قیمت تأیید شد", tone: "green", icon: "check" },
  price_changed: { label: "موجود · قیمت تغییر کرده", tone: "amber", icon: "refresh" },
  out_of_stock: { label: "ناموجود", tone: "red", icon: "x" },
  no_answer: { label: "بی‌پاسخ", tone: "gray", icon: "hourglass" },
  closed: { label: "بسته بود، جواب نداد", tone: "gray", icon: "clock" },
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
      {st.product && (
        <div className="card phead">
          <Img src={st.product.image} />
          <div className="grow">
            <div className="tiny muted">استعلام برای</div>
            <div className="small bold clamp2">{st.product.title}</div>
          </div>
        </div>
      )}

      <div className="notice" style={{ color: "var(--violet)", background: "var(--violet-soft)" }}>
        <Icon name="info" size={14} style={{ marginTop: 3 }} />
        <span>{(st.started ? st.notice : preview?.notice) || "پاسخ فروشگاه‌ها شبیه‌سازی می‌شود."}</span>
      </div>

      {!st.started && (
        <div className="card pad stack">
          <div className="bold">دستیار این پیام را برای {fa(st.sids.length)} فروشگاه می‌فرستد</div>
          {!preview && <div className="shimmer" style={{ height: 120 }} />}
          {preview?.shops[0] && <div className="bubble-out">{preview.shops[0].draft}</div>}
          <div className="tiny muted">پیام هر فروشگاه با قیمت ثبت‌شدهٔ خود آن فروشگاه شخصی‌سازی می‌شود. اگر ترجیح می‌دهید خودتان زنگ بزنید، متن تماس هم آماده است.</div>
          <div className="row wrap">
            <button className="btn grow" onClick={start} disabled={!preview || running}>
              <Icon name="send" size={16} style={{ transform: "scaleX(-1)" }} /> ارسال و استعلام هم‌زمان
            </button>
            <button className="btn secondary" onClick={() => setShowScript(!showScript)}><Icon name="phone" size={16} /> متن تماس</button>
          </div>
          {showScript && preview && (
            <ol className="small" style={{ margin: 0, paddingRight: 18 }}>
              {preview.callScript.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          )}
        </div>
      )}

      {shops.map((s) => {
        const r = st.replies[s.sid];
        const waiting = st.started && !r;
        const o = r ? OUTCOME[r.outcome] : null;
        return (
          <div key={s.sid} className="iq fadein">
            <div className="row">
              <button className="grow" style={{ textAlign: "right" }} onClick={() => onOpenShop(s.sid)}>
                <div className="bold">{s.name}</div>
                <div className="tiny muted">{s.distance_label} · {s.open_now.label}</div>
              </button>
              <div style={{ textAlign: "left" }}>
                <div className="tiny muted">ثبت‌شده</div>
                <div className="small bold">{s.price ? short(s.price) : "؟"}</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 4 }}>
              <span className={"pill " + freshTone(s.freshness)}>{s.freshness.label.replace("قیمت ثبت‌شده ", "")}</span>
              <span className="pill">موبایل: {fa(s.phone ?? "")}</span>
            </div>
            {demo && !st.started && (
              <div className="scenario">
                <span className="tiny muted">سناریو:</span>
                {SCENARIOS.map(([k, l]) => (
                  <button key={k} className={(forced[s.sid] ?? "") === k ? "on" : ""} onClick={() => setForced({ ...forced, [s.sid]: k })}>{l}</button>
                ))}
              </div>
            )}
            {st.started && <div className="bubble-out">{s.draft.split("\n")[0]} …</div>}
            {waiting && (
              <div className="typing" style={{ alignSelf: "flex-end" }}><i /><i /><i /> <span style={{ marginRight: 6 }}>در انتظار پاسخ فروشگاه</span></div>
            )}
            {r && (
              <>
                {r.text ? (
                  <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
                    <span className="simlabel"><Icon name="info" size={11} /> پاسخ شبیه‌سازی‌شده</span>
                    <div className="bubble-in">{r.text}</div>
                  </div>
                ) : (
                  <div className="small muted">{r.note}</div>
                )}
                <div className={"outcome"} style={{ color: `var(--${o!.tone === "gray" ? "muted" : o!.tone})` }}>
                  <Icon name={o!.icon} size={16} /> {o!.label}
                </div>
                {r.in_stock && (
                  <div className="confirmed-box">
                    <div><span className="muted">قیمت تأییدشده</span><b>{toman(r.confirmed_price)}</b>
                      {!!r.price_delta && <span className="tiny" style={{ color: r.price_delta > 0 ? "var(--red)" : "var(--green)" }}>{r.price_delta > 0 ? "+" : "−"}{short(Math.abs(r.price_delta))} نسبت به قیمت ثبت‌شده</span>}
                    </div>
                    <div><span className="muted">نگه‌داشتن کالا</span><b>{r.hold_until ?? "نامشخص"}</b></div>
                    <div><span className="muted">ساعت کاری امروز</span><b>تا {r.hours_today}</b></div>
                    <div><span className="muted">قسطی</span><b>{r.installments ?? "ندارد"}</b></div>
                  </div>
                )}
                {r.outcome === "out_of_stock" && r.restock && <div className="small">فروشنده گفت {r.restock} می‌تواند تهیه کند.</div>}
              </>
            )}
          </div>
        );
      })}

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
              <div className="sectiontitle">جایگزین‌های آماده <span className="muted">برای فروشگاه‌های ناموفق</span></div>
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

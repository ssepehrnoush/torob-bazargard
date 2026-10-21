import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { api } from "../api";
import { fa, jalali, priceRange, short, toman } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, Freshness, OpenState, ProductCard as PC, ShopBrief, ShopOffer, ShopsResult } from "../types";
import { Img, availability } from "./Products";

const MapView = lazy(() => import("./MapView").then((m) => ({ default: m.MapView })));

export const BADGE_TONE: Record<string, string> = {
  installment: "outline-blue", torobpay: "violet", delivery: "green", verified: "blue",
};

export function openTone(s: OpenState): "green" | "red" | "gray" {
  return s.state === "open" ? "green" : s.state === "closed" ? "red" : "gray";
}
export function freshTone(f: Freshness): "green" | "amber" | "red" | "gray" {
  return f.tier === "fresh" ? "green" : f.tier === "aging" ? "amber" : f.tier === "stale" ? "red" : "gray";
}

type Props = {
  pid: number;
  ctx: Ctx;
  setCtx: (c: Ctx) => void;
  picks: { sid: number; why: string }[];
  agentMsg: string | null;
  onOpenShop: (sid: number) => void;
  onInquiry: (sids: number[]) => void;
  onVisit: (sids: number[]) => void;
  onProduct: (p: PC) => void;
  onBack: () => void;
};

const HIDDEN_LABEL: Record<string, string> = {
  installments: "فیلتر قسطی",
  torob_pay: "فیلتر ترب‌پی",
  open: "فیلتر «فقط باز»",
};

export function ShopsView({ pid, ctx, setCtx, picks, agentMsg, onOpenShop, onInquiry, onVisit, onProduct, onBack }: Props) {
  const [sort, setSort] = useState("best");
  const [view, setView] = useState<"list" | "map">("list");
  const [data, setData] = useState<ShopsResult | null>(null);
  const [err, setErr] = useState(false);
  const [insight, setInsight] = useState<{ headline: string; body: string; pick_sid: number | null } | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [showFar, setShowFar] = useState(false);
  const initFor = useRef<number | null>(null);
  const ctxKey = JSON.stringify(ctx);

  useEffect(() => {
    const ac = new AbortController();
    setErr(false);
    api.shops(pid, ctx, sort, [], ac.signal).then((d) => {
      setData(d);
      if (initFor.current !== pid) {
        initFor.current = pid;
        const pickIds = picks.map((p) => p.sid).filter((sid) => d.items.some((i) => i.sid === sid));
        const auto = d.items.filter((i) => i.in_radius && i.open_at_visit.state !== "closed").map((i) => i.sid);
        setSel(Array.from(new Set([...pickIds, ...auto])).slice(0, 3));
      }
    }).catch((e) => e.name !== "AbortError" && setErr(true));
    return () => ac.abort();
  }, [pid, ctxKey, sort]); // eslint-disable-line

  useEffect(() => {
    const ac = new AbortController();
    setInsight(null);
    api.insight(pid, ctx, ac.signal).then(setInsight).catch(() => {});
    return () => ac.abort();
  }, [pid, ctxKey]); // eslint-disable-line

  const pickWhy = useMemo(() => Object.fromEntries(picks.map((p) => [p.sid, p.why])), [picks]);
  const items = data?.items ?? [];
  const near = items.filter((i) => i.in_radius);
  const far = items.filter((i) => !i.in_radius);
  const hidden = Object.entries(data?.stats.hidden ?? {}).filter(([k, n]) => n > 0 && HIDDEN_LABEL[k]);
  const toggle = (sid: number) => setSel((s) => (s.includes(sid) ? s.filter((x) => x !== sid) : s.length >= 5 ? s : [...s, sid]));
  const p = data?.product;

  return (
    <>
      <div className="card phead">
        <button className="iconbtn" onClick={onBack} aria-label="بازگشت به کالاها"><Icon name="right" /></button>
        <Img src={p?.image ?? null} />
        <div className="grow">
          <div className="small bold clamp2">{p?.title ?? "…"}</div>
          <div className="tiny muted">
            {p ? `${priceRange(p.price_min, p.price_max)}، ${fa(p.n_shops)} فروشگاه در کل داده` : ""}
          </div>
        </div>
      </div>

      <div className="insight">
        <div className="ico"><Icon name="spark" /></div>
        <div className="grow">
          {agentMsg ? (
            <>
              <h3>پیشنهاد دستیار</h3>
              <p>{agentMsg}</p>
            </>
          ) : insight ? (
            <>
              <h3>{insight.headline}</h3>
              <p>{insight.body}</p>
            </>
          ) : (
            <>
              <div className="shimmer" style={{ height: 18, width: "60%" }} />
              <div className="shimmer" style={{ height: 30, marginTop: 8 }} />
            </>
          )}
        </div>
      </div>

      <div className="seg" role="tablist">
        {[["best", "پیشنهاد دستیار"], ["cheapest", "ارزان‌ترین"], ["nearest", "نزدیک‌ترین"]].map(([k, l]) => (
          <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>
      <div className="filters">
        <button className={"chip" + (view === "map" ? " on" : "")} onClick={() => setView(view === "map" ? "list" : "map")}>
          <Icon name={view === "map" ? "list" : "map"} size={15} /> {view === "map" ? "فهرست" : "نقشه"}
        </button>
        <button className={"chip" + (ctx.installments_only ? " on" : "")} onClick={() => setCtx({ ...ctx, installments_only: !ctx.installments_only })}>
          <Icon name="card" size={15} /> قسطی / اعتباری
        </button>
        <button className={"chip" + (ctx.open_only ? " on" : "")} onClick={() => setCtx({ ...ctx, open_only: !ctx.open_only })}>
          <Icon name="clock" size={15} /> باز در زمان مراجعه
        </button>
        <button className={"chip" + (ctx.torob_pay_only ? " on" : "")} onClick={() => setCtx({ ...ctx, torob_pay_only: !ctx.torob_pay_only })}>
          ترب‌پی
        </button>
        <button className="chip" onClick={() => setCtx({ ...ctx, radius_km: ctx.radius_km >= 20 ? 3 : ctx.radius_km < 5 ? 5 : ctx.radius_km < 10 ? 10 : 20 })}>
          <Icon name="pin" size={15} /> شعاع {fa(ctx.radius_km)} کیلومتر
        </button>
      </div>

      {hidden.map(([k, n]) => (
        <div className="hiddenmsg" key={k}>
          <Icon name="filter" size={15} />
          <span>{fa(n)} فروشگاه به خاطر {HIDDEN_LABEL[k]} پنهان شد</span>
          <button onClick={() => setCtx({ ...ctx, ...(k === "installments" ? { installments_only: false } : k === "open" ? { open_only: false } : { torob_pay_only: false }) })}>
            نمایش همه
          </button>
        </div>
      ))}

      {err && <div className="empty">دریافت فروشگاه‌ها ناموفق بود. <button className="bold" onClick={() => setSort(sort)}>تلاش دوباره</button></div>}
      {!data && !err && [0, 1, 2].map((i) => <div key={i} className="shimmer" style={{ height: 150, borderRadius: 16 }} />)}

      {data && view === "map" && (
        <Suspense fallback={<div className="shimmer mapbox" />}><MapView
          you={ctx}
          pins={items.slice(0, 40).map((i) => ({
            id: i.sid,
            lat: i.lat,
            lon: i.lon,
            label: i.price ? short(i.price) : "؟",
            tone: sel.includes(i.sid) ? "pick" : i.open_at_visit.state === "closed" ? "closed" : "normal",
          }))}
          onPick={onOpenShop}
        /></Suspense>
      )}

      {data && (
        <div className="row between small muted" style={{ padding: "0 4px" }}>
          <span>
            {fa(near.length)} فروشگاه در شعاع شما{far.length ? `، ${fa(far.length)} دورتر` : ""}
          </span>
          {data.stats.price_min && <span>از {short(data.stats.price_min)} تا {short(data.stats.price_max)}</span>}
        </div>
      )}

      {data && near.length === 0 && (
        <div className="card empty">
          <img className="empty-art" src="/img/empty.webp" alt="" />
          در شعاع {fa(ctx.radius_km)} کیلومتری شما فروشگاهی با این کالا و این فیلترها نیست.
          {far.length > 0 && <div style={{ marginTop: 8 }}><button className="btn sm soft" onClick={() => setShowFar(true)}>دیدن {fa(far.length)} فروشگاه دورتر</button></div>}
        </div>
      )}

      {near.map((i, idx) => (
        <ShopCard key={i.sid} i={i} rank={sort === "best" ? idx : -1} why={pickWhy[i.sid]} pick={insight?.pick_sid === i.sid || !!pickWhy[i.sid]}
          selected={sel.includes(i.sid)} onToggle={() => toggle(i.sid)} onOpen={() => onOpenShop(i.sid)} onOpenAlt={onOpenShop} />
      ))}

      {far.length > 0 && near.length > 0 && (
        <button className="btn secondary" onClick={() => setShowFar(!showFar)}>
          {showFar ? "پنهان کردن فروشگاه‌های دورتر" : `${fa(far.length)} فروشگاه خارج از شعاع شما`}
          <Icon name="down" size={16} style={{ transform: showFar ? "rotate(180deg)" : undefined }} />
        </button>
      )}
      {showFar && far.map((i) => (
        <ShopCard key={i.sid} i={i} rank={-1} why={pickWhy[i.sid]} pick={false} selected={sel.includes(i.sid)} onToggle={() => toggle(i.sid)} onOpen={() => onOpenShop(i.sid)} />
      ))}

      {!!data?.similar.length && (
        <>
          <div className="sectiontitle">کالاهای مشابه با فروشگاه نزدیک <span className="muted">جایگزین اگر این مدل کم است</span></div>
          {data.similar.map((s) => (
            <button key={s.pid} className="card pad row" style={{ textAlign: "right" }} onClick={() => onProduct(s)}>
              <Img src={s.image} />
              <div className="grow stack" style={{ gap: 2 }}>
                <div className="small bold clamp2">{s.title}</div>
                <div className="small">{priceRange(s.price_min, s.price_max)}</div>
                <div className="tiny muted">{availability(s, ctx.radius_km)}</div>
              </div>
              <Icon name="left" />
            </button>
          ))}
        </>
      )}

      {!!data?.leads.length && (
        <>
          <div className="sectiontitle">شاید داشته باشند <span className="muted">تأیید نشده</span></div>
          <div className="tiny muted" style={{ padding: "0 4px" }}>
            این فروشگاه‌ها در همین دسته کار می‌کنند ولی این کالا را در ترب ثبت نکرده‌اند. فقط با استعلام می‌شود فهمید.
          </div>
          {data.leads.map((l) => <LeadCard key={l.sid} l={l} onOpen={() => onOpenShop(l.sid)} />)}
        </>
      )}

      {data && items.length > 0 && (
        <div className="sticky-cta">
          <button className="btn grow" disabled={!sel.length} onClick={() => onInquiry(sel)}>
            <Icon name="chat" size={17} /> استعلام قیمت و موجودی از {fa(sel.length)} فروشگاه
          </button>
          <button className="btn secondary" disabled={!sel.length} onClick={() => onVisit(sel)} aria-label="برنامهٔ مراجعه">
            <Icon name="route" size={17} />
          </button>
        </div>
      )}
    </>
  );
}

export function ShopCard({ i, rank, why, pick, selected, onToggle, onOpen, onOpenAlt }: {
  i: ShopOffer;
  rank: number;
  why?: string;
  pick: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenAlt?: (sid: number) => void;
}) {
  return (
    <div className={"scard fadein" + (selected ? " sel" : pick ? " pick" : "")}>
      <div className="row">
        <button className={"selbox" + (selected ? " on" : "")} onClick={onToggle} aria-pressed={selected} aria-label="انتخاب برای استعلام">
          {selected && <Icon name="check" size={14} />}
        </button>
        <button className="grow" style={{ textAlign: "right", minWidth: 0 }} onClick={onOpen}>
          <div className="row" style={{ gap: 6 }}>
            <span className="name ellipsis">{i.name}</span>
            {i.is_real_name && <Icon name="shield" size={15} style={{ color: "var(--green)" }} />}
          </div>
          <div className="tiny muted ellipsis">{i.mall || i.area || i.address}</div>
        </button>
        {rank === 0 && <span className="pickflag"><Icon name="spark" size={12} /> بهترین ترکیب</span>}
      </div>

      <div className="pricebox">
        <span className="amount">{i.price ? toman(i.price) : "قیمت ثبت نشده"}</span>
        <span className={"pill " + freshTone(i.freshness)} title={i.freshness.ts ? `آخرین تغییر: ${jalali(i.freshness.ts)}` : ""}>
          <span className={"dot " + freshTone(i.freshness)} />
          {i.freshness.label.replace("قیمت ثبت‌شده ", "ثبت ")}
        </span>
      </div>
      <div className="tiny muted" style={{ marginTop: -6 }}>
        قیمت ثبت‌شده در ترب{i.freshness.ts ? ` (آخرین تغییر ${jalali(i.freshness.ts)})` : ""}، {i.stock.label}
      </div>

      <div className="facts">
        <span className="fact"><Icon name="pin" size={15} /> {i.distance_label}، {i.travel.label.replace("حدود ", "")}</span>
        <span className="fact">
          <span className={"dot " + openTone(i.open_at_visit)} />
          <span className="ellipsis">{i.open_at_visit.label}</span>
        </span>
        {i.warranty && <span className="fact"><Icon name="shield" size={15} /> <span className="ellipsis">{i.warranty}</span></span>}
        {i.same_mall_count > 0 && <span className="fact"><Icon name="building" size={15} /> {fa(i.same_mall_count)} فروشگاه دیگر در همین پاساژ</span>}
      </div>
      {i.visit_warning && <div className="warn"><Icon name="alert" size={15} style={{ marginTop: 3 }} /> {i.visit_warning}</div>}
      {i.price_warning && <div className="warn" style={{ color: "var(--red)" }}><Icon name="alert" size={15} style={{ marginTop: 3 }} /> {i.price_warning}</div>}
      {i.alt_open && onOpenAlt && (
        <button className="altbox" onClick={() => onOpenAlt(i.alt_open!.sid)}>
          <Icon name="refresh" size={15} />
          <span className="grow">
            {i.open_at_visit.state === "closed" ? "بسته است؛ " : "ساعت کاری نامعلوم؛ "}
            جایگزین باز: <b>{i.alt_open.name}</b> {i.alt_open.same_mall ? "در همین پاساژ" : `، ${i.alt_open.distance_label} آن‌طرف‌تر`}
            {i.alt_open.price ? `، ${short(i.alt_open.price)} تومان` : ""}
          </span>
          <Icon name="left" size={15} />
        </button>
      )}

      {(i.badges.length > 0) && (
        <div className="reasons">
          {i.badges.map((b) => (
            <span key={b.label} className={"pill " + BADGE_TONE[b.kind]}>{b.label}</span>
          ))}
        </div>
      )}
      {why ? (
        <div className="why"><Icon name="spark" size={15} /> <span>{why}</span></div>
      ) : (
        i.reasons.length > 0 && (
          <div className="small muted">
            <span className="bold" style={{ color: "var(--ink-2)" }}>چرا: </span>
            {i.reasons.slice(0, 4).join("، ")}
          </div>
        )
      )}
      <div className="row">
        <button className="btn sm secondary grow" onClick={onOpen}>
          <Icon name="building" size={15} /> جزئیات، ساعت کاری و مسیر داخل پاساژ
        </button>
      </div>
    </div>
  );
}

function LeadCard({ l, onOpen }: { l: ShopBrief & { reasons: string[] }; onOpen: () => void }) {
  return (
    <button className="card pad stack" style={{ textAlign: "right", gap: 4 }} onClick={onOpen}>
      <div className="row between">
        <span className="bold">{l.name}</span>
        <span className="pill amber">موجودی نامعلوم</span>
      </div>
      <div className="tiny muted">{l.mall || l.area}</div>
      <div className="row small" style={{ gap: 10 }}>
        <span>{l.distance_label}</span>
        <span className="row" style={{ gap: 4 }}><span className={"dot " + openTone(l.open_at_visit)} /> {l.open_at_visit.label}</span>
      </div>
      <div className="tiny muted">{l.reasons[0]}</div>
    </button>
  );
}

import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { api } from "../api";
import { fa, short, toman } from "../fmt";
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
  const [showMore, setShowMore] = useState(false);
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
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="small bold ellipsis">{p?.title ?? "…"}</div>
          <div className="tiny muted">{p?.price_min ? `از ${toman(data?.stats.price_min ?? p.price_min)}` : ""}</div>
        </div>
      </div>

      <div className="insight">
        <div className="ico"><Icon name="spark" size={16} /></div>
        <div className="grow">
          {agentMsg ? (
            <p className="clamp3">{agentMsg}</p>
          ) : insight ? (
            <>
              <h3>{insight.headline}</h3>
              <p className="clamp2">{insight.body}</p>
            </>
          ) : (
            <>
              <div className="shimmer" style={{ height: 16, width: "55%" }} />
              <div className="shimmer" style={{ height: 14, marginTop: 8 }} />
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <div className="seg grow" role="tablist">
          {[["best", "پیشنهادی"], ["cheapest", "ارزان‌ترین"], ["nearest", "نزدیک‌ترین"]].map(([k, l]) => (
            <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
        <button className={"iconchip" + (view === "map" ? " on" : "")} onClick={() => setView(view === "map" ? "list" : "map")} aria-label={view === "map" ? "فهرست" : "نقشه"}>
          <Icon name={view === "map" ? "list" : "map"} size={18} />
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
        <div className="small muted" style={{ padding: "0 4px" }}>
          {fa(near.length)} فروشگاه نزدیک شما
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

      {data && (data.similar.length > 0 || data.leads.length > 0) && (
        <button className="morebtn" onClick={() => setShowMore(!showMore)}>
          گزینه‌های دیگر: {data.similar.length ? `${fa(data.similar.length)} کالای مشابه` : ""}{data.similar.length && data.leads.length ? " و " : ""}{data.leads.length ? `${fa(data.leads.length)} فروشگاه احتمالی` : ""}
          <Icon name="down" size={15} style={{ transform: showMore || near.length === 0 ? "rotate(180deg)" : undefined }} />
        </button>
      )}
      {data && (showMore || near.length === 0) && (
        <>
          {data.similar.map((s) => (
            <button key={s.pid} className="card pad row" style={{ textAlign: "right", padding: 10 }} onClick={() => onProduct(s)}>
              <Img src={s.image} className="pimg sm" />
              <div className="grow stack" style={{ gap: 0, minWidth: 0 }}>
                <div className="small bold clamp2">{s.title}</div>
                <div className="tiny muted">{s.price_min ? `از ${toman(s.price_min)}، ` : ""}{availability(s)}</div>
              </div>
            </button>
          ))}
          {data.leads.length > 0 && (
            <div className="tiny muted" style={{ padding: "0 4px" }}>فروشگاه‌های زیر در همین دسته فعال‌اند ولی این کالا را ثبت نکرده‌اند؛ فقط با استعلام معلوم می‌شود.</div>
          )}
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
  const inst = i.installments.length > 0;
  const stale = i.freshness.tier === "aging" || i.freshness.tier === "stale";
  const openShort = i.open_at_visit.state === "open" ? (i.open_at_visit.closes_at ? `باز تا ${i.open_at_visit.closes_at}` : "باز")
    : i.open_at_visit.state === "closed" ? "بسته" : "ساعت نامعلوم";
  return (
    <div className={"scard fadein" + (selected ? " sel" : pick ? " pick" : "")}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button className={"selbox" + (selected ? " on" : "")} onClick={onToggle} aria-pressed={selected} aria-label="انتخاب برای استعلام" style={{ marginTop: 6 }}>
          {selected && <Icon name="check" size={14} />}
        </button>
        <button className="grow" style={{ textAlign: "right", minWidth: 0 }} onClick={onOpen}>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <span className="name ellipsis">{i.name}</span>
            <span className="amount">{i.price ? toman(i.price) : "بدون قیمت"}</span>
          </div>
          <div className="row between tiny muted" style={{ gap: 8 }}>
            <span className="ellipsis">{i.mall || i.area || i.address}</span>
            <span style={{ flex: "none", color: stale ? "var(--amber)" : undefined }}>
              {i.freshness.days != null ? `قیمت ${fa(i.freshness.days)} روز پیش` : "زمان قیمت نامعلوم"}
            </span>
          </div>
          <div className="metarow">
            <span><Icon name="pin" size={13} /> {i.distance_label}</span>
            <span><i className={"dot " + openTone(i.open_at_visit)} /> {openShort}</span>
            {inst && <span className="tag blue">قسطی</span>}
            {i.torob_pay && <span className="tag violet">ترب‌پی</span>}
            {rank === 0 && <span className="tag brand">پیشنهاد</span>}
          </div>
        </button>
      </div>
      {why && <div className="whyline"><Icon name="spark" size={14} /> <span className="clamp2">{why}</span></div>}
      {i.price_warning && <div className="warn" style={{ color: "var(--red)" }}><Icon name="alert" size={14} style={{ marginTop: 3 }} /> قیمت مشکوک؛ شاید کالای دیگری باشد</div>}
      {i.alt_open && onOpenAlt && i.open_at_visit.state === "closed" && (
        <button className="altbox" onClick={() => onOpenAlt(i.alt_open!.sid)}>
          <Icon name="refresh" size={14} />
          <span className="grow ellipsis">جایگزین باز: <b>{i.alt_open.name}</b>{i.alt_open.same_mall ? " در همین پاساژ" : `، ${i.alt_open.distance_label}`}</span>
          <Icon name="left" size={14} />
        </button>
      )}
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

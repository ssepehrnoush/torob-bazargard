import { useEffect, useState, lazy, Suspense } from "react";
import { api } from "../api";
import { fa, toman } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, VisitPlan } from "../types";
import { openTone } from "./ShopsView";

const MapView = lazy(() => import("./MapView").then((m) => ({ default: m.MapView })));

export function VisitView({ pid, sids, confirmed, ctx, onOpenShop, toast }: {
  pid: number | null;
  sids: number[];
  confirmed: Record<number, unknown> | null;
  ctx: Ctx;
  onOpenShop: (sid: number) => void;
  toast: (s: string) => void;
}) {
  const [plan, setPlan] = useState<VisitPlan | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setPlan(null);
    setErr(false);
    api.visit(pid, sids, ctx, confirmed).then(setPlan).catch(() => setErr(true));
  }, [pid, sids.join(","), JSON.stringify(ctx)]); // eslint-disable-line

  const share = async () => {
    if (!plan) return;
    const text = [
      `برنامهٔ خرید (${plan.start_label} تا ${plan.end_label})`,
      ...plan.stops.map((s, i) => `${fa(i + 1)}. ${s.name}، ${s.mall ?? s.address ?? ""}، رسیدن ${s.arrive_label}${s.confirmed_price ? `، قیمت تأییدشده ${toman(s.confirmed_price)}` : ""}\n${s.nav.google}`),
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "برنامهٔ خرید", text });
      else {
        await navigator.clipboard.writeText(text);
        toast("برنامه کپی شد");
      }
    } catch {
      /* user cancelled */
    }
  };

  if (err) return <div className="card empty">ساخت برنامه ناموفق بود</div>;
  if (!plan) return <div className="shimmer" style={{ height: 300, borderRadius: 16 }} />;
  const route: [number, number][] = [[plan.origin.lat, plan.origin.lon], ...plan.stops.map((s) => [s.lat, s.lon] as [number, number])];
  return (
    <>
      <Suspense fallback={<div className="shimmer mapbox" />}><MapView you={plan.origin} tall route={route} onPick={onOpenShop}
        pins={plan.stops.map((s, i) => ({ id: s.sid, lat: s.lat, lon: s.lon, label: fa(i + 1), tone: s.open.state === "closed" ? "closed" : "pick" }))} /></Suspense>
      <div className="card pad row between">
        <div>
          <div className="bold">برنامهٔ مراجعه</div>
          <div className="small muted">{fa(plan.stops.length)} فروشگاه، حدود {fa(plan.total_minutes)} دقیقه، {fa(plan.total_km)} کیلومتر</div>
        </div>
        <button className="btn sm secondary" onClick={share}><Icon name="share" size={15} /> ارسال</button>
      </div>

      {plan.warnings.map((w) => (
        <div key={w} className="notice"><Icon name="alert" size={14} style={{ marginTop: 3 }} /> {w}</div>
      ))}

      <div className="card pad timeline">
        <div className="tstop">
          <span className="tnum origin"><Icon name="locate" size={17} /></span>
          <div className="grow">
            <div className="bold">حرکت از {plan.origin.label}</div>
            <div className="small muted">ساعت {plan.start_label}</div>
          </div>
        </div>
        {plan.stops.map((s, i) => (
          <div className="tstop" key={s.sid}>
            <span className="tnum">{fa(i + 1)}</span>
            <div className="grow stack" style={{ gap: 6 }}>
              <div className="tiny muted">{s.leg.label}، رسیدن حدود {s.arrive_label}</div>
              <button className="bold" style={{ textAlign: "right" }} onClick={() => onOpenShop(s.sid)}>{s.name}</button>
              {s.mall && <div className="small muted">{s.mall}</div>}
              <div className="row wrap" style={{ gap: 4 }}>
                <span className={"pill " + openTone(s.open)}><span className={"dot " + openTone(s.open)} /> {s.open.label}</span>
                {s.confirmed_price ? (
                  <span className="pill green"><Icon name="check" size={12} /> تأییدشده: {toman(s.confirmed_price)}</span>
                ) : s.price ? (
                  <span className="pill amber">ثبت‌شده: {toman(s.price)} (تأیید نشده)</span>
                ) : null}
                {s.hold_until && <span className="pill blue">نگه می‌دارند: {s.hold_until}</span>}
              </div>
              {s.guide.length > 0 && (
                <div className="small" style={{ background: "var(--blue-soft)", borderRadius: 10, padding: "6px 10px" }}>
                  {s.guide.map((g, j) => <div key={j}>{g.text}</div>)}
                </div>
              )}
              <div className="navbtns">
                <a className="btn sm soft" href={s.nav.neshan} target="_blank" rel="noreferrer"><Icon name="nav" size={14} /> نشان</a>
                <a className="btn sm soft" href={s.nav.balad} target="_blank" rel="noreferrer"><Icon name="nav" size={14} /> بلد</a>
                <a className="btn sm soft" href={s.nav.google} target="_blank" rel="noreferrer"><Icon name="nav" size={14} /> گوگل‌مپ</a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card pad stack">
        <div className="bold">قبل از رفتن</div>
        {plan.checklist.map((c) => (
          <div key={c} className="row small" style={{ alignItems: "flex-start" }}><Icon name="check" size={15} style={{ color: "var(--green)", marginTop: 4 }} /> <span>{c}</span></div>
        ))}
      </div>
    </>
  );
}

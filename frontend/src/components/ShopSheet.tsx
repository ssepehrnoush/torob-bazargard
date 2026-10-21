import { useEffect, useState } from "react";
import { api } from "../api";
import { fa, jalali, toman } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, MallGuide, ShopDetail } from "../types";
import { Sheet } from "./Sheet";
import { BADGE_TONE, freshTone, openTone } from "./ShopsView";

const GUIDE_ICON: Record<string, string> = { building: "building", floor: "floor", door: "door", pin: "pin", help: "help" };

export function ShopSheet({ sid, pid, ctx, onClose, onInquiry, onVisit, onOpenShop }: {
  sid: number;
  pid: number | null;
  ctx: Ctx;
  onClose: () => void;
  onInquiry: (sid: number) => void;
  onVisit: (sid: number) => void;
  onOpenShop: (sid: number) => void;
}) {
  const [d, setD] = useState<ShopDetail | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setD(null);
    api.shop(sid, pid, ctx).then(setD).catch(() => setErr(true));
  }, [sid, pid]); // eslint-disable-line
  return (
    <Sheet title={d?.name ?? "فروشگاه"} onClose={onClose}>
      {err && <div className="empty">اطلاعات فروشگاه دریافت نشد</div>}
      {!d && !err && <div className="shimmer" style={{ height: 260 }} />}
      {d && (
        <>
          <div className="card pad stack">
            <div className="row wrap" style={{ gap: 6 }}>
              <span className={"pill " + openTone(d.open_now)}><span className={"dot " + openTone(d.open_now)} /> الان: {d.open_now.label}</span>
              {d.open_at_visit.label !== d.open_now.label && (
                <span className={"pill " + openTone(d.open_at_visit)}>زمان رسیدن: {d.open_at_visit.label}</span>
              )}
            </div>
            {d.visit_warning && <div className="warn"><Icon name="alert" size={15} style={{ marginTop: 3 }} /> {d.visit_warning}</div>}
            <div className="small">{d.address}</div>
            <div className="row small muted" style={{ gap: 12 }}>
              <span className="row" style={{ gap: 4 }}><Icon name="pin" size={15} /> {d.distance_label}</span>
              <span>{d.travel.label}</span>
            </div>
            {d.offer && (
              <div className="card pad" style={{ background: "var(--bg)", boxShadow: "none" }}>
                <div className="tiny muted">قیمت ثبت‌شدهٔ این کالا</div>
                <div className="row between wrap">
                  <span className="price">{toman(d.offer.price)}</span>
                  <span className={"pill " + freshTone(d.offer.freshness)}>{d.offer.freshness.label}</span>
                </div>
                {d.offer.freshness.ts && <div className="tiny muted">آخرین تغییر قیمت: {jalali(d.offer.freshness.ts)}</div>}
                <div className="tiny muted">عنوان فروشنده: {d.offer.seller_title}</div>
                {d.offer.warranty && <div className="tiny">گارانتی: {d.offer.warranty}</div>}
                <div className="tiny" style={{ color: "var(--amber)", marginTop: 4 }}>موجودی تأیید نشده؛ برای اطمینان استعلام بگیرید.</div>
              </div>
            )}
            <div className="row wrap" style={{ gap: 4 }}>
              {d.badges.map((b) => (
                <span key={b.label} className={"pill " + BADGE_TONE[b.kind]}>{b.label}</span>
              ))}
              {!d.installments.length && <span className="pill">خرید قسطی ثبت نشده</span>}
            </div>
          </div>

          {d.mall_guide && <GuideCard g={d.mall_guide} onOpenShop={onOpenShop} />}

          {d.same_mall_offers.length > 0 && (
            <div className="card pad stack">
              <div className="bold">همین کالا در همین پاساژ</div>
              <div className="tiny muted">اگر این فروشگاه بسته بود یا موجود نداشت، چند قدم آن‌طرف‌تر:</div>
              {d.same_mall_offers.map((o) => (
                <button key={o.sid} className="row between small" style={{ textAlign: "right" }} onClick={() => onOpenShop(o.sid)}>
                  <span><b>{o.name}</b> <span className="muted">{o.mall}</span></span>
                  <span>{toman(o.price)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="card pad stack">
            <div className="bold">ساعت کاری ثبت‌شده</div>
            <table className="hours">
              <tbody>
                {d.week.map((w) => (
                  <tr key={w.dow} className={w.today ? "today" : ""}>
                    <td style={{ width: "34%" }}>{w.day}{w.today ? " (امروز)" : ""}</td>
                    <td>{w.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card pad stack">
            <div className="bold">تماس و مسیر</div>
            <div className="row wrap" style={{ gap: 6 }}>
              <a className="btn sm secondary" href={`tel:${d.phone ?? ""}`}><Icon name="phone" size={15} /> {fa(d.phone ?? "")}</a>
              {d.instagram_url && <a className="btn sm secondary" href={d.instagram_url} target="_blank" rel="noreferrer">اینستاگرام</a>}
              {d.website_url && <a className="btn sm secondary" href={d.website_url} target="_blank" rel="noreferrer">وب‌سایت</a>}
            </div>
            <div className="tiny muted">{d.phone_note}{d.is_real_name ? "" : "؛ نام این فروشگاه هم در دادهٔ هکاتون ساختگی است."}</div>
            <div className="navbtns">
              <a className="btn sm soft" href={d.nav.neshan} target="_blank" rel="noreferrer"><Icon name="nav" size={15} /> نشان</a>
              <a className="btn sm soft" href={d.nav.balad} target="_blank" rel="noreferrer"><Icon name="nav" size={15} /> بلد</a>
              <a className="btn sm soft" href={d.nav.google} target="_blank" rel="noreferrer"><Icon name="nav" size={15} /> گوگل‌مپ</a>
            </div>
          </div>

          {d.categories.length > 0 && (
            <div className="card pad stack">
              <div className="bold">دسته‌هایی که این فروشگاه اعلام کرده</div>
              <div className="specs">{d.categories.map((c) => <span key={c} className="spec">{c}</span>)}</div>
              <div className="tiny muted">{fa(d.n_products)} کالا در ترب ثبت کرده</div>
            </div>
          )}

          {pid && (
            <div className="row" style={{ position: "sticky", bottom: 0, paddingTop: 4 }}>
              <button className="btn grow" onClick={() => onInquiry(sid)}><Icon name="chat" size={16} /> استعلام از این فروشگاه</button>
              <button className="btn secondary" onClick={() => onVisit(sid)}><Icon name="route" size={16} /> برو</button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

function GuideCard({ g, onOpenShop }: { g: MallGuide; onOpenShop: (sid: number) => void }) {
  return (
    <div className="card pad stack">
      <div className="row between">
        <div className="bold">مسیر داخل پاساژ</div>
        {g.mall_shop_count > 1 && <span className="pill">{fa(g.mall_shop_count)} فروشگاه ثبت‌شده در این پاساژ</span>}
      </div>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <div className="guide grow">
          {g.steps.map((s, i) => (
            <div className="gstep" key={i}>
              <span className="gi"><Icon name={GUIDE_ICON[s.icon] ?? "info"} size={16} /></span>
              <span style={{ paddingTop: 3 }}>{s.text}</span>
            </div>
          ))}
        </div>
        {g.floors.length > 1 && (
          <div className="floors" aria-label="طبقات پاساژ">
            {g.floors.map((f) => (
              <div key={f.num} className={"floor" + (f.target ? " target" : "")}>
                <span>{f.num === 0 ? "همکف" : `طبقه ${fa(f.num)}`}</span>
                <span>{fa(f.shops)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {g.landmarks.length > 0 && (
        <div className="row wrap" style={{ gap: 4 }}>
          {g.landmarks.map((l) => (
            <button key={l.sid} className="spec" onClick={() => onOpenShop(l.sid)}>واحد {l.unit}: {l.name}</button>
          ))}
        </div>
      )}
      <div className="tiny muted">{g.source}</div>
    </div>
  );
}

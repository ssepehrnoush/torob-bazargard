import { useEffect, useState } from "react";
import { api } from "../api";
import { fa, priceRange, short, toman } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, ProductCard as PC } from "../types";
import { Sheet } from "./Sheet";

export function Img({ src, className = "pimg" }: { src: string | null; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return (
      <div className={className + " ph"}>
        <Icon name="bag" size={26} />
      </div>
    );
  }
  return <img className={className} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

export function availability(p: PC, radius: number): string {
  if (p.n_nearby) {
    const near = p.nearest_km != null ? `، نزدیک‌ترین ${p.nearest_km < 1 ? fa(Math.round(p.nearest_km * 1000 / 10) * 10) + " متر" : fa(p.nearest_km.toFixed(1)).replace(".", "٫") + " کیلومتر"}` : "";
    return `${fa(p.n_nearby)} فروشگاه در ${fa(radius)} کیلومتری${near}`;
  }
  if (p.n_shops) return `${fa(p.n_shops)} فروشگاه، هیچ‌کدام در شعاع شما نیست`;
  return "فروشگاهی ثبت نشده";
}

type CardProps = {
  p: PC;
  ctx: Ctx;
  compared: boolean;
  onShops: () => void;
  onCompare: () => void;
  onDetails: () => void;
};

export function ProductCard({ p, ctx, compared, onShops, onCompare, onDetails }: CardProps) {
  return (
    <div className="pcard fadein">
      <div className="top-row">
        <button onClick={onDetails} aria-label="جزئیات کالا">
          <Img src={p.image} />
        </button>
        <div className="grow stack" style={{ gap: 4 }}>
          {p.tag && (
            <span className="pill brand" style={{ alignSelf: "flex-start" }}>
              {p.tag}
            </span>
          )}
          <button className="ptitle clamp2" style={{ textAlign: "right" }} onClick={onDetails}>
            {p.title}
          </button>
          <div className="price">{p.price_min ? `از ${toman(p.nearby_min_price || p.price_min)}` : "قیمت ثبت نشده"}</div>
          <div className="shopsline row" style={{ gap: 5 }}>
            <Icon name="store" size={14} />
            <span className="grow">{availability(p, ctx.radius_km)}</span>
          </div>
        </div>
      </div>
      {p.why && (
        <div className="why">
          <Icon name="spark" size={15} />
          <span>{p.why}</span>
        </div>
      )}
      {p.specs?.length > 0 && (
        <div className="specs">
          {p.specs.slice(0, 4).map((s, i) => (
            <span className="spec" key={i}>
              <b>{s.k}:</b> {s.v}
            </span>
          ))}
        </div>
      )}
      {!!p.n_installment && ctx.installments_only && (
        <span className="pill green" style={{ alignSelf: "flex-start" }}>
          <Icon name="card" size={13} /> {fa(p.n_installment)} فروشگاه با امکان قسطی
        </span>
      )}
      <div className="pactions">
        <button className="btn sm" onClick={onShops}>
          <Icon name="pin" size={16} /> خرید حضوری
        </button>
        <button className={"btn sm " + (compared ? "dark" : "secondary")} onClick={onCompare} style={{ flex: "0 0 auto" }}>
          <Icon name={compared ? "check" : "compare"} size={16} /> مقایسه
        </button>
      </div>
    </div>
  );
}

export function ProductSheet({ pid, ctx, onClose, onShops }: { pid: number; ctx: Ctx; onClose: () => void; onShops: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    api.product(pid, ctx).then(setD).catch(() => setD({ error: true }));
  }, [pid]); // eslint-disable-line
  return (
    <Sheet title="جزئیات کالا" onClose={onClose}>
      {!d && <div className="shimmer" style={{ height: 220 }} />}
      {d?.error && <div className="empty">اطلاعات کالا دریافت نشد</div>}
      {d && !d.error && (
        <>
          <div className="card pad stack">
            <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {(d.images?.length ? d.images : [d.image]).slice(0, 5).map((u: string, i: number) => (
                <Img key={i} src={u} className="pimg" />
              ))}
            </div>
            <div className="ptitle">{d.title}</div>
            <div className="row wrap small muted">
              {d.brand && <span className="pill">{d.brand}</span>}
              <span className="pill">{d.category}</span>
            </div>
            <div className="row between">
              <div>
                <div className="tiny muted">بازهٔ قیمت ثبت‌شده در ترب</div>
                <div className="price">{priceRange(d.price_min, d.price_max)}</div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div className="tiny muted">میانهٔ قیمت</div>
                <div className="bold">{short(d.price_median)}</div>
              </div>
            </div>
            <div className="small muted">{availability(d, ctx.radius_km)}</div>
            <button className="btn block" onClick={onShops}>
              <Icon name="store" /> دیدن فروشگاه‌ها و مقایسه
            </button>
          </div>
          <div className="sectiontitle">مشخصات</div>
          <div className="card">
            <table className="hours">
              <tbody>
                {d.specs.filter((s: any) => s.value).map((s: any, i: number) => (
                  <tr key={i}>
                    <td className="muted" style={{ width: "38%" }}>{s.key}</td>
                    <td>{String(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.specs.length && <div className="empty">مشخصاتی برای این کالا ثبت نشده</div>}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function CompareSheet({ pids, ctx, need, onClose, onShops, onRemove }: {
  pids: number[];
  ctx: Ctx;
  need: string | null;
  onClose: () => void;
  onShops: (pid: number) => void;
  onRemove: (pid: number) => void;
}) {
  const [d, setD] = useState<any>(null);
  const [verdict, setVerdict] = useState<{ verdict: string | null; best_pid: number | null; labels: Record<string, string> } | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(true);
  useEffect(() => {
    setD(null);
    setVerdict(null);
    api.compare(pids, ctx).then(setD).catch(() => setD({ error: true }));
    api.verdict(pids, ctx, need).then(setVerdict).catch(() => setVerdict({ verdict: null, best_pid: null, labels: {} }));
  }, [pids.join(",")]); // eslint-disable-line
  const prods: any[] = d?.products ?? [];
  const rows: any[] = (d?.rows ?? []).filter((r: any) => !onlyDiff || r.differs);
  return (
    <Sheet title={`مقایسهٔ ${fa(pids.length)} کالا`} onClose={onClose}>
      <div className="insight">
        <div className="ico"><Icon name="spark" /></div>
        <div className="grow">
          <h3>نظر دستیار</h3>
          {!verdict && <div className="shimmer" style={{ height: 36, marginTop: 6 }} />}
          {verdict && <p>{verdict.verdict || "برای این کالاها مشخصات کافی برای قضاوت نبود؛ تفاوت‌ها را در جدول ببینید."}</p>}
        </div>
      </div>
      {!d && <div className="shimmer" style={{ height: 240 }} />}
      {d && !d.error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${prods.length}, minmax(0, 1fr))`, gap: 8 }}>
            {prods.map((p) => (
              <div key={p.pid} className="card pad stack" style={{ gap: 6, padding: 10, border: verdict?.best_pid === p.pid ? "2px solid var(--brand)" : undefined }}>
                <Img src={p.image} className="pimg" />
                {verdict?.labels?.[String(p.pid)] && <span className="pill brand">{verdict.labels[String(p.pid)]}</span>}
                <div className="small bold clamp2">{p.title}</div>
                <div className="small">{priceRange(p.price_min, p.price_max)}</div>
                <div className="tiny muted">{fa(p.n_nearby ?? 0)} فروشگاه نزدیک</div>
                <button className="btn sm" onClick={() => onShops(p.pid)}>فروشگاه‌ها</button>
                <button className="tiny muted" onClick={() => onRemove(p.pid)}>حذف از مقایسه</button>
              </div>
            ))}
          </div>
          <div className="row between">
            <div className="sectiontitle" style={{ margin: 0 }}>مشخصات</div>
            <button className={"chip" + (onlyDiff ? " on" : "")} onClick={() => setOnlyDiff(!onlyDiff)}>فقط تفاوت‌ها</button>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="compare-table">
              <tbody>
                <tr>
                  <th>قیمت (کمترین)</th>
                  {prods.map((p) => (
                    <td key={p.pid} className="bold">{toman(p.price_min)}</td>
                  ))}
                </tr>
                {rows.map((r, i) => (
                  <tr key={i} className={r.differs ? "diff" : ""}>
                    <th>{r.key}</th>
                    {r.values.map((v: string | null, j: number) => (
                      <td key={j}>{v ?? <span className="muted">ثبت نشده</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty">مشخصهٔ مشترکی برای مقایسه ثبت نشده</div>}
          </div>
        </>
      )}
    </Sheet>
  );
}

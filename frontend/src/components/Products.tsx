import { useEffect, useState } from "react";
import { api } from "../api";
import { fa, priceRange, short, toman } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, ProductCard as PC } from "../types";
import { AiNote } from "./bits";
import { Sheet } from "./Sheet";

export function Img({ src, className = "pimg" }: { src: string | null; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return (
      <div className={className + " ph"}>
        <Icon name="bag" size={24} />
      </div>
    );
  }
  return <img className={className} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

export function availability(p: PC, _radius?: number): string {
  if (p.n_nearby) return `در ${fa(p.n_nearby)} فروشگاه نزدیک شما`;
  if (p.n_shops) return `در ${fa(p.n_shops)} فروشگاه، دور از شما`;
  return "فروشگاهی ثبت نشده";
}

type CardProps = {
  p: PC;
  ctx: Ctx;
  compared: boolean;
  onShops: () => void;
  onCompare: () => void;
};

/** Torob search-result row with the assistant's one-line reason. The whole card opens the shops. */
export function ProductCard({ p, ctx, compared, onShops, onCompare }: CardProps) {
  return (
    <div className="pcard fadein">
      <button className="pcard-main" onClick={onShops}>
        <Img src={p.image} />
        <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
          {p.tag && <span className="ptag">{p.tag}</span>}
          <div className="ptitle clamp2">{p.title}</div>
          <div className="price">{p.price_min ? `از ${toman(p.nearby_min_price || p.price_min)}` : "قیمت ثبت نشده"}</div>
          <div className="meta">
            {availability(p)}
            {!!p.n_installment && <span className={ctx.installments_only ? "blue-txt bold" : ""}> · {fa(p.n_installment)} قسطی</span>}
          </div>
        </div>
      </button>
      {p.why && <div className="whyline"><Icon name="spark" size={15} stroke={1.8} /> <span className="clamp2">{p.why}</span></div>}
      <div className="pcard-foot">
        <button className={"checkline" + (compared ? " on" : "")} onClick={onCompare} aria-pressed={compared}>
          <span className={"selbox" + (compared ? " on" : "")}>{compared && <Icon name="check" size={13} stroke={2.6} />}</span>
          مقایسه
        </button>
        <button className="linkbtn" onClick={onShops}>فروشگاه‌ها <Icon name="left" size={14} /></button>
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
    <Sheet title="مشخصات کالا" onClose={onClose} footer={d && !d.error ? <button className="btn block" onClick={onShops}>دیدن فروشگاه‌ها</button> : undefined}>
      {!d && <div className="shimmer" style={{ height: 220, borderRadius: 16 }} />}
      {d?.error && <div className="empty">اطلاعات کالا دریافت نشد</div>}
      {d && !d.error && (
        <>
          <div className="card pad stack">
            <div className="gallery">
              {(d.images?.length ? d.images : [d.image]).slice(0, 5).map((u: string, i: number) => (
                <Img key={i} src={u} className="pimg lg" />
              ))}
            </div>
            <div className="ptitle" style={{ fontSize: 15 }}>{d.title}</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {d.brand && <span className="tag gray">{d.brand}</span>}
              <span className="tag gray">{d.category}</span>
            </div>
            <div className="kv">
              <div><span className="meta">بازهٔ قیمت ثبت‌شده در ترب</span><b>{priceRange(d.price_min, d.price_max)}</b></div>
              <div><span className="meta">میانهٔ قیمت</span><b>{short(d.price_median)}</b></div>
            </div>
            <div className="meta">{availability(d, ctx.radius_km)}</div>
          </div>
          <div className="card">
            <table className="table">
              <tbody>
                {d.specs.filter((s: any) => s.value).map((s: any, i: number) => (
                  <tr key={i}>
                    <th>{s.key}</th>
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
      <AiNote title="نظر دستیار" loading={!verdict}>
        {verdict?.verdict || "برای این کالاها مشخصات کافی برای قضاوت نبود؛ تفاوت‌ها را در جدول ببینید."}
      </AiNote>
      {!d && <div className="shimmer" style={{ height: 240, borderRadius: 16 }} />}
      {d && !d.error && (
        <>
          <div className="cmpgrid" style={{ gridTemplateColumns: `repeat(${prods.length}, minmax(0, 1fr))` }}>
            {prods.map((p) => (
              <div key={p.pid} className={"cmpcol" + (verdict?.best_pid === p.pid ? " best" : "")}>
                <Img src={p.image} className="pimg" />
                {verdict?.labels?.[String(p.pid)] ? <span className="tag brand">{verdict.labels[String(p.pid)]}</span> : <span className="tag-space" />}
                <div className="small bold clamp2">{p.title}</div>
                <div className="small">{priceRange(p.price_min, p.price_max)}</div>
                <div className="meta">{fa(p.n_nearby ?? 0)} فروشگاه نزدیک</div>
                <button className="btn ghost sm block" onClick={() => onShops(p.pid)}>فروشگاه‌ها</button>
                <button className="textbtn muted" onClick={() => onRemove(p.pid)}>حذف از مقایسه</button>
              </div>
            ))}
          </div>
          <div className="row between" style={{ padding: "0 4px" }}>
            <h3 className="h3">مشخصات</h3>
            <button className={"chip sm" + (onlyDiff ? " on" : "")} onClick={() => setOnlyDiff(!onlyDiff)}>فقط تفاوت‌ها</button>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table cmp">
              <tbody>
                <tr>
                  <th>کمترین قیمت</th>
                  {prods.map((p) => (
                    <td key={p.pid} className="bold">{toman(p.price_min)}</td>
                  ))}
                </tr>
                {rows.map((r, i) => (
                  <tr key={i}>
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

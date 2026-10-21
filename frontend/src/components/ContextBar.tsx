import { useState } from "react";
import { Icon } from "../icons";
import { fa, parseToman, short } from "../fmt";
import type { Ctx, Meta } from "../types";
import { Sheet } from "./Sheet";

type Props = { ctx: Ctx; setCtx: (c: Ctx) => void; meta: Meta | null; toast: (s: string) => void };

const BUDGETS = [5_000_000, 20_000_000, 50_000_000, 100_000_000, 200_000_000];
const FERDOWSI = { lat: 35.6998, lon: 51.4197 };

export function activeFilters(ctx: Ctx): number {
  return (ctx.visit !== "now" ? 1 : 0) + (ctx.budget_max ? 1 : 0) + (ctx.installments_only ? 1 : 0) +
    (ctx.open_only ? 1 : 0) + (ctx.torob_pay_only ? 1 : 0);
}

/** Two controls only: where you are, and one "filters" sheet for everything else. */
export function ContextBar({ ctx, setCtx, meta, toast }: Props) {
  const [open, setOpen] = useState<null | "place" | "filters">(null);
  const n = activeFilters(ctx);
  return (
    <>
      <div className="ctxbar">
        <button className="chip grow-chip" onClick={() => setOpen("place")}>
          <Icon name="pin" size={15} />
          <span className="ellipsis">{ctx.place.split(" (")[0]}</span>
          <small>تا {fa(ctx.radius_km)} کیلومتر</small>
          <Icon name="down" size={14} />
        </button>
        <button className={"chip" + (n ? " on" : "")} onClick={() => setOpen("filters")}>
          <Icon name="filter" size={15} />
          فیلترها{n ? ` (${fa(n)})` : ""}
        </button>
      </div>

      {open === "place" && (
        <Sheet title="کجا هستید؟" onClose={() => setOpen(null)}>
          <button
            className="btn secondary block"
            onClick={() => {
              if (!navigator.geolocation) return toast("مرورگر موقعیت‌یابی را پشتیبانی نمی‌کند");
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  const { latitude: lat, longitude: lon } = p.coords;
                  if (Math.hypot(lat - FERDOWSI.lat, (lon - FERDOWSI.lon) * 0.81) > 0.5) {
                    toast("فعلاً فقط فروشگاه‌های تهران را داریم؛ یکی از محله‌ها را انتخاب کنید");
                    return;
                  }
                  setCtx({ ...ctx, lat, lon, place: "موقعیت فعلی من" });
                  setOpen(null);
                },
                () => toast("دسترسی به موقعیت داده نشد؛ یکی از محله‌ها را انتخاب کنید"),
                { enableHighAccuracy: true, timeout: 8000 }
              );
            }}
          >
            <Icon name="locate" /> موقعیت فعلی من
          </button>
          <div className="list">
            {(meta?.places ?? []).map((p) => (
              <button key={p.id} className={"li" + (ctx.place === p.label ? " on" : "")}
                onClick={() => { setCtx({ ...ctx, lat: p.lat, lon: p.lon, place: p.label }); setOpen(null); }}>
                <span className="grow">{p.label}</span>
                {ctx.place === p.label && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
          <div className="card pad stack">
            <div className="row between">
              <span className="bold">تا چه فاصله‌ای؟</span>
              <span className="bold" style={{ color: "var(--blue)" }}>{fa(ctx.radius_km)} کیلومتر</span>
            </div>
            <input className="range" type="range" min={1} max={20} step={1} value={ctx.radius_km}
              onChange={(e) => setCtx({ ...ctx, radius_km: +e.target.value })} />
          </div>
        </Sheet>
      )}

      {open === "filters" && <FiltersSheet ctx={ctx} setCtx={setCtx} meta={meta} onClose={() => setOpen(null)} />}
    </>
  );
}

function FiltersSheet({ ctx, setCtx, meta, onClose }: { ctx: Ctx; setCtx: (c: Ctx) => void; meta: Meta | null; onClose: () => void }) {
  const [custom, setCustom] = useState("");
  const toggle = (k: "installments_only" | "open_only" | "torob_pay_only") => setCtx({ ...ctx, [k]: !ctx[k] });
  return (
    <Sheet title="فیلترها" onClose={onClose}
      actions={activeFilters(ctx) ? (
        <button className="linkbtn" onClick={() => setCtx({ ...ctx, visit: "now", budget_max: null, budget_min: null, installments_only: false, open_only: false, torob_pay_only: false })}>
          حذف همه
        </button>
      ) : undefined}>
      <div className="card pad stack">
        <div className="bold">کی می‌روید؟</div>
        <div className="opts">
          {Object.entries(meta?.visit_presets ?? { now: "همین الان" }).map(([k, label]) => (
            <button key={k} className={"opt" + (ctx.visit === k ? " sel" : "")} onClick={() => setCtx({ ...ctx, visit: k })}>{label}</button>
          ))}
        </div>
        <div className="tiny muted">باز بودن هر فروشگاه برای همان زمانی که می‌رسید حساب می‌شود.</div>
      </div>

      <div className="card pad stack">
        <div className="bold">سقف بودجه</div>
        <div className="opts">
          <button className={"opt" + (!ctx.budget_max ? " sel" : "")} onClick={() => setCtx({ ...ctx, budget_max: null, budget_min: null })}>مهم نیست</button>
          {BUDGETS.map((b) => (
            <button key={b} className={"opt" + (ctx.budget_max === b ? " sel" : "")} onClick={() => setCtx({ ...ctx, budget_max: b })}>
              تا {short(b)}
            </button>
          ))}
        </div>
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          const v = parseToman(custom);
          if (v) setCtx({ ...ctx, budget_max: v < 1000 ? v * 1_000_000 : v });
        }}>
          <input className="input grow" placeholder="مبلغ دلخواه، مثلاً ۱۵ میلیون" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="btn sm secondary" type="submit">ثبت</button>
        </form>
      </div>

      <div className="list">
        <Toggle on={ctx.installments_only} onClick={() => toggle("installments_only")} title="فقط خرید قسطی" sub="فروشگاه‌هایی که ترب‌پی، اسنپ‌پی، دیجی‌پی یا تارا دارند" />
        <Toggle on={ctx.open_only} onClick={() => toggle("open_only")} title="فقط فروشگاه‌های باز" sub="در زمانی که می‌رسید" />
        <Toggle on={ctx.torob_pay_only} onClick={() => toggle("torob_pay_only")} title="فقط ترب‌پی" />
      </div>
      <button className="btn block" onClick={onClose}>نمایش نتیجه</button>
    </Sheet>
  );
}

function Toggle({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button className="li" onClick={onClick} role="switch" aria-checked={on}>
      <span className="grow stack" style={{ gap: 0 }}>
        <span>{title}</span>
        {sub && <span className="tiny muted" style={{ fontWeight: 400 }}>{sub}</span>}
      </span>
      <span className={"switch" + (on ? " on" : "")}><i /></span>
    </button>
  );
}

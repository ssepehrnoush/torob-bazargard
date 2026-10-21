import { useState } from "react";
import { Icon } from "../icons";
import { fa, parseToman, short } from "../fmt";
import type { Ctx, Meta } from "../types";
import { Sheet } from "./Sheet";

type Props = { ctx: Ctx; setCtx: (c: Ctx) => void; meta: Meta | null; toast: (s: string) => void };

const BUDGETS = [2_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000, 200_000_000];
const FERDOWSI = { lat: 35.6998, lon: 51.4197 };

export function ContextBar({ ctx, setCtx, meta, toast }: Props) {
  const [open, setOpen] = useState<null | "place" | "budget" | "visit">(null);
  const visitLabel = meta?.visit_presets[ctx.visit] ?? "همین الان";
  return (
    <>
      <div className="ctxbar">
        <button className="chip" onClick={() => setOpen("place")}>
          <Icon name="pin" size={15} />
          {ctx.place.split(" (")[0]} <small>تا {fa(ctx.radius_km)} کیلومتر</small>
        </button>
        <button className="chip" onClick={() => setOpen("visit")}>
          <Icon name="clock" size={15} />
          {visitLabel}
        </button>
        <button className={"chip" + (ctx.budget_max ? " on" : "")} onClick={() => setOpen("budget")}>
          <Icon name="wallet" size={15} />
          {ctx.budget_max ? `تا ${short(ctx.budget_max)}` : "بودجه"}
        </button>
        <button
          className={"chip" + (ctx.installments_only ? " on" : "")}
          onClick={() => setCtx({ ...ctx, installments_only: !ctx.installments_only })}
          aria-pressed={ctx.installments_only}
        >
          <Icon name="card" size={15} />
          فقط قسطی
        </button>
        <button
          className={"chip" + (ctx.open_only ? " on" : "")}
          onClick={() => setCtx({ ...ctx, open_only: !ctx.open_only })}
          aria-pressed={ctx.open_only}
        >
          <Icon name="store" size={15} />
          فقط باز
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
                  const far = Math.hypot(lat - FERDOWSI.lat, (lon - FERDOWSI.lon) * 0.81) > 0.5;
                  if (far) {
                    toast("داده فقط فروشگاه‌های تهران را دارد؛ یکی از محله‌ها را انتخاب کنید");
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
            <Icon name="locate" /> استفاده از موقعیت فعلی من
          </button>
          <div className="list">
            {(meta?.places ?? []).map((p) => (
              <button
                key={p.id}
                className={"li" + (ctx.place === p.label ? " on" : "")}
                onClick={() => {
                  setCtx({ ...ctx, lat: p.lat, lon: p.lon, place: p.label });
                  setOpen(null);
                }}
              >
                <Icon name="pin" size={16} />
                <span className="grow">{p.label}</span>
                {ctx.place === p.label && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
          <div className="card pad stack">
            <div className="row between">
              <span className="bold">شعاع جستجو</span>
              <span className="pill">{fa(ctx.radius_km)} کیلومتر</span>
            </div>
            <input
              className="range"
              type="range"
              min={1}
              max={20}
              step={1}
              value={ctx.radius_km}
              onChange={(e) => setCtx({ ...ctx, radius_km: +e.target.value })}
            />
            <div className="tiny muted">بیشتر فروشگاه‌های دادهٔ ترب در محدودهٔ فردوسی، جمهوری، لاله‌زار و بهارستان هستند.</div>
          </div>
        </Sheet>
      )}

      {open === "budget" && <BudgetSheet ctx={ctx} setCtx={setCtx} onClose={() => setOpen(null)} />}

      {open === "visit" && (
        <Sheet title="کی می‌خواهید بروید؟" onClose={() => setOpen(null)}>
          <div className="tiny muted">بر اساس این زمان، باز یا بسته بودن هر فروشگاه هنگام رسیدن شما بررسی می‌شود.</div>
          <div className="list">
            {Object.entries(meta?.visit_presets ?? { now: "همین الان" }).map(([k, label]) => (
              <button
                key={k}
                className={"li" + (ctx.visit === k ? " on" : "")}
                onClick={() => {
                  setCtx({ ...ctx, visit: k });
                  setOpen(null);
                }}
              >
                <Icon name="clock" size={16} />
                <span className="grow">{label}</span>
                {ctx.visit === k && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

function BudgetSheet({ ctx, setCtx, onClose }: { ctx: Ctx; setCtx: (c: Ctx) => void; onClose: () => void }) {
  const [custom, setCustom] = useState("");
  return (
    <Sheet title="سقف بودجه" onClose={onClose}>
      <div className="opts">
        {BUDGETS.map((b) => (
          <button
            key={b}
            className={"opt" + (ctx.budget_max === b ? " sel" : "")}
            onClick={() => {
              setCtx({ ...ctx, budget_max: b });
              onClose();
            }}
          >
            تا {short(b)} تومان
          </button>
        ))}
        <button
          className={"opt" + (!ctx.budget_max ? " sel" : "")}
          onClick={() => {
            setCtx({ ...ctx, budget_max: null, budget_min: null });
            onClose();
          }}
        >
          بدون سقف
        </button>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const v = parseToman(custom);
          if (v) {
            setCtx({ ...ctx, budget_max: v < 1000 ? v * 1_000_000 : v });
            onClose();
          }
        }}
      >
        <input className="input grow" placeholder="مثلاً ۱۵ میلیون" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn sm" type="submit">ثبت</button>
      </form>
    </Sheet>
  );
}

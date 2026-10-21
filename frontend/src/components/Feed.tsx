import { useState } from "react";
import { fa } from "../fmt";
import { Icon } from "../icons";
import type { Ctx, FeedItem, Meta, ProductCard as PC, Question } from "../types";
import { RadishLogo } from "./Logo";
import { ProductCard } from "./Products";

const EXAMPLES = [
  "کتونی برای پیاده‌روی، مدلش رو نمی‌دونم",
  "گوشی سامسونگ تا ۲۰۰ میلیون، قسطی",
  "شارژر ۲۰ وات اصلی آیفون",
  "اسپیکر جی‌بی‌ال Flip 7",
];

type AgentItem = Extract<FeedItem, { kind: "agent" }>;

type Handlers = {
  ctx: Ctx;
  compare: number[];
  onSend: (text: string) => void;
  onShops: (p: PC) => void;
  onCompare: (pid: number) => void;
  onDetails: (pid: number) => void;
  onAnswered: (id: string) => void;
  onOpenShops: (pid: number) => void;
  onOpenInquiry: () => void;
  busy: boolean;
};

export function Feed({ items, meta, stale, onRefresh, ...h }: Handlers & { items: FeedItem[]; meta: Meta | null; stale: boolean; onRefresh: () => void }) {
  return (
    <>
      <div className="card hero">
        <img className="art" src="/img/hero.webp" alt="" style={{ height: 190, objectPosition: "50% 45%" }} />
        <div className="copy">
        <h1>چی می‌خوای بخری؟</h1>
        <p>حتی اگه مدلش رو نمی‌دونی. فروشگاه نزدیک و به‌صرفه رو پیدا می‌کنم و قبل از رفتن قیمت و موجودی رو می‌پرسم.</p>
        <div className="examples">
          {EXAMPLES.map((e) => (
            <button key={e} className="example" disabled={h.busy} onClick={() => h.onSend(e)}>
              {e}
            </button>
          ))}
        </div>
        <div className="datanote">
          <Icon name="info" size={14} style={{ marginTop: 3, flex: "none" }} />
          <span>{fa((meta?.counts?.shops ?? 6476).toLocaleString("en-US")).replace(/,/g, "٫")} فروشگاه حضوری تهران؛ قیمت‌ها تا استعلام قطعی نیستند.</span>
        </div>
        </div>
      </div>
      {items.map((it) =>
        it.kind === "user" ? (
          <div key={it.id} data-id={it.id} className="ububble fadein">{it.text}</div>
        ) : (
          <AgentBlock key={it.id} it={it} {...h} />
        )
      )}
      {stale && (
        <div className="hiddenmsg fadein">
          <Icon name="refresh" size={15} />
          <span>محل، بودجه یا شرط قسطی را عوض کردید.</span>
          <button onClick={onRefresh}>به‌روزرسانی پیشنهادها</button>
        </div>
      )}
    </>
  );
}

export function AgentBlock({ it, ...h }: Handlers & { it: AgentItem }) {
  const [showSteps, setShowSteps] = useState(false);
  const open = it.pending || showSteps; // live steps while working, one quiet line afterwards
  return (
    <div className="agent fadein">
      <div className="agenthead">
        <span className="avatar"><RadishLogo size={17} /></span>
        <span>دستیار خرید حضوری</span>
        {!it.pending && it.steps.length > 0 && (
          <button className="stepstoggle" onClick={() => setShowSteps(!showSteps)}>
            <Icon name="check" size={13} /> {fa(it.steps.length)} کار انجام شد
            <Icon name="down" size={13} style={{ transform: showSteps ? "rotate(180deg)" : undefined }} />
          </button>
        )}
      </div>
      {open && it.steps.length > 0 && (
        <div className="steps">
          {it.steps.map((s) => (
            <div className="stepline" key={s.id}>
              <span className={"st " + (s.done ? "ok" : "run")}>{s.done && <Icon name="check" size={12} />}</span>
              <span className="bold">{s.label}</span>
              {s.detail && <span className="detail ellipsis grow">{s.detail}</span>}
            </div>
          ))}
        </div>
      )}
      {it.pending && !it.message && (
        <div className="typing">
          <i /><i /><i /> <span style={{ marginRight: 6 }}>{it.status || "در حال فکر کردن…"}</span>
        </div>
      )}
      {it.notice && (
        <div className="notice"><Icon name="info" size={14} style={{ marginTop: 3 }} /> {it.notice}</div>
      )}
      {it.message && <div className="amsg">{it.message}</div>}
      {it.error && <div className="notice"><Icon name="alert" size={14} /> {it.error}</div>}
      {it.ask && !it.answered && <AskBox qs={it.ask} onSubmit={(t) => { h.onAnswered(it.id); h.onSend(t); }} disabled={h.busy} />}
      {it.ask && it.answered && <div className="tiny muted" style={{ padding: "0 4px" }}>پاسخ داده شد</div>}
      {it.products?.map((p) => (
        <ProductCard
          key={p.pid}
          p={p}
          ctx={h.ctx}
          compared={h.compare.includes(p.pid)}
          onShops={() => h.onShops(p)}
          onCompare={() => h.onCompare(p.pid)}
          onDetails={() => h.onDetails(p.pid)}
        />
      ))}
      {it.shopsPid != null && (
        <button className="btn soft" onClick={() => h.onOpenShops(it.shopsPid!)}>
          <Icon name="store" size={16} /> نمایش فروشگاه‌ها
        </button>
      )}
      {it.inquiry && (
        <button className="btn soft" onClick={h.onOpenInquiry}>
          <Icon name="chat" size={16} /> رفتن به استعلام
        </button>
      )}
      {!!it.suggestions?.length && !it.pending && (
        <div className="sugs">
          {it.suggestions.map((s) => (
            <button key={s} className="sug" disabled={h.busy} onClick={() => h.onSend(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AskBox({ qs, onSubmit, disabled }: { qs: Question[]; onSubmit: (text: string) => void; disabled: boolean }) {
  const [sel, setSel] = useState<Record<number, string[]>>({});
  const single = qs.length === 1 && !qs[0].multi;
  const ready = qs.every((_, i) => (sel[i] ?? []).length > 0);
  const send = (s: Record<number, string[]>) => {
    const parts = qs.map((q, i) => ((s[i] ?? []).length ? `${q.question.replace(/[؟?]$/, "")}: ${s[i].join("، ")}` : null)).filter(Boolean);
    onSubmit(parts.join("\n"));
  };
  return (
    <div className="ask">
      {qs.map((q, i) => (
        <div key={i} className="stack" style={{ gap: 6 }}>
          <div className="q">{q.question}</div>
          <div className="opts">
            {q.options.map((o) => {
              const on = (sel[i] ?? []).includes(o);
              return (
                <button
                  key={o}
                  className={"opt" + (on ? " sel" : "")}
                  disabled={disabled}
                  onClick={() => {
                    const cur = sel[i] ?? [];
                    const next = q.multi ? (on ? cur.filter((x) => x !== o) : [...cur, o]) : [o];
                    const s = { ...sel, [i]: next };
                    setSel(s);
                    if (single) send(s);
                  }}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!single && (
        <div className="row">
          <button className="btn sm" disabled={!ready || disabled} onClick={() => send(sel)}>
            ادامه <Icon name="left" size={16} />
          </button>
          <button className="small muted" disabled={disabled} onClick={() => onSubmit("فرقی نمی‌کند، خودت بهترین‌ها را پیشنهاد بده")}>
            فرقی نمی‌کنه، پیشنهاد بده
          </button>
        </div>
      )}
    </div>
  );
}

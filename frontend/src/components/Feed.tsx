import { useEffect, useRef, useState } from "react";
import { fa } from "../fmt";
import { Icon } from "../icons";
import type { Bargain, Ctx, FeedItem, Meta, ProductCard as PC, Question } from "../types";
import { BargainCard } from "./bits";
import { RadishLogo } from "./Logo";
import { ProductCard } from "./Products";
import { speak, stopSpeaking } from "../voice";

/* Every example is a real query: each one returns products from the dataset (checked with /api/search). */
const EXAMPLES: [string, string][] = [
  ["mobile", "گوشی سامسونگ تا ۲۰۰ میلیون، قسطی"],
  ["shoe", "کتونی برای پیاده‌روی، مدلش رو نمی‌دونم"],
  ["plug", "شارژر ۲۰ وات اصلی آیفون"],
  ["speaker", "اسپیکر جی‌بی‌ال Flip 7"],
];

type AgentItem = Extract<FeedItem, { kind: "agent" }>;

export type FeedHandlers = {
  ctx: Ctx;
  compare: number[];
  onSend: (text: string) => void;
  onShops: (p: PC) => void;
  onCompare: (pid: number) => void;
  onAnswered: (id: string) => void;
  onOpenShops: (pid: number) => void;
  onOpenInquiry: () => void;
  onBargain: (b: Bargain) => void;
  onEditFilters: () => void;
  onToast: (s: string) => void;
  tts: boolean;
  busy: boolean;
};

/** The calm first screen, like torob's own chat: one question, four real examples, the four steps in one line. */
export function Home({ meta, busy, onSend }: { meta: Meta | null; busy: boolean; onSend: (t: string) => void }) {
  return (
    <div className="home fadein">
      <div className="card home-card">
        <img className="hero-art" src="/img/hero.webp" width={960} height={480} alt="" />
        <h1>چی می‌خوای بخری؟</h1>
        <p>مدلش رو نمی‌دونی؟ اشکالی نداره. نزدیک‌ترین فروشگاه رو پیدا می‌کنم و قبل از رفتن، قیمت و موجودی رو ازشون می‌پرسم.</p>
      </div>
      {meta && !meta.llm.available && (
        <div className="notice"><Icon name="info" size={16} /> دستیار هوشمند الان در دسترس نیست؛ با جستجوی ساده پیدا می‌کنم.</div>
      )}
      <div className="label-sm">مثلاً بپرس</div>
      <div className="list">
        {EXAMPLES.map(([icon, text]) => (
          <button key={text} className="li example" disabled={busy} onClick={() => onSend(text)}>
            <span className="ex-ico"><Icon name={icon} size={19} /></span>
            <span className="grow">{text}</span>
            <Icon name="left" size={16} className="faint" />
          </button>
        ))}
      </div>
      <div className="stepsline">انتخاب کالا · فروشگاه نزدیک · استعلام · مسیر رفتن</div>
    </div>
  );
}

export function Feed({ items, stale, onRefresh, ...h }: FeedHandlers & { items: FeedItem[]; stale: boolean; onRefresh: () => void }) {
  return (
    <div className="feed">
      {items.map((it) =>
        it.kind === "user" ? (
          <div key={it.id} data-id={it.id} className="ububble fadein">{it.text}</div>
        ) : (
          <AgentBlock key={it.id} it={it} {...h} />
        )
      )}
      {stale && (
        <div className="hintbar fadein">
          <Icon name="refresh" size={16} />
          <span className="grow">محل، بودجه یا شرط قسطی را عوض کردید.</span>
          <button onClick={onRefresh}>به‌روزرسانی پیشنهادها</button>
        </div>
      )}
    </div>
  );
}

export function AgentBlock({ it, ...h }: FeedHandlers & { it: AgentItem }) {
  const [showSteps, setShowSteps] = useState(false);
  const [playing, setPlaying] = useState(false);
  const spoke = useRef(false);
  const open = it.pending || showSteps; // live steps while working, one quiet line afterwards
  const canSpeak = h.tts && !it.pending && !!it.message;
  const play = () => {
    if (playing) return stopSpeaking();
    setPlaying(true);
    speak(it.id, it.message!, () => setPlaying(false)).catch((e) => {
      setPlaying(false);
      h.onToast(e?.message ?? "پخش صوتی جواب الان در دسترس نیست");
    });
  };
  // A question asked by voice gets its answer read aloud once, as soon as it lands.
  useEffect(() => {
    if (it.speak && canSpeak && !spoke.current) {
      spoke.current = true;
      play();
    }
  }, [it.speak, canSpeak]); // eslint-disable-line
  return (
    <div className="agent fadein" data-id={it.id}>
      <div className="agenthead">
        <span className="avatar"><RadishLogo size={15} /></span>
        <span>دستیار ترب</span>
        {canSpeak && (
          <button className={"speakbtn" + (playing ? " on" : "")} onClick={play} aria-label={playing ? "توقف پخش" : "شنیدن جواب"} aria-pressed={playing}>
            <Icon name={playing ? "stop" : "volume"} size={16} />
            {playing ? "توقف" : "بشنو"}
          </button>
        )}
        {!it.pending && it.steps.length > 0 && (
          <button className="stepstoggle" onClick={() => setShowSteps(!showSteps)} aria-expanded={showSteps}>
            <Icon name="check" size={14} stroke={2.2} /> {fa(it.steps.length)} کار انجام شد
            <Icon name="down" size={14} style={{ transform: showSteps ? "rotate(180deg)" : undefined }} />
          </button>
        )}
      </div>
      {open && it.steps.length > 0 && (
        <ol className="steps">
          {it.steps.map((s) => (
            <li key={s.id}>
              <span className={"st " + (s.done ? "ok" : "run")}>{s.done && <Icon name="check" size={11} stroke={2.6} />}</span>
              <span className="st-label">{s.label}</span>
              {s.detail && <span className="st-detail">{s.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {!!it.applied?.length && (
        <div className="applied">
          <span className="meta">اعمال شد:</span>
          {it.applied.map((a) => <span key={a} className="chip xs on"><Icon name="check" size={12} stroke={2.4} />{a}</span>)}
          <button className="textbtn" onClick={h.onEditFilters}>تغییر</button>
        </div>
      )}
      {it.pending && !it.message && (
        <div className="typing"><i /><i /><i /> <span>{it.status || "در حال فکر کردن…"}</span></div>
      )}
      {it.notice && <div className="notice"><Icon name="info" size={16} /> {it.notice}</div>}
      {it.message && <div className="amsg">{it.message}</div>}
      {it.error && <div className="notice"><Icon name="alert" size={16} /> {it.error}</div>}
      {it.bargain && <BargainCard b={it.bargain} onOpen={() => h.onBargain(it.bargain!)} />}
      {it.ask && !it.answered && <AskBox qs={it.ask} onSubmit={(t) => { h.onAnswered(it.id); h.onSend(t); }} disabled={h.busy} />}
      {it.products?.map((p) => (
        <ProductCard key={p.pid} p={p} ctx={h.ctx} compared={h.compare.includes(p.pid)} onShops={() => h.onShops(p)} onCompare={() => h.onCompare(p.pid)} />
      ))}
      {it.shopsPid != null && (
        <button className="linkrow" onClick={() => h.onOpenShops(it.shopsPid!)}>
          <Icon name="store" size={18} /> <span className="grow">نمایش فروشگاه‌ها</span> <Icon name="left" size={16} />
        </button>
      )}
      {it.inquiry && (
        <button className="linkrow" onClick={h.onOpenInquiry}>
          <Icon name="chat" size={18} /> <span className="grow">رفتن به استعلام</span> <Icon name="left" size={16} />
        </button>
      )}
      {!!it.suggestions?.length && !it.pending && (
        <div className="sugs">
          {it.suggestions.map((s) => (
            <button key={s} className="sug" disabled={h.busy} onClick={() => h.onSend(s)}>{s}</button>
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
    <div className="card ask">
      {qs.map((q, i) => (
        <div key={i} className="stack" style={{ gap: 8 }}>
          <div className="q">{q.question}{q.multi && <span className="meta"> (چند گزینه)</span>}</div>
          <div className="chips">
            {q.options.map((o) => {
              const on = (sel[i] ?? []).includes(o);
              return (
                <button key={o} className={"chip opt" + (on ? " on" : "")} disabled={disabled} aria-pressed={on}
                  onClick={() => {
                    const cur = sel[i] ?? [];
                    const next = q.multi ? (on ? cur.filter((x) => x !== o) : [...cur, o]) : [o];
                    const s = { ...sel, [i]: next };
                    setSel(s);
                    if (single) send(s);
                  }}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!single && (
        <div className="stack" style={{ gap: 4 }}>
          <button className="btn block" disabled={!ready || disabled} onClick={() => send(sel)}>ادامه</button>
          <button className="textbtn muted center" disabled={disabled} onClick={() => onSubmit("فرقی نمی‌کند، خودت بهترین‌ها را پیشنهاد بده")}>
            فرقی نمی‌کنه، خودت پیشنهاد بده
          </button>
        </div>
      )}
    </div>
  );
}

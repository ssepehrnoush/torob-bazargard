import { num } from "../fmt";
import { Icon } from "../icons";
import type { Meta } from "../types";
import { Sheet } from "./Sheet";

const LABELS: [string, string, string][] = [
  ["green", "قیمت ثبت‌شده، اخیر", "آخرین تغییر قیمت در ترب کمتر از ۱۵ روز پیش بوده"],
  ["amber", "ممکن است تغییر کرده باشد", "۱۵ تا ۴۵ روز از آخرین تغییر قیمت گذشته"],
  ["red", "قدیمی", "بیش از ۴۵ روز؛ حتماً قبل از رفتن استعلام بگیرید"],
  ["gray", "موجودی تأیید نشده", "ترب فقط قیمت ثبت‌شده را دارد؛ موجودی فقط با استعلام معلوم می‌شود"],
];

export function AboutSheet({ meta, onClose, onRestart }: { meta: Meta | null; onClose: () => void; onRestart?: () => void }) {
  const c = meta?.counts ?? {};
  const snap = meta?.snapshot ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long", year: "numeric" }).format(new Date(meta.snapshot)) : "";
  return (
    <Sheet title="خرید حضوری ترب چطور کار می‌کند" onClose={onClose}>
      <div className="card pad stack">
        <h3 className="h3">دستیار چه می‌کند</h3>
        <ol className="about-steps">
          <li><b>انتخاب کالا:</b> نیاز شما را می‌فهمد، اگر لازم باشد با چند گزینهٔ آماده سؤال می‌پرسد و از {num(c.products ?? 225903)} کالا پیشنهاد می‌دهد، با دلیل.</li>
          <li><b>فروشگاه‌های نزدیک:</b> محدوده را با زمان رسیدن (پیاده، با ماشین یا با مترو و اتوبوس) حساب می‌کند و فروشگاه‌ها را با قیمت، باز بودن در زمان رسیدن، تازگی قیمت، قسطی و اصالت مقایسه می‌کند.</li>
          <li><b>استعلام:</b> پیام را می‌نویسد و هم‌زمان از چند فروشگاه می‌پرسد. چون شماره‌ها ساختگی‌اند، پاسخ فروشگاه شبیه‌سازی می‌شود و همین برچسب را دارد.</li>
          <li><b>مراجعه:</b> ترتیب رفتن، ساعت رسیدن، مسیر داخل پاساژ و مسیریابی با نشان، بلد یا گوگل‌مپ؛ و اگر بخواهید یک مسیر گردش و خرید در همان اطراف.</li>
        </ol>
      </div>
      <div className="card pad stack">
        <h3 className="h3">برچسب‌ها</h3>
        {LABELS.map(([tone, l, d]) => (
          <div key={l} className="legend">
            <span className={"dot " + tone} />
            <span><b>{l}:</b> {d}</span>
          </div>
        ))}
        <div className="legend">
          <Icon name="check" size={15} stroke={2.4} className="green-txt" />
          <span><b>قیمت تأییدشده:</b> فقط بعد از پاسخ فروشگاه به استعلام نشان داده می‌شود و همیشه جدا از قیمت ثبت‌شده است.</span>
        </div>
        <div className="legend">
          <span className="tag amber">احتمال غیراصل</span>
          <span>برآوردی از عنوان فروشنده، قیمت در برابر بقیه و گارانتی؛ قطعی نیست و در استعلام پرسیده می‌شود. «غیراصل» یعنی خود فروشنده نوشته یا تأیید کرده.</span>
        </div>
      </div>
      <div className="card pad stack">
        <h3 className="h3">داده</h3>
        <p className="small" style={{ margin: 0 }}>
          {num(c.shops ?? 6476)} فروشگاه حضوری تهران، {num(c.products ?? 225903)} کالا و {num(c.offers ?? 331506)} قیمت ثبت‌شده از ترب.
          بیشتر فروشگاه‌ها در مرکز شهر هستند (فردوسی، جمهوری، لاله‌زار، بهارستان). آخرین تغییر قیمت در داده: {snap}.
        </p>
        <ul className="about-list">
          <li>موقعیت فروشگاه‌ها واقعی است؛ نام بیشتر فروشگاه‌ها و همهٔ شماره تلفن‌ها ساختگی است.</li>
          <li>پاساژ، طبقه و واحد از متن نشانی استخراج می‌شود و فروشگاه‌های هم‌طبقه نشانهٔ پیدا کردن مسیر داخل پاساژ می‌شوند.</li>
          <li>ساعت کاری برای حدود ۷۰٪ فروشگاه‌ها ثبت شده؛ بقیه «ساعت کاری ثبت نشده» نشان داده می‌شوند.</li>
          <li>زمان رسیدن تقریبی است؛ مسیر مترو از روی ایستگاه‌های واقعی تهران ساخته می‌شود.</li>
          <li>قیمتی که خیلی پایین‌تر از بقیه است با برچسب «مشکوک» مشخص می‌شود و مبنای «ارزان‌ترین» نیست.</li>
          <li>فروشگاهی که فقط در یک دسته فعال است ولی کالا را ثبت نکرده، جدا و با برچسب «تأیید نشده» می‌آید.</li>
          <li>کالابرگ در داده نیست؛ فیلتر قسطی بر اساس ترب‌پی، اسنپ‌پی، دیجی‌پی، تارا و ازکی‌وام است.</li>
        </ul>
        {meta && (
          <div className="meta">
            مدل زبانی: {meta.llm.available ? meta.llm.providers.map((p) => `${p.model} (${p.name})`).join("، ") : "در دسترس نیست؛ حالت جستجوی ساده فعال است"}
          </div>
        )}
      </div>
      {onRestart && (
        <button className="btn ghost block" onClick={onRestart}><Icon name="refresh" size={17} /> شروع دوباره</button>
      )}
    </Sheet>
  );
}

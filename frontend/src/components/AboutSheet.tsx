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

export function AboutSheet({ meta, onClose }: { meta: Meta | null; onClose: () => void }) {
  const c = meta?.counts ?? {};
  const snap = meta?.snapshot ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long", year: "numeric" }).format(new Date(meta.snapshot)) : "";
  return (
    <Sheet title="خرید حضوری ترب چطور کار می‌کند" onClose={onClose}>
      <div className="card pad stack">
        <div className="bold">داده</div>
        <div className="small">
          {num(c.shops ?? 6476)} فروشگاه حضوری تهران، {num(c.products ?? 225903)} کالا و {num(c.offers ?? 331506)} قیمت ثبت‌شده از ترب.
          بیشتر فروشگاه‌ها در مرکز شهر هستند (فردوسی، جمهوری، لاله‌زار، بهارستان). آخرین تغییر قیمت در داده: {snap}.
        </div>
        <ul className="small" style={{ margin: 0, paddingRight: 18 }}>
          <li>موقعیت فروشگاه‌ها واقعی است؛ نام بیشتر فروشگاه‌ها و همهٔ شماره تلفن‌ها ساختگی است. فروشگاه‌هایی که سایت یا اینستاگرام دارند نام واقعی دارند.</li>
          <li>پاساژ، طبقه و واحد از متن نشانی استخراج می‌شود و فروشگاه‌های هم‌طبقه نشانهٔ پیدا کردن مسیر داخل پاساژ می‌شوند.</li>
          <li>ساعت کاری برای حدود ۷۰٪ فروشگاه‌ها ثبت شده؛ بقیه «نامشخص» نشان داده می‌شوند.</li>
          <li>اگر یک کالا در ترب چند بار با عنوان یکسان ثبت شده باشد، فروشگاه‌هایش با هم نشان داده می‌شوند.</li>
          <li>قیمتی که خیلی پایین‌تر از بقیه است با برچسب «مشکوک» مشخص می‌شود.</li>
          <li>فروشگاهی که فقط در یک دسته فعال است ولی کالا را ثبت نکرده، جدا و با برچسب «تأیید نشده» می‌آید.</li>
          <li>کالابرگ در دادهٔ هکاتون وجود ندارد؛ فیلتر قسطی بر اساس سرویس‌هایی مثل ترب‌پی، اسنپ‌پی، دیجی‌پی و تارا است.</li>
        </ul>
      </div>
      <div className="card pad stack">
        <div className="bold">برچسب‌ها</div>
        {LABELS.map(([tone, l, d]) => (
          <div key={l} className="row small" style={{ alignItems: "flex-start" }}>
            <span className={"dot " + tone} style={{ marginTop: 9 }} />
            <span><b>{l}:</b> {d}</span>
          </div>
        ))}
        <div className="row small" style={{ alignItems: "flex-start" }}>
          <Icon name="check" size={15} style={{ color: "var(--green)", marginTop: 4 }} />
          <span><b>قیمت تأییدشده:</b> فقط بعد از پاسخ فروشگاه به استعلام نشان داده می‌شود و همیشه جدا از قیمت ثبت‌شده است.</span>
        </div>
      </div>
      <div className="card pad stack">
        <div className="bold">دستیار چه می‌کند</div>
        <ul className="small" style={{ margin: 0, paddingRight: 18 }}>
          <li>نیاز شما را می‌فهمد، اگر لازم باشد با چند گزینهٔ آماده سؤال می‌پرسد و از ۲۲۶ هزار کالا جستجو می‌کند.</li>
          <li>فروشگاه‌ها را با قیمت، فاصله، باز بودن در زمان رسیدن شما، تازگی قیمت و امکان قسطی مقایسه می‌کند و دلیلش را می‌گوید.</li>
          <li>پیام استعلام را می‌نویسد و هم‌زمان از چند فروشگاه می‌پرسد. چون شماره‌ها ساختگی‌اند، پاسخ فروشگاه شبیه‌سازی می‌شود و همین برچسب را دارد.</li>
          <li>اگر فروشگاهی جواب نداد، بسته بود یا موجود نداشت، فوراً جایگزین می‌دهد و در آخر مسیر مراجعه را می‌چیند.</li>
        </ul>
        {meta && (
          <div className="tiny muted">
            مدل زبانی: {meta.llm.available ? meta.llm.providers.map((p) => `${p.model} (${p.name})`).join("، ") : "در دسترس نیست؛ حالت جستجوی ساده فعال است"}
          </div>
        )}
      </div>
    </Sheet>
  );
}

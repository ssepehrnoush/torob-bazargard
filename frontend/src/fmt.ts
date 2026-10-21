const FA = "۰۱۲۳۴۵۶۷۸۹";

export function fa(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[0-9]/g, (d) => FA[+d]);
}

/** 12500000 -> "۱۲٬۵۰۰٬۰۰۰" */
export function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return fa(Math.round(v).toLocaleString("en-US")).replace(/,/g, "٬");
}

export function toman(v: number | null | undefined): string {
  if (!v) return "قیمت نامشخص";
  return `${num(v)} تومان`;
}

/** Compact: 12500000 -> "۱۲٫۵ میلیون" */
export function short(v: number | null | undefined): string {
  if (!v) return "";
  if (v >= 1_000_000_000) return `${fa(trim(v / 1_000_000_000))} میلیارد`;
  if (v >= 1_000_000) return `${fa(trim(v / 1_000_000))} میلیون`;
  if (v >= 1_000) return `${fa(trim(v / 1_000))} هزار`;
  return fa(v);
}

function trim(x: number): string {
  const s = x >= 100 ? x.toFixed(0) : x.toFixed(1);
  return s.replace(/\.0$/, "").replace(".", "٫");
}

export function priceRange(min: number | null, max: number | null): string {
  if (!min) return "قیمت ثبت نشده";
  if (!max || max === min) return `${short(min)} تومان`;
  return `${short(min)} تا ${short(max)} تومان`;
}

export function jalali(tsSeconds: number | undefined | null): string {
  if (!tsSeconds) return "";
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long" }).format(new Date(tsSeconds * 1000));
  } catch {
    return "";
  }
}

/** Parse a Persian/Latin number typed by the user ("۲۰ میلیون", "20000000"). */
export function parseToman(s: string): number | null {
  const latin = s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٬,\s]/g, "");
  const m = latin.match(/(\d+(?:[.٫]\d+)?)/);
  if (!m) return null;
  let n = parseFloat(m[1].replace("٫", "."));
  if (/میلیارد/.test(s)) n *= 1e9;
  else if (/میلیون|م$/.test(s)) n *= 1e6;
  else if (/هزار/.test(s)) n *= 1e3;
  return Math.round(n) || null;
}

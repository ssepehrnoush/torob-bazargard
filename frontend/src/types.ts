export type Ctx = {
  lat: number;
  lon: number;
  place: string;
  radius_km: number;
  budget_min: number | null;
  budget_max: number | null;
  visit: string;
  installments_only: boolean;
  torob_pay_only: boolean;
  open_only: boolean;
};

export type Spec = { k: string; v: string };

export type ProductCard = {
  pid: number;
  title: string;
  brand: string | null;
  category: string;
  image: string | null;
  n_shops: number;
  price_min: number | null;
  price_median: number | null;
  price_max: number | null;
  n_nearby?: number;
  nearest_km?: number | null;
  nearby_min_price?: number | null;
  n_installment?: number;
  specs: Spec[];
  why?: string;
  tag?: string | null;
};

export type OpenState = {
  state: "open" | "closed" | "unknown";
  label: string;
  closes_in_min?: number | null;
  closes_at?: string;
  opens_at?: string;
};

export type Freshness = { tier: "fresh" | "aging" | "stale" | "unknown"; days: number | null; ts?: number; label: string };

export type Badge = { kind: string; label: string };

export type ShopBrief = {
  sid: number;
  shop_id: string;
  name: string;
  area: string | null;
  address: string | null;
  lat: number;
  lon: number;
  mall: string | null;
  mall_name: string | null;
  km: number;
  distance_label: string;
  travel: { mode: string; minutes: number; label: string };
  in_radius: boolean;
  open_now: OpenState;
  open_at_visit: OpenState;
  visit_warning: string | null;
  badges: Badge[];
  installments: string[];
  torob_pay: boolean;
  phone: string | null;
  is_real_name: boolean;
  instagram_url: string | null;
  website_url: string | null;
  reasons?: string[];
};

export type ShopOffer = ShopBrief & {
  offer_id: number;
  price: number | null;
  price_note: string | null;
  freshness: Freshness;
  seller_title: string;
  warranty: string | null;
  n_listings: number;
  stock: { state: string; label: string };
  score: number;
  reasons: string[];
  same_mall_count: number;
  price_warning: string | null;
  alt_open: { sid: number; name: string; price: number | null; distance_label: string; same_mall: boolean; open_label: string } | null;
};

export type ShopsResult = {
  items: ShopOffer[];
  stats: {
    total: number;
    in_radius: number;
    price_min: number | null;
    price_max: number | null;
    open_at_visit: number;
    hidden: Record<string, number>;
  };
  visit_at: string;
  product: { pid: number; title: string; brand: string | null; image: string | null; category: string; price_min: number | null; price_max: number | null; n_shops: number };
  similar: ProductCard[];
  leads: (ShopBrief & { reasons: string[] })[];
};

export type MallGuide = {
  mall_name: string | null;
  floor: string | null;
  floor_num: number | null;
  unit: string | null;
  street: string | null;
  steps: { icon: string; text: string }[];
  landmarks: { name: string; unit: string; sid: number }[];
  floors: { num: number; shops: number; target: boolean }[];
  mall_shop_count: number;
  source: string;
};

export type ShopDetail = ShopBrief & {
  week: { dow: number; day: string; text: string; today: boolean }[];
  categories: string[];
  n_products: number;
  providers: string[];
  mall_guide: MallGuide | null;
  offer: { price: number | null; freshness: Freshness; seller_title: string; warranty: string | null; description: string | null } | null;
  same_mall_offers: { sid: number; name: string; mall: string | null; price: number | null }[];
  phone_note: string;
  nav: { neshan: string; balad: string; google: string };
};

export type Question = { question: string; options: string[]; multi: boolean };

export type AgentStep = { id: string; tool: string; label: string; detail?: string; done: boolean };

export type FeedItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "agent";
      id: string;
      steps: AgentStep[];
      status?: string;
      pending: boolean;
      message?: string;
      notice?: string;
      ask?: Question[];
      answered?: boolean;
      products?: ProductCard[];
      suggestions?: string[];
      shopsPid?: number;
      inquiry?: { pid: number; sids: number[] };
      error?: string;
      elapsed?: number;
    };

export type Reply = {
  sid: number;
  outcome: "confirmed" | "price_changed" | "out_of_stock" | "no_answer" | "closed";
  delay_s: number;
  confirmed_price: number | null;
  price_delta?: number;
  in_stock: boolean | null;
  hold_until: string | null;
  hours_today: string | null;
  text: string | null;
  note?: string;
  restock?: string | null;
  installments: string | null;
};

export type InquiryShop = {
  sid: number;
  name: string;
  price: number | null;
  phone: string | null;
  freshness: Freshness;
  open_now: OpenState;
  distance_label: string;
  draft: string;
};

export type InquirySummary = {
  text: string;
  best_sid: number | null;
  confirmed_sids: number[];
  failed_sids: number[];
  alternatives: ShopOffer[];
  similar: ProductCard[];
  leads: (ShopBrief & { reasons: string[] })[];
};

export type VisitStop = {
  sid: number;
  name: string;
  lat: number;
  lon: number;
  mall_name: string | null;
  mall: string | null;
  address: string | null;
  leg: { km: number; mode: string; minutes: number; label: string };
  arrive: string;
  arrive_label: string;
  open: OpenState;
  price: number | null;
  confirmed_price: number | null;
  hold_until: string | null;
  guide: { icon: string; text: string }[];
  nav: { neshan: string; balad: string; google: string };
  installments: string[];
};

export type VisitPlan = {
  start: string;
  start_label: string;
  end_label: string;
  total_minutes: number;
  total_km: number;
  stops: VisitStop[];
  warnings: string[];
  checklist: string[];
  origin: { lat: number; lon: number; label: string };
};

export type Place = { id: string; label: string; lat: number; lon: number };

export type Meta = {
  places: Place[];
  visit_presets: Record<string, string>;
  snapshot: string;
  counts: Record<string, number>;
  llm: { available: boolean; providers: { name: string; model: string }[] };
  now: string;
};

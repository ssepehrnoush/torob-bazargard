import type { CSSProperties } from "react";

const P: Record<string, string> = {
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  wallet: "M3 7.5A2.5 2.5 0 0 1 5.5 5h12A1.5 1.5 0 0 1 19 6.5V8 M3 7.5v10A2.5 2.5 0 0 0 5.5 20H20a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5z M16.5 14.5h.01",
  card: "M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z M3 10h18 M7 15h3",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-3.5-3.5",
  send: "M20 4L10.5 13.5 M20 4l-6 16-3.5-6.5L4 10z",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12 M18 6L6 18",
  phone: "M5 4h3.5l1.5 4.5-2 1.2a11 11 0 0 0 6.3 6.3l1.2-2L20 15.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  chat: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z",
  map: "M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z M9 4v13.5 M15 6.5V20",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  store: "M4 9.5V20h16V9.5 M3 9.5l1.8-5.5h14.4L21 9.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z M10 20v-5h4v5",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z",
  filter: "M4 5h16l-6 7.5V19l-4-2v-4.5z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16",
  building: "M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16 M15 9h3a1 1 0 0 1 1 1v11 M3 21h18 M8.5 8h3 M8.5 12h3 M8.5 16h3",
  floor: "M12 3l9 4.5-9 4.5-9-4.5z M3 12l9 4.5 9-4.5 M3 16.5L12 21l9-4.5",
  door: "M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21 M3 21h18 M14.5 12.5h.01",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01",
  alert: "M12 4l9 16H3z M12 10v4 M12 17h.01",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7L20 8.5 M20 4v4.5h-4.5",
  compare: "M7 4v16 M17 4v16 M3 8h8 M13 16h8",
  plus: "M12 5v14 M5 12h14",
  nav: "M3.5 11.2L20 4l-7.2 16.5-2-7.3z",
  copy: "M9 9h10v11H9z M5 15V4h10",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4",
  locate: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  bag: "M5 8h14l-1 12.5H6z M9 8V6.5a3 3 0 0 1 6 0V8",
  tag: "M3 12V4h8l9.5 9.5-8 8z M7.5 8h.01",
  hourglass: "M6 3h12 M6 21h12 M7 3c0 5 5 6 5 9s-5 4-5 9 M17 3c0 5-5 6-5 9s5 4 5 9",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M5.5 11.5a6.5 6.5 0 0 0 13 0 M12 18v3",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
};

export function Icon({ name, size = 18, style, className }: { name: keyof typeof P | string; size?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={P[name] || P.info} />
    </svg>
  );
}

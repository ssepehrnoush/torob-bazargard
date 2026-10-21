import { useEffect, type ReactNode } from "react";
import { Icon } from "../icons";

export function Sheet({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="sheethead">
          <h2>{title}</h2>
          {actions}
          <button className="iconbtn" onClick={onClose} aria-label="بستن">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheetbody">{children}</div>
      </div>
    </>
  );
}

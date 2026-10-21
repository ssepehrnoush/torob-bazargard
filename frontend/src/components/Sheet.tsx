import { useEffect, type ReactNode } from "react";
import { Icon } from "../icons";

/** Torob-style bottom sheet: grab handle, a light slate body, and an optional pinned footer for the one main action. */
export function Sheet({ title, onClose, children, actions, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; footer?: ReactNode }) {
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
        <div className="sheethead">
          <span className="grab" />
          <h2>{title}</h2>
          {actions}
          <button className="iconbtn" onClick={onClose} aria-label="بستن">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="sheetbody">{children}</div>
        {footer && <div className="sheetfoot">{footer}</div>}
      </div>
    </>
  );
}

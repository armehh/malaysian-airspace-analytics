import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { EXPORT_OPTIONS, exportUrl, type CsvParams } from '../lib/csvUrl';
import '../csvButton.css';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Satu butang "Muat turun" dengan menu Excel, CSV dan PDF. Menu ditutup bila klik di luar atau tekan Esc. */
export default function ExportButtons(params: CsvParams) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const n = EXPORT_OPTIONS.length;
  const focusItem = (i: number) => items.current[(i + n) % n]?.focus();

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setTimeout(() => focusItem(e.key === 'ArrowDown' ? 0 : n - 1), 0);
    }
  };
  const onItemKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
    else if (e.key === 'End') { e.preventDefault(); focusItem(n - 1); }
  };

  return (
    <span
      className="expmenu"
      ref={root}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); button.current?.focus(); } }}
      onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        type="button"
        className="expmenu__btn"
        ref={button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
      >
        Muat turun <i className="expmenu__caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="expmenu__list" role="menu" aria-label="Format muat turun">
          {EXPORT_OPTIONS.map((o, i) => (
            <a
              key={o.format}
              role="menuitem"
              className="expmenu__item"
              href={exportUrl(BASE, params, o.format)}
              download
              tabIndex={-1}
              ref={(el) => { items.current[i] = el; }}
              onKeyDown={(e) => onItemKey(e, i)}
              onClick={() => setOpen(false)}
            >
              {o.label} <small>{o.ext}</small>
            </a>
          ))}
        </div>
      )}
    </span>
  );
}

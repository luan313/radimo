import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, MapPin, X } from "lucide-react";
import { fetchLocations } from "../lib/api";
import type { Business, Location } from "../lib/types";

interface Props {
  label: string;
  placeholder: string;
  kind: "city" | "neighborhood";
  business: Business;
  value: Location | null;
  onChange: (v: Location | null) => void;
  city?: string;
  disabled?: boolean;
  optional?: boolean;
  icon?: React.ReactNode;
}

const describe = (l: Location, kind: "city" | "neighborhood") =>
  kind === "city" ? `${l.city}, ${l.uf}` : l.neighborhood;

export function LocationField({ label, placeholder, kind, business, value, onChange, city, disabled, optional, icon }: Props) {
  const [text, setText] = useState(value ? describe(value, kind) : "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Location[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // mantém o texto em sincronia quando o valor muda por fora (ex.: limpar cidade)
  useEffect(() => {
    setText(value ? describe(value, kind) : "");
  }, [value, kind]);

  useEffect(() => {
    const q = text.trim();
    if (!open || q.length < 2 || (value && describe(value, kind) === text)) {
      setOptions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchLocations(q, kind, business, city, ctrl.signal);
        setOptions(res);
        setActive(0);
      } catch (e) {
        if (!ctrl.signal.aborted) setError("Não consegui buscar sugestões agora.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, open, kind, business, city, value]);

  const pick = (l: Location) => {
    onChange(l);
    setText(describe(l, kind));
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && (options.length > 0 || loading || error || text.trim().length >= 2);

  return (
    <div className={`relative ${disabled ? "opacity-50" : ""}`}>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
        {optional && <span className="font-medium normal-case tracking-normal text-muted/70">(opcional)</span>}
      </label>
      <div
        className={`group flex h-12 items-center gap-2.5 rounded-2xl border bg-surface px-3.5 transition-all duration-300 ease-out-expo ${
          open ? "border-forest/60 shadow-[0_0_0_4px_color-mix(in_oklab,var(--forest)_10%,transparent)]" : "border-line hover:border-muted/40"
        }`}
      >
        <span className="text-muted transition-colors group-focus-within:text-forest">{icon ?? <MapPin size={18} />}</span>
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={!!showList}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
        />
        <AnimatePresence initial={false}>
          {loading ? (
            <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoaderCircle size={16} className="animate-spin text-muted" />
            </motion.span>
          ) : text && !disabled ? (
            <motion.button
              key="x"
              type="button"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setText("");
                onChange(null);
                inputRef.current?.focus();
              }}
              className="grid size-6 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Limpar"
            >
              <X size={14} />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showList && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 origin-top overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]"
          >
            {options.map((o, i) => (
              <li
                key={o.locationId + i}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  i === active ? "text-ink" : "text-ink/80"
                }`}
              >
                {i === active && (
                  <motion.span
                    layoutId={`hl-${listId}`}
                    className="absolute inset-0 rounded-xl bg-surface-2 ring-1 ring-line"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <MapPin size={15} className="relative text-muted" />
                <span className="relative flex-1">
                  <span className="font-semibold">{kind === "city" ? o.city : o.neighborhood}</span>
                  <span className="ml-1.5 text-muted">
                    {kind === "city" ? o.state : [o.zone, o.city].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            ))}
            {!loading && !options.length && !error && (
              <li className="px-3 py-3 text-sm text-muted">Nenhum resultado para “{text}”.</li>
            )}
            {loading && !options.length && <li className="px-3 py-3 text-sm text-muted">Buscando…</li>}
            {error && <li className="px-3 py-3 text-sm text-danger">{error}</li>}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

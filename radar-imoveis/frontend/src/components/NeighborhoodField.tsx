import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, LoaderCircle, MapPin, Plus, X } from "lucide-react";
import { fetchLocations } from "../lib/api";
import { norm } from "../lib/format";
import type { Business, Location } from "../lib/types";

interface Props {
  business: Business;
  city: Location | null;
  value: Location[];
  onChange: (v: Location[]) => void;
}

type Option = { kind: "suggestion"; loc: Location } | { kind: "free"; text: string };

const MAX = 10;

/** Campo de bairros com vários valores (chips). Aceita sugestões ou texto livre. */
export function NeighborhoodField({ business, city, value, onChange }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const disabled = !city;
  const full = value.length >= MAX;

  useEffect(() => {
    const q = text.trim();
    if (!open || !city || q.length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setSuggestions(await fetchLocations(q, "neighborhood", business, city.city, ctrl.signal));
        setActive(0);
      } catch {
        if (!ctrl.signal.aborted) setError("Não consegui buscar sugestões agora.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 260);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, open, business, city]);

  const chosen = new Set(value.map((v) => norm(v.neighborhood)));
  const q = text.trim();
  const options: Option[] = suggestions.filter((s) => !chosen.has(norm(s.neighborhood))).map((loc) => ({ kind: "suggestion", loc }));
  // Bairro que não está nas sugestões (ex.: "Jardim Guanabara IV"): permite adicionar assim mesmo.
  if (q.length >= 2 && !loading && !suggestions.some((s) => norm(s.neighborhood) === norm(q)) && !chosen.has(norm(q))) {
    options.push({ kind: "free", text: q });
  }

  const add = (o: Option) => {
    if (!city || full) return;
    const loc: Location =
      o.kind === "suggestion"
        ? o.loc
        : { city: city.city, state: city.state, uf: city.uf, zone: "", neighborhood: o.text, locationId: "" };
    onChange([...value, loc]);
    setText("");
    setSuggestions([]);
    inputRef.current?.focus();
  };

  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !text && value.length) {
      remove(value.length - 1);
      return;
    }
    if (!options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (!q) return;
      e.preventDefault();
      add(options[Math.min(active, options.length - 1)]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && !disabled && q.length >= 2;

  return (
    <div className={`relative ${disabled ? "opacity-50" : ""}`}>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Bairros
        <span className="font-medium normal-case tracking-normal text-muted/70">(opcional, vários)</span>
      </label>
      <div
        onClick={() => inputRef.current?.focus()}
        className={`group flex min-h-12 cursor-text flex-wrap items-center gap-1.5 rounded-2xl border bg-surface px-3 py-1.5 transition-all duration-300 ease-out-expo ${
          open && !disabled
            ? "border-forest/60 shadow-[0_0_0_4px_color-mix(in_oklab,var(--forest)_10%,transparent)]"
            : "border-line hover:border-muted/40"
        }`}
      >
        <span className="text-muted transition-colors group-focus-within:text-forest">
          <Building2 size={18} />
        </span>
        <AnimatePresence initial={false}>
          {value.map((v, i) => (
            <motion.span
              key={v.neighborhood + v.locationId}
              layout
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              title={v.locationId ? v.neighborhood : `${v.neighborhood} (digitado — alguns portais podem não reconhecer)`}
              className={`inline-flex h-8 max-w-full items-center gap-1 rounded-full pl-3 pr-1 text-[13px] font-semibold ${
                v.locationId ? "bg-forest text-forest-ink" : "border border-dashed border-forest/60 text-ink"
              }`}
            >
              <span className="truncate">{v.neighborhood}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                className="grid size-6 place-items-center rounded-full opacity-70 hover:bg-black/15 hover:opacity-100"
                aria-label={`Remover ${v.neighborhood}`}
              >
                <X size={13} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          ref={inputRef}
          value={text}
          disabled={disabled || full}
          placeholder={
            disabled ? "Escolha a cidade antes" : full ? "Limite de 10 bairros" : value.length ? "Adicionar outro…" : `Bairro em ${city!.city}`
          }
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          className="h-8 min-w-[120px] flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
        />
        {loading && <LoaderCircle size={16} className="animate-spin text-muted" />}
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
            className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 origin-top overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]"
          >
            {options.map((o, i) => (
              <li
                key={o.kind === "free" ? "free" : o.loc.locationId + i}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(o)}
                className="relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink"
              >
                {i === active && (
                  <motion.span
                    layoutId={`hl-${listId}`}
                    className="absolute inset-0 rounded-xl bg-surface-2 ring-1 ring-line"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {o.kind === "suggestion" ? (
                  <>
                    <MapPin size={15} className="relative text-muted" />
                    <span className="relative flex-1">
                      <span className="font-semibold">{o.loc.neighborhood}</span>
                      <span className="ml-1.5 text-muted">{[o.loc.zone, o.loc.city].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Plus size={15} className="relative text-muted" />
                  </>
                ) : (
                  <>
                    <Plus size={15} className="relative text-forest" />
                    <span className="relative flex-1">
                      Adicionar <span className="font-semibold">“{o.text}”</span>
                      <span className="block text-xs text-muted">Não está nas sugestões — vou procurar pelo nome em cada portal</span>
                    </span>
                  </>
                )}
              </li>
            ))}
            {loading && !options.length && <li className="px-3 py-3 text-sm text-muted">Buscando…</li>}
            {error && <li className="px-3 py-3 text-sm text-danger">{error}</li>}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

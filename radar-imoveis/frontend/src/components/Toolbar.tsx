import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpDown, Check, Download, Search, X } from "lucide-react";

export type SortKey = "relevance" | "price-asc" | "price-desc" | "m2-asc" | "area-desc" | "beds-desc";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Relevância" },
  { value: "price-asc", label: "Menor preço" },
  { value: "price-desc", label: "Maior preço" },
  { value: "m2-asc", label: "Menor R$/m²" },
  { value: "area-desc", label: "Maior área" },
  { value: "beds-desc", label: "Mais quartos" },
];

interface Props {
  count: number;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  text: string;
  onText: (s: string) => void;
  exactOnly: boolean;
  onExactOnly: (v: boolean) => void;
  showExact: boolean;
  withPhotoOnly: boolean;
  onWithPhotoOnly: (v: boolean) => void;
  onExport: () => void;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:border-muted/50"
      aria-pressed={on}
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors duration-300 ${on ? "bg-forest" : "bg-line"}`}>
        <motion.span
          className="absolute top-0.5 size-4 rounded-full bg-white shadow"
          animate={{ left: on ? 18 : 2 }}
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
        />
      </span>
      {label}
    </button>
  );
}

export function Toolbar(p: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-baseline gap-2">
        <motion.span
          key={p.count}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-4xl leading-none tabular-nums text-ink"
        >
          {p.count.toLocaleString("pt-BR")}
        </motion.span>
        <span className="text-sm font-semibold text-muted">{p.count === 1 ? "imóvel encontrado" : "imóveis encontrados"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-forest/60 sm:w-56">
          <Search size={15} className="text-muted" />
          <input
            value={p.text}
            onChange={(e) => p.onText(e.target.value)}
            placeholder="Filtrar resultados…"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-muted/70"
          />
          {p.text && (
            <button type="button" onClick={() => p.onText("")} className="text-muted hover:text-ink" aria-label="Limpar filtro">
              <X size={14} />
            </button>
          )}
        </label>

        {p.showExact && <Toggle on={p.exactOnly} onChange={p.onExactOnly} label="Só os bairros escolhidos" />}
        <Toggle on={p.withPhotoOnly} onChange={p.onWithPhotoOnly} label="Com foto" />

        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={p.onExport}
          disabled={!p.count}
          title="Baixa um .txt com o link de cada imóvel da lista, um por linha"
          className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:border-muted/50 disabled:opacity-40"
        >
          <Download size={15} className="text-muted" />
          Exportar links
        </motion.button>

        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:border-muted/50"
          >
            <ArrowUpDown size={15} className="text-muted" />
            {SORTS.find((s) => s.value === p.sort)?.label}
          </button>
          <AnimatePresence>
            {open && (
              <motion.ul
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 top-12 z-30 w-52 origin-top-right rounded-2xl border border-line bg-surface p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]"
              >
                {SORTS.map((s) => (
                  <li key={s.value}>
                    <button
                      type="button"
                      onClick={() => {
                        p.onSort(s.value);
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface-2"
                    >
                      {s.label}
                      {p.sort === s.value && <Check size={15} className="text-forest" />}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

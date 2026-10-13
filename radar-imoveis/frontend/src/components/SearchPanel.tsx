import { useState } from "react";
import { motion } from "motion/react";
import { Check, KeyRound, LoaderCircle, Search } from "lucide-react";
import { LocationField } from "./LocationField";
import { NeighborhoodField } from "./NeighborhoodField";
import { maskMoney, parseMoney } from "../lib/format";
import type { Business, Location, SearchParams, Source } from "../lib/types";

interface Props {
  sources: Source[];
  loading: boolean;
  onSearch: (p: SearchParams) => void;
  compact: boolean;
}

const spring = { type: "spring" as const, stiffness: 420, damping: 36 };

function Segmented<T extends string | number | null>({
  value,
  options,
  onChange,
  id,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  id: string;
  size?: "md" | "sm";
}) {
  return (
    <div className={`relative flex rounded-2xl border border-line bg-surface-2 p-1 ${size === "md" ? "h-12" : "h-11"}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors duration-200 ${
              on ? "text-forest-ink" : "text-muted hover:text-ink"
            }`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring}
                className="absolute inset-0 rounded-xl bg-forest shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--forest)_80%,transparent)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MoneyInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="group flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 transition-all duration-300 ease-out-expo focus-within:border-forest/60 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--forest)_10%,transparent)] hover:border-muted/40">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-sm font-semibold text-muted">R$</span>
      <input
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(maskMoney(e.target.value))}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/60"
      />
    </label>
  );
}

export function SearchPanel({ sources, loading, onSearch, compact }: Props) {
  const [business, setBusiness] = useState<Business>("rent");
  const [city, setCity] = useState<Location | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<Location[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [bedrooms, setBedrooms] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [touched, setTouched] = useState(false);

  const active = selected ?? sources.filter((s) => !s.defaultOff).map((s) => s.id);
  const min = parseMoney(priceMin);
  const max = parseMoney(priceMax);
  const rangeError = min != null && max != null && min > max;
  const canSearch = !!city && !rangeError && active.length > 0 && !loading;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSearch) return;
    onSearch({ business, city, neighborhoods, priceMin: min, priceMax: max, bedrooms, sources: active });
  };

  const toggleSource = (id: string) => {
    const next = active.includes(id) ? active.filter((s) => s !== id) : [...active, id];
    setSelected(next);
  };

  return (
    <motion.form
      layout
      onSubmit={submit}
      transition={{ layout: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }}
      className="relative rounded-[28px] border border-line/80 bg-surface/85 p-4 shadow-[0_30px_80px_-40px_rgba(20,52,43,0.45)] backdrop-blur-xl sm:p-5"
    >
      <div className={`grid grid-cols-1 items-start gap-3 ${compact ? "lg:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)_auto]" : "lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]"}`}>
        <motion.div layout="position" className="lg:pt-[22px]">
          <Segmented
            id="business"
            value={business}
            onChange={(v) => setBusiness(v)}
            options={[
              { value: "rent", label: "Alugar" },
              { value: "buy", label: "Comprar" },
            ]}
          />
        </motion.div>

        <motion.div layout="position">
          <LocationField
            label="Cidade"
            placeholder="Ex.: Campinas"
            kind="city"
            business={business}
            value={city}
            onChange={(v) => {
              setCity(v);
              setNeighborhoods([]);
            }}
          />
        </motion.div>

        <motion.div layout="position">
          <NeighborhoodField business={business} city={city} value={neighborhoods} onChange={setNeighborhoods} />
        </motion.div>

        <motion.div layout="position" className={compact ? "" : "lg:col-span-2"}>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Faixa de preço {business === "rent" ? "(aluguel/mês)" : "(venda)"}
          </span>
          <div className="flex gap-2">
            <MoneyInput label="de" value={priceMin} onChange={setPriceMin} placeholder={business === "rent" ? "1.500" : "300.000"} />
            <MoneyInput label="até" value={priceMax} onChange={setPriceMax} placeholder={business === "rent" ? "5.000" : "900.000"} />
          </div>
        </motion.div>

        {!compact && (
          <motion.div layout="position">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Quartos</span>
            <Segmented
              id="rooms"
              value={bedrooms}
              onChange={setBedrooms}
              options={[
                { value: null, label: "Todos" },
                { value: 1, label: "1+" },
                { value: 2, label: "2+" },
                { value: 3, label: "3+" },
                { value: 4, label: "4+" },
              ]}
            />
          </motion.div>
        )}

        {compact && (
          <motion.div layout="position" className="lg:pt-[22px]">
            <SearchButton loading={loading} disabled={!canSearch} compact />
          </motion.div>
        )}
      </div>

      {compact && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Quartos</span>
          <div className="w-[300px] max-w-full">
            <Segmented
              id="rooms-c"
              size="sm"
              value={bedrooms}
              onChange={setBedrooms}
              options={[
                { value: null, label: "Todos" },
                { value: 1, label: "1+" },
                { value: 2, label: "2+" },
                { value: 3, label: "3+" },
                { value: 4, label: "4+" },
              ]}
            />
          </div>
          <SourcePicker sources={sources} active={active} onToggle={toggleSource} />
        </div>
      )}

      {!compact && (
        <div className="mt-5 flex flex-col gap-4 border-t border-line/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Portais</span>
            <SourcePicker sources={sources} active={active} onToggle={toggleSource} />
          </div>
          <SearchButton loading={loading} disabled={!canSearch} />
        </div>
      )}

      {touched && (!city || rangeError || !active.length) && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-sm font-medium text-danger">
          {!city
            ? "Escolha uma cidade da lista de sugestões."
            : rangeError
              ? "O preço mínimo está maior que o máximo."
              : "Selecione ao menos um portal."}
        </motion.p>
      )}
    </motion.form>
  );
}

function SourcePicker({ sources, active, onToggle }: { sources: Source[]; active: string[]; onToggle: (id: string) => void }) {
  return (
    <>
      {sources.map((s) => {
        const on = active.includes(s.id);
        return (
          <motion.button
            key={s.id}
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onToggle(s.id)}
            className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-all duration-200 ${
              on ? "border-transparent bg-ink text-paper" : "border-line bg-transparent text-muted hover:text-ink"
            }`}
          >
            <span className="size-1.5 rounded-full" style={{ background: s.color, opacity: on ? 1 : 0.5 }} />
            {s.name}
            {s.ufs && s.ufs.length <= 2 && (
              <span className={`rounded px-1 text-[10px] font-bold ${on ? "bg-paper/15" : "bg-surface-2"}`} title={`Só cobre ${s.ufs.join(", ")}`}>
                {s.ufs.join("/")}
              </span>
            )}
            {s.session && (
              <span title="Mostra mais anúncios com login (menu Contas)">
                <KeyRound size={11} className="opacity-70" />
              </span>
            )}
            <motion.span
              initial={false}
              animate={{ width: on ? 14 : 0, opacity: on ? 1 : 0 }}
              className="inline-flex overflow-hidden"
            >
              <Check size={13} strokeWidth={3} />
            </motion.span>
          </motion.button>
        );
      })}
    </>
  );
}

function SearchButton({ loading, disabled, compact }: { loading: boolean; disabled: boolean; compact?: boolean }) {
  return (
    <motion.button
      type="submit"
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      aria-disabled={disabled}
      className={`group relative flex h-12 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-2xl bg-forest px-6 text-[15px] font-bold text-forest-ink shadow-[0_14px_30px_-14px_color-mix(in_oklab,var(--forest)_90%,transparent)] transition-opacity ${
        disabled ? "opacity-60" : ""
      } ${compact ? "w-full lg:w-auto" : "w-full sm:w-auto sm:min-w-[200px]"}`}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
      {loading ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} strokeWidth={2.5} />}
      {loading ? "Buscando…" : "Buscar imóveis"}
    </motion.button>
  );
}

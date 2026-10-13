import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Moon, RotateCcw, SearchX, Sun, TriangleAlert } from "lucide-react";
import { SearchPanel } from "./components/SearchPanel";
import { AccountsMenu } from "./components/AccountsMenu";
import { PropertyCard, SkeletonCard } from "./components/PropertyCard";
import { SourceStatus } from "./components/SourceStatus";
import { Toolbar, type SortKey } from "./components/Toolbar";
import { fetchSources, runSearch } from "./lib/api";
import { mergeListings } from "./lib/dedupe";
import { compactMoney, norm } from "./lib/format";
import type { Property, SearchParams, Source, SourceState } from "./lib/types";

const PAGE = 24;
const ease = [0.16, 1, 0.3, 1] as const;

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("radar-theme");
      if (saved) return saved === "dark";
    } catch {
      /* sem storage */
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("radar-theme", dark ? "dark" : "light");
    } catch {
      /* sem storage */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-forest">
        <div className="radar-sweep absolute inset-0 opacity-70" />
        <span className="absolute size-5 rounded-full border border-forest-ink/40" />
        <span className="relative size-2 rounded-full bg-brass" />
      </div>
      <span className="text-[17px] font-extrabold tracking-tight text-ink">
        Radar<span className="font-display text-xl font-normal italic text-muted"> imóveis</span>
      </span>
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useTheme();
  const [sources, setSources] = useState<Source[]>([]);
  const [backendDown, setBackendDown] = useState(false);

  const [params, setParams] = useState<SearchParams | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [items, setItems] = useState<Property[]>([]);
  const [searching, setSearching] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const [sort, setSort] = useState<SortKey>("relevance");
  const [text, setText] = useState("");
  const [exactOnly, setExactOnly] = useState(false);
  const [withPhotoOnly, setWithPhotoOnly] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  const cancelRef = useRef<(() => void) | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadSources = useCallback(() => {
    setBackendDown(false);
    fetchSources()
      .then(setSources)
      .catch(() => setBackendDown(true));
  }, []);
  useEffect(loadSources, [loadSources]);

  const sourceMap = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s])), [sources]);
  const sourceIndex = useMemo(() => Object.fromEntries(sources.map((s, i) => [s.id, i])), [sources]);

  const search = (p: SearchParams) => {
    cancelRef.current?.();
    setParams(p);
    setItems([]);
    setFatal(null);
    setHidden(new Set());
    setExactOnly(p.neighborhoods.length > 0); // bairros escolhidos: mostra só eles por padrão
    setLimit(PAGE);
    setSearching(true);
    setStates(Object.fromEntries(p.sources.map((s) => [s, { status: "loading" } as SourceState])));
    window.scrollTo({ top: 0, behavior: "smooth" });
    cancelRef.current = runSearch(p, {
      onStart: () => {},
      onSource: (e) => {
        setStates((st) => ({
          ...st,
          [e.source]:
            e.status === "ok"
              ? { status: "ok", count: e.items.length, total: e.total ?? 0, ms: e.ms, cached: e.cached, warning: e.warning }
              : e.status === "skipped"
                ? { status: "skipped", reason: e.reason ?? "Fora da região", label: e.label }
                : { status: "error", error: e.error ?? "Erro desconhecido" },
        }));
        if (e.items.length) setItems((prev) => mergeListings(prev, e.items));
      },
      onDone: () => setSearching(false),
      onError: (msg) => {
        setSearching(false);
        setFatal(msg);
        setStates((st) =>
          Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.status === "loading" ? { status: "error", error: msg } : v])),
        );
      },
    });
  };

  const visible = useMemo(() => {
    const q = norm(text);
    let list = items.filter((it) => {
      if (it.offers.every((o) => hidden.has(o.source))) return false;
      if (exactOnly && !it.exactNeighborhood) return false;
      if (withPhotoOnly && !it.image) return false;
      if (q) {
        const hay = norm([it.title, it.neighborhood, it.address, it.city].join(" "));
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const nullLast = (v: number | null, dir: 1 | -1) => (v == null ? Infinity : v * dir);
    const by: Record<SortKey, (a: Property, b: Property) => number> = {
      relevance: (a, b) =>
        Number(b.exactNeighborhood) - Number(a.exactNeighborhood) ||
        a.order - b.order ||
        (sourceIndex[a.source] ?? 0) - (sourceIndex[b.source] ?? 0),
      "price-asc": (a, b) => nullLast(a.price, 1) - nullLast(b.price, 1),
      "price-desc": (a, b) => nullLast(a.price, -1) - nullLast(b.price, -1),
      "m2-asc": (a, b) => nullLast(a.pricePerM2, 1) - nullLast(b.pricePerM2, 1),
      "area-desc": (a, b) => nullLast(a.area, -1) - nullLast(b.area, -1),
      "beds-desc": (a, b) => nullLast(a.bedrooms, -1) - nullLast(b.bedrooms, -1),
    };
    list = list.slice().sort(by[sort]);
    return list;
  }, [items, hidden, exactOnly, withPhotoOnly, text, sort, sourceIndex]);

  // rolagem infinita
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => l + PAGE);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [params]);

  const stats = useMemo(() => {
    const prices = visible.map((v) => v.price).filter((p): p is number => !!p).sort((a, b) => a - b);
    if (!prices.length) return null;
    return { min: prices[0], median: prices[Math.floor(prices.length / 2)], max: prices[prices.length - 1] };
  }, [visible]);

  // Um link por linha, na ordem em que a lista está (respeita filtros e ordenação).
  const exportLinks = () => {
    const links = visible.map((v) => v.url).filter(Boolean);
    const blob = new Blob([links.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    a.href = URL.createObjectURL(blob);
    a.download = `imoveis-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const hasSearched = !!params;
  const allFailed =
    hasSearched && !searching && Object.values(states).every((s) => s.status === "error" || s.status === "skipped");
  const place = params
    ? params.neighborhoods.length
      ? params.neighborhoods.length <= 2
        ? `${params.neighborhoods.map((n) => n.neighborhood).join(" e ")} · ${params.city?.city}`
        : `${params.neighborhoods.length} bairros · ${params.city?.city}`
      : `${params.city?.city}, ${params.city?.uf}`
    : "";

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1320px] items-center justify-between px-4 pt-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
        {!backendDown && <AccountsMenu />}
        <motion.button
          whileTap={{ scale: 0.9, rotate: -20 }}
          onClick={() => setDark(!dark)}
          className="grid size-10 place-items-center rounded-xl border border-line bg-surface/70 text-ink backdrop-blur hover:bg-surface"
          aria-label="Alternar tema"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={dark ? "d" : "l"}
              initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
              transition={{ duration: 0.25 }}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pb-24 sm:px-6">
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {!hasSearched && (
              <motion.section
                key="hero"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, transition: { duration: 0.5, ease } }}
                className="mx-auto mb-10 mt-14 max-w-3xl text-center sm:mt-20"
              >
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease }}
                  className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-[12px] font-semibold text-muted backdrop-blur"
                >
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-brass opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-brass" />
                  </span>
                  ZAP · Viva Real · OLX · QuintoAndar · Imovelweb · Chaves na Mão · 62imoveis · MGF · Facebook e mais
                </motion.p>
                <motion.h1
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, ease, delay: 0.05 }}
                  className="font-display text-[44px] leading-[1.02] tracking-tight text-ink sm:text-[68px]"
                >
                  Todos os portais.
                  <br />
                  <span className="italic text-muted">Uma única busca.</span>
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, ease, delay: 0.15 }}
                  className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-muted"
                >
                  Defina o que você procura e o Radar varre os principais sites de imóveis ao mesmo tempo, junta os anúncios repetidos e
                  leva você direto ao anúncio original.
                </motion.p>
              </motion.section>
            )}
          </AnimatePresence>

          <motion.div
            layout
            transition={{ layout: { duration: 0.7, ease } }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className={hasSearched ? "mt-6" : "mx-auto max-w-4xl"}
          >
            {backendDown ? (
              <div className="flex flex-col items-center gap-3 rounded-[28px] border border-danger/30 bg-surface p-8 text-center">
                <TriangleAlert className="text-danger" />
                <p className="font-semibold text-ink">Não consegui falar com o servidor local.</p>
                <p className="max-w-md text-sm text-muted">
                  Inicie o backend com <code className="rounded bg-surface-2 px-1.5 py-0.5">python run.py</code> e tente de novo.
                </p>
                <button onClick={loadSources} className="mt-2 flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper">
                  <RotateCcw size={15} /> Tentar novamente
                </button>
              </div>
            ) : (
              <SearchPanel sources={sources} loading={searching} onSearch={search} compact={hasSearched} />
            )}
          </motion.div>
        </LayoutGroup>

        {hasSearched && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.2 }} className="mt-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {params!.business === "rent" ? "Para alugar" : "À venda"}
                </p>
                <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{place}</h2>
              </div>
              {stats && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-5 text-right">
                  {[
                    ["mínimo", stats.min],
                    ["mediana", stats.median],
                    ["máximo", stats.max],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{l}</p>
                      <p className="text-[15px] font-bold tabular-nums text-ink">{compactMoney(v as number)}</p>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

            <SourceStatus
              sources={sources}
              states={states}
              hidden={hidden}
              onToggle={(id) =>
                setHidden((h) => {
                  const n = new Set(h);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                })
              }
            />

            <div className="mt-6">
              <Toolbar
                count={visible.length}
                sort={sort}
                onSort={setSort}
                text={text}
                onText={setText}
                exactOnly={exactOnly}
                onExactOnly={setExactOnly}
                showExact={!!params?.neighborhoods.length}
                withPhotoOnly={withPhotoOnly}
                onWithPhotoOnly={setWithPhotoOnly}
                onExport={exportLinks}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {visible.slice(0, limit).map((it, i) => (
                  <PropertyCard key={it.key} item={it} sources={sourceMap} business={params!.business} index={i} />
                ))}
                {searching &&
                  Array.from({ length: visible.length < 8 ? 8 - visible.length : 4 }).map((_, i) => (
                    <SkeletonCard key={`sk-${i}`} i={i} />
                  ))}
              </AnimatePresence>
            </div>

            <div ref={sentinel} className="h-4" />

            <AnimatePresence>
              {!searching && visible.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 text-center"
                >
                  <div className="grid size-14 place-items-center rounded-2xl bg-surface text-muted ring-1 ring-line">
                    {allFailed ? <TriangleAlert /> : <SearchX />}
                  </div>
                  <p className="font-display text-2xl text-ink">{allFailed ? "Os portais não responderam" : "Nada por aqui"}</p>
                  <p className="text-sm text-muted">
                    {allFailed
                      ? fatal ?? "Pode ser um bloqueio temporário ou falta de conexão. Passe o mouse sobre cada portal para ver o motivo."
                      : items.length
                        ? "Os filtros da lista esconderam todos os resultados. Tente afrouxá-los."
                        : "Nenhum anúncio bateu com esses filtros. Tente ampliar a faixa de preço ou remover o bairro."}
                  </p>
                  {allFailed && params && (
                    <button onClick={() => search(params)} className="mt-1 flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper">
                      <RotateCcw size={15} /> Tentar novamente
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </main>

      <footer className="mx-auto max-w-[1320px] px-6 pb-8 text-center text-xs text-muted/80">
        Uso pessoal. Os anúncios pertencem aos respectivos portais — confirme sempre as informações no site de origem.
      </footer>
    </div>
  );
}

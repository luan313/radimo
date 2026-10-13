import { memo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Bath, BedDouble, Car, ChevronDown, ImageOff, Layers, MapPin, Ruler } from "lucide-react";
import { money, num } from "../lib/format";
import type { Business, Property, Source } from "../lib/types";

interface Props {
  item: Property;
  sources: Record<string, Source>;
  business: Business;
  index: number;
}

function SourceBadge({ source }: { source?: Source }) {
  if (!source) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white backdrop-blur-md">
      <span className="size-1.5 rounded-full" style={{ background: source.color }} />
      {source.name}
    </span>
  );
}

export const PropertyCard = memo(function PropertyCard({ item, sources, business, index }: Props) {
  const [imgOk, setImgOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [menu, setMenu] = useState(false);
  const multi = item.offers.length > 1;
  const specs = [
    { icon: Ruler, value: item.area ? `${num(item.area)} m²` : null, label: "Área" },
    { icon: BedDouble, value: item.bedrooms != null ? String(item.bedrooms) : null, label: "Quartos" },
    { icon: Bath, value: item.bathrooms != null ? String(item.bathrooms) : null, label: "Banheiros" },
    { icon: Car, value: item.parking != null ? String(item.parking) : null, label: "Vagas" },
  ].filter((s) => s.value);

  const place = [item.neighborhood, item.city].filter(Boolean).join(", ");

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{
        layout: { type: "spring", stiffness: 260, damping: 32 },
        default: { duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: Math.min(index % 24, 12) * 0.035 },
      }}
      whileHover={{ y: -4 }}
      className="group relative flex flex-col overflow-hidden rounded-[22px] border border-line/80 bg-surface shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-shadow duration-500 hover:shadow-[0_28px_60px_-30px_rgba(20,52,43,0.45)]"
    >
      {/* imagem */}
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-[16/11] overflow-hidden bg-surface-2">
        {item.image && imgOk ? (
          <>
            {!loaded && <div className="shimmer absolute inset-0" />}
            <img
              src={item.image}
              alt={item.title ?? "Imóvel"}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              onError={() => setImgOk(false)}
              className={`size-full object-cover transition-all duration-[900ms] ease-out-expo group-hover:scale-[1.06] ${
                loaded ? "opacity-100 blur-0" : "opacity-0 blur-md"
              }`}
            />
          </>
        ) : (
          <div className="grid size-full place-items-center text-muted/60">
            <ImageOff size={28} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <SourceBadge source={sources[item.offers[0].source]} />
          {multi && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-forest backdrop-blur-md dark:bg-black/60 dark:text-brass">
              <Layers size={11} /> +{item.offers.length - 1} portal{item.offers.length > 2 ? "is" : ""}
            </span>
          )}
          {item.tag && (
            <span className="rounded-full bg-brass px-2.5 py-1 text-[11px] font-bold text-black/80">{item.tag}</span>
          )}
        </div>
        {item.pricePerM2 && business === "buy" && (
          <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur dark:bg-black/60 dark:text-white">
            {money(item.pricePerM2)}/m²
          </span>
        )}
      </a>

      {/* conteúdo */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-[30px] leading-none tracking-tight text-ink">
            {money(item.price)}
            {business === "rent" && item.price != null && <span className="ml-1 font-sans text-sm font-semibold text-muted">/mês</span>}
          </p>
        </div>
        {(item.condo || item.iptu) && (
          <p className="mt-1.5 text-[13px] text-muted">
            {item.condo ? <>Cond. {money(item.condo)}</> : null}
            {item.condo && item.iptu ? " · " : null}
            {item.iptu ? <>IPTU {money(item.iptu)}</> : null}
          </p>
        )}

        {place && (
          <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-ink">
            <MapPin size={15} className="mt-0.5 shrink-0 text-muted" />
            <span className="line-clamp-1">{place}</span>
          </p>
        )}
        {item.address && <p className="ml-[21px] mt-0.5 line-clamp-1 text-[13px] text-muted">{item.address}</p>}

        {item.title && <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{item.title}</p>}

        {specs.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line/70 pt-3.5">
            {specs.map(({ icon: Icon, value, label }) => (
              <span key={label} title={label} className="flex items-center gap-1.5 text-[13px] font-semibold text-ink/85">
                <Icon size={15} className="text-muted" />
                {value}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4">
          <div className="relative flex gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/btn flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink text-sm font-bold text-paper transition-all duration-300 hover:gap-2.5"
            >
              Ver anúncio
              <ArrowUpRight size={16} className="transition-transform duration-300 group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
            </a>
            {multi && (
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                onBlur={() => setTimeout(() => setMenu(false), 150)}
                className="flex h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-surface-2"
                aria-label="Ver em outros portais"
              >
                {item.offers.length}
                <motion.span animate={{ rotate: menu ? 180 : 0 }}>
                  <ChevronDown size={15} />
                </motion.span>
              </button>
            )}
            <AnimatePresence>
              {menu && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  className="absolute bottom-12 right-0 z-20 w-60 origin-bottom-right rounded-2xl border border-line bg-surface p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]"
                >
                  <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Também anunciado em</p>
                  {item.offers.map((o) => (
                    <a
                      key={o.source}
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex items-center justify-between rounded-xl px-2.5 py-2 text-sm font-semibold text-ink hover:bg-surface-2"
                    >
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: sources[o.source]?.color }} />
                        {sources[o.source]?.name ?? o.source}
                      </span>
                      <span className="flex items-center gap-1 text-muted">
                        {o.price ? money(o.price) : ""}
                        <ArrowUpRight size={14} />
                      </span>
                    </a>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.article>
  );
});

export function SkeletonCard({ i }: { i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: i * 0.05 }}
      className="overflow-hidden rounded-[22px] border border-line/80 bg-surface"
    >
      <div className="shimmer aspect-[16/11]" />
      <div className="space-y-3 p-4">
        <div className="shimmer h-7 w-2/5 rounded-lg" />
        <div className="shimmer h-4 w-3/5 rounded-md" />
        <div className="shimmer h-4 w-4/5 rounded-md" />
        <div className="flex gap-3 pt-3">
          <div className="shimmer h-4 w-14 rounded-md" />
          <div className="shimmer h-4 w-10 rounded-md" />
          <div className="shimmer h-4 w-10 rounded-md" />
        </div>
        <div className="shimmer mt-2 h-10 rounded-xl" />
      </div>
    </motion.div>
  );
}

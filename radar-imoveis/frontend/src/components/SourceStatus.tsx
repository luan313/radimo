import { AnimatePresence, motion } from "motion/react";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import type { Source, SourceState } from "../lib/types";

interface Props {
  sources: Source[];
  states: Record<string, SourceState>;
  hidden: Set<string>;
  onToggle: (id: string) => void;
}

export function SourceStatus({ sources, states, hidden, onToggle }: Props) {
  const ids = Object.keys(states);
  const done = ids.filter((id) => states[id].status !== "loading").length;
  const pct = ids.length ? (done / ids.length) * 100 : 0;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {sources
          .filter((s) => states[s.id])
          .map((s, i) => {
            const st = states[s.id];
            const off = hidden.has(s.id);
            const clickable = st.status === "ok" && st.count > 0;
            return (
              <motion.button
                key={s.id}
                type="button"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: off ? 0.45 : st.status === "skipped" ? 0.5 : 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => clickable && onToggle(s.id)}
                title={
                  st.status === "error"
                    ? st.error
                    : st.status === "skipped"
                      ? st.reason
                      : st.status === "ok"
                      ? `${st.count} anúncios compatíveis${st.total ? ` (de ${st.total.toLocaleString("pt-BR")} no portal)` : ""} · ${(st.ms / 1000).toFixed(1)}s${st.cached ? " · cache" : ""}${st.warning ? `\n${st.warning}` : ""}${clickable ? " — clique para mostrar/ocultar" : ""}`
                      : "Buscando…"
                }
                className={`group flex h-9 items-center gap-2 rounded-full border bg-surface pl-2 pr-3 text-[13px] font-semibold transition-colors ${
                  st.status === "error" ? "border-danger/30 text-danger" : "border-line text-ink"
                } ${clickable ? "cursor-pointer hover:border-muted/50" : "cursor-default"}`}
              >
                <span className="relative grid size-5 place-items-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {st.status === "loading" && (
                      <motion.span key="l" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <LoaderCircle size={15} className="animate-spin text-muted" />
                      </motion.span>
                    )}
                    {st.status === "ok" && (
                      <motion.span
                        key="ok"
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 22 }}
                        className="grid size-5 place-items-center rounded-full"
                        style={{ background: s.color }}
                      >
                        <Check size={11} strokeWidth={3.5} className="text-white" />
                      </motion.span>
                    )}
                    {st.status === "error" && (
                      <motion.span key="e" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <TriangleAlert size={15} />
                      </motion.span>
                    )}
                    {st.status === "skipped" && (
                      <motion.span key="s" initial={{ scale: 0 }} animate={{ scale: 1 }} className="size-2 rounded-full bg-line" />
                    )}
                  </AnimatePresence>
                </span>
                <span className={off ? "line-through decoration-2" : ""}>{s.name}</span>
                {st.status === "ok" && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-muted"
                  >
                    {st.count}
                  </motion.span>
                )}
                {st.status === "ok" && st.warning && <span className="size-1.5 rounded-full bg-brass" aria-label="aviso" />}
                {st.status === "error" && <span className="text-[11px] font-medium opacity-80">falhou</span>}
                {st.status === "skipped" && <span className="text-[11px] font-medium text-muted">{st.label ?? "fora da região"}</span>}
              </motion.button>
            );
          })}
      </div>

      <div className="mt-4 h-[3px] overflow-hidden rounded-full bg-line/60">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-forest to-brass"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%`, opacity: pct === 100 ? 0 : 1 }}
          transition={{ width: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }, opacity: { delay: 0.6, duration: 0.5 } }}
        />
      </div>
    </div>
  );
}

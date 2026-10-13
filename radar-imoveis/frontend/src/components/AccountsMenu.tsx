import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { fetchSessions, sessionAction } from "../lib/api";
import type { Sessions } from "../lib/types";

/**
 * Contas opcionais (Facebook, Mercado Livre). O login acontece numa janela do navegador
 * aberta pelo app: o usuário digita a senha lá, o app nunca a vê. A sessão fica só na
 * memória e some quando o app é fechado ou quando o usuário clica em "Sair".
 */
export function AccountsMenu() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Sessions>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    fetchSessions()
      .then(setSessions)
      .catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  const anyPending = Object.values(sessions).some((s) => s.status === "pending");
  useEffect(() => {
    if (!open && !anyPending) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [open, anyPending, refresh]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const act = async (name: string, action: "connect" | "disconnect") => {
    setBusy(name);
    setError(null);
    try {
      await sessionAction(name, action);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falhou");
    } finally {
      setBusy(null);
    }
  };

  const connected = Object.values(sessions).filter((s) => s.status === "connected").length;

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface/70 px-3 text-[13px] font-semibold text-ink backdrop-blur hover:bg-surface"
      >
        <KeyRound size={15} />
        Contas
        {connected > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-forest text-[11px] font-bold text-forest-ink">{connected}</span>
        )}
        {anyPending && <LoaderCircle size={14} className="animate-spin text-muted" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-12 z-50 w-[340px] origin-top-right rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]"
          >
            <p className="font-display text-xl text-ink">Contas opcionais</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Sem login esses sites mostram só parte dos anúncios. Ao conectar, abre uma janela do navegador para você entrar
              normalmente.
            </p>

            <div className="mt-4 space-y-2">
              {Object.entries(sessions).map(([id, s]) => (
                <div key={id} className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-ink">{s.name}</p>
                    <p className="text-xs text-muted">
                      {s.status === "connected"
                        ? "Conectado nesta execução"
                        : s.status === "pending"
                          ? "Faça login na janela que abriu…"
                          : "Não conectado"}
                    </p>
                  </div>
                  {s.status === "connected" || s.status === "pending" ? (
                    <button
                      onClick={() => act(id, "disconnect")}
                      disabled={busy === id}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-bold text-ink hover:bg-surface"
                    >
                      {busy === id ? <LoaderCircle size={13} className="animate-spin" /> : <LogOut size={13} />}
                      {s.status === "pending" ? "Cancelar" : "Sair"}
                    </button>
                  ) : (
                    <button
                      onClick={() => act(id, "connect")}
                      disabled={busy === id}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-bold text-paper"
                    >
                      {busy === id && <LoaderCircle size={13} className="animate-spin" />}
                      Conectar
                    </button>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}

            <div className="mt-4 flex gap-2 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-forest" />
              <span>
                Você digita a senha no próprio site; o app nunca a vê. A sessão fica só na memória e é apagada ao fechar o app ou
                clicar em “Sair”. Automatizar buscas vai contra os termos desses sites e pode gerar bloqueio temporário da conta —
                use com moderação.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

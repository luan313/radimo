const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("pt-BR");

export const money = (v: number | null | undefined) => (v == null ? "—" : brl.format(v));

export const compactMoney = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (v >= 10_000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return brl.format(v);
};

export const num = (v: number | null | undefined) => (v == null ? "—" : int.format(v));

/** Converte "1.500.000" / "R$ 2.500" em número. */
export const parseMoney = (s: string): number | null => {
  const digits = s.replace(/\D/g, "");
  return digits ? Number(digits) : null;
};

export const maskMoney = (s: string) => {
  const n = parseMoney(s);
  return n == null ? "" : int.format(n);
};

export const norm = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

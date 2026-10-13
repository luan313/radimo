import type { Listing, Property } from "./types";
import { norm } from "./format";

/**
 * Junta anúncios repetidos:
 *  1) mesma chave (ZAP e Viva Real compartilham o ID do anúncio);
 *  2) mesmo preço + área + quartos + bairro em portais diferentes.
 */
export function mergeListings(existing: Property[], incoming: Listing[]): Property[] {
  const out = existing.map((p) => ({ ...p, offers: [...p.offers] }));
  const byKey = new Map<string, Property>();
  const byFingerprint = new Map<string, Property>();

  const fp = (l: Listing) =>
    l.price && l.area && l.bedrooms != null
      ? `${l.price}|${Math.round(l.area)}|${l.bedrooms}|${norm(l.neighborhood)}`
      : null;

  for (const p of out) {
    byKey.set(p.key, p);
    const f = fp(p);
    if (f) byFingerprint.set(f, p);
  }

  incoming.forEach((l, rank) => {
    const f = fp(l);
    const match = byKey.get(l.key) || (f ? byFingerprint.get(f) : undefined);
    if (match) {
      if (!match.offers.some((o) => o.source === l.source)) {
        match.offers.push({ source: l.source, url: l.url, price: l.price });
      }
      // completa dados que faltavam no primeiro anúncio
      match.image ||= l.image;
      match.condo ??= l.condo;
      match.iptu ??= l.iptu;
      match.bathrooms ??= l.bathrooms;
      match.parking ??= l.parking;
      if (!match.address && l.address) match.address = l.address;
      return;
    }
    // "order" = posição do anúncio no próprio portal; usado para intercalar os portais na relevância
    const p: Property = { ...l, offers: [{ source: l.source, url: l.url, price: l.price }], order: rank };
    out.push(p);
    byKey.set(p.key, p);
    if (f) byFingerprint.set(f, p);
  });
  return out;
}

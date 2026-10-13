import type { Business, Listing, Location, SearchParams, Sessions, Source } from "./types";

export async function fetchSources(): Promise<Source[]> {
  const r = await fetch("/api/sources");
  if (!r.ok) throw new Error("Backend indisponível");
  return r.json();
}

export async function fetchLocations(
  q: string,
  kind: "city" | "neighborhood",
  business: Business,
  city?: string,
  signal?: AbortSignal,
): Promise<Location[]> {
  const qs = new URLSearchParams({ q, kind, business });
  if (city) qs.set("city", city);
  const r = await fetch(`/api/locations?${qs}`, { signal });
  if (!r.ok) throw new Error("Falha ao buscar localizações");
  return r.json();
}

export async function fetchSessions(): Promise<Sessions> {
  const r = await fetch("/api/sessions");
  if (!r.ok) throw new Error("Falha ao ler as contas");
  return r.json();
}

export async function sessionAction(name: string, action: "connect" | "disconnect"): Promise<void> {
  const r = await fetch(`/api/sessions/${name}/${action}`, { method: "POST" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Falhou");
}

export interface SourceEvent {
  source: string;
  status: "ok" | "error" | "skipped";
  reason?: string;
  label?: string;
  items: Listing[];
  total?: number;
  ms: number;
  error?: string;
  cached?: boolean;
  warning?: string;
}

export function runSearch(
  params: SearchParams,
  handlers: { onStart: (sources: string[]) => void; onSource: (e: SourceEvent) => void; onDone: () => void; onError: (msg: string) => void },
): () => void {
  const qs = new URLSearchParams({
    business: params.business,
    location: JSON.stringify(params.city),
    neighborhoods: JSON.stringify(
      params.neighborhoods.map((n) => ({ neighborhood: n.neighborhood, locationId: n.locationId, zone: n.zone })),
    ),
    sources: params.sources.join(","),
    pages: "2",
  });
  if (params.priceMin) qs.set("priceMin", String(params.priceMin));
  if (params.priceMax) qs.set("priceMax", String(params.priceMax));
  if (params.bedrooms) qs.set("bedrooms", String(params.bedrooms));

  const es = new EventSource(`/api/search?${qs}`);
  let finished = false;
  es.addEventListener("start", (e) => handlers.onStart(JSON.parse((e as MessageEvent).data).sources));
  es.addEventListener("source", (e) => handlers.onSource(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("done", () => {
    finished = true;
    es.close();
    handlers.onDone();
  });
  es.onerror = () => {
    if (finished) return;
    es.close();
    handlers.onError("A conexão com o servidor caiu. O backend está rodando?");
  };
  return () => es.close();
}

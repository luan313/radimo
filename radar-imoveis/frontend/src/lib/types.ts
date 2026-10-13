export type Business = "rent" | "buy";

export interface Location {
  city: string;
  state: string;
  uf: string;
  neighborhood: string;
  zone: string;
  locationId: string;
}

export interface Source {
  id: string;
  name: string;
  color: string;
  ufs?: string[] | null;
  session?: string | null;
  defaultOff?: boolean;
}

export type SessionStatus = "disconnected" | "pending" | "connected";
export type Sessions = Record<string, { name: string; status: SessionStatus }>;

export interface Listing {
  key: string;
  id: string;
  source: string;
  title: string | null;
  price: number | null;
  condo: number | null;
  iptu: number | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  neighborhood: string | null;
  city: string | null;
  address: string | null;
  image: string | null;
  url: string;
  tag?: string | null;
  pricePerM2: number | null;
  exactNeighborhood: boolean;
}

/** Um imóvel pode aparecer em vários portais; agrupamos as ofertas num só card. */
export interface Offer {
  source: string;
  url: string;
  price: number | null;
}

export interface Property extends Listing {
  offers: Offer[];
  order: number;
}

export type SourceState =
  | { status: "loading" }
  | { status: "ok"; count: number; total: number; ms: number; cached?: boolean; warning?: string }
  | { status: "error"; error: string }
  | { status: "skipped"; reason: string; label?: string };

export interface SearchParams {
  business: Business;
  city: Location | null;
  neighborhoods: Location[];
  priceMin: number | null;
  priceMax: number | null;
  bedrooms: number | null;
  sources: string[];
}

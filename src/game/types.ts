export type GoodId =
  | "grain"
  | "salt"
  | "wool"
  | "cloth"
  | "wine"
  | "beer"
  | "iron"
  | "weapons"
  | "silver"
  | "spices";

export interface Good {
  id: GoodId;
  name: string;
  glyph: string;
  basePrice: number;
  weight: number;
  category: "bulk" | "manufactured" | "luxury";
}

export type CityId = string;

export interface City {
  id: CityId;
  name: string;
  lat: number;
  lon: number;
  region: string;
  population: number;
  produces: Partial<Record<GoodId, number>>;
  consumes: Partial<Record<GoodId, number>>;
}

export interface CityMarket {
  cityId: CityId;
  stock: Record<GoodId, number>;
  prices: Record<GoodId, number>;
  priceHistory: Record<GoodId, number[]>;
}

export type CaravanStatus = "idle" | "traveling" | "loading";

export interface Caravan {
  id: string;
  name: string;
  capacity: number;
  cargo: Partial<Record<GoodId, number>>;
  speed: number;
  status: CaravanStatus;
  cityId: CityId | null;
  fromCityId: CityId | null;
  toCityId: CityId | null;
  travelProgress: number;
  travelDuration: number;
  routeId: string | null;
  routeStopIndex: number;
  loadingDays: number;
}

export interface RouteOrder {
  goodId: GoodId;
  mode: "buy" | "sell";
  // "all" = fill remaining capacity (buy) / sell everything carried (sell).
  qty: number | "all";
  // Buy: refuse to pay more than this. Sell: refuse to accept less.
  limit?: number;
}

export interface RouteStop {
  cityId: CityId;
  orders: RouteOrder[];
}

export interface TradeRoute {
  id: string;
  name: string;
  stops: RouteStop[];
}

export interface MarketIntel {
  prices: Record<GoodId, number>;
  stock: Record<GoodId, number>;
  date: GameDate;
}

export interface FamilyMember {
  id: string;
  givenName: string;
  surname: string;
  birthYear: number;
  deathYear: number | null;
  isHead: boolean;
  isHeir: boolean;
  parentId: string | null;
  spouseId: string | null;
  traits: string[];
}

export interface GameDate {
  year: number;
  month: number;
  day: number;
}

export interface LogEntry {
  date: GameDate;
  text: string;
  kind: "info" | "event" | "milestone" | "trade";
}

export interface MilestoneEvent {
  id: string;
  year: number;
  month?: number;
  title: string;
  flavor: string;
  fired: boolean;
  apply: (state: GameState) => void;
}

export type Speed = 0 | 1 | 2 | 5;

export interface GameState {
  date: GameDate;
  tickAccumulator: number;
  speed: Speed;
  treasury: number;
  cities: City[];
  markets: Record<CityId, CityMarket>;
  caravans: Caravan[];
  routes: TradeRoute[];
  intel: Record<CityId, MarketIntel>;
  family: FamilyMember[];
  log: LogEntry[];
  milestones: MilestoneEvent[];
  selection:
    | { kind: "none" }
    | { kind: "city"; id: CityId }
    | { kind: "caravan"; id: string }
    | { kind: "dispatch"; caravanId: string };
  hoveredCity: CityId | null;
  modal: ModalState | null;
}

export type ModalState =
  | { kind: "trade"; caravanId: string; cityId: CityId }
  | { kind: "milestone"; eventId: string }
  | { kind: "routes" }
  | { kind: "route-edit"; routeId: string };

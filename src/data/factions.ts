import type { FactionId, Rank } from "../game/types";

export interface FactionDef {
  id: FactionId;
  name: string;
  short: string;
  color: string;
  blurb: string;
}

export const FACTIONS: FactionDef[] = [
  {
    id: "habsburg",
    name: "The Imperial Court",
    short: "Habsburg",
    color: "#7a2418",
    blurb: "The house of Austria and its emperors. Favor is won by financing the crown — its wars, its elections, its debts. The road to nobility runs through Vienna.",
  },
  {
    id: "hansa",
    name: "The Hanseatic League",
    short: "Hansa",
    color: "#2a4a6a",
    blurb: "The northern league of merchant cities. Trade in the Baltic and North Sea ports earns their regard — and their privileges.",
  },
  {
    id: "imperial-cities",
    name: "The Free Imperial Cities",
    short: "Free Cities",
    color: "#4a6028",
    blurb: "The self-governing burgher cities of the south. Your own kind. Standing here is the foundation of any merchant house's respectability.",
  },
];

export const FACTION_BY_ID: Record<FactionId, FactionDef> = Object.fromEntries(
  FACTIONS.map((f) => [f.id, f])
) as Record<FactionId, FactionDef>;

export interface RankDef {
  id: Rank;
  title: string;      // German rank
  english: string;    // gloss
  // Requirements to be offered promotion to THIS rank:
  minTreasury: number;
  favorReqs: Partial<Record<FactionId, number>>;
  // Alternative "any of these reaches N" requirement (e.g. a second faction).
  secondFaction?: { anyOf: FactionId[]; min: number };
  requiresElection?: boolean;
  fee: number;        // gold paid on accepting the title
  unlocks: string;    // human description shown in the promotion offer
}

// The ladder. Index order is the climb.
export const RANKS: RankDef[] = [
  {
    id: "burger",
    title: "Bürger",
    english: "Burgher",
    minTreasury: 0,
    favorReqs: {},
    fee: 0,
    unlocks: "A citizen merchant of Augsburg.",
  },
  {
    id: "patrizier",
    title: "Patrizier",
    english: "Patrician",
    minTreasury: 8000,
    favorReqs: { "imperial-cities": 12 },
    fee: 4000,
    unlocks: "Admission to the city's ruling merchant elite. The great houses will treat with you as equals.",
  },
  {
    id: "ritter",
    title: "Reichsritter",
    english: "Imperial Knight",
    minTreasury: 30000,
    favorReqs: { habsburg: 25 },
    fee: 15000,
    unlocks: "A knight of the Empire, answerable to the Emperor alone. Your credit is now good at court.",
  },
  {
    id: "freiherr",
    title: "Freiherr",
    english: "Baron",
    minTreasury: 90000,
    favorReqs: { habsburg: 45 },
    secondFaction: { anyOf: ["hansa", "imperial-cities"], min: 35 },
    fee: 45000,
    unlocks: "A baron with lands and a seat. The old nobility can no longer pretend you are merely a moneylender.",
  },
  {
    id: "graf",
    title: "Reichsgraf",
    english: "Imperial Count",
    minTreasury: 250000,
    favorReqs: { habsburg: 65 },
    fee: 120000,
    unlocks: "A count of the Empire. Princes owe you money; bishops seek your daughters.",
  },
  {
    id: "furst",
    title: "Reichsfürst",
    english: "Imperial Prince",
    minTreasury: 600000,
    favorReqs: { habsburg: 85 },
    requiresElection: true,
    fee: 300000,
    unlocks: "A Prince of the Holy Roman Empire, with a voice in its councils. The weaver's grandchildren sit among the mighty. — This is the summit of the climb.",
  },
];

export const RANK_BY_ID: Record<Rank, RankDef> = Object.fromEntries(
  RANKS.map((r) => [r.id, r])
) as Record<Rank, RankDef>;

export function rankIndex(rank: Rank): number {
  return RANKS.findIndex((r) => r.id === rank);
}

// Which factions hold sway in which cities. Trading here earns their favor.
// Some cities answer to two powers; some (ducal seats, foreign towns) to none.
export const CITY_FACTIONS: Record<string, FactionId[]> = {
  // Free Imperial Cities of the south
  augsburg: ["imperial-cities"],
  nuremberg: ["imperial-cities"],
  frankfurt: ["imperial-cities"],
  strasbourg: ["imperial-cities"],
  // Hanseatic ports
  lubeck: ["hansa"],
  hamburg: ["hansa"],
  bremen: ["hansa"],
  danzig: ["hansa"],
  cologne: ["hansa", "imperial-cities"],
  magdeburg: ["hansa"],
  // Habsburg lands (Austrian + Burgundian Netherlands)
  vienna: ["habsburg"],
  antwerp: ["habsburg"],
  bruges: ["habsburg"],
  prague: ["habsburg"],
  // Neutral / foreign: munich (Bavaria), leipzig (Saxony), basel (Swiss), krakow (Poland)
};

export function cityFactions(cityId: string): FactionId[] {
  return CITY_FACTIONS[cityId] ?? [];
}


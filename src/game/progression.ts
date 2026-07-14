import type { GameState, FactionId, Rank } from "./types";
import { RANKS, RANK_BY_ID, rankIndex, cityFactions } from "../data/factions";
import { pushLog } from "./log";

export const MAX_FAVOR = 100;

// One favor point per this many gold of gross trade transacted in a faction's
// city. Habsburg cities are few, so most Habsburg favor comes from financing
// the crown at decision points — which is the whole thematic point.
const GOLD_PER_FAVOR = 2200;

export function addFavor(state: GameState, faction: FactionId, amount: number) {
  const cur = state.standing[faction] ?? 0;
  state.standing[faction] = Math.max(0, Math.min(MAX_FAVOR, cur + amount));
}

// Called after any trade settles in a city. Splits favor across whichever
// factions hold that city.
export function accrueTradeFavor(state: GameState, cityId: string, grossGold: number) {
  if (grossGold <= 0) return;
  const factions = cityFactions(cityId);
  if (factions.length === 0) return;
  const gain = grossGold / GOLD_PER_FAVOR;
  for (const f of factions) addFavor(state, f, gain);
}

function meetsRequirements(state: GameState, rank: Rank): boolean {
  const def = RANK_BY_ID[rank];
  if (state.treasury < def.minTreasury) return false;
  for (const [f, min] of Object.entries(def.favorReqs)) {
    if ((state.standing[f as FactionId] ?? 0) < (min as number)) return false;
  }
  if (def.secondFaction) {
    const ok = def.secondFaction.anyOf.some(
      (f) => (state.standing[f] ?? 0) >= def.secondFaction!.min
    );
    if (!ok) return false;
  }
  if (def.requiresElection && !state.electionParticipated) return false;
  return true;
}

// Returns the next rank the player newly qualifies for, or null.
export function pendingPromotion(state: GameState): Rank | null {
  const nextIdx = rankIndex(state.rank) + 1;
  if (nextIdx >= RANKS.length) return null;
  const next = RANKS[nextIdx];
  return meetsRequirements(state, next.id) ? next.id : null;
}

// Progress toward the next rank, for the HUD. Returns null at max rank.
export interface RankProgress {
  next: Rank;
  goldOk: boolean;
  favor: { faction: FactionId; have: number; need: number; ok: boolean }[];
  electionOk: boolean | null;
  ready: boolean;
}

export function rankProgress(state: GameState): RankProgress | null {
  const nextIdx = rankIndex(state.rank) + 1;
  if (nextIdx >= RANKS.length) return null;
  const def = RANKS[nextIdx];
  const favor: RankProgress["favor"] = [];
  for (const [f, need] of Object.entries(def.favorReqs)) {
    const have = state.standing[f as FactionId] ?? 0;
    favor.push({ faction: f as FactionId, have, need: need as number, ok: have >= (need as number) });
  }
  if (def.secondFaction) {
    // Show the best-standing eligible second faction.
    let best: FactionId = def.secondFaction.anyOf[0];
    for (const f of def.secondFaction.anyOf) {
      if ((state.standing[f] ?? 0) > (state.standing[best] ?? 0)) best = f;
    }
    const have = state.standing[best] ?? 0;
    favor.push({ faction: best, have, need: def.secondFaction.min, ok: have >= def.secondFaction.min });
  }
  return {
    next: def.id,
    goldOk: state.treasury >= def.minTreasury,
    favor,
    electionOk: def.requiresElection ? state.electionParticipated : null,
    ready: meetsRequirements(state, def.id),
  };
}

export function applyPromotion(state: GameState, rank: Rank) {
  const def = RANK_BY_ID[rank];
  if (state.treasury < def.fee) return;
  state.treasury -= def.fee;
  state.rank = rank;
  pushLog(state, `The House of ${state.family.find((m) => m.isHead)?.surname ?? ""} is raised to ${def.title} (${def.english}). Confirmation fee: ${def.fee.toLocaleString("de-DE")}ɡ.`, "milestone");
  if (rank === "furst") {
    pushLog(state, "You have reached the summit of the Empire. The climb is complete.", "milestone");
  }
}

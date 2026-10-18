/**
 * Load-time resolvers for systems cut in Phase A3 (docs/CUTS.md). Each takes the
 * raw saved field, settles whatever was in flight into the live game, and drops
 * the field. They run from Game.deserialize and must be idempotent on saves that
 * no longer carry the old field.
 */
import type { Game } from './state';

/** Full price of each level of each estate holding, as the old estate sold them. */
const HOLDING_COST: Record<string, number[]> = {
  casa: [3000, 5500, 9500], quinta: [4200], engenho: [6500], senhorio: [15000],
};

/**
 * estate.ts is gone. Holdings convert to purse at the price paid; income and
 * returns accrued but unpaid are paid out; a voyage outfitted but not yet home is
 * refunded its stake; unread letters go to the log. A lordship survives as
 * `g.lordship` (the King's Offer ending reads it).
 */
export function migrateEstate(g: Game, old: any): void {
  if (!old || typeof old !== 'object') return;
  let gold = 0;
  for (const [id, level] of Object.entries(old.holdings ?? {}) as [string, number][]) {
    const costs = HOLDING_COST[id] ?? [];
    for (let i = 0; i < Math.min(Number(level) || 0, costs.length); i++) gold += costs[i];
  }
  gold += Number(old.accrued) || 0;
  for (const o of old.outfits ?? []) if (!o.outcome) gold += Number(o.stake) || 0;
  gold = Math.round(gold);
  if (gold > 0) {
    g.crown.gold += gold;
    g.logEvent('trade', `Your affairs at home have been wound up and paid over: ${gold} cruzados.`, true);
  }
  for (const n of old.news ?? []) g.logEvent('trade', String(n), true);
  if (old.lordship && !g.lordship) g.lordship = String(old.lordship);
}

/** Port, by the ids of the goods-delivery errands cut in A3 (portCharacter.ts used to hold them). */
const OLD_PORT_QUESTS: Record<string, string> = {
  'funchal-wheat': 'funchal', 'benin-coral': 'ugoton', 'kongo-tools': 'mpinda', 'melinde-horses': 'melinde',
};

/**
 * PortQuest goods-delivery errands are gone. The only state they had was the set
 * of those already done, which is simply dropped. An errand still open (never
 * done) where the captain is docked is cancelled with one log line; nothing is
 * refunded, because nothing was ever taken before delivery.
 */
export function cancelPortQuests(g: Game, done: string[] | undefined): void {
  const at = g.dockedAt;
  if (!at) return;
  const finished = new Set(done ?? []);
  const open = Object.entries(OLD_PORT_QUESTS).find(([id, port]) => port === at && !finished.has(id));
  if (open) g.logEvent('note', 'The town’s errand for goods is withdrawn; nobody here is asking any more.', true);
}

/** A bare world for the headless falsifiers: markets, trade, ports and a House or two, no ship, no player. */
import { Clock } from '../../src/core/clock';
import { Markets } from '../../src/economy/market';
import { newTrade, worldMod } from '../../src/economy/trade';
import { dateFromDays } from '../../src/core/clock';
import { prosperityOf, type WorldHost } from '../../src/world/tick';
import '../../src/world/lanes';
import { newRival } from '../../src/progression/rival';
import { newHeat } from '../../src/economy/contraband';
import { Rng } from '../../src/core/rng';

export interface BareHost extends WorldHost { notes: string[]; t0: number; rivalEvents: string[] }

/** `lanes: false` leaves the lane model out of it (the pre-D1 world) and the rival out of the lanes. */
export function makeHost(seed: number, opts: { rival?: boolean } = {}): BareHost {
  const t0 = new Clock().t;
  const h: BareHost = {
    seed, worldT: t0, t0, ports: {}, notes: [], rivalEvents: [], heat: newHeat(),
    rival: opts.rival === false ? undefined : newRival(new Rng(seed)),
    rivalEvent: (k, p, g) => { h.rivalEvents.push(`${k}:${p}:${g}`); },
    markets: new Markets(seed), trade: newTrade(t0), feitorias: [],
    worldNote: (id, text) => { h.notes.push(`${id}: ${text}`); },
  };
  h.markets.prosperityOf = (id) => prosperityOf(h, id);
  // The world's prices as the game applies them (shocks and fairs), without the competition term.
  h.markets.adjust = (p, g, t) => {
    const w = worldMod(h.trade, p, g, t, dateFromDays(Math.floor(t / 86400)).month);
    return { ask: w.ask, bid: w.bid, stock: 1 };
  };
  return h;
}

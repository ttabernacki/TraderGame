import { NM, clamp, haversine } from '../core/math';
import { GOOD_BY_ID } from '../economy/goods';
import { PORTS, anchorageOf, portDef } from '../world/ports';
import type { Game } from '../game/state';
import {
  WORK_BY_ID, capacityOf, newLedger, policyOf, runFactory, stockTons, stockValue, strengthOf,
  trafficOf, type Feitoria, type WorkId,
} from './feitoria';

/**
 * A station that runs itself.
 *
 * The factory used to sit frozen until the ship came back and then be run
 * forward in one lump, which made it a chore: visit, read the books, fund the
 * chest, load the shed, pay the demand, go. Nothing happened in between, so
 * nothing could be left to look after itself.
 *
 * Now it is lived, a month at a time, whether or not anybody is there. The
 * factor buys, reinvests, pays the town to keep the peace, builds what his own
 * chest can afford, and sends what is over his reserve home on the Casa's ships
 * for a cut. What he sends arrives as coin at the next Portuguese port the
 * captain makes; what happens to him arrives as a letter. A player who never
 * goes near a station still gets a steady return and a steady supply of news,
 * and a player who does go gets what a visit has always been for: the whole of
 * the shed at the price a resident pays, and a word with the man.
 *
 * It is still never free. A fifth to a third of everything sent home is the
 * Casa's, a few per cent go down with the ship, the factor skims in proportion
 * to his honesty, and a town that has had enough burns the place down while its
 * owner is at the other end of the road.
 */

/** Note that a ship of yours has been off the place: passing it counts, putting in is not needed. */
export function noteSightings(g: Game): void {
  for (const f of g.feitorias) {
    if (f.lost) continue;
    const at = anchorageOf(portDef(f.portId));
    if (haversine(g.ship.state.pos, at) / NM < 150) f.seen = g.clock.t;
  }
}

/** Months run in one go when a long stretch of time is skipped. */
const MAX_CATCH_UP = 36;
const MONTH = 30 * 86400;
/** What the Casa keeps of what it carries. */
const FREIGHT = 0.36;
/** What the Casa keeps of a captain who is on first-name terms with the Rua Nova. */
const FREIGHT_RUA = 0.2;
/** Coin the chest keeps back to buy with before sending the rest home. */
const FLOAT = 260;

/** Days a letter or a remittance takes from a place to a Portuguese port, at a caravel's pace. */
function transitDays(portId: string): number {
  const lisbon = PORTS.find((p) => p.id === 'lisboa');
  const def = PORTS.find((p) => p.id === portId);
  if (!lisbon || !def) return 90;
  const nm = haversine(anchorageOf(def), anchorageOf(lisbon)) / NM;
  return Math.round(clamp(nm / 70, 20, 160));
}

/** The chance a consignment goes down at sea, worse the longer the road. */
function lossChance(portId: string): number {
  return 0.025 + (1 - trafficOf(portId)) * 0.07;
}

function letter(g: Game, f: Feitoria, text: string, severity: 'note' | 'warning' | 'grave' = 'note'): void {
  g.factoryLetters.push({
    t: g.clock.t, arrives: g.clock.t + transitDays(f.portId) * 86400, text, severity,
  });
  if (g.factoryLetters.length > 40) g.factoryLetters.splice(0, g.factoryLetters.length - 40);
}

/** Burned, while nobody was there. */
function burn(g: Game, f: Feitoria): void {
  const def = portDef(f.portId);
  const value = stockValue(f);
  g.loseGarrison(f);
  f.lost = true;
  f.lostWhy = 'Burned while you were away.';
  f.stock = {};
  f.paid = {};
  f.chest = 0;
  g.relationsFor(f.portId).factory = false;
  g.relationsFor(f.portId).regard = clamp(g.relationsFor(f.portId).regard - 0.2, -1, 1);
  g.refreshEnvironment();
  letter(g, f, `${def.name}: the factory has been burned. The town had been uneasy for a long time, and `
    + `nobody came. ${f.factor} and the men are dead or gone; about ${value} cruzados of goods went with it. `
    + 'The ground is still yours on paper. It wants a man, men, and money, and none of it is aboard.', 'grave');
  g.logEvent('crown', `The factory at ${def.name} was burned while you were away.`, true);
}

/** One month of one station. */
function tickOne(g: Game, f: Feitoria): void {
  const def = portDef(f.portId);
  const led = (f.ledger ??= newLedger());
  const policy = policyOf(f);
  const rel = g.relationsFor(f.portId);
  const since = (g.clock.t - Math.max(f.settled, f.seen ?? 0)) / 86400;
  const traffic = trafficOf(f.portId);

  // Keeping the peace comes before buying: the town is paid first, out of what
  // the chest holds, because a shed bought full in a town that has turned is
  // only a bigger fire.
  if (policy.peace && f.trouble > 0.28) {
    const gift = Math.round(40 + stockValue(f) * 0.05 + f.garrison * 4);
    if (f.chest >= gift + 20) {
      f.chest -= gift;
      f.regard = clamp(f.regard + 0.06, 0, 1);
      f.trouble = clamp(f.trouble - 0.2, 0, 1);
      led.gifts += gift;
    }
  }

  const news = runFactory(f, def, 30, g.rng, rel.regard, { sinceVisit: since, traffic });
  led.months += 1;
  led.bought += news.bought;
  led.earned += news.earned;

  // Building what his own money can stand.
  if (policy.build) {
    const next: WorkId | null = !f.works.includes('palicada') ? 'palicada'
      : !f.works.includes('armazem') ? 'armazem' : null;
    const w = next ? WORK_BY_ID.get(next) : null;
    if (w && f.chest >= w.cost + FLOAT) {
      f.chest -= w.cost;
      f.works.push(w.id);
      f.trouble = clamp(f.trouble - 0.1, 0, 1);
      led.built.push(w.english.toLowerCase());
      letter(g, f, `${def.name}: ${f.factor} has built a ${w.english.toLowerCase()} out of the chest.`);
    }
  }

  // What is over the reserve goes home, dearest by the ton first.
  if (policy.home) {
    const freight = g.can('rua') ? FREIGHT_RUA : FREIGHT;
    const reserve = capacityOf(f) * 0.25;
    let excess = stockTons(f) - reserve;
    let proceeds = 0;
    let lost = 0;
    if (excess > 0.5) {
      const goods = Object.keys(f.stock)
        .filter((id) => (f.stock[id] ?? 0) >= 1 && GOOD_BY_ID.has(id))
        .sort((a, b) => GOOD_BY_ID.get(b)!.lisbon / GOOD_BY_ID.get(b)!.bulk
          - GOOD_BY_ID.get(a)!.lisbon / GOOD_BY_ID.get(a)!.bulk);
      for (const id of goods) {
        if (excess <= 0.2) break;
        const gd = GOOD_BY_ID.get(id)!;
        const units = Math.min(Math.floor(f.stock[id]), Math.ceil(excess / Math.max(gd.bulk, 1e-6)));
        if (units < 1) continue;
        f.stock[id] -= units;
        excess -= units * gd.bulk;
        const fetch = units * gd.lisbon * (1 - freight) * (0.6 + f.honesty * 0.4);
        if (g.rng.chance(lossChance(f.portId))) lost += fetch; else proceeds += fetch;
      }
    }
    const surplus = f.chest - FLOAT;
    if (surplus > 120) {
      f.chest -= surplus;
      const coin = surplus * (1 - freight * 0.3) * (0.7 + f.honesty * 0.3);
      if (g.rng.chance(lossChance(f.portId) * 0.6)) lost += coin; else proceeds += coin;
    }
    if (proceeds > 0) {
      g.remittances.push({
        arrives: g.clock.t + transitDays(f.portId) * 86400, amount: Math.round(proceeds), from: def.name,
      });
      led.sentHome += proceeds;
      f.paidOut += proceeds;
    }
    if (lost > 40) {
      led.lostAtSea += lost;
      letter(g, f, `${def.name}: a consignment worth about ${Math.round(lost)} cruzados went down with the `
        + 'Casa’s caravel on the way home. Nothing to be done about it.', 'warning');
    }
  }

  // A town that has had enough, with nobody to see it done.
  if (f.trouble >= 0.92 && g.rng.chance(0.3 * (1 - strengthOf(f)))) { burn(g, f); return; }

  // A word, now and then, so a station is never just silence: every quarter
  // at least, sooner if it is going badly.
  if (led.months % 3 === 0 || (f.trouble > 0.6 && led.months % 2 === 0)) {
    const hopeful = f.trouble < 0.36;
    letter(g, f,
      hopeful
        ? `${def.name}: ${f.factor} writes that the shed holds ${stockTons(f).toFixed(0)} tons and the chest ${Math.round(f.chest)} cruzados. `
          + `${led.sentHome > 0 ? `${Math.round(led.sentHome)} cruzados have gone home on the Casa’s ships. ` : ''}The town is ${f.regard > 0.55 ? 'quiet' : 'watching'}.`
        : `${def.name}: ${f.factor} writes carefully. The town has changed its mind about the station`
          + `${policy.peace && led.gifts > 0 ? ', and he has been paying it to keep the peace' : ''}. He would like a ship to be seen off the place.`,
      hopeful ? 'note' : 'warning');
  }
}

/**
 * Run every station forward by whatever whole months have passed. Cheap to call
 * every frame: it does nothing until a month is due.
 */
export function tickFactories(g: Game): void {
  if (g.feitorias.length === 0) return;
  for (const f of g.feitorias) {
    if (f.lost) continue;
    f.ticked ??= f.settled;
    let months = 0;
    while (g.clock.t - f.ticked >= MONTH && months < MAX_CATCH_UP) {
      f.ticked += MONTH;
      months++;
      tickOne(g, f);
      if (f.lost) break;
    }
    if (g.clock.t - f.ticked > MONTH * MAX_CATCH_UP) f.ticked = g.clock.t;
  }
}

/** A Portuguese port, or one where the King's factor is: where letters and coin are handed over. */
export function isPostPort(g: Game, portId: string): boolean {
  const def = PORTS.find((p) => p.id === portId);
  if (!def) return false;
  return def.people === 'portuguese' || !!def.feitoria || g.feitorias.some((f) => f.portId === portId && !f.lost);
}

/**
 * What has arrived for the captain: remittances that are due become coin, and
 * letters become news. Said once, together, rather than a card per station.
 */
export function deliverFactoryMail(g: Game, portId: string): void {
  if (!isPostPort(g, portId)) return;
  const t = g.clock.t;

  const due = g.remittances.filter((r) => r.arrives <= t);
  if (due.length) {
    g.remittances = g.remittances.filter((r) => r.arrives > t);
    const sum = due.reduce((s, r) => s + r.amount, 0);
    if (sum > 0) {
      g.crown.gold += sum;
      const shared = g.takeShares(sum);
      const from = [...new Set(due.map((r) => r.from))].join(', ');
      const line = `The Casa’s ships have brought ${sum} cruzados from your stations (${from})`
        + `${shared > 0.5 ? `, of which ${Math.round(shared)} went to the men holding sixteenths` : ''}.`;
      g.pushAlert(line, 'note');
      g.logEvent('trade', line, true);
    }
  }

  const mail = g.factoryLetters.filter((l) => l.arrives <= t);
  if (mail.length) {
    g.factoryLetters = g.factoryLetters.filter((l) => l.arrives > t);
    // Worst first, and no more than three read out; the rest are summed up.
    const rank = { grave: 0, warning: 1, note: 2 } as const;
    mail.sort((a, b) => rank[a.severity] - rank[b.severity] || b.t - a.t);
    for (const l of mail.slice(0, 3)) {
      g.pushAlert(l.text, l.severity);
      g.logEvent(l.severity === 'note' ? 'trade' : 'peril', l.text, l.severity !== 'note');
    }
    if (mail.length > 3) g.logEvent('trade', `${mail.length - 3} older letters from the stations were read and filed.`);
  }
}

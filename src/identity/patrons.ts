import { clamp } from '../core/math';
import { daysFromEpoch } from '../core/clock';
import { good } from '../economy/goods';
import { MONOPOLY } from '../economy/trade';
import type { Game } from '../game/state';
import { record, type Entry } from '../ledger/ledger';
import type { Tag } from '../ledger/tags';
import type { Patent } from '../progression/crown';
import { ACT_CHARGE } from '../progression/chronicle';
import { shockTime } from '../world/powers/core';
import { portDef } from '../world/ports';
import { PATRON_IDS, type PatronId } from './state';
import { titlePatronEdge, titleShuts } from './titles';

/**
 * Patrons (BUILD_PLAN D5; v2-story Pillar 6).
 *
 * The King is one patron among three. Each voyage the captain sails for a patron of record: the Crown (orders, the
 * cartaz), the Order of Christ and the Church (mission funds, baptism policy, Prester John), or the Rua Nova money
 * (credit, Lines). Each issues orders generated from the state of the world, takes a cut of the pay, and has an agenda
 * that moves with the Court Front. A patron betrayed can ruin him; a patron that falls pulls its clients down unless
 * the captain moves early. The Crown's own content stays what it was (the dated acts and the King's commissions).
 *
 * Sources and what is invented are marked beside each event and in docs/SOURCES.md.
 */

export interface PatronDef {
  id: PatronId;
  name: string;
  short: string;
  /** The home faction of the Crown’s court it stands for (world/powers POWERS.crown.factions). */
  faction: string;
  /** What it gives. */
  gives: string;
  /** Share of an order’s pay it keeps. INVENTED: 0, 8% and 12%. */
  cut: number;
  loves: Tag[];
  hates: Tag[];
  /** What counts as betrayal under its flag (a subset of hates). */
  betrays: Tag[];
}

export const PATRONS: Record<PatronId, PatronDef> = {
  crown: {
    id: 'crown', name: 'The Crown', short: 'the King', faction: 'the throne',
    gives: 'The King’s commissions and the acts as history wrote them; the cartaz; rank.', cut: 0,
    loves: ['patent.completed', 'crown.reported', 'claim.made', 'chart.shared', 'books.honest', 'patron.honest', 'name.given', 'landmark.surveyed', 'south.beyond', 'parcel.redeemed'],
    hates: ['contraband.run', 'chart.sold', 'smuggle.caught', 'order.breached', 'books.cooked', 'mutiny.lost', 'patron.flattered', 'ship.repulsed'],
    betrays: ['contraband.run', 'chart.sold', 'smuggle.caught', 'order.breached', 'books.cooked'],
  },
  church: {
    id: 'church', name: 'The Order of Christ', short: 'the Order', faction: 'the Order of Christ and the Church',
    gives: 'Mission funds up front, a baptism policy to carry out, and the road to Prester John.', cut: 0.08,
    loves: ['companion.freed', 'person.redeemed', 'mercy.shown', 'peace.made', 'ship.succoured', 'promise.kept', 'hearing.contested', 'patron.honest'],
    hates: ['traffic.carried', 'silent.blood', 'ship.abandoned', 'promise.broken', 'books.cooked', 'hand.hanged'],
    betrays: ['silent.blood', 'ship.abandoned', 'promise.broken', 'books.cooked'],
  },
  ruanova: {
    id: 'ruanova', name: 'The Rua Nova', short: 'the Rua Nova', faction: 'the Rua Nova money',
    gives: 'Credit against the voyage, orders for cargo, and a hand on the Lines.', cut: 0.12,
    loves: ['loan.repaid', 'contract.kept', 'contract.filled', 'commission.delivered', 'weights.fair', 'port.funded', 'lane.opened', 'rival.undercut', 'contraband.run', 'fact.sold', 'rumour.true', 'chart.sold'],
    hates: ['loan.defaulted', 'contract.broken', 'contract.lapsed', 'commission.failed', 'weights.false', 'smuggle.caught'],
    betrays: ['loan.defaulted', 'contract.broken', 'commission.failed', 'weights.false', 'smuggle.caught'],
  },
};

/** The Church’s baptism policy follows the Crown’s: leave it be until the Edict, press it after (documented: Dec 1496, forced conversions 1497). */
export type Policy = 'wait' | 'press';
export function churchPolicy(t: number): Policy {
  return t >= daysFromEpoch(1496, 12, 1) * 86400 ? 'press' : 'wait';
}

function lovesOf(id: PatronId, t: number): Tag[] {
  const d = PATRONS[id];
  if (id !== 'church') return d.loves;
  return [...d.loves, churchPolicy(t) === 'press' ? 'faith.pressed' : 'faith.respected'];
}
function hatesOf(id: PatronId, t: number): Tag[] {
  const d = PATRONS[id];
  if (id !== 'church') return d.hates;
  return [...d.hates, churchPolicy(t) === 'press' ? 'faith.respected' : 'faith.pressed'];
}
function betraysOf(id: PatronId, t: number): Tag[] {
  const d = PATRONS[id];
  if (id !== 'church') return d.betrays;
  return [...d.betrays, churchPolicy(t) === 'press' ? 'faith.respected' : 'faith.pressed'];
}

// -- The agenda: dated falls and rises --------------------------------------------

const DAY = 86400, MONTH = 30 * DAY, YEAR = 365.25 * DAY;

export interface AgendaEvent {
  id: string;
  patron: PatronId;
  kind: 'fall' | 'rise';
  /** Seconds: when it happens. Scheduled shocks of the Court Front read their date from the powers' schedule. */
  at: () => number | null;
  /** Months of warning before a fall, or 0 for none (a massacre does not warn). */
  warn: number;
  /** Months a fall lasts. */
  lasts: number;
  text: string;
  warnText?: string;
  source: string;
  grade: 'documented' | 'approximate' | 'invented';
}

const ym = (y: number, m: number): (() => number) => () => daysFromEpoch(y, m, 1) * 86400;

export const AGENDA: AgendaEvent[] = [
  { id: 'great-houses', patron: 'crown', kind: 'rise', at: ym(1483, 6), warn: 0, lasts: 0,
    text: 'The great houses have been broken, and the King’s hand is the only one that holds the Casa.',
    source: 'The Duke of Braganza executed 1483 and the Duke of Viseu killed by the King 1484 (Hair; Disney, A History of Portugal). Effect on the Crown’s strength is the game’s own.', grade: 'documented' },
  { id: 'kongo-font', patron: 'church', kind: 'rise', at: ym(1491, 5), warn: 0, lasts: 0,
    text: 'The Manikongo has been baptised and has asked for priests and masons. The Order has funds for anyone who will carry them.',
    source: 'Baptism of the Mani Soyo and Manikongo, 1491 (Rui de Pina). The Order’s funding is invented.', grade: 'documented' },
  { id: 'king-dies', patron: 'crown', kind: 'fall', at: () => shockTime('joao-dies'), warn: 4, lasts: 8,
    text: 'The King is dead. The old reign’s circle is out of favour, and the Crown’s orders wait on the new one.',
    warnText: 'The King is failing. Those who hold the Casa by his favour are looking for another door.',
    source: 'João II died October 1495 and Manuel I succeeded (documented, via the Powers’ schedule). The warning, the eight months and the fall of the old circle’s clients are invented.', grade: 'documented' },
  { id: 'edict', patron: 'ruanova', kind: 'fall', at: () => shockTime('edict'), warn: 3, lasts: 24,
    text: 'The Edict has been published. The converso houses of the Rua Nova are being forced to the font or out of the kingdom, and their credit is called.',
    warnText: 'The King has promised Castile a Portugal clear of its Jews. The Rua Nova is not calm, and its lenders are calling in what they can.',
    source: 'Edict of expulsion December 1496, forced conversions 1497 (Tavares; Soyer). The calling-in of credit and its length are invented.', grade: 'documented' },
  { id: 'font-and-cross', patron: 'church', kind: 'rise', at: ym(1497, 6), warn: 0, lasts: 0,
    text: 'The King has ordered the font where he cannot have the expulsion. The Church is the strongest it has been at court.',
    source: 'Forced conversion of 1497 (Tavares). The Church’s strength at court is the game’s own reading.', grade: 'approximate' },
  { id: 'cabral-friars', patron: 'church', kind: 'rise', at: ym(1500, 3), warn: 0, lasts: 0,
    text: 'The fleet sails with friars aboard and the Order’s money in it. The mission funds are open.',
    source: 'Eight Franciscans sailed with Cabral in 1500 (documented). The Order’s funds are invented.', grade: 'approximate' },
  { id: 'easter-1506', patron: 'ruanova', kind: 'fall', at: ym(1506, 4), warn: 0, lasts: 18,
    text: 'The New Christians of Lisbon have been killed in the streets over three days, and the money that was left in the Rua Nova has gone to ground.',
    source: 'Lisbon massacre, April 1506 (Tavares; Soyer). The credit effect and its length are invented.', grade: 'documented' },
];

/** Strength of a patron now: the Court Front’s stage, the dated history, and any fall in progress. */
export function strengthOf(g: Game, id: PatronId): number {
  const rec = g.identity.patrons[id];
  const stage = g.powers?.fronts?.court?.stage ?? 1;
  let s = 0.6;
  if (id === 'crown') s += stage === 1 ? 0.25 : stage === 3 ? -0.1 : 0;
  if (id === 'ruanova') s += stage === 3 ? 0.3 : stage === 1 ? -0.1 : 0;
  if (id === 'church') s += stage === 3 ? -0.05 : 0;
  if (stage === 4) s -= 0.1;
  for (const e of AGENDA) {
    if (e.patron !== id || e.kind !== 'rise') continue;
    const at = e.at();
    if (at !== null && g.clock.t >= at) s += 0.1;
  }
  if (rec.fell !== null && (rec.recovers === null || g.clock.t < rec.recovers)) s = Math.min(s, 0.1);
  return clamp(s, 0, 1);
}

export const isFallen = (g: Game, id: PatronId): boolean => {
  const r = g.identity.patrons[id];
  return r.fell !== null && (r.recovers === null || g.clock.t < r.recovers);
};

/** The cut a patron keeps, higher when the Court Front’s reckoning has come. */
export function cutOf(g: Game, id: PatronId): number {
  const stage = g.powers?.fronts?.court?.stage ?? 1;
  return PATRONS[id].cut * (stage === 4 ? 1.5 : 1);
}

/** Why a patron cannot be sailed for this voyage, or null. */
export function patronBlocked(g: Game, id: PatronId): string | null {
  const r = g.identity.patrons[id];
  const shut = titleShuts(g, id);
  if (shut) return shut;
  if (r.ruined !== null && g.clock.t < r.ruined + 2.5 * YEAR) return `${PATRONS[id].name} has not forgiven you, and will not for some time.`;
  return null;
}

// -- Choosing the patron of record ------------------------------------------------

/** Choose (or change) the patron for the voyage. Allowed at Lisbon, before sailing. */
export function choosePatron(g: Game, id: PatronId): { ok: boolean; text: string } {
  if (g.dockedAt !== 'lisboa') return { ok: false, text: 'A patron is chosen at Lisbon, before sailing.' };
  if (g.crown.patent && g.identity.patron !== id) return { ok: false, text: 'An order from your present patron is in hand. Discharge it first.' };
  const why = patronBlocked(g, id);
  if (why) return { ok: false, text: why };
  const old = g.identity.patron;
  if (old === id) return { ok: true, text: `You sail for ${PATRONS[id].name} again.` };
  // Leaving a patron that has been warned of falling, before it falls, is moving early.
  for (const e of AGENDA) {
    if (e.patron !== old || e.kind !== 'fall') continue;
    const warned = g.identity.warned[e.id];
    if (warned !== undefined && !g.identity.applied.includes(e.id) && !g.identity.moved.includes(e.id)) {
      g.identity.moved.push(e.id);
      record(g, 'patron.moved', { target: PATRONS[old].name, magnitude: 0.5, note: `Left ${PATRONS[old].name} before it fell: ${e.warnText ?? e.text}` });
    }
  }
  g.identity.patron = id;
  record(g, 'patron.chosen', { target: PATRONS[id].name, note: `Sailing for ${PATRONS[id].name}.`, silent: true });
  return { ok: true, text: `You sail for ${PATRONS[id].name}: ${PATRONS[id].gives}` };
}

// -- The monthly fold ---------------------------------------------------------------

function applyFall(g: Game, e: AgendaEvent): void {
  const rec = g.identity.patrons[e.patron];
  rec.fell = g.clock.t;
  rec.recovers = g.clock.t + e.lasts * MONTH;
  const client = g.identity.patron === e.patron;
  const early = g.identity.moved.includes(e.id);
  g.pushAlert(e.text, 'warning');
  g.logEvent('crown', e.text, true);
  if (client && !early) {
    rec.pulled = true;
    rec.favour = clamp(rec.favour - 0.4, -1, 1);
    const hit = g.origin === 'converso' && e.patron === 'ruanova' ? 0.2 : 0.1;
    g.crown.standing = Math.round(g.crown.standing * (1 - hit));
    record(g, 'patron.fell', { target: PATRONS[e.patron].name, magnitude: 0.6, note: `${PATRONS[e.patron].name} fell and you were its client: ${Math.round(hit * 100)}% of your standing went with it.` });
  }
}

/** Fold new Ledger entries into the patrons’ favour and grudge. */
function foldLedger(g: Game): void {
  const id = g.identity;
  const now = g.clock.t;
  for (; id.cursor < g.ledger.length; id.cursor++) {
    const e: Entry = g.ledger[id.cursor];
    if (e.tag.startsWith('patron.') || e.tag.startsWith('clause.') || e.tag.startsWith('title.')) continue;
    const fresh = e.t >= now - 62 * DAY;
    for (const p of PATRON_IDS) {
      const rec = id.patrons[p];
      const mag = clamp(e.magnitude, 0.3, 1);
      if (lovesOf(p, e.t).includes(e.tag as Tag)) rec.favour = clamp(rec.favour + 0.08 * mag, -1, 1);
      if (hatesOf(p, e.t).includes(e.tag as Tag)) {
        // The record’s patron feels it in full; the others hear of it.
        rec.favour = clamp(rec.favour - 0.12 * mag * (p === id.patron ? 1 : 0.4), -1, 1);
      }
      if (fresh && p === id.patron && betraysOf(p, e.t).includes(e.tag as Tag)) {
        const before = rec.grudge;
        rec.grudge += 0.5 * mag;
        if (Math.floor(rec.grudge * 2) > Math.floor(before * 2)) {
          record(g, 'patron.betrayed', { target: PATRONS[p].name, magnitude: mag, note: `Under ${PATRONS[p].name}’s flag you did a thing it cannot forgive (${e.tag}).` });
        }
      }
    }
  }
}

function ruin(g: Game, p: PatronId): void {
  const rec = g.identity.patrons[p];
  rec.ruined = g.clock.t;
  rec.grudge = 0.5;
  rec.favour = -1;
  let what = '';
  if (p === 'crown') {
    g.crown.standing = Math.round(g.crown.standing * 0.65);
    g.casa.regard = -1;
    what = 'The Crown has cut your standing by a third and closed the Casa’s door to ordinary commissions. The act’s own charge, which the King does not refuse, is still yours.';
  } else if (p === 'church') {
    const claw = Math.min(Math.round(g.crown.gold * 0.2), 400);
    g.crown.gold -= claw;
    what = `The Order has taken back ${claw} cruzados of mission funds and its door is shut to you.`;
  } else {
    const pay = Math.min(g.crown.debt, Math.max(0, g.crown.gold));
    g.crown.gold -= pay;
    g.crown.debt -= pay;
    for (const k of Object.keys(g.finance.credit) as (keyof typeof g.finance.credit)[]) g.finance.credit[k] = Math.max(0, g.finance.credit[k] - 30);
    what = `The Rua Nova has called in your notes (${Math.round(pay)} cruzados paid out of the purse) and its houses will not lend to you for years.`;
  }
  if (g.identity.patron === p) g.identity.patron = p === 'crown' ? 'church' : 'crown';
  record(g, 'patron.ruined', { target: PATRONS[p].name, magnitude: 1, note: what });
  g.pushAlert(what, 'grave');
}

/** Once a month: the agenda, warnings, falls and recoveries, favour, betrayal and ruin. */
export function tickPatrons(g: Game): void {
  const id = g.identity;
  const now = g.clock.t;
  const month = Math.floor(now / MONTH);
  if (month === id.lastMonth) return;
  id.lastMonth = month;
  foldLedger(g);
  for (const e of AGENDA) {
    const at = e.at();
    if (at === null || id.applied.includes(e.id)) continue;
    if (e.kind === 'fall' && e.warn > 0 && now >= at - e.warn * MONTH && id.warned[e.id] === undefined) {
      id.warned[e.id] = now;
      if (e.warnText) { g.pushAlert(e.warnText, 'note'); g.logEvent('crown', e.warnText, true); }
    }
    if (now >= at) {
      id.applied.push(e.id);
      if (e.kind === 'fall') applyFall(g, e);
      else { g.logEvent('crown', e.text, true); }
    }
  }
  // The invented favourite: when the Court Front reaches its second stage, one patron’s man falls (seeded).
  if ((g.powers?.fronts?.court?.stage ?? 1) >= 2 && !id.favourite) {
    id.favourite = PATRON_IDS[Math.abs(g.seed) % PATRON_IDS.length];
    const e: AgendaEvent = { id: 'favourite', patron: id.favourite, kind: 'fall', at: () => now, warn: 0, lasts: 10, text: `${PATRONS[id.favourite].name}’s favourite at court has fallen, and so have those who were his.`, source: 'invented', grade: 'invented' };
    id.applied.push(e.id);
    applyFall(g, e);
  }
  for (const p of PATRON_IDS) {
    const rec = id.patrons[p];
    if (rec.recovers !== null && now >= rec.recovers) { rec.fell = null; rec.recovers = null; rec.pulled = false; }
    if (rec.grudge >= 1 && (rec.ruined === null || now > rec.ruined + 2.5 * YEAR)) ruin(g, p);
    rec.grudge = Math.max(0, rec.grudge - 0.1);
  }
}

// -- What a patron is worth to the captain ----------------------------------------

/** Favour as the captain feels it: the Ledger’s fold plus the worn titles’ edge. */
export function favourOf(g: Game, p: PatronId): number {
  return clamp(g.identity.patrons[p].favour + titlePatronEdge(g, p), -1, 1);
}

export function favourWord(f: number): string {
  return f > 0.5 ? 'warm' : f > 0.15 ? 'friendly' : f > -0.15 ? 'cool' : f > -0.5 ? 'wary' : 'hostile';
}

/** Credit the Rua Nova lets run while it is the patron of record. Added to `Game.creditLimit`. */
export function patronCredit(g: Game): number {
  const r = g.identity.patrons.ruanova;
  if (r.pulled && isFallen(g, 'ruanova')) return -Math.round(g.ship.manifestValue() * 0.5);
  if (g.identity.patron !== 'ruanova' || isFallen(g, 'ruanova')) return 0;
  return Math.round(120 + 360 * Math.max(0, favourOf(g, 'ruanova')) + 160 * strengthOf(g, 'ruanova'));
}

// -- Generated orders ---------------------------------------------------------------

type Body = Omit<Patent, 'id' | 'issued' | 'monarch' | 'complete' | 'failed'>;

const CHURCH_ORDERS: Record<number, { title: string; port: string; line: string }> = {
  1: { title: 'The tenth of Madeira', port: 'funchal', line: 'The Order of Christ holds the spiritual charge of the islands and its tenth is owed at Funchal. Carry the clerk and his chest there, and bring back his receipt.' },
  2: { title: 'Priests for Mpinda', port: 'mpinda', line: 'The Manikongo has been baptised and has asked for priests and masons. The Order has the priests. It wants a ship that will land them where they were asked for.' },
  3: { title: 'A chapel on the Cape road', port: 'mocambique', line: 'A ship that rounds the Cape and finds no altar on the far side has not been Christian about it. The Order will pay for a chapel at Moçambique, and for the man who sees it built.' },
  4: { title: 'Letters for Prester John', port: 'melinde', line: 'The Order believes in a Christian king in the east, and has written to him. Take the letters as far as Melinde, where the pilots say the road to him begins.' },
  5: { title: 'The Christians of St Thomas', port: 'cochim', line: 'There are said to be Christians on the Malabar coast who keep the faith of the Apostle. The Order wants to know whether it is true, and whether they will pray as Rome does.' },
};

function churchOrder(g: Game): Body | null {
  const act = Math.min(5, g.chronicle.act);
  const o = CHURCH_ORDERS[act];
  if (!o) return null;
  const press = churchPolicy(g.clock.t) === 'press';
  const gross = 220 + 160 * act;
  const cut = cutOf(g, 'church');
  return {
    title: o.title, advance: Math.round(gross * 0.55), reward: Math.round(gross * (1 - cut)), standingReward: 18 + 14 * act, returnTo: 'lisboa',
    patron: 'church', cut, gross,
    narrative: `${o.line} ${press ? 'The Order’s policy is the font for every people you meet; its chaplain will ask you how many.' : 'The Order’s policy is patience: it asks that a rite be understood before it is replaced.'} (The Order’s mission funds are in the advance; its tenth is out of the reward.)`,
    objectives: [
      { kind: 'reach', description: `Make ${portDef(o.port).name}`, target: o.port, progress: 0, complete: false },
      { kind: 'return', description: 'Report to the Order’s commandery at Lisbon (its factor at the next quay will do)', target: 'lisboa', progress: 0, complete: false },
    ],
  };
}

/** The best good the far port makes that is not the King’s, for a cargo order. */
function ruaNovaCargo(portId: string): { id: string; qty: number } | null {
  const p = portDef(portId);
  const cands = Object.entries(p.produces).filter(([id]) => !MONOPOLY.includes(id)).sort((a, b) => b[1] * good(b[0]).lisbon - a[1] * good(a[0]).lisbon);
  const top = cands[0];
  if (!top) return null;
  const gd = good(top[0]);
  const qty = Math.max(6, Math.round(300 / Math.max(gd.lisbon, 4) / 5) * 5);
  return { id: top[0], qty: Math.min(qty, 60) };
}

const RN_PORT: Record<number, string> = { 1: 'funchal', 2: 'arguim', 3: 'mocambique', 4: 'melinde', 5: 'cochim' };

function ruaNovaOrder(g: Game): Body | null {
  const act = Math.min(5, g.chronicle.act);
  const port = RN_PORT[act];
  const c = ruaNovaCargo(port);
  if (!c) return null;
  const gd = good(c.id);
  const gross = Math.round(c.qty * gd.lisbon * 0.6 + 80 * act);
  const cut = cutOf(g, 'ruanova');
  return {
    title: `A cargo of ${gd.english.toLowerCase()} for the Rua Nova`, advance: Math.round(gross * 0.5), reward: Math.round(gross * (1 - cut)), standingReward: 10 + 8 * act, returnTo: 'lisboa',
    patron: 'ruanova', cut, gross,
    narrative: `A house on the Rua Nova has a buyer in Lisbon for ${c.qty} ${gd.unit}s of ${gd.english.toLowerCase()} from ${portDef(port).name}, and will advance half the pay against the hold. It takes its commission off the top, and expects the cargo aboard when you report.`,
    objectives: [
      { kind: 'reach', description: `Call at ${portDef(port).name}`, target: port, progress: 0, complete: false },
      { kind: 'cargo', description: `Bring home ${c.qty} ${gd.unit}s of ${gd.english.toLowerCase()}`, target: c.id, amount: c.qty, progress: 0, complete: false },
      { kind: 'return', description: 'Report to the house at Lisbon (its factor at the next quay will do)', target: 'lisboa', progress: 0, complete: false },
    ],
  };
}

function crownSurvey(g: Game): Body | null {
  const act = Math.min(5, g.chronicle.act);
  if (favourOf(g, 'crown') < 0.2) return null;
  const gross = 150 + 90 * act;
  return {
    title: `The Casa’s survey, ${['', 'first', 'second', 'third', 'fourth', 'fifth'][act]} coast`, advance: Math.round(gross * 0.5), reward: gross, standingReward: 20 + 10 * act, returnTo: 'lisboa',
    patron: 'crown', cut: 0, gross,
    narrative: 'Aires Tinoco has a gap on his sheet and a clerk who will not draw what nobody has measured. He is sending the nearest captain he trusts. It pays what a survey pays.',
    objectives: [
      { kind: 'chart', description: `Survey ${120 + 60 * act} miles of coast`, amount: 120 + 60 * act, progress: 0, complete: false },
      { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
    ],
  };
}

/**
 * What the patron of record puts on the table. The Crown keeps its dated commissions and gains a survey the Casa
 * writes when it likes him; the Church and the Rua Nova write theirs from the act, the policy and the markets, and
 * the King’s own charge for the act is always there beside them, so that the road and the ending stay the King’s.
 */
export function patronOffers(g: Game, crownOffers: Patent[]): Patent[] {
  const id = g.identity.patron;
  const mk = (b: Body, i: number): Patent => ({
    ...b, id: `${id}${g.identity.patrons[id].done}-${g.chronicle.act}-${i}`, issued: 0, monarch: PATRONS[id].name, complete: false, failed: false,
  });
  const act = g.chronicle.act;
  // What the King always gives: the act’s own charge (the first commission in Act I), whoever the patron is.
  const keep = act >= 2 ? crownOffers.filter((p) => p.title === ACT_CHARGE[act]) : crownOffers.slice(0, 1);
  if (id === 'crown') {
    if (isFallen(g, 'crown')) return keep;
    const s = crownSurvey(g);
    return s ? [...crownOffers, mk(s, 0)].slice(-4) : crownOffers;
  }
  const barred = patronBlocked(g, id);
  const own: Patent[] = [];
  if (!barred && !isFallen(g, id) && strengthOf(g, id) > 0.2) {
    const b = id === 'church' ? churchOrder(g) : ruaNovaOrder(g);
    if (b) own.push(mk(b, 0));
  }
  return [...own, ...keep];
}

/** An order is discharged: the patron’s favour and its count. */
export function orderDischarged(g: Game, p: Patent): void {
  const pid = (p.patron ?? 'crown') as PatronId;
  const rec = g.identity.patrons[pid];
  rec.done += 1;
  rec.favour = clamp(rec.favour + 0.1, -1, 1);
  if (p.cut && p.gross) {
    record(g, 'order.taken', { target: PATRONS[pid].name, magnitude: 0.3, silent: true, note: `${PATRONS[pid].name} kept ${p.gross - Math.round(p.gross * (1 - p.cut))} cruzados of ${p.gross} as its cut.` });
  }
}

/** A patron’s order taken: the Ledger remembers whose it was. */
export function orderTaken(g: Game, p: Patent): void {
  if (!p.patron || p.patron === 'crown') return;
  record(g, 'order.taken', { target: PATRONS[p.patron as PatronId].name, magnitude: 0.3, silent: true, note: `Took "${p.title}" from ${PATRONS[p.patron as PatronId].name}.` });
}

// -- The last page -------------------------------------------------------------------

/** What the patron of record made of the career, for the epilogue. */
export function patronEnding(g: Game): { title: string; text: string } | null {
  const p = g.identity.patron;
  const rec = g.identity.patrons[p];
  const d = PATRONS[p];
  const who = g.identity.name || 'the captain';
  if (rec.ruined !== null) {
    return { title: `${d.name}, which turned on you`, text: `${d.name} did not forget what ${who} did under its flag. ${p === 'crown' ? 'The Casa kept his name in a drawer, and drew on it when he was gone.' : p === 'church' ? 'The Order’s chronicle gives the voyages and leaves out the man.' : 'The Rua Nova wrote him off in the same hand it used for lost ships.'}` };
  }
  if (rec.pulled) {
    return { title: `${d.name}, which fell`, text: `${who} sailed for ${d.name} and was still its man when it fell. What he had from it went with it, and what he made after he made alone.` };
  }
  const fav = favourOf(g, p);
  const done = rec.done;
  if (p === 'crown') return { title: 'The King’s man', text: fav > 0.3 ? `${who} ended as the Crown’s captain, with ${done} orders on the Casa’s books and the cartaz in his chest. The chronicles give the King the credit for the roads, and ${who} the credit for being the man who sailed them.` : `${who} ended as the Crown’s captain without the Crown’s love. He did what was asked and was paid what was owed.` };
  if (p === 'church') return { title: 'The Order’s captain', text: `${who} ended in the Order’s books: ${done} missions carried, a chaplain at his table and a line in the Order’s chronicle. ${churchPolicy(g.clock.t) === 'press' ? 'The font was the policy of his last years, and the chronicle counts the baptised. It does not count the rest.' : 'The Order’s patience ran out in his lifetime; the chronicle gives the years it lasted.'}` };
  return { title: 'The Rua Nova’s captain', text: `${who} ended as the Rua Nova’s: ${done} cargoes carried against its notes, and a name on the Rua Nova that houses read before they read a ship. ${g.identity.patrons.ruanova.favour > 0.3 ? 'They paid him in the only thing that outlasted the Edict, which was credit.' : 'They lent, and wrote it down, and were repaid in full.'}` };
}

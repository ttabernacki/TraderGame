import type { Game } from '../game/state';
import { planInheritance } from '../identity/dynasty';
import { favourOf, PATRONS } from '../identity/patrons';
import { PATRON_IDS, type CallingId, type PatronId } from '../identity/state';
import { TITLE_BY_ID } from '../identity/titles';
import { muster } from '../ledger/chronicle';
import { ownEntries, type Entry } from '../ledger/ledger';
import { TAGS } from '../ledger/tags';
import { fameOf } from '../knowledge/fame';

/**
 * The ending, assembled (BUILD_PLAN E2; v2-story Pillar 6).
 *
 * The King's Offer is the last of many things that decide how a career ends, not a menu. This is the evaluation: Patron favour,
 * the stage of the Fronts, the Ledger and the Fame the captain made are read once, as plain data (`EndingState`), and each of six
 * authored endings is scored from it; the highest is told, in two or three paragraphs with the names and counts out of the
 * Ledger, and a last line says what world he made (the Traffic, the Rule). Nothing here is rolled: the same state is the
 * same ending, and the heir, who is the person the ending is about, is in it.
 *
 *   lordship     the Crown gives land and a gallows, and the quiet that goes with them.
 *   command      the Crown gives a fleet, and the road is his.
 *   exile        what is left of a captain no door will open to: the islands, and no questions.
 *   book         a chronicler's legacy: what he drew and wrote is copied, used and not always credited.
 *   repudiation  the heir disowns him: takes another name, and the name is left with what it was.
 *   goeson       the quiet one: the Houses and the Lines and the habit of the sea go on, and so does the work.
 *
 * Sources and invention (docs/SOURCES.md): the Lei Mental of 1434 (Crown grants pass whole to the eldest legitimate son, and revert
 * to the Crown without one) is documented; João de Barros, a boy in 1500 and the Casa's factor from 1525, wrote the Décadas out
 * of the Casa's papers (first Década 1552); every weight below and every sentence of what a particular captain did is INVENTED.
 */

export type EndingId = 'lordship' | 'command' | 'exile' | 'book' | 'repudiation' | 'goeson';
export const ENDING_IDS: EndingId[] = ['lordship', 'command', 'exile', 'book', 'repudiation', 'goeson'];
export type KingOffer = 'armada' | 'lordship' | 'rich' | 'ship';

export interface Counts {
  kept: number; broken: number; carried: number; refused: number; redeemed: number; hanged: number; stopped: number;
  succoured: number; abandoned: number; chartShared: number; chartSold: number; honest: number; cooked: number;
  repaid: number; defaulted: number; claims: number; patents: number; pressed: number; mercy: number; funded: number;
}
export const COUNT_KEYS = ['kept', 'broken', 'carried', 'refused', 'redeemed', 'hanged', 'stopped', 'succoured', 'abandoned',
  'chartShared', 'chartSold', 'honest', 'cooked', 'repaid', 'defaulted', 'claims', 'patents', 'pressed', 'mercy', 'funded'] as const;

export interface EndingState {
  captain: string;
  ship: string;
  generation: number;
  /** The person the ending is about: the heir he leaves, if there is one to name. */
  heir: { name: string; relation: string; age: number } | null;
  gold: number;
  standing: number;
  patron: PatronId;
  /** What each patron makes of him, as he feels it (`favourOf`: the Ledger's fold plus his worn titles' edge). */
  favour: Record<PatronId, number>;
  ruined: PatronId[];
  pulled: PatronId[];
  /** Front stages, 1..4. */
  stages: { traffic: number; rule: number; court: number };
  c: Counts;
  /** Mean tone of his own deeds, weighted by magnitude: -1 (shameful) .. 1 (honoured). */
  tone: number;
  fame: { points: number; held: number };
  houses: number;
  lines: number;
  king: KingOffer | null;
  lordship: string | null;
  worn: string[];
  calling: CallingId | null;
  dead: number;
}

const LORDSHIPS = ['Alvito', 'Sortelha', 'Ferreira de Aves', 'Castelo Rodrigo'];

const KING_OF: Record<string, KingOffer> = { armada: 'armada', lordship: 'lordship', rich: 'rich', ship: 'ship' };

export const emptyCounts = (): Counts => Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])) as unknown as Counts;

/** The counts that the endings tell, from a Ledger (own entries only: an heir's ending is his own). */
export function countsOf(ledger: Entry[]): Counts {
  const c = emptyCounts();
  const n = (...tags: string[]): number => ledger.filter((e) => tags.includes(e.tag)).length;
  c.kept = n('promise.kept'); c.broken = n('promise.broken'); c.carried = n('traffic.carried'); c.refused = n('traffic.refused');
  c.redeemed = n('person.redeemed', 'companion.freed'); c.hanged = n('hand.hanged', 'hand.flogged'); c.stopped = n('ship.stopped');
  c.succoured = n('ship.succoured'); c.abandoned = n('ship.abandoned'); c.chartShared = n('chart.shared'); c.chartSold = n('chart.sold');
  c.honest = n('books.honest'); c.cooked = n('books.cooked'); c.repaid = n('loan.repaid'); c.defaulted = n('loan.defaulted');
  c.claims = n('claim.made'); c.patents = n('patent.completed'); c.pressed = n('faith.pressed'); c.mercy = n('mercy.shown'); c.funded = n('port.funded');
  return c;
}

export function toneOf(ledger: Entry[]): number {
  let s = 0, w = 0;
  for (const e of ledger) {
    const t = TAGS[e.tag]?.tone ?? 0;
    if (t === 0) continue;
    const m = Math.max(0.2, Math.min(1, e.magnitude));
    s += t * m; w += m;
  }
  return w === 0 ? 0 : s / w;
}

/** Read the game once. Everything the evaluation uses is in what this returns. */
export function endingStateOf(g: Game): EndingState {
  const mine = ownEntries(g.ledger);
  const favour = {} as Record<PatronId, number>;
  for (const p of PATRON_IDS) favour[p] = favourOf(g, p);
  const q = g.quests.find((x) => x.id === 'kingsoffer');
  const worn = g.identity.worn.map((id) => TITLE_BY_ID.get(id)?.english).filter((x): x is string => !!x);
  const fame = fameOf(g);
  return {
    captain: g.identity.name || 'the captain',
    ship: g.ship.name,
    generation: g.generation,
    heir: heirOf(g),
    gold: Math.round(g.crown.gold),
    standing: Math.round(g.crown.lifetimeStanding),
    patron: g.identity.patron,
    favour,
    ruined: PATRON_IDS.filter((p) => g.identity.patrons[p].ruined !== null),
    pulled: PATRON_IDS.filter((p) => g.identity.patrons[p].pulled),
    stages: { traffic: g.powers.fronts.traffic.stage, rule: g.powers.fronts.rule.stage, court: g.powers.fronts.court.stage },
    c: countsOf(mine),
    tone: toneOf(mine),
    fame: { points: fame.points, held: fame.held.length },
    houses: g.liveFactories.length,
    lines: g.lines.filter((l) => !l.lost).length,
    king: q?.outcome ? KING_OF[q.outcome] ?? null : null,
    lordship: g.lordship ?? null,
    worn,
    calling: g.identity.calling,
    dead: Math.max(muster(mine).total, g.crew.deaths),
  };
}

/** The person the ending is about: the heir the hand-off will name (identity/dynasty), the same one the heir card shows. */
function heirOf(g: Game): EndingState['heir'] {
  const p = planInheritance(g, { repudiate: false }).person;
  return { name: p.name, relation: p.relation, age: p.age };
}

/** Give the ending the person it is about (the hand-off plan's heir, or the heir record of a captain who is himself one). */
export function withHeir(s: EndingState, heir: EndingState['heir']): EndingState {
  return { ...s, heir };
}

// -- The evaluation ------------------------------------------------------------------------------------------------------

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const pos = (x: number): number => Math.max(0, x);

/** What the Crown can offer a captain at Lisbon at the end: the King's Offer's menu, gated. At least two are always open. */
export function kingsOfferOpen(s: EndingState): Record<KingOffer, boolean> {
  const crownShut = s.ruined.includes('crown') || s.pulled.includes('crown');
  const bar = s.stages.court >= 3 ? 0.2 : 0.1;
  return {
    armada: !crownShut && s.favour.crown >= bar,
    lordship: !crownShut && s.favour.crown >= -0.1 && s.standing >= 150,
    rich: true,
    ship: true,
  };
}

/** The King's Offer's four choices, in the order the audience writes them (armada, lordship, gold, the ship), with those the Crown cannot give taken out. */
export function gateKingsOffer<T>(g: Game, choices: T[]): T[] {
  const open = kingsOfferOpen(endingStateOf(g));
  const order: KingOffer[] = ['armada', 'lordship', 'rich', 'ship'];
  const out = choices.filter((_, i) => open[order[i]] !== false);
  return out.length >= 2 ? out : choices;
}

/** Each ending's pull on this state, 0 and up. The highest is told. */
export function scoreEndings(s: EndingState): Record<EndingId, number> {
  const c = s.c;
  const fav = s.favour;
  const crownShut = s.ruined.includes('crown') || s.pulled.includes('crown');
  const fame01 = clamp01(s.fame.points / 10);
  const wealth01 = clamp01(s.gold / 4000);
  const standing01 = clamp01(s.standing / 600);
  const shame = Math.min(1.5, 0.12 * c.carried + 0.12 * c.hanged + 0.1 * c.broken + 0.15 * c.abandoned + 0.08 * c.pressed + 0.1 * c.cooked + 0.1 * c.defaulted);
  const honour = Math.min(1.5, 0.1 * c.kept + 0.12 * c.redeemed + 0.1 * c.succoured + 0.08 * c.mercy + 0.08 * c.honest + 0.08 * c.refused);
  const ruinedAny = s.ruined.length > 0 ? 1 : 0;
  const friendless = PATRON_IDS.every((p) => fav[p] < 0.1) ? 1 : 0;
  const k = s.king;
  const sc: Record<EndingId, number> = {
    lordship: 0.04 + 0.3 * pos(fav.crown) + 0.2 * standing01 + 0.12 * wealth01 + 0.05 * Number(s.houses > 0)
      + (k === 'lordship' ? 0.5 : 0) - (k === 'armada' ? 0.1 : 0) - (crownShut ? 0.6 : 0),
    command: 0.04 + 0.3 * pos(fav.crown) + 0.28 * fame01 + 0.12 * Number(s.calling === 'master' || s.calling === 'pilot')
      + 0.08 * Number(s.stages.rule >= 3 && fav.crown > 0) + (k === 'armada' ? 0.5 : 0) - (k === 'rich' ? 0.15 : 0) - (crownShut ? 0.6 : 0),
    exile: 0.0 + 0.45 * ruinedAny + 0.25 * Number(s.gold < 500) + 0.2 * friendless + 0.3 * Math.min(1, c.defaulted) + 0.3 * pos(-s.tone)
      + 0.2 * Number(s.pulled.length > 0) - 0.3 * wealth01 - 0.1 * Number(s.houses > 0),
    book: 0.08 + 0.4 * fame01 + 0.2 * Math.min(1, c.chartShared / 3) + 0.15 * pos(fav.church) + 0.1 * Number(k === 'ship')
      + 0.1 * Number(s.calling === 'pilot') + 0.08 * Number(c.honest > 0) - 0.3 * Number(c.chartSold > 0) - 0.2 * Math.min(1, shame),
    repudiation: -0.12 + 0.95 * Math.min(1, shame) + 0.2 * Number(s.stages.traffic >= 3 && c.carried >= 3) + 0.2 * pos(-s.tone)
      - 0.35 * Math.min(1, honour),
    goeson: 0.4 + 0.12 * Math.min(1, (s.houses + s.lines) / 3) + 0.08 * Number(c.funded > 0) + 0.06 * Number(k === 'ship' || k === 'rich')
      - 0.15 * Math.max(0, fame01 - 0.6) - 0.15 * Math.min(1, shame),
  };
  for (const id of ENDING_IDS) sc[id] = Math.max(0, sc[id]);
  return sc;
}

/** The ending that stands highest; a tie goes to the one earlier in `ENDING_IDS`. */
export function chooseEnding(s: EndingState): EndingId {
  const sc = scoreEndings(s);
  let best: EndingId = 'goeson';
  let top = -1;
  for (const id of ENDING_IDS) if (sc[id] > top + 1e-9) { top = sc[id]; best = id; }
  return best;
}

// -- The telling ---------------------------------------------------------------------------------------------------------

export interface Ending {
  id: EndingId;
  title: string;
  paragraphs: string[];
  /** The last line: the world the captain made. */
  world: string;
  scores: Record<EndingId, number>;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many.replace('{n}', String(n)));
const join = (xs: string[]): string => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);
const first = (name: string): string => name.split(' ')[0];
const hash = (x: string): number => { let h = 0; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) % 9973; return h; };

/** The count-bearing facts the Ledger has about him, in the order they weigh, for whatever ending needs to say what he did. */
export function deeds(s: EndingState, kind: 'honour' | 'shame' | 'work'): string[] {
  const c = s.c;
  const out: string[] = [];
  if (kind === 'honour') {
    if (c.kept > 0) out.push(plural(c.kept, 'one word kept', '{n} words kept'));
    if (c.redeemed > 0) out.push(plural(c.redeemed, 'one man freed', '{n} people freed or bought back'));
    if (c.succoured > 0) out.push(plural(c.succoured, 'a ship brought off', '{n} ships brought off'));
    if (c.refused > 0) out.push(plural(c.refused, 'one cargo of people refused', '{n} cargoes of people refused'));
    if (c.honest > 0) out.push('the books kept straight');
  } else if (kind === 'shame') {
    if (c.carried > 0) out.push(plural(c.carried, 'one parcel of people carried to be sold', '{n} parcels of people carried to be sold'));
    if (c.hanged > 0) out.push(plural(c.hanged, 'one man hanged or flogged', '{n} men hanged or flogged'));
    if (c.broken > 0) out.push(plural(c.broken, 'one promise broken', '{n} promises broken'));
    if (c.abandoned > 0) out.push(plural(c.abandoned, 'a ship held past in distress', '{n} ships held past in distress'));
    if (c.pressed > 0) out.push(plural(c.pressed, 'the font pressed once on people who had not asked', 'the font pressed {n} times on people who had not asked'));
    if (c.cooked > 0) out.push('the books cooked');
    if (c.defaulted > 0) out.push(plural(c.defaulted, 'a loan gone bad against his name', '{n} loans gone bad against his name'));
  } else {
    if (c.patents > 0) out.push(plural(c.patents, 'one commission for the Crown', '{n} commissions for the Crown'));
    if (c.claims > 0) out.push(plural(c.claims, 'one padrão raised', '{n} padrões raised'));
    if (c.chartShared > 0) out.push(plural(c.chartShared, 'one sheet given to the Casa', '{n} sheets given to the Casa'));
    if (s.houses > 0) out.push(plural(s.houses, 'a House still standing on the coast', '{n} Houses still standing on the coast'));
    if (s.lines > 0) out.push(plural(s.lines, 'a Line still running', '{n} Lines still running'));
  }
  return out;
}

const dead = (s: EndingState): string => (s.dead > 0 ? `${s.dead} ${s.dead === 1 ? 'man' : 'men'} buried` : 'no one buried');
const heirTail = (s: EndingState, text: Record<string, string>): string => {
  const h = s.heir;
  if (!h) return text.none ?? '';
  const rel = h.relation === 'natural son' ? 'natural son' : h.relation;
  return (text[h.relation] ?? text.son ?? '').replace(/\{heir\}/g, h.name).replace(/\{first\}/g, first(h.name)).replace(/\{age\}/g, String(h.age)).replace(/\{rel\}/g, rel);
};

const TRAFFIC_END: Record<number, string> = {
  1: 'The Traffic still has its first shape: people bought on the edge of the Sahara and the coast of Guinea for horses, wheat and cloth, a few hundred a year, and it is still possible to say nobody planned it.',
  2: 'The Traffic has a book and a clerk at every factory now, and ships carry its cargo without remark. What was barter is routine.',
  3: 'The Traffic has a number written into the licence of every ship that sails the Mina road, and the cane on São Tomé is why.',
  4: 'The Traffic is the system now: sugar is cheap in Lisbon, the court at Mbanza Kongo has split over what it sells, and children are being born into it who will never be asked.',
};
const RULE_END: Record<number, string> = {
  1: 'On the Indian Ocean anyone may still sail anywhere, and nobody carries a pass.',
  2: 'On the Indian Ocean the ships of friends carry a Portuguese letter and are left alone.',
  3: 'On the Indian Ocean a ship without the letter is stopped, searched and sometimes taken.',
  4: 'On the Indian Ocean the ports are closed to any ship without the letter, and the water is watched.',
};

/** The last line: what he made of the world, by the Front stages he left and what the Ledger says he had to do with them. */
export function worldLine(s: EndingState): string {
  const c = s.c;
  const t = TRAFFIC_END[s.stages.traffic] ?? TRAFFIC_END[1];
  const tHand = c.carried > 0 ? ` You carried ${c.carried === 1 ? 'one parcel' : `${c.carried} parcels`} of it yourself.` : c.refused > 0 ? ` You refused ${c.refused === 1 ? 'one cargo' : `${c.refused} cargoes`} of it, and it went on.` : '';
  const r = RULE_END[s.stages.rule] ?? RULE_END[1];
  const rHand = c.stopped > 0 ? ` You stopped ${c.stopped === 1 ? 'one ship' : `${c.stopped} ships`} yourself.` : '';
  return `${t}${tHand} ${r}${rHand}`;
}

const patronName = (p: PatronId): string => PATRONS[p].name;

function lordshipName(s: EndingState): string {
  return s.lordship ?? LORDSHIPS[hash(s.captain) % LORDSHIPS.length];
}

/** The ending, told. Pure: the same state tells the same ending. */
export function assembleEnding(s: EndingState): Ending {
  const scores = scoreEndings(s);
  const id = chooseEnding(s);
  const who = s.captain;
  const honour = deeds(s, 'honour'), shame = deeds(s, 'shame'), work = deeds(s, 'work');
  let title = '';
  const p: string[] = [];
  switch (id) {
    case 'lordship': {
      const land = lordshipName(s);
      title = `Senhor de ${land}`;
      p.push(s.king === 'lordship'
        ? `The King made ${who} Senhor de ${land}, with its rents and its gallows, and was kind about it. On a clear day you could see the river from the terrace, and ${who} usually did not look.`
        : `The Crown had a town in its gift and a captain it could not otherwise repay, and made ${who} Senhor de ${land}. It was the Casa's idea of a kindness, and it was meant as one.`);
      p.push(`${cap(dead(s))}, ${work.length ? join(work.slice(0, 2)) : 'and the road opened'}: that is the account the town was given for its new lord. The law of 1434 takes a grant of the Crown's land and passes it whole to the eldest legitimate son, and to the Crown if there is none. ${heirTail(s, {
        son: '{heir}, {age}, is the eldest, and will have it whole.',
        nephew: 'There is no son living, so it would have gone back to the Crown, and the Crown, for a fee, has let {heir}, {age}, a sister’s son, have it.',
        'natural son': '{heir}, {age}, is not legitimate, and the Crown had to write him a letter of legitimation before the law would let him have it. He will remember who paid for the letter.',
        ward: '{heir}, {age}, is the Crown’s ward as much as yours, and the law has an easy time of it.',
        none: 'There is nobody to take it, and it will go back.',
      })}`);
      p.push(`${patronName(s.patron)} ${s.favour[s.patron] > 0.3 ? 'remembered him warmly, and wrote it' : 'had him in its book, and wrote that too'}.`);
      break;
    }
    case 'command': {
      title = 'Captain-major';
      p.push(s.king === 'armada'
        ? `The King named ${who} captain-major of the next armada to the Indies, and the road to the Indies was his for the rest of his life: the pilots, the stones, the letters, and whatever the road brings.`
        : `The Casa had a fleet to send and a man who knew the road, and the flag went to ${who}. It was not offered; it was written down on a Tuesday, and he learned of it from the clerk.`);
      p.push(`Behind the flag, ${dead(s)}${work.length ? `, ${join(work.slice(0, 3))}` : ''}. ${s.stages.rule >= 3 ? 'The fleet sails under the Rule, and what a captain-major does to a ship without the letter is what he is told to do.' : 'The fleet sails when the Rule is still a thing a captain-major may argue with, and he argues with it.'}`);
      p.push(heirTail(s, {
        son: '{heir}, {age}, goes out as a page in the flagship, which is how it is done.',
        nephew: '{heir}, {age}, a sister’s son, goes out in the flagship as a clerk, which is how it is done for nephews.',
        'natural son': '{heir}, {age}, goes out in the flagship as a boy at the lower end of the list, with a letter that says nothing of who his father is.',
        ward: '{heir}, {age}, goes out as the flag’s boy, and learns the road he will command.',
        none: 'There is no one to take the next armada after him, and the Casa knows it.',
      }));
      break;
    }
    case 'exile': {
      title = 'The islands, and no questions';
      p.push(s.ruined.length > 0
        ? `${cap(join(s.ruined.map(patronName)))} did not forgive ${who}, and a captain without a house at his back is a man the Casa has already stopped thinking about.`
        : `No house on the Rua Nova and no door at court was open to ${who} by the end, and there is nothing in Lisbon more final than a door that is merely closed politely.`);
      p.push(`He took a passage to the islands, where nobody asks and the sugar is good, with ${s.gold > 0 ? `${s.gold} cruzados` : 'nothing'} and ${dead(s)} behind him${shame.length ? `, and ${join(shame.slice(0, 2))}` : ''}.`);
      p.push(heirTail(s, {
        son: '{heir}, {age}, stayed in Lisbon with a mother’s name to use, and wrote to him once a year.',
        nephew: '{heir}, {age}, came out to the islands with him, and has the books.',
        'natural son': '{heir}, {age}, came with him because there was nowhere else for him to go.',
        ward: '{heir}, {age}, was returned to the Crown, which had not been consulted.',
        none: 'There is nobody to write.',
      }));
      break;
    }
    case 'book': {
      title = 'The roteiro';
      p.push(`${cap(who)} did not end as a lord or a captain-major. ${cap(who)} ended as a book. The Casa's clerks copied the sheets, the pilots who came after sailed on the latitudes he had settled, and the names he gave are on the chart under his name, or, more often, under somebody else's.`);
      p.push(`${cap(join(work.length ? work.slice(0, 3) : ['the sheets', 'the soundings']))}, and ${s.fame.held > 0 ? plural(s.fame.held, 'one claim held', '{n} claims held') : 'the coasts found and not claimed'}. Half a century on, a boy who is in Lisbon this year, and will one day keep the Casa's books, will write the history of the Indies out of its papers, and yours are among them.`);
      p.push(heirTail(s, {
        son: '{heir}, {age}, has the original and keeps it in a chest, and has been told never to lend it.',
        nephew: '{heir}, {age}, a sister’s son, can read the hand, and has been taken on at the Casa to do it.',
        'natural son': '{heir}, {age}, has been made a copyist at the Casa, which is the one place nobody asks whose son he is.',
        ward: '{heir}, {age}, is learning to draw the coasts from it.',
        none: 'There is nobody to keep it but the Casa.',
      }));
      break;
    }
    case 'repudiation': {
      title = 'A name put off';
      p.push(`${cap(who)} left a ship, a purse and a name, and the heir took the first two.`);
      p.push(heirTail(s, {
        son: 'Within the year {heir}, {age}, asked the Casa’s clerk to write the grant in his mother’s name, and the clerk, who had seen it done before, did not ask why.',
        nephew: 'Within the year {heir}, {age}, a sister’s son, asked the Casa’s clerk to write the grant in the name of his own father, and the clerk, who had seen it done before, did not ask why.',
        'natural son': 'Within the year {heir}, {age}, who had been given the name by letter and never by love, wrote to the Casa to say he would not use it.',
        ward: 'Within the year {heir}, {age}, who was the Crown’s ward and could, asked to be written under the Crown’s name instead.',
        none: 'There was nobody to put the name off, and it was put off all the same, by the rest of the town.',
      }) + ` The Book gives ${shame.length ? join(shame.slice(0, 3)) : 'what he did'}, and ${dead(s)}.`);
      p.push(honour.length
        ? `There was also ${join(honour.slice(0, 2))}, which is what the town said at the funeral and nobody wrote down.`
        : 'There was nothing that anybody could say at the funeral that the Book would not answer.');
      break;
    }
    default: {
      title = 'The work goes on';
      p.push(`${cap(who)} ended neither as a lord nor as a ruin. ${cap(dead(s))}, ${work.length ? join(work.slice(0, 3)) : 'a road opened that was not his alone'}, and a habit of the sea in a house that does not know how to stop.`);
      p.push(s.houses + s.lines > 0
        ? `${s.houses > 0 ? plural(s.houses, 'The House', 'The {n} Houses') : ''}${s.houses > 0 && s.lines > 0 ? ' and ' : ''}${s.lines > 0 ? plural(s.lines, 'the Line', 'the {n} Lines') : ''} go on whether he is alive to read the books or not, and the factors write to the next man in the family.`
        : 'There is little standing on the coast in his name, and what there is will outlast the account of it.');
      p.push(heirTail(s, {
        son: '{heir}, {age}, goes down to the quay the week after the funeral, which is what a son does.',
        nephew: '{heir}, {age}, a sister’s son, has been at the books since before the funeral and takes the keys.',
        'natural son': '{heir}, {age}, takes the keys, which nobody had thought to take from him.',
        ward: '{heir}, {age}, takes up the work because there is work and nobody else.',
        none: 'The factors write to the Casa, which does not know whom to write back to.',
      }));
    }
  }
  return { id, title, paragraphs: p.filter(Boolean), world: worldLine(s), scores };
}

/** The ending of a game, with its heir named from the hand-off plan if the caller has it. */
export function endingFor(g: Game, heir: EndingState['heir'] = null): Ending {
  return assembleEnding(withHeir(endingStateOf(g), heir));
}


import { clamp } from '../core/math';
import type { Game } from '../game/state';
import type { Entry } from '../ledger/ledger';
import type { Tag } from '../ledger/tags';
import { POLITIES, POLITY_BY_ID, polityOfPort, type PolityDef, type Temper } from '../diplomacy/polities';
import { along } from '../progression/road';
import { anchorageOf, portDef } from '../world/ports';
import { record } from '../ledger/ledger';
import type { PatronId } from './state';

/**
 * Titles (BUILD_PLAN D5; docs/design-team/v2-story.md Pillar 1).
 *
 * What the world calls the captain. Never picked: a title is earned by a predicate over the Ledger (or over a milestone,
 * which is how the career's marks became titles). He wears three at most. A worn title is a door and a wall: it moves
 * what the courts that have heard of it make of him, what the patrons think, and what a hand asks to ship with him.
 *
 * Word of a title runs down the road at a port a month, and changes in the telling: the same deed is told by a factor,
 * a priest, a soldier, a courtier or a sailor, and each hears something different (a mercy becomes weakness, a hard
 * hand becomes a butcher). The distortion is data (`DISTORT`), applied as the trust and respect the word carries.
 * INVENTED: every title name's English gloss, every threshold, every teller line; the predicates read only tags
 * the game really writes.
 */

export interface Delta { trust?: number; respect?: number; interest?: number }
export type Spin = 'mercy' | 'hard' | 'honest' | 'faith' | 'trade' | 'sea' | 'shame' | 'fortune';
export type Teller = 'factors' | 'priests' | 'soldiers' | 'courtiers' | 'sailors';

/** What a title's predicate can see. A plain object, so a test can hand it a synthetic Ledger. */
export interface TitleCtx {
  ledger: Entry[];
  milestones: string[];
  /** Entries aimed at one polity, kept for the per-court titles. */
}

export interface TitleDef {
  id: string;
  name: string;
  english: string;
  /** What earns it, for the Book. */
  hint: string;
  spin: Spin;
  when(c: TitleCtx): boolean;
  /** Worn, at courts that have heard: by polity id, temper, or '*'. */
  courts?: Record<string, Delta>;
  /** Worn: patron favour offsets, and patrons whose door it shuts. */
  patron?: Partial<Record<PatronId, number>>;
  shuts?: PatronId[];
  /** Wage multiplier asked by a hand who ships with this name. */
  hire?: number;
  /** One line each for the Book: what it opens, what it shuts. */
  opens: string;
  shut: string;
}

const n = (c: TitleCtx, ...tags: Tag[]): number => c.ledger.filter((e) => tags.includes(e.tag as Tag)).length;
const at = (c: TitleCtx, target: string, ...tags: Tag[]): number => c.ledger.filter((e) => e.target === target && tags.includes(e.tag as Tag)).length;
const ms = (c: TitleCtx, id: string): boolean => c.milestones.includes(id);

export const TITLES: TitleDef[] = [
  // --- Earned from the Ledger ---------------------------------------------
  { id: 'o-justo', name: 'O Justo', english: 'The Just', hint: 'Eight promises kept and none broken.', spin: 'honest',
    when: (c) => n(c, 'promise.kept') >= 8 && n(c, 'promise.broken') === 0,
    courts: { '*': { trust: 0.12 }, mercantile: { trust: 0.08, interest: 0.05 } }, patron: { crown: 0.1, church: 0.1 },
    opens: 'Courts take your word without a hostage.', shut: 'Nobody believes you when you must lie.' },
  { id: 'mao-pesada', name: 'Mão Pesada', english: 'The Heavy Hand', hint: 'Five ships stopped, men flogged or hanged.', spin: 'hard',
    when: (c) => n(c, 'ship.stopped') + n(c, 'hand.flogged') + n(c, 'hand.hanged') >= 5,
    courts: { warlike: { respect: 0.14 }, '*': { trust: -0.06 } }, patron: { crown: 0.1, church: -0.15 }, hire: 1.15,
    opens: 'Warlike courts reckon with you.', shut: 'Hands ask more to ship with you; the Church is cool.' },
  { id: 'amigo-de-melinde', name: 'Amigo de Melinde', english: 'Friend of Melinde', hint: 'Three kindnesses or kept words at Melinde.', spin: 'honest',
    when: (c) => at(c, 'malindi', 'gift.great', 'table.kept', 'promise.kept', 'peace.made') >= 3,
    courts: { malindi: { trust: 0.3, interest: 0.15 }, mombasa: { trust: -0.12 }, kilwa: { trust: -0.06 } },
    opens: 'Melinde’s court is yours; its pilots come to you.', shut: 'Mombaça remembers whose friend you are.' },
  { id: 'the-redeemer', name: 'O Resgatador', english: 'The Redeemer', hint: 'Two people bought out of the trade or freed.', spin: 'mercy',
    when: (c) => n(c, 'person.redeemed') + n(c, 'companion.freed') >= 2,
    courts: { '*': { trust: 0.05 }, pious: { trust: 0.1 } }, patron: { church: 0.25, ruanova: -0.1 },
    opens: 'The Church opens its funds; the Kongo court hears you.', shut: 'The factors of the Rua Nova find you expensive.' },
  { id: 'the-man-who-sold-the-chart', name: 'O que Vendeu a Carta', english: 'The Man Who Sold the Chart', hint: 'Sold a survey or a roteiro to another flag or house.', spin: 'shame',
    when: (c) => n(c, 'chart.sold') >= 1,
    courts: { '*': { interest: 0.08 } }, patron: { crown: -0.3, ruanova: 0.2 }, shuts: ['crown'],
    opens: 'The Genoese and the Rua Nova pay for what you know.', shut: 'The Crown will not give a sold chart’s captain its orders.' },
  { id: 'pilot-of-the-cape', name: 'Piloto do Cabo', english: 'Pilot of the Cape', hint: 'Round the Cape, with three landfalls that held.', spin: 'sea',
    when: (c) => ms(c, 'cape') && n(c, 'landfall.exact') >= 3,
    courts: { '*': { respect: 0.08 } }, patron: { crown: 0.15 }, hire: 0.9,
    opens: 'Pilots and hands ship with you for less.', shut: 'Nothing; only that the Casa will ask you to do it again.' },
  { id: 'honest-weight', name: 'Peso Justo', english: 'The Honest Weight', hint: 'Three fair weighings and no shaded scale.', spin: 'trade',
    when: (c) => n(c, 'weights.fair') >= 3 && n(c, 'weights.false') === 0,
    courts: { mercantile: { trust: 0.12, interest: 0.1 } }, patron: { ruanova: 0.2 },
    opens: 'Merchants’ courts deal with you first.', shut: 'The Casa distrusts a captain who will not shade.' },
  { id: 'false-weight', name: 'Pesos Falsos', english: 'False Weights', hint: 'The scales shaded, twice.', spin: 'shame',
    when: (c) => n(c, 'weights.false') >= 2,
    courts: { mercantile: { trust: -0.15 } }, patron: { ruanova: -0.1 },
    opens: 'Nothing; the factors will simply expect it.', shut: 'Merchants’ courts watch the scale.' },
  { id: 'bom-pagador', name: 'Bom Pagador', english: 'A Good Payer', hint: 'Two loans repaid and none gone bad.', spin: 'trade',
    when: (c) => n(c, 'loan.repaid') >= 2 && n(c, 'loan.defaulted') === 0,
    patron: { ruanova: 0.3 }, courts: { mercantile: { interest: 0.08 } },
    opens: 'The Rua Nova writes you paper more readily.', shut: 'Nothing.' },
  { id: 'o-devedor', name: 'O Devedor', english: 'The Defaulter', hint: 'A loan went bad against your name.', spin: 'shame',
    when: (c) => n(c, 'loan.defaulted') >= 1,
    patron: { ruanova: -0.4 }, shuts: ['ruanova'], courts: { mercantile: { trust: -0.1 } },
    opens: 'Nothing.', shut: 'The Rua Nova will not carry you this voyage.' },
  { id: 'pai-dos-homens', name: 'Pai dos Homens', english: 'Father of Men', hint: 'Three kindnesses to people who could not repay.', spin: 'mercy',
    when: (c) => n(c, 'mercy.shown') >= 3,
    courts: { '*': { trust: 0.06 } }, patron: { church: 0.2 }, hire: 0.85,
    opens: 'Hands ship for less; the Church notices.', shut: 'Soldiers think you soft.' },
  { id: 'pacificador', name: 'Pacificador', english: 'The Peacemaker', hint: 'Two peaces carried between states.', spin: 'honest',
    when: (c) => n(c, 'peace.made') >= 2,
    courts: { '*': { trust: 0.1 } }, patron: { church: 0.1, crown: 0.1 },
    opens: 'Quarrelling courts send for you.', shut: 'Nothing.' },
  { id: 'quebra-juramentos', name: 'Quebra-Juramentos', english: 'Oath-Breaker', hint: 'Three promises broken.', spin: 'shame',
    when: (c) => n(c, 'promise.broken') >= 3,
    courts: { '*': { trust: -0.18 } }, patron: { church: -0.2, crown: -0.1 },
    opens: 'Nothing.', shut: 'No court takes your word; hostages are asked.' },
  { id: 'homem-do-rei', name: 'Homem do Rei', english: 'The King’s Man', hint: 'Three commissions discharged for the Crown.', spin: 'honest',
    when: (c) => n(c, 'patent.completed') >= 3,
    courts: { '*': { respect: 0.08 } }, patron: { crown: 0.3, ruanova: -0.1 },
    opens: 'The Crown’s door; the cartaz is yours to carry.', shut: 'The Rua Nova thinks you the Casa’s.' },
  { id: 'contrabandista', name: 'Contrabandista', english: 'The Runner', hint: 'The King’s goods run past the Casa three times.', spin: 'trade',
    when: (c) => n(c, 'contraband.run') >= 3,
    patron: { ruanova: 0.25, crown: -0.3 }, shuts: ['crown'], courts: { mercantile: { interest: 0.1 } },
    opens: 'The Rua Nova’s private doors.', shut: 'The Crown gives its orders to others.' },
  { id: 'o-socorredor', name: 'O Socorredor', english: 'The Succourer', hint: 'Two ships in distress brought off.', spin: 'sea',
    when: (c) => n(c, 'ship.succoured') >= 2,
    courts: { '*': { trust: 0.07 } }, hire: 0.9, patron: { church: 0.1 },
    opens: 'Seamen of every flag speak well of you.', shut: 'Nothing.' },
  { id: 'passa-largo', name: 'Passa-Largo', english: 'Hold-Your-Course', hint: 'Passed two ships in distress.', spin: 'shame',
    when: (c) => n(c, 'ship.abandoned') >= 2,
    courts: { '*': { trust: -0.08 } }, hire: 1.1, patron: { church: -0.15 },
    opens: 'Nothing.', shut: 'Seamen do not forget a ship passed by.' },
  { id: 'dador-de-nomes', name: 'Dador de Nomes', english: 'The Namer', hint: 'Three headlands named and a padrão raised.', spin: 'fortune',
    when: (c) => n(c, 'name.given') >= 3 && n(c, 'claim.made') >= 1,
    courts: { '*': { respect: 0.05 } }, patron: { crown: 0.15 },
    opens: 'The Casa lists your names in its padrão.', shut: 'The rival counts them against his own.' },
  { id: 'mao-aberta', name: 'Mão Aberta', english: 'The Open Hand', hint: 'Three gifts praised.', spin: 'fortune',
    when: (c) => n(c, 'gift.great') >= 3,
    courts: { '*': { interest: 0.1 }, proud: { respect: 0.1 } },
    opens: 'Proud courts receive you.', shut: 'Every court now expects a gift.' },
  { id: 'amigo-das-fes', name: 'Amigo das Fés', english: 'Friend of Faiths', hint: 'Three worships left alone.', spin: 'mercy',
    when: (c) => n(c, 'faith.respected') >= 3,
    courts: { pious: { trust: 0.12 }, '*': { trust: 0.04 } }, patron: { church: -0.15 },
    opens: 'Muslim and Hindu courts hear you first.', shut: 'The Order of Christ finds you wanting.' },
  { id: 'o-batizador', name: 'O Batizador', english: 'The Baptiser', hint: 'Baptism pressed twice on a people who had not asked.', spin: 'faith',
    when: (c) => n(c, 'faith.pressed') >= 2,
    courts: { pious: { trust: -0.14 } }, patron: { church: 0.3 },
    opens: 'The Order opens its mission funds.', shut: 'Pious courts of other faiths shut you out.' },
  { id: 'he-who-spoke', name: 'Quem Falou', english: 'He Who Spoke at the Castle', hint: 'Put a question about the trade to a court, in the open.', spin: 'mercy',
    when: (c) => n(c, 'hearing.contested') >= 1,
    courts: { '*': { respect: 0.05 } }, patron: { church: 0.1, crown: -0.15 },
    opens: 'People on the coast tell it.', shut: 'The factors at the Casa remember.' },
  { id: 'o-portador', name: 'O Portador', english: 'The Carrier', hint: 'Carried people to be sold, three times.', spin: 'shame',
    when: (c) => n(c, 'traffic.carried') >= 3,
    patron: { ruanova: 0.2, church: -0.2 }, courts: { '*': { trust: -0.04 } },
    opens: 'The factors send you cargo.', shut: 'The people of the coast know the name.' },
  { id: 'senhor-de-feitorias', name: 'Senhor de Feitorias', english: 'Lord of Houses', hint: 'Three Houses founded on the coast.', spin: 'trade',
    when: (c) => n(c, 'port.funded') >= 3,
    courts: { mercantile: { interest: 0.1 } }, patron: { ruanova: 0.15 },
    opens: 'Quays offer ground before you ask.', shut: 'Three garrisons wait on your letters.' },
  // --- The marks of the career, which were milestones -----------------------
  { id: 'passador-da-linha', name: 'Passador da Linha', english: 'Crosser of the Line', hint: 'Sailed across the equator.', spin: 'sea',
    when: (c) => ms(c, 'line'), hire: 0.95, opens: 'Hands call you one of theirs.', shut: 'Nothing.' },
  { id: 'do-cabo', name: 'Do Cabo', english: 'Of the Cape', hint: 'Rounded the Cape of Good Hope.', spin: 'sea',
    when: (c) => ms(c, 'cape'), courts: { '*': { respect: 0.06 } }, opens: 'Courts beyond the Cape have heard the name.', shut: 'Nothing.' },
  { id: 'o-indiano', name: 'O Indiano', english: 'The Indian', hint: 'Made a port on the coast of India.', spin: 'fortune',
    when: (c) => ms(c, 'india'), courts: { '*': { respect: 0.1 } }, patron: { crown: 0.15 }, opens: 'Malabar courts receive you as the Portuguese.', shut: 'Calicut remembers Gama.' },
  { id: 'do-fim', name: 'Do Fim', english: 'Of the Far End', hint: 'Made a port at Malacca.', spin: 'fortune',
    when: (c) => ms(c, 'malacca'), courts: { '*': { respect: 0.12 } }, opens: 'There is nowhere further.', shut: 'Nothing.' },
  { id: 'plantador', name: 'Plantador de Padrões', english: 'Planter of Padrões', hint: 'Three padrões raised on new coasts.', spin: 'fortune',
    when: (c) => ms(c, 'padroes'), courts: { '*': { respect: 0.05 }, pious: { trust: -0.04 } }, patron: { crown: 0.15 }, opens: 'The Casa counts the stones.', shut: 'Local courts count them too.' },
  { id: 'curtido', name: 'Curtido', english: 'Weathered', hint: 'Weathered three gales.', spin: 'sea',
    when: (c) => ms(c, 'gales'), hire: 0.9, opens: 'Hands trust the old man in the gale.', shut: 'Nothing.' },
  { id: 'muitos-portos', name: 'Homem de Muitos Portos', english: 'Man of Many Harbours', hint: 'Made twenty-five different ports.', spin: 'fortune',
    when: (c) => ms(c, 'ports25'), courts: { '*': { interest: 0.05 } }, opens: 'Every quay has a story about you.', shut: 'Nothing.' },
  { id: 'de-fortuna', name: 'Homem de Fortuna', english: 'A Man of Fortune', hint: 'Held five thousand cruzados at once.', spin: 'fortune',
    when: (c) => ms(c, 'purse5'), patron: { ruanova: 0.15 }, courts: { mercantile: { interest: 0.08 } }, opens: 'The Rua Nova pays you the compliment of its terms.', shut: 'Every court asks the price of a fortune.' },
];

export const TITLE_BY_ID = new Map(TITLES.map((t) => [t.id, t]));

export const titleCtx = (g: Pick<Game, 'ledger' | 'milestones'>): TitleCtx => ({ ledger: g.ledger, milestones: g.milestones });

/** Which titles the Ledger says are earned, in the order authored. */
export function earnedNow(c: TitleCtx): TitleDef[] {
  return TITLES.filter((t) => t.when(c));
}

// -- Word, and its distortion ---------------------------------------------------

const TELLER_OF: Record<Temper, Teller> = { mercantile: 'factors', pious: 'priests', warlike: 'soldiers', proud: 'courtiers', wary: 'sailors' };
export const tellerOf = (p: PolityDef): Teller => TELLER_OF[p.temper];

/**
 * How each teller carries each kind of deed. [line, trust, respect]. `{t}` is the title as the teller says it.
 * A mercy told by a soldier is weakness; a hard hand told by a factor is a butcher; a sold chart told by a priest is theft.
 */
const D = (line: string, trust: number, respect: number): [string, number, number] => [line, trust, respect];
export const DISTORT: Record<Spin, Record<Teller, [string, number, number]>> = {
  mercy: {
    factors: D('they say the captain {t} gives more away than he takes in, which is bad for the price of everything', 0.0, -0.01),
    priests: D('they say the captain {t} does what the Gospel asks, and the Church should know his name', 0.06, 0.02),
    soldiers: D('they say the captain {t} is soft, and will not hold a beach against a crowd', -0.02, -0.07),
    courtiers: D('they say the captain {t} is a man of feeling, which is useful to a court that wants a favour', 0.03, -0.02),
    sailors: D('they say the captain {t} looks after his people and does not leave men on a beach', 0.06, 0.03),
  },
  hard: {
    factors: D('they say the captain {t} is a butcher, and a quay he has visited does not trade for a month', -0.07, 0.02),
    priests: D('they say the captain {t} has blood on his hands, and the Church had best keep its distance', -0.06, -0.01),
    soldiers: D('they say the captain {t} knows how to command, and his orders are carried out', 0.0, 0.08),
    courtiers: D('they say the captain {t} is dangerous, and must be received with care', -0.02, 0.06),
    sailors: D('they say the captain {t} runs a hard ship, and his men do not talk about it', -0.03, 0.03),
  },
  honest: {
    factors: D('they say the captain {t} keeps his word to the grain, and a bargain with him stays made', 0.08, 0.02),
    priests: D('they say the captain {t} is an honest man, a rare thing among the Portuguese', 0.07, 0.02),
    soldiers: D('they say the captain {t} has kept faith when it cost him, and a man can stand beside that', 0.05, 0.04),
    courtiers: D('they say the captain {t} can be believed, and a court that can believe a stranger is lucky', 0.07, 0.01),
    sailors: D('they say the captain {t} is as good as his word, which no one has found yet to be false', 0.06, 0.02),
  },
  faith: {
    factors: D('they say the captain {t} presses the font on people who have come to trade, and that is bad for trade', -0.05, 0.0),
    priests: D('they say the captain {t} brings the faith to places that had none, and is blessed for it', 0.07, 0.03),
    soldiers: D('they say the captain {t} carries a priest and a gun, and the priest goes first', -0.03, 0.03),
    courtiers: D('they say the captain {t} baptises, and a ruler with a divided court should be careful of him', -0.06, 0.01),
    sailors: D('they say the captain {t} keeps a chaplain who is never idle', 0.0, 0.0),
  },
  trade: {
    factors: D('they say the captain {t} knows the worth of a thing and does not cheat on it', 0.07, 0.02),
    priests: D('they say the captain {t} is a merchant, and what he does is between him and his weights', 0.0, 0.0),
    soldiers: D('they say the captain {t} is a counting-house man who has learned to stand in a boat', -0.01, -0.03),
    courtiers: D('they say the captain {t} is rich, and what is rich can be taxed', 0.0, 0.02),
    sailors: D('they say the captain {t} pays on the day and does not argue the price of a hand', 0.05, 0.02),
  },
  sea: {
    factors: D('they say the captain {t} gets the cargo home, which is the only thing a factor asks', 0.05, 0.03),
    priests: D('they say the captain {t} has been to the end of the world and come back, and God was with him', 0.04, 0.04),
    soldiers: D('they say the captain {t} has taken a ship through what would have killed a better man', 0.03, 0.07),
    courtiers: D('they say the captain {t} has seen what the King’s council has only drawn', 0.02, 0.06),
    sailors: D('they say the captain {t} is a seaman, and the coast is better pilotted for knowing him', 0.07, 0.07),
  },
  shame: {
    factors: D('they say the captain {t}, and a factor’s hand goes to the weights when he is mentioned', -0.08, -0.02),
    priests: D('they say the captain {t}, and the Church had best pray for him', -0.07, -0.03),
    soldiers: D('they say the captain {t}, and a man like that does not stay on a beach when it matters', -0.06, -0.05),
    courtiers: D('they say the captain {t}, and the court will not be seen to receive him gladly', -0.08, -0.04),
    sailors: D('they say the captain {t}, and no hand signs on with him who has a choice', -0.06, -0.03),
  },
  fortune: {
    factors: D('they say the captain {t} has a name that opens doors, and doors cost money', 0.02, 0.04),
    priests: D('they say the captain {t} is favoured by fortune, which is not the same as by God', 0.0, 0.02),
    soldiers: D('they say the captain {t} has a name, which is worth something on a beach', 0.01, 0.06),
    courtiers: D('they say the captain {t} is someone, and a court likes to know someone', 0.03, 0.06),
    sailors: D('they say the captain {t}, and every quay knows him', 0.04, 0.05),
  },
};

const DAY = 86400;
/** Word runs a port a month: days from where it was earned to this court, by the road. */
export function wordDays(fromPort: string, pol: PolityDef): number {
  let a = 0, b = 0;
  try { a = along(anchorageOf(portDef(fromPort || 'lisboa'))); b = along(anchorageOf(portDef(pol.seat))); } catch { /* off the road */ }
  return clamp(25 + Math.abs(a - b) / 23, 25, 400);
}

/** The line a teller says of a title, with the captain’s name when it is known. */
export function toldBy(title: TitleDef, teller: Teller, who = ''): string {
  const [line] = DISTORT[title.spin][teller];
  const nm = title.english.replace(/^The /, 'the ');
  return line.replace('{t}', `${who ? who + ', ' : ''}${nm}`.replace(/^, /, ''));
}

/** Put a newly earned title’s word on the road: one item per court, each as its own teller tells it, arriving late. */
export function announceTitle(g: Game, id: string, place: string): void {
  const t = TITLE_BY_ID.get(id);
  if (!t) return;
  for (const p of POLITIES) {
    const teller = tellerOf(p);
    const [, tr, re] = DISTORT[t.spin][teller];
    g.diplomacy.word.push({
      polity: p.id, arrive: g.clock.t + wordDays(place, p) * DAY, trust: tr, respect: re,
      text: `${toldBy(t, teller, g.identity.name ? g.identity.name.split(' ')[0] : '')}.`,
    });
  }
}

/** Fold the Ledger into earned titles; announce each new one once. Called as the days pass. */
export function tickTitles(g: Game): string[] {
  const got: string[] = [];
  const have = g.identity.titles;
  for (const t of earnedNow(titleCtx(g))) {
    if (have[t.id]) continue;
    have[t.id] = { t: g.clock.t, place: g.dockedAt ?? '' };
    got.push(t.id);
    record(g, 'title.earned', { target: t.name, magnitude: 0.5, note: `${t.english}: ${t.hint}`, data: { title: t.id } });
    g.identity.announced.push(t.id);
    announceTitle(g, t.id, g.dockedAt ?? '');
    // Three at most: the first earned ones are put on if there is room, so the screen never opens empty.
    if (g.identity.worn.length < 3) g.identity.worn.push(t.id);
  }
  return got;
}

export function wear(g: Game, id: string): { ok: boolean; text: string } {
  const t = TITLE_BY_ID.get(id);
  if (!t || !g.identity.titles[id]) return { ok: false, text: 'That is not yours to wear.' };
  if (g.identity.worn.includes(id)) return { ok: false, text: 'Already worn.' };
  if (g.identity.worn.length >= 3) return { ok: false, text: 'Three at most. Put one off first.' };
  g.identity.worn.push(id);
  record(g, 'title.worn', { target: t.english, note: `Put on ${t.english}.`, silent: true });
  return { ok: true, text: `You wear ${t.english}.` };
}

export function putOff(g: Game, id: string): void {
  g.identity.worn = g.identity.worn.filter((x) => x !== id);
}

// -- What a worn title does -----------------------------------------------------

/** Whether this court has had time to hear of a title that was earned where and when it was. */
export function heardAt(g: Pick<Game, 'clock' | 'identity'>, titleId: string, pol: PolityDef): boolean {
  const r = g.identity.titles[titleId];
  if (!r) return false;
  return g.clock.t >= r.t + wordDays(r.place, pol) * DAY;
}

/** The edge the captain’s worn titles give or take at a court that has heard of them. */
export function titleEdge(g: Pick<Game, 'clock' | 'identity'>, polityId: string): Required<Delta> {
  const out = { trust: 0, respect: 0, interest: 0 };
  const pol = POLITY_BY_ID.get(polityId);
  if (!pol) return out;
  for (const id of g.identity.worn) {
    const t = TITLE_BY_ID.get(id);
    if (!t?.courts || !heardAt(g, id, pol)) continue;
    for (const key of ['*', pol.temper, pol.id]) {
      const d = t.courts[key];
      if (d) { out.trust += d.trust ?? 0; out.respect += d.respect ?? 0; out.interest += d.interest ?? 0; }
    }
  }
  return { trust: clamp(out.trust, -0.5, 0.5), respect: clamp(out.respect, -0.5, 0.5), interest: clamp(out.interest, -0.5, 0.5) };
}

export function titleEdgeAtPort(g: Pick<Game, 'clock' | 'identity'>, port: string): Required<Delta> {
  const p = polityOfPort(port);
  return p ? titleEdge(g, p.id) : { trust: 0, respect: 0, interest: 0 };
}

export function titleWageMult(g: Pick<Game, 'identity'>): number {
  return g.identity.worn.reduce((m, id) => m * (TITLE_BY_ID.get(id)?.hire ?? 1), 1);
}

export function titlePatronEdge(g: Pick<Game, 'identity'>, p: PatronId): number {
  return g.identity.worn.reduce((s, id) => s + (TITLE_BY_ID.get(id)?.patron?.[p] ?? 0), 0);
}

export function titleShuts(g: Pick<Game, 'identity'>, p: PatronId): string | null {
  for (const id of g.identity.worn) {
    const t = TITLE_BY_ID.get(id);
    if (t?.shuts?.includes(p)) return `${t.english} is on your name, and it shuts this door.`;
  }
  return null;
}


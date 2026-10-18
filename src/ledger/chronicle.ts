import { POLITY_BY_ID, type Temper } from '../diplomacy/polities';
import { dateOf, nameOf, placeName, type Entry } from './ledger';
import { TAGS, type Tag } from './tags';

/**
 * The Two Chronicles.
 *
 * At the end of a career Lisbon writes its account of the captain, and each
 * polity the Ledger says mattered writes its own, and they do not agree. Both
 * are generated from the Ledger: authored phrases per family of tags, chosen
 * and numbered by what the entries actually say. A career that left no entry
 * in a family says nothing of it; there is no generic filler.
 *
 * The tags each voice reads are listed with its phrases (`LISBON`, `POLITY`),
 * and `scripts/ledger.ts` checks the `readers` in `tags.ts` against them.
 */

export interface Chronicle {
  id: string;
  title: string;
  /** One line under the title: who is writing. */
  byline: string;
  lines: string[];
}

type Counts = (t: Tag) => number;
interface Voice {
  tags: Tag[];
  say(c: Counts, es: Entry[]): string[];
}

const times = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const listOf = (xs: string[]): string => {
  const u = [...new Set(xs)].slice(0, 3);
  if (u.length <= 1) return u[0] ?? '';
  return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
};

// -- Lisbon -----------------------------------------------------------------

const LISBON: Voice[] = [
  {
    tags: ['voyage.home'],
    say: (c) => c('voyage.home') > 0
      ? [`The Casa has him entered as returned ${times(c('voyage.home'))}, and the clerks have stopped asking where from.`]
      : [],
  },
  {
    tags: ['promise.kept', 'promise.broken', 'weights.false', 'weights.fair', 'gift.great', 'gift.insult'],
    say: (c) => {
      const k = c('promise.kept'), b = c('promise.broken');
      const out: string[] = [];
      if (k + b > 0) {
        out.push(b === 0
          ? `Our factors on the coast report that he kept his word to the courts, ${times(k)} that they counted, and broke it to none.`
          : k === 0
            ? `Our factors report that he gave his word to the courts and broke it ${times(b)}, which they do not say lightly of a servant of the King.`
            : `Our factors report that he kept his word to the courts ${times(k)} and broke it ${times(b)}; ${b > k ? 'the breaking is what the coast remembers' : 'the keeping is what the coast remembers'}.`);
      }
      const wf = c('weights.false'), wr = c('weights.fair');
      if (wf > 0) out.push(`He is said to have shaded the scales on the gold coast${wr ? ', though he dealt fair at other times' : ''}.`);
      else if (wr > 0) out.push('He dealt by honest weights where shading would have been easy, which the gold traders noticed and the Casa did not.');
      const gg = c('gift.great'), gi = c('gift.insult');
      if (gg + gi > 0) out.push(`His gifts were praised at ${plural(gg, 'court', 'courts')} and mocked at ${plural(gi, 'court', 'courts')}; the tray cost the Casa more than it was told.`);
      return out;
    },
  },
  {
    tags: ['commission.delivered', 'commission.failed', 'contract.kept', 'contract.broken'],
    say: (c) => {
      const d = c('commission.delivered'), f = c('commission.failed'), ck = c('contract.kept'), cb = c('contract.broken');
      const out: string[] = [];
      if (d + f > 0) {
        out.push(`The Rua Nova has him down for ${plural(d, 'charter', 'charters')} discharged and ${plural(f, 'charter', 'charters')} broken`
          + (f > d ? ', and the street does not forgive arithmetic like that.' : f === 0 ? ', which is rare enough to be remarked on.' : '.'));
      }
      if (ck + cb > 0) out.push(`The Houses count ${plural(ck, 'contract', 'contracts')} delivered and ${cb} run out undelivered.`);
      return out;
    },
  },
  {
    tags: ['smuggle.caught', 'order.breached'],
    say: (c) => {
      const out: string[] = [];
      if (c('smuggle.caught') > 0) out.push(`The weigh-house fined him ${times(c('smuggle.caught'))} for goods not in the book, and the file has not been closed.`);
      if (c('order.breached') > 0) out.push(`The clerk who watched him let an interloper pass against his commission wrote it down ${times(c('order.breached'))}.`);
      return out;
    },
  },
  {
    tags: ['chart.sold', 'chart.shared'],
    say: (c) => {
      const out: string[] = [];
      if (c('chart.sold') > 0) out.push(`He sold his sheets of the coast to foreign hands ${times(c('chart.sold'))}; the Casa has the receipts it was not given.`);
      if (c('chart.shared') > 0) out.push(`He gave the Casa his sheets and his roteiros ${times(c('chart.shared'))} without being pressed.`);
      return out;
    },
  },
  {
    tags: ['landfall.exact', 'landfall.lost'],
    say: (c) => {
      const e = c('landfall.exact'), l = c('landfall.lost');
      if (e + l === 0) return [];
      return [`The pilots at the Armazém say his reckoning raised its port within a few miles ${times(e)}, and was a day’s sail out ${times(l)}.`];
    },
  },
  {
    tags: ['claim.made', 'claim.lost', 'south.beyond', 'lane.opened', 'port.funded'],
    say: (c, es) => {
      const out: string[] = [];
      const names = (tag: Tag): string[] => es.filter((e) => e.tag === tag).map((e) => nameOf(e.target));
      if (c('claim.made') > 0) out.push(`He raised ${plural(c('claim.made'), 'pillar', 'pillars')} for the Crown, at ${listOf(names('claim.made'))}.`);
      if (c('claim.lost') > 0) out.push(`The rival’s name stands on ${plural(c('claim.lost'), 'coast', 'coasts')} he might have had: ${listOf(names('claim.lost'))}.`);
      if (c('south.beyond') > 0) out.push('He was the first out of Lisbon to pass the furthest south any Christian had been, and the Casa does not forget a thing like that.');
      if (c('lane.opened') > 0) out.push(`He opened the road inland at ${listOf(names('lane.opened'))}.`);
      if (c('port.funded') > 0) out.push(`He put Houses at ${listOf(names('port.funded'))}, and the factors there are paid out of Lisbon.`);
      return out;
    },
  },
  {
    tags: ['crown.reported', 'patent.completed', 'patron.honest', 'patron.flattered'],
    say: (c) => {
      const out: string[] = [];
      if (c('patent.completed') > 0) out.push(`He discharged ${plural(c('patent.completed'), 'commission', 'commissions')} for the Crown, and the King has a long memory for who gave him what he asked.`);
      if (c('crown.reported') > 0) out.push(`He reported to the King’s factor ${times(c('crown.reported'))} on the coast, so that what he found did not wait for Lisbon.`);
      if (c('patron.honest') > 0) out.push('He told the King the plain truth once, in a letter, and the King kept the letter.');
      if (c('patron.flattered') > 0) out.push('He sent the King a cheerful letter once, and the man who read it over his shoulder never forgot it.');
      return out;
    },
  },
  {
    tags: ['loan.taken', 'loan.repaid', 'loan.defaulted'],
    say: (c) => {
      const t = c('loan.taken'), r = c('loan.repaid'), d = c('loan.defaulted');
      if (t + r + d === 0) return [];
      return [d > 0
        ? `He drew on the Rua Nova ${times(t)}, and ${plural(d, 'bad debt', 'bad debts')} stand against his name in a book that is never closed.`
        : `He drew on the Rua Nova ${times(t)} and paid ${times(r)}; the houses would write him paper on a nod.`];
    },
  },
  {
    tags: ['ship.stopped', 'ship.spared', 'ship.succoured', 'ship.abandoned'],
    say: (c) => {
      const s = c('ship.stopped'), p = c('ship.spared'), h = c('ship.succoured'), a = c('ship.abandoned');
      if (s + p + h + a === 0) return [];
      const bits: string[] = [];
      if (s) bits.push(`${plural(s, 'deposition', 'depositions')} of ships taken`);
      if (p) bits.push(`${plural(p, 'ship', 'ships')} warned off or let pass`);
      if (h) bits.push(`${plural(h, 'ship', 'ships')} helped in distress`);
      if (a) bits.push(`${plural(a, 'ship', 'ships')} he held his course past`);
      return [`At sea the Casa has on file ${bits.join(', ')}.`];
    },
  },
];

// -- The polities ------------------------------------------------------------

const FRAME: Record<Temper, { friend: string; foe: string; mixed: string }> = {
  proud: {
    friend: 'did not think much of the Portuguese, and thought better of this one',
    foe: 'does not forgive being made small in its own hall, and he made it small',
    mixed: 'weighed him as it weighs every stranger, and has not finished weighing',
  },
  pious: {
    friend: 'gave thanks that the Franks sent one who respected the house of God',
    foe: 'prayed for his departure, and counts it among the mercies of the year',
    mixed: 'asked the qadis and the priests what he was, and received two answers',
  },
  mercantile: {
    friend: 'kept his account in the good book, where honest buyers are entered',
    foe: 'wrote his name in the bad book, where it will be read by the next ship’s factor',
    mixed: 'entered him as a buyer of middling reliability',
  },
  wary: {
    friend: 'watched him a long time, and found nothing to be afraid of',
    foe: 'watched him a long time, and found what it was afraid of',
    mixed: 'is still watching him, and will say nothing until it has finished',
  },
  warlike: {
    friend: 'would have him at its side in a quarrel, and says so',
    foe: 'has his name on a list of men to be remembered at the proper time',
    mixed: 'measured him as a fighting man and found him neither soft nor dangerous',
  },
};

const POLITY: Voice[] = [
  {
    tags: ['promise.kept', 'promise.broken', 'weights.false', 'weights.fair'],
    say: (c) => {
      const k = c('promise.kept'), b = c('promise.broken'), wf = c('weights.false'), wr = c('weights.fair');
      const out: string[] = [];
      if (k + b > 0) {
        out.push(b === 0 ? `He kept his word to them ${times(k)}.`
          : k === 0 ? `He gave his word and broke it ${times(b)}.`
            : `He kept his word ${times(k)} and broke it ${times(b)}, and they remember the broken ones in more detail.`);
      }
      if (wf > 0) out.push('The scales on the beach were not his friends.');
      if (wr > 0) out.push('He weighed fair, and they say so.');
      return out;
    },
  },
  {
    tags: ['courtesy.kept', 'courtesy.broken', 'table.kept', 'table.spoiled', 'gift.great', 'gift.insult'],
    say: (c) => {
      const out: string[] = [];
      if (c('courtesy.kept')) out.push('He asked how to greet them before he did it.');
      if (c('courtesy.broken')) out.push('He stood where a stranger should have bowed, and they have not forgotten.');
      if (c('table.kept')) out.push('He kept their table like a guest of the house.');
      if (c('table.spoiled')) out.push('His manners at their table were noticed, and not repeated to his face.');
      if (c('gift.great')) out.push('His gifts were what they would have asked for.');
      if (c('gift.insult')) out.push('His gifts were mocked, and the tray is a story they tell.');
      return out;
    },
  },
  {
    tags: ['peace.made', 'peace.left', 'judgement.just', 'judgement.unjust'],
    say: (c) => {
      const out: string[] = [];
      if (c('peace.made')) out.push('He carried proposals between them and their neighbour, and a peace was made.');
      if (c('peace.left')) out.push('He came between them and their neighbour and left the quarrel as he found it.');
      if (c('judgement.just')) out.push('He judged as a man of law, in the open court.');
      if (c('judgement.unjust')) out.push('His ruling did not survive a second look.');
      return out;
    },
  },
  {
    tags: ['hostage.freed', 'hostage.raised', 'hostage.ill', 'hostage.died'],
    say: (c) => {
      const out: string[] = [];
      if (c('hostage.raised')) out.push('A boy of the house grew up in his care, and was well, and is called a son of two houses.');
      if (c('hostage.freed')) out.push('He let the boy go, and what it cost him is known here.');
      if (c('hostage.ill')) out.push('The boy lived, but his father counts the winter he was ill.');
      if (c('hostage.died')) out.push('A son of the house died in his keeping, and he is counted among the killers.');
      return out;
    },
  },
  {
    tags: ['pilot.trusted', 'pilot.misled', 'silent.fair', 'silent.blood', 'informer.found', 'informer.wronged', 'refusal.honest'],
    say: (c) => {
      const out: string[] = [];
      if (c('pilot.trusted')) out.push('He read the pilot right.');
      if (c('pilot.misled')) out.push('He followed a pilot who did not know his own sea, and it is told as a joke.');
      if (c('silent.fair')) out.push('On the mat he dealt fairly, and a good name went along the coast ahead of him.');
      if (c('silent.blood')) out.push('Blood was shed on the beach, and the next ship to land is met with distrust.');
      if (c('informer.found')) out.push('He saw what their own court had not, the rival’s man in the house.');
      if (c('informer.wronged')) out.push('He named an innocent man, whose family has not forgotten.');
      if (c('refusal.honest')) out.push('He refused them honestly, and kept the friend.');
      return out;
    },
  },
  {
    tags: ['ship.stopped', 'ship.spared', 'ship.succoured', 'ship.abandoned'],
    say: (c) => {
      const out: string[] = [];
      if (c('ship.stopped')) out.push(`Their ships were stopped and carried ${times(c('ship.stopped'))}.`);
      if (c('ship.spared')) out.push(`Their ships were let pass ${times(c('ship.spared'))}.`);
      if (c('ship.succoured')) out.push('Their people were helped in distress, and say so.');
      if (c('ship.abandoned')) out.push('Their people were left in distress, and say so.');
      return out;
    },
  },
  {
    tags: ['mark.for', 'mark.against', 'envoy.mixed'],
    say: (c) => {
      const out: string[] = [];
      if (c('mark.for')) out.push('There is something in his favour in the court’s book.');
      if (c('mark.against')) out.push('There is something against him in the court’s book.');
      if (c('envoy.mixed')) out.push('Their envoy came home from Lisbon and said little.');
      return out;
    },
  },
];

/** Tags each voice reads; the falsifier checks these against `readers` in tags.ts. */
export function chronicleTags(voice: 'lisbon' | 'polity'): Tag[] {
  return (voice === 'lisbon' ? LISBON : POLITY).flatMap((v) => v.tags);
}

/** The roll of the dead reads these. */
export const MUSTER_TAGS: Tag[] = ['hand.died', 'hand.hanged', 'officer.died', 'journey.lost'];

// -- Putting them together ---------------------------------------------------

function countsOf(es: Entry[]): Counts {
  const m = new Map<Tag, number>();
  for (const e of es) m.set(e.tag, (m.get(e.tag) ?? 0) + 1);
  return (t) => m.get(t) ?? 0;
}

function saysFor(voices: Voice[], es: Entry[]): string[] {
  const out: string[] = [];
  for (const v of voices) {
    const mine = es.filter((e) => v.tags.includes(e.tag));
    if (mine.length === 0) continue;
    out.push(...v.say(countsOf(mine), mine));
  }
  return out;
}

/** How the entries read for the captain's name: tone times weight, summed. */
export function sentiment(es: Entry[]): number {
  return es.reduce((s, e) => s + TAGS[e.tag].tone * Math.max(0.2, e.magnitude), 0);
}

/** How much a polity has to say: the sum of what it was done. */
function weight(es: Entry[]): number {
  return es.reduce((s, e) => s + Math.abs(TAGS[e.tag].tone) * Math.max(0.2, e.magnitude), 0);
}

const POLITY_TAGS = new Set(chronicleTags('polity'));

export interface Chronicles {
  lisbon: Chronicle;
  others: Chronicle[];
}

export function chronicles(ledger: Entry[], captain: string): Chronicles {
  // Lisbon sees the whole career.
  const lisbonLines = saysFor(LISBON, ledger);
  const net = sentiment(ledger.filter((e) => LISBON.some((v) => v.tags.includes(e.tag))));
  const verdict = lisbonLines.length === 0
    ? 'The Casa has nothing of him on file but the dates.'
    : net > 3 ? `On the whole the Casa is content with ${captain}, and says so in the minute.`
      : net < -3 ? `On the whole the Casa would sooner not have the name of ${captain} in the minute, and has entered it anyway.`
        : `The Casa’s minute on ${captain} is a long one, and has no conclusion.`;
  const lisbon: Chronicle = {
    id: 'lisbon', title: 'Lisbon’s account', byline: 'As the Casa da Índia entered it', lines: [...lisbonLines, verdict],
  };

  // Each polity writes only of what was done to it.
  const byPolity = new Map<string, Entry[]>();
  for (const e of ledger) {
    if (!POLITY_BY_ID.has(e.target) || !POLITY_TAGS.has(e.tag)) continue;
    const l = byPolity.get(e.target) ?? [];
    l.push(e);
    byPolity.set(e.target, l);
  }
  const ranked = [...byPolity.entries()]
    .map(([id, es]) => ({ id, es, w: weight(es) }))
    .filter((x) => x.w >= 0.5)
    .sort((a, b) => b.w - a.w || a.id.localeCompare(b.id))
    .slice(0, 6);

  const others: Chronicle[] = ranked.map(({ id, es }) => {
    const pol = POLITY_BY_ID.get(id)!;
    const s = sentiment(es);
    const kind = s > 0.6 ? 'friend' : s < -0.6 ? 'foe' : 'mixed';
    const lines = [
      `${pol.name} ${FRAME[pol.temper][kind]}.`,
      ...saysFor(POLITY, es),
    ];
    // The one line their chronicle keeps in its own words: the heaviest entry's note.
    const heavy = [...es].sort((a, b) => Math.abs(TAGS[b.tag].tone) * b.magnitude - Math.abs(TAGS[a.tag].tone) * a.magnitude)[0];
    if (heavy?.note) lines.push(`Their record has it so: “${heavy.note}” (${dateOf(heavy)}${heavy.place ? `, ${placeName(heavy.place)}` : ''}).`);
    return {
      id, title: `${pol.name}’s account`, byline: `As ${pol.title === 'Sultan' ? 'the sultan’s clerks' : 'the court'} at ${placeName(pol.seat)} told it`,
      lines,
    };
  });
  return { lisbon, others };
}

// -- The muster roll ---------------------------------------------------------

export interface Muster {
  /** Men the captain knew by name who died, with how and when. */
  named: { name: string; fate: string; t: number; place: string }[];
  /** Everyone who died, by the Ledger's count. */
  total: number;
  /** Of whom nobody wrote the name. */
  unnamed: number;
}

export function muster(ledger: Entry[]): Muster {
  const named: Muster['named'] = [];
  const seen = new Set<string>();
  let total = 0;
  const add = (name: string, e: Entry): void => {
    if (seen.has(name)) return;
    seen.add(name);
    named.push({ name, fate: e.note, t: e.t, place: e.place });
  };
  for (const e of ledger) {
    if (e.tag === 'hand.died') {
      total += Math.round(e.magnitude);
      for (const n of e.actors) if (n !== 'captain') add(n, e);
    } else if (e.tag === 'hand.hanged') {
      total += 1;
      add(e.target, e);
    } else if (e.tag === 'officer.died') {
      total += 1;
      add(e.target, e);
    } else if (e.tag === 'journey.lost') {
      total += 1;
      add(e.target, e);
    }
  }
  return { named, total, unnamed: Math.max(0, total - named.length) };
}

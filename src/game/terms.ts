import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { GOOD_BY_ID } from '../economy/goods';
import { shiftAll } from '../crew/hands';
import { POLITY_BY_ID } from '../diplomacy/polities';
import { DISTORT, tellerOf, wordDays } from '../identity/titles';
import type { Tag } from '../ledger/tags';
import { announce, hops, reaches, rumourFact } from '../world/powers/rumours';
import { powerOfName } from '../world/powers/core';
import { portsNear } from '../world/ports';
import { hullClass } from '../ship/hull';
import { NATION_NAME, seaRegionAt, type Stranger } from './encounter';
import type { SeaChoice, SeaEvent } from './seaEvents';
import type { Game } from './state';
import {
  CULTURES, TEMPER_LINE, cargoLine, cargoValue, holdsPass, infoOf, masterById, regardParts, regardWord,
  type MasterInfo, type MasterRec, type Passenger,
} from './strangers';

/**
 * Terms (BUILD_PLAN D7): what a captain may do about a master he has hailed.
 *
 * A hail used to be a menu: ask the news, ask a position, send letters, dip the colours. It is now a person with a
 * name, a house, a temper and often somebody aboard on an errand, and the menu is what the captain may do about HIM:
 *
 *   parley      talk. The news is a rumour told by him, and he is the source on the Fact.
 *   search      look at the papers and the hold. By the Rule's stage and the clause `cartaz recognised` this is a
 *               courtesy that honours his pass, an affront, or a stopping by another name.
 *   pass        let him go; with a gift; with a pass written in the King's name; or for a toll (the Rule at a
 *               stage where friends have passes).
 *   stop        stop him under the Rule. Only when the Rule stands at its third stage or more, and never to a ship
 *               whose court honours the cartaz or which holds the captain's pass.
 *
 * Nothing here is combat. Every term writes the Ledger (existing tags where there is one: ship.stopped, ship.spared,
 * pass.granted, courtesy.*, gift.*; and passenger.* / toll.taken / master.met from tagsStrangers), stamps the entry
 * with the master's id so he is the same man next time, and moves the Powers through the tables that already exist.
 * Word of what was done runs to the courts of the Rule's waters (`sendWord`), told as each court tells it.
 */

export interface TermHelpers {
  /** His pilot's reckoning (hailing.askThePosition). */
  position: (g: Game, quality: number) => string;
  /** What she shouts across first, by flag (hailing.hailFrom). */
  shout: (nation: string) => string;
}

export type TermId = 'parley' | 'search' | 'pass' | 'gift' | 'licence' | 'toll' | 'stop';
export const TERM_ORDER: TermId[] = ['parley', 'search', 'pass', 'gift', 'licence', 'toll', 'stop'];

/** The Rule's waters: where the Rule is a thing that happens to ships. */
export const RULE_REGIONS = new Set(['swahili', 'arabian', 'crossing', 'gujarat', 'malabar']);
export const inRuleWaters = (s: Pick<Stranger, 'pos'>): boolean => RULE_REGIONS.has(seaRegionAt(s.pos));
export const ruleStageOf = (g: Pick<Game, 'powers'>): number => g.powers?.fronts.rule.stage ?? 1;

const SPICES = new Set(['pimenta', 'cravo', 'noz', 'maca', 'canela', 'gengibre', 'cardamomo']);
const DAY = 86400;

const nearPort = (s: Stranger): string => portsNear(s.pos, 3000)[0]?.def.id ?? '';
const recOf = (g: Game, info: MasterInfo): MasterRec | undefined => masterById(g.seed, info.id);

/** Which terms the stranger's master may be offered, by the Rule's stage and the clauses. Pure. */
export function termsOffered(g: Game, s: Stranger): TermId[] {
  const info = s.masterInfo;
  if (!info || s.rival) return [];
  const rule = inRuleWaters(s);
  const stage = ruleStageOf(g);
  const pass = holdsPass(g, { id: info.id, polity: info.polity });
  const out: TermId[] = ['parley'];
  if (rule) out.push('search');
  out.push('pass', 'gift');
  if (rule && stage >= 2 && !pass) out.push('licence', 'toll');
  if (rule && stage >= 3 && !pass) out.push('stop');
  return out;
}

// -----------------------------------------------------------------------------
// The Ledger, stamped

function deed(g: Game, s: Stranger, tag: Tag, magnitude: number, note: string, o: { silent?: boolean; data?: Record<string, number | string> } = {}): void {
  const info = s.masterInfo!;
  g.noteDeed(tag, {
    target: info.polity, magnitude, note, witnesses: [info.name], silent: o.silent ?? true,
    data: { master: info.id, near: nearPort(s), ...(o.data ?? {}) },
  });
}

const captainName = (g: Game): string => (g.identity.name ? g.identity.name.split(' ')[0] : 'the captain');

const SPIN_OF: Partial<Record<Tag, 'hard' | 'mercy' | 'honest'>> = {
  'ship.stopped': 'hard', 'toll.taken': 'hard', 'passenger.delayed': 'hard', 'ship.repulsed': 'hard',
  'ship.spared': 'mercy', 'ship.succoured': 'mercy', 'passenger.aided': 'mercy', 'pass.granted': 'honest',
};

/**
 * Word runs ahead. The deed becomes (1) a rumour the captain may hear again at a later port, told by a kind of
 * teller, and (2) news at each of the Rule’s courts, told as THAT court tells it (the Titles’ distortion
 * table: a stop told by a factor is a butcher’s, by a soldier a commander’s) and arriving as the road
 * allows. Only in the Rule’s waters: the Atlantic keeps its own accounts.
 */
const RULE_COURTS = ['kilwa', 'mombasa', 'malindi', 'calicut', 'cochin', 'kolathiri', 'gujarat', 'aden', 'hormuz'];

export function sendWord(g: Game, s: Stranger, tag: Tag, what: string): void {
  const info = s.masterInfo;
  if (!info || !inRuleWaters(s)) return;
  const spin = SPIN_OF[tag];
  if (!spin) return;
  const near = nearPort(s);
  const me = captainName(g);
  const power = powerOfName(info.polity) ?? undefined;
  if (g.powers && near) {
    const rng = Rng.fromString(`word:${g.seed}:${g.ledger.length}`);
    const hard = spin === 'hard';
    announce(g.powers, rng, g.clock.t, {
      event: `word:${tag}:${info.id}`, place: near, power, front: 'rule', window: 8,
      truth: { claim: `${info.name}, master of ${s.name} of ${info.homeName}, says the Portuguese ship ${what}.`, vague: `A master out of ${info.homeName} has a tale of the Portuguese ship.` },
      falsehood: hard ? { claim: `${info.name} of ${info.homeName} says the Portuguese ship stripped his hold and kept his people.`, vague: 'They say the Portuguese ship strips what she stops.' } : undefined,
      stale: undefined,
    });
  }
  // Each court hears it as that court tells it.
  const courts = RULE_COURTS.map((id) => POLITY_BY_ID.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ p, days: wordDays(near || info.home, p) }))
    .sort((a, b) => a.days - b.days).slice(0, 5);
  for (const { p, days } of courts) {
    const home = p.id === info.polity;
    const [line, trust, respect] = DISTORT[spin][tellerOf(p)];
    g.diplomacy.word.push({
      polity: p.id, arrive: g.clock.t + days * DAY * (home ? 0.6 : 1),
      trust: trust * (home ? 1 : 0.5), respect: respect * (home ? 1 : 0.5),
      text: `${info.name} of ${info.homeName} says it at every quay: ${line.replace('{t}', me)}.`,
    });
  }
}

const WHAT: Partial<Record<Tag, string>> = {
  'ship.stopped': 'was boarded and carried', 'ship.spared': 'was warned off and let go', 'ship.succoured': 'was helped under way',
  'ship.repulsed': 'drove off the King\u2019s boats', 'ship.abandoned': 'was passed by in distress', 'ship.ransomed': 'was paid off',
};

/** Stamp what an old option wrote with the master's id, and send word of it. */
function stampSince(g: Game, s: Stranger, from: number): void {
  const info = s.masterInfo!;
  for (let i = from; i < g.ledger.length; i++) {
    const e = g.ledger[i];
    if (!e.tag.startsWith('ship.')) continue;
    e.data = { ...(e.data ?? {}), master: info.id, near: nearPort(s) };
    if (!e.witnesses.includes(info.name)) e.witnesses.push(info.name);
    sendWord(g, s, e.tag, WHAT[e.tag] ?? 'met the King\u2019s ship');
  }
}

// -----------------------------------------------------------------------------
// What he says first

function recognition(g: Game, s: Stranger): string {
  const info = s.masterInfo!;
  const mem = g.ledger.filter((e) => e.data?.master === info.id && e.tag !== 'master.met');
  const r = info.regard;
  const last = mem[mem.length - 1];
  const parts = regardParts(g, { id: info.id, polity: info.polity, home: info.home, temper: info.temper });
  if (last) {
    const bad = last.tag === 'ship.stopped' || last.tag === 'toll.taken' || last.tag === 'passenger.delayed' || last.tag === 'courtesy.broken' || last.tag === 'ship.repulsed';
    const good = last.tag === 'ship.spared' || last.tag === 'ship.succoured' || last.tag === 'pass.granted' || last.tag === 'passenger.aided' || last.tag === 'courtesy.kept' || last.tag === 'gift.great';
    if (bad) return r <= -0.45
      ? `${info.name} knows the ship. He has been looking at her for an hour with his hand on the tiller, and he does not come about; he has not forgotten ${last.note.replace(/\.$/, '').toLowerCase()}.`
      : `${info.name} knows the ship, and is civil in the way of a man who remembers how he was last treated.`;
    if (good) return r >= 0.45
      ? `${info.name} has a man at the rail with an arm raised before she is within hail. He has not forgotten that he was let go, and says so, loudly, in two languages.`
      : `${info.name} knows the ship and comes to the wind to be spoken.`;
  }
  if (parts.word <= -0.1) return `${info.name} has heard of this ship, and not from you. He has the look of a man who has been told what to expect.`;
  if (parts.word >= 0.1) return `${info.name} has heard of this ship at his last port, and what he heard was good enough to bring him down to be spoken.`;
  return `${info.name}, master of ${s.name}, comes up into the wind a cable to leeward and waits to be asked.`;
}

export function readLine(info: MasterInfo): string {
  const t = TEMPER_LINE[info.temper];
  if (info.metBefore > 0) return `${t} Spoken ${info.metBefore === 1 ? 'once' : `${info.metBefore} times`} before; ${regardWord(info.regard)} toward you.`;
  if (Math.abs(info.regard) >= 0.1) return `${t} He has heard of the ship; ${regardWord(info.regard)}.`;
  return t;
}

// -----------------------------------------------------------------------------
// The terms

/** News, told by him: a rumour that has reached his circuit, with his name on the Fact. */
function newsFrom(g: Game, s: Stranger, favourFalse: boolean): { said: string; got: boolean } {
  const info = s.masterInfo!;
  const st = g.powers;
  if (st) {
    const port = info.home || nearPort(s);
    const open = st.rumours.filter((r) => !r.heard && port && reaches(r, port, g.clock.t));
    const pick = (truth: boolean): typeof open[number] | undefined => open.find((r) => (r.truth === 'true') === truth);
    const r = (favourFalse ? pick(false) : pick(true)) ?? open[0];
    if (r) {
      r.heard = { t: g.clock.t, port, hops: hops(r.place, port) };
      r.via = `${info.name}, master of ${s.name}`;
      const f = rumourFact(r, g.clock.t);
      g.pushAlert(`Word from ${info.name}: ${f.claim}`, 'note');
      g.logEvent('note', `${info.name} of ${info.homeName}, speaking from his deck: ${f.claim}`, true);
      return { said: `He talks while the boats lie alongside, and the Book has one thing from it: ${f.claim}`, got: true };
    }
  }
  // Nothing on his circuit the captain has not heard: the old way, with his name on it.
  const before = g.leads.length;
  const got = g.hearFromStranger();
  if (got && g.leads.length > before) g.leads[g.leads.length - 1].source = `${info.name}, master of ${s.name}`;
  return {
    said: got ? 'An hour across fifty yards of water, and one thing worth the writing down.' : 'Prices, weather and who has died. Nothing that was not known.',
    got,
  };
}

function parley(g: Game, s: Stranger, h: TermHelpers): string {
  const info = s.masterInfo!;
  const first = s.passengers?.[0];
  if (info.regard <= -0.45) {
    deed(g, s, 'courtesy.plain', 0.1, `${info.name} would not talk.`);
    return `${info.name} gives his name, the name of his ship and the name of his port, and nothing else. `
      + 'He has heard enough about this one ship, and his hand does not leave the tiller.';
  }
  const n = newsFrom(g, s, info.temper === 'sly');
  g.crew.morale = clamp(g.crew.morale + 0.04, 0, 1);
  shiftAll(g.hands, 0.03);
  deed(g, s, 'courtesy.kept', 0.25, `Asked ${info.name} for his news before anything else.`);
  let extra = '';
  if (first) {
    switch (first.kind) {
      case 'envoy': {
        const more = newsFrom(g, s, false);
        extra = more.got ? ` His passenger ${first.name} adds one more, as a man does who knows the court: it is in the Book.` : ` ${first.name} sits with his letter and says nothing about it.`;
        break;
      }
      case 'pilot':
        extra = ` ${first.name}, the pilot, takes the captain’s side of the rail and gives his reckoning for the asking. ${h.position(g, 1.2)}`;
        break;
      case 'pilgrim':
        g.crew.morale = clamp(g.crew.morale + 0.03, 0, 1);
        extra = ` ${first.name} asks a blessing on the voyage in his own words, and the men take it better than they would have said.`;
        break;
      case 'wife':
        extra = ` ${first.name} stays below, and the master says only that she is going home and would like to arrive.`;
        break;
      default:
        extra = ` Of the gift under the cloth the master says nothing at all, which is the correct thing to say.`;
    }
  }
  return `${n.said}${extra}`;
}

function showHold(s: Stranger): string {
  const pax = (s.passengers ?? []).map((p) => `${p.name}, ${p.errand.replace(/^[^,]+, /, '')}`);
  return `In her hold: ${cargoLine(s.cargo ?? [])}.${pax.length ? ` Aboard: ${pax.join(' ')}` : ''}`;
}

function delayPassengers(g: Game, s: Stranger, scale: number): string {
  let out = '';
  for (const p of s.passengers ?? []) {
    const w = clamp(p.weight * scale, 0.1, 1);
    deed(g, s, 'passenger.delayed', w, `Held ${s.name} with ${p.name} aboard: ${p.errand}`, { data: { kind: p.kind } });
    out += ` ${passengerLine(p)}`;
  }
  return out;
}

function passengerLine(p: Passenger): string {
  switch (p.kind) {
    case 'envoy': return `${p.name}’s letter is read in front of him, and he will tell his court who read it.`;
    case 'pilgrim': return `${p.name} is kept on deck on his knees for the afternoon, and does not complain, which is worse.`;
    case 'wife': return `${p.name} is brought up and sent below again, white to the lips.`;
    case 'pilot': return `${p.name} asks, with some irony, whether the King’s ship is short of pilots.`;
    default: return `The gift is left under its cloth, untouched, and counted: that will be said at the other end.`;
  }
}

function search(g: Game, s: Stranger): string {
  const info = s.masterInfo!;
  const stage = ruleStageOf(g);
  const pass = holdsPass(g, { id: info.id, polity: info.polity });
  const hold = showHold(s);
  if (pass) {
    deed(g, s, 'courtesy.kept', 0.3, `Looked at ${info.name}’s pass and his hold and found both as written.`);
    return `${info.name} has the letter out of his chest before the boat touches. It is honoured, the hold is looked at for form, and the boat goes back. ${hold}`;
  }
  const proud = info.temper === 'proud';
  if (stage >= 3) {
    deed(g, s, 'ship.stopped', 0.35, `Searched ${s.name} of ${info.homeName} under the Rule.`);
    const px = delayPassengers(g, s, 0.6);
    sendWord(g, s, 'ship.stopped', `searched ${s.name} under the King’s letter`);
    return `There is no such thing, under the Rule, as looking at a ship that is not a stopping. ${hold}${px}`;
  }
  if (stage === 2) {
    deed(g, s, 'courtesy.broken', proud ? 0.4 : 0.25, `Searched ${info.name} without a pass to show and none offered.`);
    return `${info.name} bears it, and asks, as the papers go back, what a man must do to be counted a friend. ${hold}`;
  }
  deed(g, s, 'courtesy.broken', proud ? 0.55 : 0.35, `Put a boat across to search ${info.name}’s ship where no law of the King’s runs.`);
  const px = (s.passengers ?? []).some((p) => p.kind === 'envoy' || p.kind === 'gift' || p.kind === 'wife')
    ? delayPassengers(g, s, 0.4) : '';
  return `${info.name} stands by while the boat is across and says, for the record, that no letter of the Portuguese King runs on this water. `
    + `${proud ? 'He does not look at the boat again. ' : ''}${hold}${px}`;
}

function letPass(g: Game, s: Stranger): string {
  const info = s.masterInfo!;
  deed(g, s, 'ship.spared', 0.3, `Let ${info.name} of ${info.homeName} go his way.`, { silent: false });
  sendWord(g, s, 'ship.spared', `let ${s.name} go on her way without a boat across`);
  const tail: Record<string, string> = {
    open: 'He waves his cap at the stern until she is hull down.',
    proud: 'He takes it as no more than his due.',
    wary: 'He does not believe it until the ship is two miles off.',
    sly: 'He is already thinking what he will make of it at the next quay.',
    hard: 'He nods once, as a man does to an equal, and no more.',
  };
  return `You stand on. ${tail[info.temper]}`;
}

function gift(g: Game, s: Stranger): string {
  const info = s.masterInfo!;
  const first = s.passengers?.[0];
  const cost = Math.round(12 + (first?.weight ?? 0.3) * 20);
  if (g.crown.gold < cost) return 'You have not got it to give, and he can see that you have not, and says it does not matter in a way that does.';
  g.crown.gold -= cost;
  const warm = info.temper === 'open' || info.temper === 'proud' || info.temper === 'sly';
  deed(g, s, 'ship.spared', 0.45, `Sent ${info.name} a gift across and let him go.`, { silent: false });
  deed(g, s, warm ? 'gift.great' : 'gift.plain', 0.3, `Sent ${info.name} ${cost} cruzados’ worth: cloth, wine and a cask of water.`);
  if (first) deed(g, s, 'passenger.aided', clamp(first.weight, 0.2, 0.8), `Sent a gift to ${info.name} for ${first.name}’s errand.`, { data: { kind: first.kind } });
  sendWord(g, s, 'ship.spared', `was sent a gift and no boat`);
  g.crew.morale = clamp(g.crew.morale + 0.02, 0, 1);
  return `${cost} cruzados of cloth, wine and water go across in the boat. `
    + (info.temper === 'hard' ? `${info.name} takes it as tribute, which it is not, and says nothing. `
      : info.temper === 'wary' ? `${info.name} looks at every bale for the hook in it. ` : `${info.name} is moved, or does it very well. `)
    + (first ? `${first.name} will hear who made the road easier.` : '');
}

function licence(g: Game, s: Stranger): string {
  const info = s.masterInfo!;
  deed(g, s, 'pass.granted', 0.6, `Wrote ${info.name} of ${info.homeName} a pass in the King’s name.`, { silent: false });
  deed(g, s, 'ship.spared', 0.3, `Let ${info.name} go with a pass in his chest.`);
  sendWord(g, s, 'pass.granted', `was given a pass in the King’s name and sent on`);
  g.crown.standing += 1; g.crown.lifetimeStanding += 1;
  return `The escrivão writes it out, the captain signs it, and ${info.name} takes it in both hands and puts it in his chest with the rest of his papers. `
    + 'Any ship of the King’s that stops him now will be shown it, and will have to say whether it counts.';
}

function toll(g: Game, s: Stranger): string {
  const info = s.masterInfo!;
  const value = cargoValue(s.cargo ?? []);
  const coin = Math.max(6, Math.round(value * (0.05 + (info.temper === 'hard' ? 0.02 : 0))));
  g.crown.gold += coin;
  deed(g, s, 'toll.taken', 0.4, `Took ${coin} cruzados of ${info.name}’s ${s.name} for passage.`, { silent: false });
  if (info.temper === 'proud') deed(g, s, 'courtesy.broken', 0.3, `${info.name} paid a toll and took it as an insult.`);
  sendWord(g, s, 'toll.taken', `paid ${coin} cruzados for passage`);
  g.crown.standing += 1; g.crown.lifetimeStanding += 1;
  const reaction: Record<string, string> = {
    open: 'He counts it out, laughing, and says it is the cheapest lesson in the King’s law that he will ever buy.',
    proud: 'He pays without a word and does not look at the man who counts it.',
    wary: 'He pays what he is asked, no less and no more, and writes the sum in his own book.',
    sly: 'He pays, and asks for a paper to show for it, which is what he came for.',
    hard: 'He pays grimly, as a man pays who has paid before and expects to pay again.',
  };
  return `${coin} cruzados over the side in a basket. ${reaction[info.temper]}`;
}

function stop(g: Game, s: Stranger): string {
  const info = s.masterInfo!;
  const lots = s.cargo ?? [];
  const value = cargoValue(lots);
  const duty = Math.max(10, Math.round(value * 0.12));
  g.crown.gold += duty;
  deed(g, s, 'ship.stopped', info.temper === 'proud' ? 0.7 : 0.55, `Stopped ${s.name} of ${info.homeName} under the Rule and took ${duty} cruzados in duty.`, { silent: false });
  // Spice bound the wrong way is held; the rest is taxed.
  let held = '';
  const spice = lots.filter((l) => SPICES.has(l.goodId));
  for (const l of spice.slice(0, 1)) {
    const gd = GOOD_BY_ID.get(l.goodId)!;
    const took = g.ship.addCargo(l.goodId, l.units, 0, 0.45);
    if (took > 0) held = ` ${took} ${gd.unit}s of ${gd.english.toLowerCase()} are held as unlicensed and swung across.`;
  }
  const px = delayPassengers(g, s, 1);
  g.crown.standing += 4; g.crown.lifetimeStanding += 4;
  shiftAll(g.hands, 0.02);
  sendWord(g, s, 'ship.stopped', `was stopped under the Rule and charged ${duty} cruzados`);
  const reaction: Record<string, string> = {
    open: `${info.name} calls it robbery, laughing, and pays, and will tell the story better than you would.`,
    proud: `${info.name} turns his back on the deck while the papers are read, and keeps it turned.`,
    wary: `${info.name} counts your guns, not your face, and says nothing at all.`,
    sly: `${info.name} offers a private arrangement; you let it lie, and he is the more interested for it.`,
    hard: `${info.name} does not argue. He will remember.`,
  };
  return `${s.name} is held, her papers read, her hold gone through and ${duty} cruzados taken in duty.${held} ${reaction[info.temper]}${px}`;
}

// -----------------------------------------------------------------------------

const LABEL: Record<TermId, (g: Game, s: Stranger) => { label: string; detail: string }> = {
  parley: (_g, s) => ({ label: `Parley with ${s.masterInfo!.name}`, detail: 'An hour of talk across the rail. What he tells you has his name on it.' }),
  search: (g, s) => {
    const stage = ruleStageOf(g);
    const pass = holdsPass(g, { id: s.masterInfo!.id, polity: s.masterInfo!.polity });
    return {
      label: 'Search him: papers and hold',
      detail: pass ? 'He holds a pass your court honours: a courtesy.'
        : stage >= 3 ? 'Under the Rule a search is a stopping, whatever it is called.'
          : stage === 2 ? 'No pass: an affront, but a small one.' : 'No law of the King’s runs here: an affront.',
    };
  },
  pass: () => ({ label: 'Let him pass', detail: 'Dip the colours and stand on. He will remember it.' }),
  gift: (_g, s) => ({ label: 'Let him pass, with a gift', detail: `${Math.round(12 + (s.passengers?.[0]?.weight ?? 0.3) * 20)} cruzados of cloth and water. Warm, and not free.` }),
  licence: () => ({ label: 'Write him a pass in the King’s name', detail: 'Friends have passes. Any ship of the King’s will be shown it.' }),
  toll: () => ({ label: 'Pass him for a toll', detail: 'A few cruzados out of his hold. The first thing the Rule looks like from the other ship.' }),
  stop: () => ({ label: 'Stop him under the Rule', detail: 'Hold her, read her papers, take the duty. His people, and his errand, wait.' }),
};

/**
 * Turn the base hail for a stranger with a master into the card the player sees: the terms first (for a trader),
 * the old options after them, every old option stamped so the master remembers it, and the man on the card.
 */
export function withPeople(g: Game, s: Stranger, base: SeaEvent, h: TermHelpers): SeaEvent {
  const prior = s.masterInfo!;
  const rec = recOf(g, prior);
  // The Ledger may have moved between the sail being raised and the hail.
  const info = rec ? infoOf(g, rec) : prior;
  s.masterInfo = info;
  const who = { name: info.name, home: info.homeName, errand: s.errand ?? '', read: readLine(info) };

  // Spoken: the Ledger remembers the meeting, so the same man is met as the same man.
  if (!g.ledger.some((e) => e.tag === 'master.met' && e.data?.master === info.id && e.t === g.clock.t)) {
    g.noteDeed('master.met', { target: info.polity, magnitude: 0.1, witnesses: [info.name], silent: true, note: `Spoke ${info.name} of ${info.homeName}, master of ${s.name}.`, data: { master: info.id, near: nearPort(s) } });
  }

  const wrap = (c: SeaChoice): SeaChoice => ({
    ...c,
    resolve: (gg) => {
      const from = gg.ledger.length;
      const text = c.resolve(gg);
      stampSince(gg, s, from);
      return text;
    },
  });
  const old = (base.choices ?? []).map(wrap);

  if (base.id !== 'hail:trader' && base.id !== 'hail:interloper') {
    return { ...base, who, choices: old };
  }

  const make = (t: TermId): SeaChoice => {
    const { label, detail } = LABEL[t](g, s);
    const run: Record<TermId, (gg: Game) => string> = {
      parley: (gg) => parley(gg, s, h), search: (gg) => search(gg, s), pass: (gg) => letPass(gg, s), gift: (gg) => gift(gg, s),
      licence: (gg) => licence(gg, s), toll: (gg) => toll(gg, s), stop: (gg) => stop(gg, s),
    };
    return { label, detail, term: t, resolve: run[t] };
  };

  if (base.id === 'hail:interloper') {
    // The interloper keeps her own scene; the master may be talked to as well.
    return { ...base, who, choices: [...old, make('parley')] };
  }

  const offered = termsOffered(g, s);
  const hull = hullClass(s.hullId);
  const indian = s.nation === 'swahili' || s.nation === 'arab' || s.nation === 'gujarati' || s.nation === 'malabari';
  const rig = indian ? (s.hullId === 'barcha' ? 'a lateen coaster' : s.hullId.includes('latina') ? 'a lateen-rigged merchantman' : 'a deep two-masted merchantman') : `a ${hull.english.toLowerCase()}`;
  const text = `${s.name}, ${rig} under ${NATION_NAME[s.nation]} colours: ${s.flag ?? 'no colours you know'}.\n\n`
    + `${recognition(g, s)}\n\n`
    + (rec && CULTURES[rec.nation] ? `"${h.shout(s.nation)}"` : '');
  // Position and letters stay; the news and the dip of the colours are parley and the pass.
  const keep = old.filter((c) => !/^Ask him the news|^Give him a gun and stand on/.test(c.label));
  return {
    ...base,
    title: `${s.name}, ${NATION_NAME[s.nation]}`,
    text,
    who,
    choices: [...offered.map(make), ...keep],
  };
}


import { clamp } from '../core/math';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { good } from '../economy/goods';
import { people } from '../world/peoples';
import { portDef } from '../world/ports';
import { POLITIES, POLITY_BY_ID, polityOfPort, type Cares, type PolityDef, type Temper } from './polities';

/**
 * Where you stand with each state, and what you owe it.
 *
 * Three measures instead of one. *Trust* is whether they believe what you say
 * — built by keeping agreements, lost by breaking them. *Respect* is whether
 * they reckon with you — built by guns, great gifts and great deeds, lost by
 * weakness and by grovelling. *Interest* is whether you are worth their while —
 * built by trade, lost by bringing nothing. They make different relationships:
 * a court that fears and distrusts you gives way when pushed and betrays you
 * when it can; one that trusts but does not respect you is friendly and asks
 * for nothing to be done about it.
 */

export interface Agreement {
  id: number;
  polity: string;
  kind: 'return' | 'deliver' | 'ally' | 'envoy';
  text: string;
  /** For a delivery: what and how much. */
  goodId?: string;
  qty?: number;
  /** For an alliance: against whom. */
  against?: string;
  made: number;
  due?: number;
  status: 'open' | 'kept' | 'broken';
}

export interface PolityState {
  met: boolean;
  ruler: number;
  rulerSince: number;
  temper: Temper;
  trust: number;
  respect: number;
  interest: number;
  /** How well you know these people: their customs, their court, their wants. 0-1. */
  knowledge: number;
  /** Each faction's attitude to you, -1 to 1. */
  factions: Record<string, number>;
  lastCrisisT: number;
  /** What they have heard about you, waiting to be said on arrival. */
  heard: string[];
  customsLearned: number[];
  /** The last few things that changed between you, for the Courts page. */
  news?: { t: number; text: string }[];
  /** Whether the rival has been at this court before you. */
  rivalCourted?: boolean;
}

export interface WordItem {
  polity: string;
  arrive: number;
  trust: number;
  respect: number;
  text: string;
}

export interface DiplomacyState {
  polities: Record<string, PolityState>;
  agreements: Agreement[];
  word: WordItem[];
  nextId: number;
}

export function newDiplomacy(): DiplomacyState {
  const polities: Record<string, PolityState> = {};
  for (const p of POLITIES) polities[p.id] = newPolityState(p);
  return { polities, agreements: [], word: [], nextId: 1 };
}

export function newPolityState(p: PolityDef): PolityState {
  const disp = people(p.people).disposition;
  const factions: Record<string, number> = {};
  for (const f of p.factions) factions[f.id] = clamp(disp * 0.6 + (f.cares === 'trade' ? 0.1 : f.cares === 'faith' ? -0.15 : 0), -1, 1);
  return {
    met: false, ruler: 0, rulerSince: 0, temper: p.temper,
    trust: clamp(disp * 0.5, -1, 1), respect: 0, interest: 0.1,
    knowledge: 0, factions, lastCrisisT: -1e12, heard: [], customsLearned: [],
  };
}

/** Port regard as the rest of the game sees it, moved by a change to the state's measures. */
export function regardDelta(d: { trust?: number; respect?: number; interest?: number }): number {
  return (d.trust ?? 0) * 0.5 + (d.respect ?? 0) * 0.2 + (d.interest ?? 0) * 0.3;
}

export function rulerName(def: PolityDef, s: PolityState): string {
  return def.rulers[Math.min(s.ruler, def.rulers.length - 1)];
}

export function standingWord(s: PolityState): string {
  const t = s.trust, r = s.respect, i = s.interest;
  if (t > 0.5 && r > 0.3) return 'A trusted ally';
  if (t > 0.4 && i > 0.3) return 'A valued partner';
  if (t > 0.3) return 'Friendly';
  if (r > 0.5 && t < 0) return 'Feared, and not trusted';
  if (r > 0.4) return 'Respected';
  if (t < -0.5) return 'Hostile';
  if (t < -0.2) return 'Distrusted';
  if (i < 0) return 'Of no account';
  return 'Unknown quantity';
}

export function measureWord(v: number): string {
  if (v > 0.6) return 'high';
  if (v > 0.25) return 'good';
  if (v > -0.1) return 'little';
  if (v > -0.45) return 'poor';
  return 'none';
}

// ---------------------------------------------------------------------------
// Word travels

/** Something done to one state is heard of by its neighbours, in time. */
export function spreadWord(g: Game, from: string, trust: number, respect: number, text: string): void {
  const src = POLITY_BY_ID.get(from);
  if (!src) return;
  for (const p of POLITIES) {
    if (p.id === from || p.network !== src.network) continue;
    // A friend of the injured takes it harder; an enemy of them takes it lightly.
    const kin = p.allies.includes(from) ? 1.4 : p.feuds.includes(from) ? -0.6 : 0.5;
    g.diplomacy.word.push({
      polity: p.id,
      arrive: g.clock.t + g.rng.range(40, 140) * 86400,
      trust: trust * kin, respect: respect * 0.6,
      text,
    });
  }
}

// ---------------------------------------------------------------------------
// Negotiation

export type Ask = 'trade' | 'factory' | 'exclusive' | 'padrao' | 'pilot';
export type Offer = 'return' | 'deliver' | 'ally' | 'envoy' | 'tribute';

export interface Deal {
  asks: Ask[];
  offers: Offer[];
  /** Gifts laid before the ruler, value in cruzados and whether any was prized. */
  giftValue: number;
  giftLoved: boolean;
  giftScorned: boolean;
  /** Whether the protocol was observed. */
  protocol: 'right' | 'wrong' | 'none';
  /** 0-1: how much of what is said arrives. */
  comprehension: number;
}

export const ASK_LABEL: Record<Ask, string> = {
  trade: 'Leave to trade',
  factory: 'Ground for a feitoria',
  exclusive: 'Trade with Portugal alone',
  padrao: 'Leave to set a padrão',
  pilot: 'A pilot and his soundings',
};

export function offerLabel(def: PolityDef, o: Offer): string {
  switch (o) {
    case 'return': return 'Return within eighteen months with a cargo';
    case 'deliver': return `Bring ${deliveryQty(def)} ${good(def.wants[0]).english.toLowerCase()} within eighteen months`;
    case 'ally': return def.feuds.length > 0 ? `Stand with them against ${POLITY_BY_ID.get(def.feuds[0])?.name ?? 'their enemies'}` : 'Friendship against their enemies';
    case 'envoy': return 'Carry an envoy to the King of Portugal';
    case 'tribute': return 'A payment of 150 cruzados, now';
  }
}

export function deliveryQty(def: PolityDef): number {
  const w = def.wants[0];
  return w === 'cavalos' ? 4 : w === 'ouro' ? 5 : w === 'coral' ? 10 : 20;
}

/** How each kind of voice feels about each thing asked or offered. */
const ASK_COST: Record<Ask, Partial<Record<Cares, number>>> = {
  trade: { trade: -0.02, custom: -0.05, faith: -0.05 },
  factory: { trade: -0.12, custom: -0.2, war: -0.15, faith: -0.1 },
  exclusive: { trade: -0.4, war: -0.1, custom: -0.05 },
  padrao: { faith: -0.35, custom: -0.25, war: -0.05 },
  pilot: { trade: -0.08, war: -0.05, custom: -0.05 },
};
const OFFER_GAIN: Record<Offer, Partial<Record<Cares, number>>> = {
  return: { trade: 0.28, custom: 0.05 },
  deliver: { trade: 0.12, war: 0.1, custom: 0.08 },
  ally: { war: 0.4, trade: 0.05, custom: 0.05 },
  envoy: { custom: 0.25, faith: 0.05 },
  tribute: { trade: 0.22, war: 0.05 },
};

export interface Verdict {
  factions: { id: string; name: string; approval: number }[];
  ruler: number;
  score: number;
  accepted: boolean;
  /** What the ruler would need to accept, when he will not. */
  counter: { add?: Offer; drop?: Ask } | null;
}

export function evaluate(g: Game, def: PolityDef, s: PolityState, deal: Deal): Verdict {
  const t = s.temper;
  const noise = (1 - deal.comprehension) * 0.25;
  const giftRatio = deal.giftValue / Math.max(expectedGift(def), 1);
  const giftScore = clamp(giftRatio, 0, 1.6) * 0.25 + (deal.giftLoved ? 0.1 : 0) - (deal.giftScorned ? 0.2 : 0)
    - (deal.giftValue > 0 && giftRatio < 0.3 ? 0.15 : 0);
  const protocol = deal.protocol === 'right' ? 0.12 : deal.protocol === 'wrong' ? -0.18 : 0;
  const factions = def.factions.map((f) => {
    let a = s.factions[f.id] ?? 0;
    a += s.trust * 0.3 + s.interest * (f.cares === 'trade' ? 0.35 : 0.1) + s.respect * (f.cares === 'war' ? 0.3 : 0.1);
    a += giftScore * (f.cares === 'trade' ? 1.2 : 0.8);
    if (f.cares === 'custom') a += protocol * 1.5; else a += protocol * 0.6;
    for (const ask of deal.asks) a += ASK_COST[ask][f.cares] ?? 0;
    for (const off of deal.offers) a += OFFER_GAIN[off][f.cares] ?? 0;
    // Where the Arab and Gujarati houses run the trade, asking them to shut
    // their own ships out is asking the merchants to ruin themselves.
    if (deal.asks.includes('exclusive') && people(def.people).rivalNetwork && f.cares === 'trade') a -= 0.35;
    // Faith: a devout court minds a Christian asking for anything.
    if (f.cares === 'faith' && t === 'pious' && def.people !== 'kongo') a -= 0.08;
    a -= noise * 0.5;
    return { id: f.id, name: f.name, approval: clamp(a, -1, 1) };
  });
  let ruler = s.trust * 0.35 + s.respect * 0.3 + s.interest * 0.25 + giftScore + protocol;
  if (t === 'proud') ruler += (deal.giftValue > 0 ? 0.05 : -0.1) + protocol * 0.5;
  if (t === 'mercantile') ruler += deal.offers.includes('return') ? 0.1 : 0;
  if (t === 'warlike') ruler += deal.offers.includes('ally') ? 0.15 : 0;
  if (t === 'wary') ruler -= 0.08 * deal.asks.length;
  if (deal.offers.includes('deliver')) ruler += 0.15;
  // Nobody gives ground or a monopoly to a stranger, however good his presents.
  if (deal.asks.includes('factory') && s.trust < 0.15) ruler -= 0.25;
  if (deal.asks.includes('exclusive')) ruler -= s.trust < 0.35 ? 0.6 : 0.15;
  ruler = clamp(ruler, -1, 1);
  const courtScore = factions.reduce((sum, f, i) => sum + f.approval * def.factions[i].weight, 0);
  const score = ruler * 0.4 + courtScore * 0.6;
  const threshold = 0.08 + deal.asks.length * 0.03 - (g.can?.('treaty') ? 0.05 : 0);
  const accepted = score >= threshold && deal.asks.length > 0;
  let counter: Verdict['counter'] = null;
  if (!accepted && deal.asks.length > 0) {
    if (!deal.offers.includes('deliver')) counter = { add: 'deliver' };
    else {
      const worst = [...deal.asks].sort((a, b) => costOf(def, a) - costOf(def, b))[0];
      counter = deal.asks.length > 1 ? { drop: worst } : null;
    }
  }
  return { factions, ruler, score, accepted, counter };
}

function costOf(def: PolityDef, a: Ask): number {
  return def.factions.reduce((s, f) => s + (ASK_COST[a][f.cares] ?? 0) * f.weight, 0);
}

export function expectedGift(def: PolityDef): number {
  const p = portDef(def.seat);
  return Math.round(30 + p.wealth * 160 * (0.5 + people(def.people).sophistication));
}

// ---------------------------------------------------------------------------
// Crises

export function crisisFor(g: Game, def: PolityDef, s: PolityState): SeaEvent | null {
  const kinds: string[] = [];
  if (def.feuds.length > 0) kinds.push('war');
  if (s.ruler < def.rulers.length - 1 && g.clock.t - s.rulerSince > 3 * 365 * 86400) kinds.push('succession');
  if (g.relationsFor(def.seat).factory || g.relationsFor(def.seat).mayTrade) kinds.push('plot');
  kinds.push('envoy');
  const kind = kinds[Math.floor(g.rng.next() * kinds.length)];
  const ruler = rulerName(def, s);
  const id = `crisis:${def.id}:${kind}`;
  const change = (d: { trust?: number; respect?: number; interest?: number }, why: string) =>
    g.adjustPolity(def.id, d, why);

  if (kind === 'war') {
    const foe = POLITY_BY_ID.get(def.feuds[0])!;
    const ally = g.diplomacy.agreements.find((a) => a.polity === def.id && a.kind === 'ally' && a.status === 'open');
    const odds = clamp(0.35 + g.ship.effects.guns * 0.06 + g.crew.count / 150, 0.3, 0.9);
    return {
      id, title: `${foe.name} makes war`, severity: 'warning',
      text: `${ruler}’s messenger is waiting on the beach. ${foe.name} has sent warriors against `
        + `the ${def.title}’s country, and ${ruler} asks — `
        + (ally ? 'reminds you, rather, of your agreement — ' : '')
        + 'whether your guns will stand with him.',
      choices: [
        {
          label: 'Stand with him, guns and men',
          detail: `About ${Math.round(odds * 10)} in ten it goes well. Men will be hurt either way. ${foe.name} will not forget.`,
          resolve: (gg) => {
            const won = gg.rng.chance(odds);
            gg.killHands(won ? 1 : 3, 'Killed fighting ashore for an ally.');
            gg.ship.damage(won ? 0.03 : 0.08);
            change({ trust: won ? 0.35 : 0.2, respect: won ? 0.3 : 0.05 }, 'stood by them in war');
            gg.adjustPolity(foe.id, { trust: -0.4, respect: won ? 0.15 : 0 }, 'fought against them');
            if (ally) ally.status = 'kept';
            return won
              ? `Your guns broke ${foe.name}’s attack on the beach. ${ruler} will not forget it, and neither will his enemies.`
              : `The fight went badly, but you stood with ${ruler} to the end of it, and he saw you do it.`;
          },
        },
        {
          label: 'Send powder and money instead',
          detail: '150 cruzados. Something, if not everything.',
          resolve: (gg) => {
            gg.crown.gold = Math.max(0, gg.crown.gold - 150);
            change({ trust: 0.1 }, 'sent help in war');
            return 'Sent powder, shot and money. It was taken politely.';
          },
        },
        {
          label: 'Keep out of it',
          detail: ally ? 'You have an agreement. This breaks it.' : 'It is not your war.',
          resolve: (gg) => {
            if (ally) gg.breakAgreement(ally, 'refused to stand by an ally');
            else change({ trust: -0.15, respect: -0.1 }, 'stood aside in war');
            return `Kept out of ${ruler}’s war. ${ally ? 'An agreement is broken, and the whole coast will hear.' : 'He noticed.'}`;
          },
        },
      ],
    };
  }

  if (kind === 'succession') {
    const heir = def.rulers[s.ruler + 1];
    return {
      id, title: `The ${def.title} is dead`, severity: 'warning',
      text: `${ruler} is dead. His heir, ${heir}, holds the palace; a cousin holds the ${def.factions.find((f) => f.cares === 'war')?.name.toLowerCase() ?? 'army'}. `
        + 'Both have sent men to the ship.',
      choices: [
        {
          label: `Back ${heir}, the heir`,
          detail: 'The lawful choice, and most likely to win.',
          resolve: (gg) => {
            const won = gg.rng.chance(0.7);
            gg.successionIn(def.id, won ? 0.5 : -0.2);
            if (won) change({ trust: 0.3, respect: 0.1 }, 'backed the new ruler');
            return won ? `${heir} holds the throne, and remembers who stood with him.` : `The cousin won, and has a long memory for who backed ${heir}.`;
          },
        },
        {
          label: 'Back the cousin',
          detail: 'The army is his. A bold throw.',
          resolve: (gg) => {
            const won = gg.rng.chance(0.4);
            gg.successionIn(def.id, won ? 0.6 : -0.4);
            if (won) change({ trust: 0.25, respect: 0.25 }, 'made a king');
            return won ? 'The cousin took the throne with your help. He owes you, and knows it.' : `${heir} won, and does not forgive.`;
          },
        },
        {
          label: 'Stay out of it',
          detail: 'Whoever wins starts fresh with you.',
          resolve: (gg) => { gg.successionIn(def.id, 0); return `${heir} holds the throne. He will make up his own mind about you.`; },
        },
      ],
    };
  }

  if (kind === 'plot') {
    const merchants = def.factions.find((f) => f.cares === 'trade');
    return {
      id, title: 'A plot against your trade', severity: 'warning',
      text: `${merchants?.name ?? 'The merchants'} have been telling ${ruler} that you mean to seize the town, `
        + 'and a friend in the court warns you that your goods ashore will be taken tomorrow.',
      choices: [
        {
          label: 'Pay them off',
          detail: '120 cruzados, and their goodwill for a while.',
          resolve: (gg) => {
            gg.crown.gold = Math.max(0, gg.crown.gold - 120);
            if (merchants) gg.diplomacy.polities[def.id].factions[merchants.id] += 0.25;
            return 'Paid the merchants. The rumour went away as quickly as it came.';
          },
        },
        {
          label: 'Expose them to the ruler',
          detail: s.knowledge >= 0.4 ? 'You know this court well enough to be believed.' : 'You do not know this court well. It may backfire.',
          resolve: (gg) => {
            const ok = gg.rng.chance(s.knowledge >= 0.4 ? 0.8 : 0.35);
            if (merchants) gg.diplomacy.polities[def.id].factions[merchants.id] += ok ? -0.3 : -0.1;
            change({ trust: ok ? 0.25 : -0.2 }, ok ? 'exposed a plot' : 'accused the merchants and failed');
            return ok ? `${ruler} believed you. The ringleaders are fined, and the court knows you are no fool.` : 'Nobody believed you, and the merchants are delighted.';
          },
        },
        {
          label: 'Take the goods back aboard',
          detail: 'Safe, and it looks like guilt.',
          resolve: () => { change({ trust: -0.1, interest: -0.1 }, 'fled a rumour'); return 'Took everything back aboard. The rumour is now believed.'; },
        },
      ],
    };
  }

  // A rival envoy.
  const castile = g.rng.chance(0.5);
  const who = castile ? 'a Castilian envoy' : 'an envoy of the Mamluk sultan, from Cairo';
  return {
    id, title: 'A rival at court', severity: 'note',
    text: `There is ${who} at ${ruler}’s court, with presents, and a great deal to say about the Portuguese.`,
    choices: [
      {
        label: 'Outbid him with gifts',
        detail: '200 cruzados of presents.',
        resolve: (gg) => {
          gg.crown.gold = Math.max(0, gg.crown.gold - 200);
          change({ interest: 0.2, respect: 0.1 }, 'outbid a rival envoy');
          return `The ${castile ? 'Castilian' : 'Egyptian'} went home with his presents unopened.`;
        },
      },
      {
        label: 'Discredit him',
        detail: s.trust > 0.3 ? 'They believe you more than him.' : 'They do not know whom to believe.',
        resolve: (gg) => {
          const ok = gg.rng.chance(s.trust > 0.3 ? 0.75 : 0.35);
          change({ trust: ok ? 0.1 : -0.15 }, ok ? 'discredited a rival' : 'slandered an envoy');
          return ok ? 'The envoy was shown the door.' : 'The envoy is still at court, and now he has a grievance.';
        },
      },
      {
        label: 'Ignore him',
        detail: 'Your trade speaks for itself — or does not.',
        resolve: () => { change({ interest: -0.15 }, 'let a rival have the court'); return 'Left the envoy to it. Some of what he says will stick.'; },
      },
    ],
  };
}

export function polityForPort(portId: string): PolityDef | null {
  return polityOfPort(portId);
}

import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import { makeOfficer, type Officer, type OfficerRole } from '../crew/crew';
import type { Temper } from '../crew/hands';
import type { Game } from '../game/state';
import { record } from '../ledger/ledger';
import { EXIT_AT, companionOf } from './approval';

/**
 * The company, handed on (BUILD_PLAN E2). Plain data rules over what the company already is; no authored arcs.
 *
 *   Succession   The old pilot and the old master are a generation older than the heir. A seat that had a promoted mate or
 *                an apprentice aboard when the career ended goes to him: first the mates (the ones the captain raised),
 *                then the men forward the Book remembers warmly. Taught by the old man, so a little of his ability goes with it.
 *   Enemies      A man the father wronged (left on bad terms, betrayed, estranged, or said he would go and was let) remains
 *                an enemy of the name. What he does is what he did: sells to the rival, writes to the Casa, or talks on the quay.
 *   Freed        A named man the father freed or put ashore with leave, who had a tongue of the coast, may have a child, and
 *                the child may be the new Língua. (Rolled once, from the seed; a quarter of the time he is not.)
 *
 * `planSuccession` reads the old game and changes nothing. `applySuccession` is the one call that changes the heir's crew.
 */

export interface SeatSuccessor {
  officer: Officer;
  seat: OfficerRole;
  /** Where he came from: a mate the father raised, a man forward, or the child of a freed man. */
  from: 'mate' | 'hand' | 'child';
  /** The old man the seat was his, or the freed man he is the child of. */
  replaces: string;
  text: string;
}

export interface Enemy {
  name: string;
  role: string;
  consequence: 'chart' | 'rival' | 'gossip' | 'report';
  text: string;
}

export interface SuccessionPlan {
  successors: SeatSuccessor[];
  enemies: Enemy[];
  /** The old holders of the seats that changed hands, by name. */
  retired: string[];
}

const TEMPER_TRAIT: Record<Temper, string> = {
  steady: 'steady', bold: 'hardhorse', devout: 'pious', young: 'curious', sullen: 'sullen', sly: 'ambitious',
};
const SEATS: OfficerRole[] = ['piloto', 'mestre'];
const BAPTISED = ['João', 'Pedro', 'Diogo', 'Manuel', 'Jorge', 'Simão', 'Martim', 'Gil'];
const ENEMY_CAP = 3;

const alive = (o: Officer): boolean => o.alive && !o.left && !o.ashoreAt;
const firstWord = (name: string): string => name.split(' ').slice(-1)[0] || name;

/** The men the father raised or left a good name with, best first. Mates before hands. */
function pool(old: Game): { name: string; from: 'mate' | 'hand'; ability: number; regard: number; trait: string; memory: string[] }[] {
  const out: { name: string; from: 'mate' | 'hand'; ability: number; regard: number; trait: string; memory: string[] }[] = [];
  const mates = old.crew.officers.filter((o) => o.mate && alive(o)).sort((a, b) => b.ability - a.ability);
  for (const o of mates) out.push({ name: o.name, from: 'mate', ability: o.ability, regard: o.loyalty, trait: o.trait ?? 'steady', memory: (o.memory ?? []).slice(0, 2) });
  const promoted = new Set(old.crew.officers.filter((o) => o.handId).map((o) => o.handId));
  const hands = old.hands
    .filter((h) => h.alive && h.aboard && h.regard >= 0.55 && h.temper !== 'sullen' && h.temper !== 'sly' && !promoted.has(h.id))
    .sort((a, b) => b.regard - a.regard);
  for (const h of hands) out.push({ name: h.name, from: 'hand', ability: 0.34 + h.regard * 0.3, regard: h.regard, trait: TEMPER_TRAIT[h.temper], memory: (h.memory ?? []).slice(0, 2) });
  return out;
}

/** Who the father wronged. Pure. */
export function enemiesOf(old: Game): Enemy[] {
  const out: Enemy[] = [];
  const seen = new Set<string>();
  for (const o of old.crew.officers) {
    const wronged = o.arcEnd === 'betrayed' || o.arcEnd === 'estranged' || (!!o.left && o.arcEnd !== 'ashore') || (o.approval ?? 0) <= EXIT_AT;
    if (!wronged || o.arcEnd === 'ashore' || seen.has(o.name)) continue;
    seen.add(o.name);
    let consequence: Enemy['consequence'] = 'gossip';
    try { consequence = companionOf(o).exit.consequence; } catch { /* a role with no table */ }
    out.push({
      name: o.name, role: o.role, consequence,
      text: o.arcEnd === 'betrayed'
        ? `${o.name} sold what he knew of your father, and has not stopped; he does not make the difference between you.`
        : `${o.name} left your father's ship on bad terms, and tells it so.`,
    });
  }
  // Betrayers before the merely estranged; the heir meets at most three of them.
  out.sort((a, b) => Number(/sold what/.test(b.text)) - Number(/sold what/.test(a.text)));
  return out.slice(0, ENEMY_CAP);
}

/** A named man the father freed or put ashore with leave, who had a tongue, as {name, languages}. */
function freedParent(old: Game): { name: string; languages: string[] } | null {
  for (const o of old.crew.officers) {
    if (o.arcEnd === 'ashore' && o.languages.length > 0) return { name: o.name, languages: [...o.languages] };
  }
  const lingua = old.crew.officers.find((o) => o.role === 'lingua' && o.languages.length > 0);
  for (const e of old.ledger) {
    if (e.tag !== 'companion.freed' || !e.target || /^(a|an|the) /i.test(e.target)) continue;
    const man = old.crew.officers.find((o) => o.name === e.target && o.languages.length > 0);
    const languages = man?.languages ?? lingua?.languages ?? [];
    if (languages.length > 0) return { name: e.target, languages: [...languages] };
  }
  return null;
}

export function planSuccession(old: Game, rng: Rng): SuccessionPlan {
  const successors: SeatSuccessor[] = [];
  const retired: string[] = [];
  const men = pool(old);
  for (const seat of SEATS) {
    const next = men.shift();
    if (!next) break;
    const holder = old.crew.officers.find((o) => o.role === seat && alive(o) && !o.mate);
    const taught = holder ? holder.ability : 0.4;
    const o = makeOfficer(seat, rng, clamp(0.3 + 0.3 * next.regard + 0.3 * taught, 0.3, 0.75));
    o.name = next.name;
    o.trait = next.trait;
    o.loyalty = clamp(0.5 + 0.4 * next.regard, 0.3, 0.9);
    o.wage = 22;
    o.memory = ['Served your father.', ...next.memory].slice(0, 3);
    o.succeeds = holder?.name ?? 'the old company';
    const seatName = seat === 'piloto' ? 'the pilot’s board' : 'the master’s berth';
    if (holder) retired.push(holder.name);
    successors.push({
      officer: o, seat, from: next.from, replaces: o.succeeds,
      text: `${next.name}, ${next.from === 'mate' ? 'whom your father raised to mate' : 'a man out of your father’s fo’c’sle'}, has ${seatName}`
        + `${holder ? `; ${holder.name} is too old for the sea now` : ''}.`,
    });
  }
  // A freed man's child may be the new Língua.
  const parent = freedParent(old);
  if (parent && rng.chance(0.75)) {
    const o = makeOfficer('lingua', rng, clamp(0.45 + 0.1 * rng.next(), 0.4, 0.6), parent.languages);
    o.name = `${rng.pick(BAPTISED)} ${firstWord(parent.name)}`;
    o.trait = 'curious';
    o.wage = 18;
    o.loyalty = 0.62;
    o.memory = [`His father was freed by yours.`];
    o.succeeds = parent.name;
    successors.push({
      officer: o, seat: 'lingua', from: 'child', replaces: parent.name,
      text: `${o.name}, the child of ${parent.name}, whom your father freed, has his father’s ${parent.languages.slice(0, 2).join(' and ')} and offers it for a língua’s wage.`,
    });
  }
  return { successors, enemies: enemiesOf(old), retired };
}

/**
 * Put the plan into the heir's crew: the starting holder of a seat that changed hands is replaced, a língua is added, and
 * what the enemies do is done. Called once, from `Game.inheritFrom`, on a crew the constructor has just written.
 */
export function applySuccession(heir: Game, plan: SuccessionPlan): string[] {
  const said: string[] = [];
  for (const s of plan.successors) {
    if (s.seat === 'lingua') heir.crew.officers = heir.crew.officers.filter((o) => o.role !== 'lingua' || !o.alive);
    else heir.crew.officers = heir.crew.officers.filter((o) => o.role !== s.seat || !o.alive);
    heir.crew.officers.push(s.officer);
    record(heir, 'heir.succeeded', { target: s.officer.name, magnitude: 0.3, note: s.text, silent: true });
    said.push(s.text);
  }
  for (const e of plan.enemies) {
    if (e.consequence === 'chart' || e.consequence === 'rival') { heir.rival.standing += 6; heir.rival.frontierLat -= 0.2; }
    else if (e.consequence === 'report') heir.casa.regard = clamp(heir.casa.regard - 0.1, -1, 1);
    else heir.crown.standing = Math.max(0, heir.crown.standing - 3);
    record(heir, 'heir.enemy', { target: e.name, magnitude: 0.4, note: e.text, silent: true });
    said.push(e.text);
  }
  return said;
}

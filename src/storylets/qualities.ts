import { NM, haversine } from '../core/math';
import { approvalFor } from '../company/approval';
import { activeClauses } from '../identity/clauses';
import { favourOf } from '../identity/patrons';
import { skill, type SkillId } from '../crew/skills';
import type { Game } from '../game/state';
import { along } from '../progression/road';
import { PORTS, anchorageOf, portDef } from '../world/ports';
import { FRONT_IDS, type FrontId } from '../world/powers/types';
import type { Req, Val } from './types';

/**
 * QUALITIES: the world-state storylets are written against (BUILD_PLAN E1, Pillar 4).
 *
 * There is one resolver, `qualityOf(g, key)`, and one namespace. A quality is read, never stored here: it is a
 * view onto the Ledger, the company, the Fronts, the identity block, the road, the clock and the thread records.
 * The only qualities this file lets a storylet WRITE are `flag.*` (kept in `g.web.flags`) and, through the thread
 * kit, the flags of a thread's own record (`story.<arc>.<flag>`).
 *
 *   time        act  year  month  day  season ('sail' | 'winter', game/year)
 *   place       port ('' at sea)  at.<portId>  sea  along (nm from Lisbon)  shore (nm to land)
 *   purse       gold  renown (lifetime)
 *   captain     origin  calling  patron (of record)  patron.<id>.favour  title.<id>  skill.<id> (0..100)
 *   people      met.<port>  trade.<port>  regard.<people>  polity.<id>.trust|respect|interest
 *   Ledger      ledger.<tag>  ledger.<tag>@<target>  (counts)    clause.<kind> (count in force)
 *   company     officer.<role> (aboard, alive)  aboard.<key>  approval.<key> (-100..100, absent if not aboard)
 *   Fronts      front.<id>.stage (1..4)   power.<id>.attitude   power.kongo.succession (the court has settled it)
 *   hold        hold.<good> (quantity aboard)
 *   career      goal.met (the act's goal)  route.opened (the epilogue's)  heard.<secret> (talk overheard)
 *   threads     story.<id>.step | outcome | taken | done | days | <flag>      open.<id>.<step>
 *   flags       flag.<name>   (storylets write these: promise.kilwa.first_call, ending.kings, ...)
 *
 * `story.@.days` and `open.@.x` use `@` for the arc of the storylet being tested.
 */

/** The namespaces, for the falsifier: every key a storylet reads must begin with one of these. */
export const NAMESPACES = [
  'act', 'year', 'month', 'day', 'season', 'port', 'at', 'sea', 'along', 'shore', 'gold', 'renown', 'origin', 'calling', 'patron',
  'title', 'skill', 'met', 'trade', 'regard', 'polity', 'ledger', 'clause', 'officer', 'aboard', 'approval', 'front', 'power',
  'hold', 'story', 'open', 'flag', 'heard', 'goal', 'route',
] as const;

export const dayOf = (g: Game): number => Math.floor((g.clock.t - g.startT) / 86400);

/** Mean regard of the ports of one people (the ports a quality like "Kongo regard" speaks of). */
function peopleRegard(g: Game, people: string): number | undefined {
  const ports = PORTS.filter((p) => p.people === people);
  if (ports.length === 0) return undefined;
  let s = 0;
  for (const p of ports) s += g.relationsFor(p.id).regard;
  return s / ports.length;
}

function count(g: Game, tag: string, target?: string): number {
  let n = 0;
  for (const e of g.ledger) if (e.tag === tag && (target === undefined || e.target === target)) n++;
  return n;
}

/** A thread's flag, a state or an outcome as a quality. */
function story(g: Game, rest: string[], arc: string | undefined): Val | undefined {
  const id = rest[0] === '@' ? arc : rest[0];
  const what = rest.slice(1).join('.');
  const q = g.quests.find((x) => x.id === id);
  switch (what) {
    case 'taken': return !!q;
    case 'done': return !!q?.outcome;
    case 'outcome': return q?.outcome ?? '';
    case 'step': return q && !q.outcome ? q.step : '';
    case 'days': return q ? (g.clock.t - q.stepT) / 86400 : 0;
    default: {
      const v = q?.flags[what];
      return v === undefined ? false : v;
    }
  }
}

export function qualityOf(g: Game, key: string, arc?: string): Val | undefined {
  const p = key.split('.');
  switch (p[0]) {
    case 'act': return g.chronicle.act;
    case 'year': return g.clock.date.year;
    case 'month': return g.clock.date.month;
    case 'day': return dayOf(g);
    case 'season': return seasonOf(g);
    case 'port': return g.dockedAt ?? '';
    case 'at': return g.dockedAt === p[1];
    case 'sea': return !g.dockedAt;
    case 'along': return Math.round(along(g.dockedAt ? anchorageOf(portDef(g.dockedAt)) : g.ship.state.pos));
    case 'shore': return g.sounding.shoreDistNm;
    case 'gold': return g.crown.gold;
    case 'renown': return g.crown.lifetimeStanding;
    case 'origin': return g.origin;
    case 'calling': return g.identity?.calling ?? '';
    case 'patron': return p.length === 1 ? g.identity?.patron ?? 'crown' : p[2] === 'favour' ? favourOf(g, p[1] as 'crown' | 'church' | 'ruanova') : undefined;
    case 'title': return !!g.identity?.titles[p.slice(1).join('.')];
    case 'skill': return skill(g.effectiveSkill, p[1] as SkillId) * 100;
    case 'met': return g.relationsFor(p[1]).met;
    case 'trade': return g.relationsFor(p[1]).mayTrade;
    case 'regard': return peopleRegard(g, p[1]);
    case 'polity': {
      const st = g.diplomacy.polities[p[1]];
      return st ? (st as unknown as Record<string, number>)[p[2]] : undefined;
    }
    case 'ledger': {
      const tag = p.slice(1).join('.');
      const at = tag.indexOf('@');
      return at < 0 ? count(g, tag) : count(g, tag.slice(0, at), tag.slice(at + 1));
    }
    case 'clause': return activeClauses(g.ledger, g.clock.t).filter((c) => c.kind === p[1]).length;
    case 'officer': return g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === p[1]);
    case 'aboard': return g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.arc === p[1]);
    case 'approval': {
      const o = g.crew.officers.find((x) => x.alive && !x.ashoreAt && x.arc === p[1]);
      return o ? approvalFor(o, g.ledger, g.clock.t).score : undefined;
    }
    case 'front': return FRONT_IDS.includes(p[1] as FrontId) ? g.powers.fronts[p[1] as FrontId].stage : undefined;
    case 'power': {
      if (p[1] === 'kongo' && p[2] === 'succession') return kongoSucceeded(g);
      return g.powers.powers[p[1] as keyof typeof g.powers.powers]?.attitude;
    }
    case 'hold': return g.ship.quantityOf(p[1]);
    case 'story': return story(g, p.slice(1), arc);
    case 'open': {
      const id = p[1] === '@' ? arc : p[1];
      const q = g.quests.find((x) => x.id === id);
      return !!q && !q.outcome && q.step === p[2];
    }
    case 'flag': return g.web.flags[key];
    case 'heard': return g.secretsHeard.includes(p.slice(1).join('.'));
    case 'goal': return p[1] === 'met' ? g.chronicle.goalMet : undefined;
    case 'route': return p[1] === 'opened' ? g.crown.routeOpened : undefined;
    default: return undefined;
  }
}

/** The Kongo court has already settled its succession without the captain (the Power's own move, world/powers/kongo). */
function kongoSucceeded(g: Game): boolean {
  const k = g.powers.powers.kongo;
  const live = g.powers.effects.some((e) => e.power === 'kongo' && e.kind === 'succession' && e.end > g.clock.t);
  return !!k.flags.succession && !live;
}

function seasonOf(g: Game): string {
  const m = g.clock.date.month;
  // The Carreira sails out in spring and summer (game/year: the window shifts with the hull; the month is the plain reading).
  return m >= 3 && m <= 9 ? 'sail' : 'winter';
}

const CMP = {
  '>=': (a: number, b: number) => a >= b, '<=': (a: number, b: number) => a <= b,
  '>': (a: number, b: number) => a > b, '<': (a: number, b: number) => a < b,
} as const;

/** True if a query holds. A quality that does not exist is falsy and compares as absent (never throws). */
export function evalReq(g: Game, r: Req, arc?: string): boolean {
  if ('all' in r) return r.all.every((x) => evalReq(g, x, arc));
  if ('any' in r) return r.any.some((x) => evalReq(g, x, arc));
  if ('not' in r) return !evalReq(g, r.not, arc);
  if ('fn' in r) return r.fn(g);
  const v = qualityOf(g, r.q, arc);
  if (r.op === undefined) return !!v;
  if (r.op === '==') return v === r.v;
  if (r.op === '!=') return v !== r.v;
  if (typeof v !== 'number' || typeof r.v !== 'number') return false;
  return CMP[r.op](v, r.v);
}

export const allHold = (g: Game, rs: Req[], arc?: string): boolean => rs.every((r) => evalReq(g, r, arc));

/** Every quality key a query reads, for the graph and the dead-quality check. */
export function keysOf(r: Req, out: string[] = []): string[] {
  if ('all' in r) r.all.forEach((x) => keysOf(x, out));
  else if ('any' in r) r.any.forEach((x) => keysOf(x, out));
  else if ('not' in r) keysOf(r.not, out);
  else if ('fn' in r) out.push(...(r.reads ?? []));
  else out.push(r.q);
  return out;
}

// -- Writing -----------------------------------------------------------------------------------------------------------

/** Set a `flag.*` quality. The only quality a storylet may write that nothing else owns. */
export function setFlag(g: Game, key: string, v: Val = true): void {
  if (!key.startsWith('flag.')) throw new Error(`storylets write only flag.* qualities, not ${key}`);
  g.web.flags[key] = v;
}

// -- Small builders, for authoring ---------------------------------------------------------------------------------------

export const has = (q: string): Req => ({ q });
export const lacks = (q: string): Req => ({ not: { q } });
export const gte = (q: string, v: number): Req => ({ q, op: '>=', v });
export const lte = (q: string, v: number): Req => ({ q, op: '<=', v });
export const lt = (q: string, v: number): Req => ({ q, op: '<', v });
export const eq = (q: string, v: Val): Req => ({ q, op: '==', v });
export const anyOf = (...rs: Req[]): Req => ({ any: rs });
export const allOf = (...rs: Req[]): Req => ({ all: rs });
/** Days since the arc's present beat began. */
export const afterDays = (n: number): Req => ({ q: 'story.@.days', op: '>=', v: n });

export function nearNm(g: Game, at: { lat: number; lon: number }): number {
  return haversine(g.ship.state.pos, at) / NM;
}

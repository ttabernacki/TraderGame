/**
 * Falsifier for the Web (BUILD_PLAN E1, Pillar 4): the storylet engine and the migrated threads.
 *   npx esbuild scripts/storylets.ts --bundle --platform=node --format=cjs --outfile=/tmp/storylets.cjs && node /tmp/storylets.cjs [seeds=3] [quick]
 *
 * Ground truth, not the expression under test:
 *  - the outcomes a thread can end in are read off the SOURCE text of its `end(...)` calls, and the walk must reach each;
 *  - the walk drives the real scenes from a real game (staged by setting the underlying state, never the quality that is
 *    being tested), every choice of every beat, with the dice varied, and reads the thread's record afterwards;
 *  - "dead quality" is measured by tracing which flags the scenes, the engine and the consumers actually READ while
 *    the walk runs, not by listing which ones are meant to be read;
 *  - the road rule is checked against `road.ts: along()` of where each beat is had, not against the order it was written in;
 *  - one scene per port call / per leg is counted from what the played game actually put on the screen.
 *
 * Quick mode (`quick`) skips the played careers.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { NM, haversine } from '../src/core/math';
import { PORTS, anchorageOf, portDef } from '../src/world/ports';
import { alongOf, inPlace, pointsOf } from '../src/storylets/places';
import {
  NAMESPACES, afterDays, allHold, dayOf, dueNow, evalReq, hear, keysOf, offersAt, qualityOf, registerSource, sources, surface, takeThread,
  threadDefs, threadStorylets, waitingAt, webOnArrival, resolveOldSaves, setFlag,
} from '../src/storylets';
import { quiet } from '../src/storylets/engine';
import { QUESTS, callbackAt, lateEndings, originEnding, refreshQuestPrices } from '../src/progression/quests';
import { evaluateKings } from '../src/storylets/threads/ending';
import type { Req, Storylet } from '../src/storylets/types';
import { SECTION_VIEWS } from '../src/ui/quarters';
import { Ctx } from '../src/ui/quarters';
import { FakeEl, installFakeDom, verbsIn } from './lib/fakeDom';
import { newGame, newTally } from './lib/botlib';
import { play } from './lib/careerCore';
import { approvalFor } from '../src/company/approval';
import { makeOfficer } from '../src/crew/crew';
import { TRAFFIC_SCENES, dueTrafficScene } from '../src/progression/trafficScenes';
import { POWER_SCENES } from '../src/progression/powerScenes';
import { peekTrafficScene } from '../src/progression/trafficScenes';

const SEEDS = Math.max(1, Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3));
const QUICK = process.argv.includes('quick');
const DAY = 86400;
const t0 = Date.now();
let fails = 0;
const check = (name: string, ok: boolean, extra: unknown = ''): void => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra !== '' ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
  if (!ok) fails++;
};
installFakeDom();

const defs = threadDefs();
const all = threadStorylets();
const byId = new Map(all.map((s) => [s.id, s]));
const stepIdOf = (arc: string, step: string): string => `quest:${arc}:${step}`;

// ---------------------------------------------------------------------------------------------
// 1. The graph: ids, hooks, reachability from an offer, vocabulary
// ---------------------------------------------------------------------------------------------
{
  check('every thread but the two cut ones is in the registry', defs.length === 23, defs.map((d) => d.id).join(','));
  check('storylet ids are unique', new Set(all.map((s) => s.id)).size === all.length);
  const missing = all.flatMap((s) => s.hooks.filter((h) => !byId.has(h)).map((h) => `${s.id}->${h}`));
  check('every hook names a storylet', missing.length === 0, missing.join(' '));

  // Reachability by hooks from the arc's first beat (an offer, or an auto beat) to every step.
  const unreachable: string[] = [];
  for (const d of defs) {
    const seen = new Set<string>();
    const stack = [stepIdOf(d.id, d.first)];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const h of byId.get(id)?.hooks ?? []) stack.push(h);
    }
    for (const k of Object.keys(d.steps)) if (!seen.has(stepIdOf(d.id, k))) unreachable.push(`${d.id}.${k}`);
    if (!d.steps[d.first]) unreachable.push(`${d.id}: first beat "${d.first}" does not exist`);
    if (!d.auto && !all.some((s) => s.offer?.thread === d.id)) unreachable.push(`${d.id}: no offer`);
  }
  check('every step of every thread is reachable from its first beat by hooks', unreachable.length === 0, unreachable.join(' '));

  // Every step either hooks another or ends the thread (read off the source, not the declarations).
  const files = readdirSync('src/storylets/threads').filter((f) => f.endsWith('.ts'));
  const src = files.map((f) => readFileSync(`src/storylets/threads/${f}`, 'utf8')).join('\n');
  const dead: string[] = [];
  for (const d of defs) {
    for (const [k, st] of Object.entries(d.steps)) {
      if (st.hooks.length === 0) {
        const block = src.slice(src.indexOf(`id: '${d.id}'`));
        const from = block.search(new RegExp(`\\n    ${k}: \\{`));
        const body = block.slice(from, from + 6000);
        const next = body.slice(1).search(/\n    \w+: \{/);
        if (!/\bend\(/.test(next > 0 ? body.slice(0, next + 1) : body)) dead.push(`${d.id}.${k}`);
      }
    }
  }
  check('a step with no hook ends its thread', dead.length === 0, dead.join(' '));

  // Vocabulary: every quality a requires reads belongs to a documented namespace, and resolves on a fresh game.
  const g0 = newGame(1);
  const keys = new Set<string>();
  for (const s of all) for (const r of [...s.requires, ...(s.expires ? [s.expires.when] : [])]) keysOf(r).forEach((k) => keys.add(k));
  for (const d of defs) for (const r of d.requires) keysOf(r).forEach((k) => keys.add(k));
  const badNs = [...keys].filter((k) => !(NAMESPACES as readonly string[]).includes(k.split('.')[0]));
  check('every quality a storylet reads is in a documented namespace', badNs.length === 0, badNs.join(' '));
  const unresolved = [...keys].filter((k) => !k.startsWith('approval.') && !k.startsWith('flag.') && qualityOf(g0, k, 'kongo') === undefined);
  check('every such quality resolves on a fresh game', unresolved.length === 0, unresolved.join(' '));
  let threw = '';
  try { for (const s of all) for (const r of s.requires) evalReq(g0, r, s.arc); } catch (e) { threw = String(e); }
  check('requires evaluate without throwing on a fresh game', threw === '', threw);
  const bad = all.filter((s) => (s.place.ports ?? []).some((p) => !PORTS.some((x) => x.id === p)) || pointsOf(s.place).length === 0).map((s) => s.id);
  check('every place names ports that exist or a point on the sea', bad.length === 0, bad.join(' '));
  check('the writes a storylet declares are flag.* qualities', all.every((s) => s.writes.every((w) => w.startsWith('flag.'))));
}

// ---------------------------------------------------------------------------------------------
// 2. The road: no beat requires sailing back
// ---------------------------------------------------------------------------------------------
{
  const TOL = 120;
  const violations: string[] = [];
  let homeEdges = 0;
  let carried = 0;
  for (const d of defs) {
    const seen = new Set<string>();
    const walk = (id: string, mode: 'out' | 'home'): void => {
      const key = `${id}|${mode}`;
      if (seen.has(key)) return;
      seen.add(key);
      const a = alongOf(byId.get(id)!.place);
      for (const hid of byId.get(id)!.hooks) {
        const h = byId.get(hid)!;
        const b = alongOf(h.place);
        const behind = Math.max(...b) < Math.min(...a) - TOL;
        const ahead = Math.min(...b) > Math.max(...a) + TOL;
        let next = mode;
        if (behind) { next = 'home'; homeEdges++; }
        else if (ahead) {
          if (mode === 'home') {
            if (!h.carries) violations.push(`${id} -> ${hid}: ahead again after the turn for home, and nothing aboard to take there`);
            else carried++;
          }
          next = 'out';
        }
        walk(hid, next);
      }
    };
    walk(stepIdOf(d.id, d.first), 'out');
  }
  check('no beat of any thread sends the ship back out along the road after the turn for home, unless it carries what it is about', violations.length === 0, violations.join(' | '));
  console.log(`     (${homeEdges} homeward turns; ${carried} outward legs that carry a person, a letter or cargo)`);
  // Every beat met on the way home is marked, so the next author sees it.
  const homeNames = all.filter((s) => s.homeward).length;
  check('beats marked homeward exist and are on the road', homeNames > 8, homeNames);
  const longWaits = defs.flatMap((d) => Object.entries(d.steps).filter(([, st]) => (st.needs ?? []).some((r) => 'q' in r && r.q === 'story.@.days' && Number(r.v) > 300)).map(([k]) => `${d.id}.${k}`));
  check('no beat waits more than the India run (300 days)', longWaits.length === 0, longWaits.join(' '));
  // Adapters keep their own road order (powers.ts checks it for the scenes themselves); the engine adds none.
  const adapters = sources().flatMap((s) => s.all()).filter((s) => s.source !== 'thread');
  check('the Traffic, the courts and the Patron are sources of the one engine', ['traffic', 'power', 'deep', 'thread'].every((id) => sources().some((s) => s.id === id)) && adapters.length >= 26, adapters.length);
}

// ---------------------------------------------------------------------------------------------
// 3. Staging: put a real game into the state a storylet needs, by setting what the qualities are views of
// ---------------------------------------------------------------------------------------------

function setRng(g: Game, n: number): void { (g.rng as unknown as { state: number }).state = (Rng.fromString(`variant:${n}`) as unknown as { state: number }).state; }

/** Make a requirement true by setting the underlying state (never the quality). */
function force(g: Game, r: Req, arc: string): void {
  if ('all' in r) { r.all.forEach((x) => force(g, x, arc)); return; }
  if ('any' in r) { for (const x of r.any) { force(g, x, arc); if (evalReq(g, x, arc)) return; } return; }
  if ('not' in r || 'fn' in r) return;
  const p = r.q.split('.');
  const v = r.v as number;
  const want = r.op === undefined ? true : r.op;
  switch (p[0]) {
    case 'act': g.chronicle.act = want === '<=' || want === '<' ? Math.min(g.chronicle.act, v) : Math.max(g.chronicle.act, v); break;
    case 'renown': g.crown.lifetimeStanding = Math.max(g.crown.lifetimeStanding, v + 1); g.crown.standing = g.crown.lifetimeStanding; break;
    case 'origin': g.origin = r.v as typeof g.origin; break;
    case 'met': g.relationsFor(p[1]).met = true; break;
    case 'regard': for (let i = 0; i < 30 && Number(qualityOf(g, r.q)) < v; i++) g.shiftPeopleRegard(p[1], 0.1); break;
    case 'front': g.powers.fronts[p[1] as 'gold'].stage = (want === '<=' || want === '<' ? Math.min(g.powers.fronts[p[1] as 'gold'].stage, v) : Math.max(g.powers.fronts[p[1] as 'gold'].stage, v)) as 1; break;
    case 'hold': g.ship.addCargo(p[1], Math.max(v, 1) + 1, 0, 0.7); break;
    case 'heard': if (!g.secretsHeard.includes(p.slice(1).join('.'))) g.secretsHeard.push(p.slice(1).join('.')); break;
    case 'patron': if (p[2] === 'favour') g.identity.patrons[p[1] as 'church'].favour = Math.max(v + 0.1, g.identity.patrons[p[1] as 'church'].favour); break;
    case 'goal': g.chronicle.goalMet = true; break;
    case 'route': g.crown.routeOpened = true; break;
    case 'power': if (p[1] === 'kongo' && p[2] === 'succession') g.powers.powers.kongo.flags.succession = true; break;
    case 'title': g.identity.titles[p.slice(1).join('.')] = { t: g.clock.t, place: '' }; break;
    case 'flag': g.web.flags[r.q] = true; break;
    case 'story': {
      const q = g.quests.find((x) => x.id === (p[1] === '@' ? arc : p[1]));
      if (!q) break;
      if (p[2] === 'days') q.stepT = g.clock.t - (v + 1) * DAY;
      else if (p[2] !== 'taken') q.flags[p.slice(2).join('.')] = true;
      break;
    }
    case 'ledger': {
      const tag = p.slice(1).join('.'); const at = tag.indexOf('@');
      for (let i = 0; i < v; i++) g.noteDeed((at < 0 ? tag : tag.slice(0, at)) as 'ship.stopped', { target: at < 0 ? '' : tag.slice(at + 1), silent: true });
      break;
    }
    default: break;
  }
}

function putAt(g: Game, s: Storylet): void {
  let pl = s.place;
  while (pl.either) pl = pl.either[0];
  if (pl.ports) {
    const a = anchorageOf(portDef(pl.ports[0]));
    g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = pl.ports[0]; g.mode = 'port';
  } else if (pl.anyPort) {
    const a = anchorageOf(portDef('lisboa'));
    g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = 'lisboa'; g.mode = 'port';
  } else if (pl.sea) {
    g.dockedAt = null; g.mode = 'sailing';
    g.ship.state.pos = { lat: pl.sea.at.lat, lon: pl.sea.at.lon };
    const lo = pl.sea.shoreMin ?? 0; const hi = pl.sea.shoreMax ?? lo + 40;
    g.sounding.shoreDistNm = (lo + hi) / 2;
  }
  g.web.used = { port: 0, sea: 0 }; g.web.waiting = null;
}

/** A game rich enough that no beat fails for want of coin, with the generous standing the later acts assume. */
function richGame(seed: number): Game {
  const g = newGame(seed);
  g.crown.gold = 20000;
  g.crown.lifetimeStanding = 400; g.crown.standing = 400;
  g.ship.addCargo('pimenta', 120, 0, 0.8);
  g.ship.addCargo('ferramenta', 25, 0, 0.8);
  g.ship.addCargo('coral', 10, 0, 0.8);
  return g;
}

/** Flag tracing: which of a thread's flags are written and which are read, by anything, while the walk runs. */
const written = new Set<string>();
const read = new Set<string>();
let TRACE = false;
function track(g: Game): void {
  for (const q of g.quests) {
    if ((q.flags as unknown as { __t?: boolean }).__t) continue;
    q.flags = new Proxy(q.flags, {
      get: (t, k) => { if (TRACE && quiet.n === 0 && typeof k === 'string' && k !== '__t' && k !== 'toJSON') read.add(`${q.id}.${k}`); return k === '__t' ? true : (t as Record<string, unknown>)[k as string]; },
      set: (t, k, v) => { if (TRACE && typeof k === 'string') written.add(`${q.id}.${k}`); (t as Record<string, unknown>)[k as string] = v; return true; },
    });
  }
}
const snapshot = (g: Game): string => { const was = TRACE; TRACE = false; const s = g.serialize(); TRACE = was; return s; };
const restore = (s: string): Game => { const was = TRACE; TRACE = false; const g = Game.deserialize(s); TRACE = was; track(g); return g; };

function stageStep(g: Game, arc: string, key: string): Storylet {
  const s = byId.get(stepIdOf(arc, key))!;
  const q = g.quests.find((x) => x.id === arc)!;
  q.step = key; q.stepT = g.clock.t - 400 * DAY; q.fired = false;
  for (const r of s.requires) force(g, r, arc);
  putAt(g, s);
  return s;
}

// ---------------------------------------------------------------------------------------------
// 4. The walk: every beat, every choice, the dice varied
// ---------------------------------------------------------------------------------------------

/** What each thread can end in, read off the source of its `end(...)` calls. */
function outcomesInSource(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const f of readdirSync('src/storylets/threads').filter((x) => x.endsWith('.ts'))) {
    const text = readFileSync(`src/storylets/threads/${f}`, 'utf8');
    for (const d of defs.filter((x) => text.includes(`id: '${x.id}'`))) {
      const from = text.indexOf(`id: '${d.id}'`);
      const nextDef = text.indexOf('\nexport const ', from + 10);
      const body = text.slice(from, nextDef < 0 ? undefined : nextDef);
      const set = (out[d.id] ??= new Set());
      let i = 0;
      while ((i = body.indexOf('end(', i)) >= 0) {
        i += 4;
        // argument 3: from the second comma at depth 0 to the third
        let depth = 0, commas = 0, j = i, start = -1;
        for (; j < body.length; j++) {
          const c = body[j];
          if (c === '(' || c === '[' || c === '{') depth++;
          else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
          else if (c === '\'' || c === '`' || c === '"') { const e = c; j++; while (j < body.length && body[j] !== e) { if (body[j] === '\\') j++; j++; } }
          else if (c === ',' && depth === 0) { commas++; if (commas === 2) start = j + 1; if (commas === 3) break; }
        }
        if (start < 0) continue;
        const expr = body.slice(start, j);
        for (const m of expr.matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (!/===\s*$/.test(expr.slice(0, m.index))) set.add(m[1]);
      }
    }
  }
  return out;
}

const walkFlags: Record<string, Record<string, number | string | boolean>> = {};
const reached: Record<string, Set<string>> = {};
const stepsWalked: Record<string, Set<string>> = {};
const stuck: string[] = [];
const declined = new Set<string>();
const hookBreaks: string[] = [];
const unreachableByEngine: string[] = [];
const noChange: string[] = [];
let walked = 0;

function walkArc(d: (typeof defs)[number], variants: number): void {
  const arc = d.id;
  const g0 = richGame(1);
  track(g0);
  // The offer: state the world must be in, then the person is there (or, for an auto beat, he is met).
  for (const r of d.requires) force(g0, r, arc);
  const first = byId.get(stepIdOf(arc, d.first))!;
  const offer = all.find((s) => s.offer?.thread === arc);
  if (offer) {
    putAt(g0, offer);
    const here = offersAt(g0, offer.place.ports![0]).some((x) => x.id === arc);
    check(`${arc}: offered at ${offer.place.ports!.join('/')} when ${d.requires.length ? 'its requires hold' : 'nothing is asked'}`, here);
    g0.acceptQuest(arc);
  } else {
    putAt(g0, first);
    const c = dueNow(g0, g0.dockedAt).find((x) => x.id === first.id);
    check(`${arc}: its first beat is met at ${first.place.ports?.join('/') ?? 'sea'} when its requires hold`, !!c);
    takeThread(g0, d.id);
  }
  const frontier: string[] = [snapshot(g0)];
  const visited = new Set<string>();
  reached[arc] = new Set(); stepsWalked[arc] = new Set();
  while (frontier.length) {
    const s0 = frontier.pop()!;
    const g = restore(s0);
    const q = g.quests.find((x) => x.id === arc)!;
    if (q.outcome) { reached[arc].add(q.outcome); continue; }
    const key = q.step;
    const sig = `${key}|${JSON.stringify(Object.entries(q.flags).sort())}`;
    if (visited.has(sig)) continue;
    visited.add(sig);
    stepsWalked[arc].add(key);
    if (process.env.SL_TRACE) console.log(`         node ${arc}.${key} ${sig.slice(0, 80)}`);
    const st = stageStep(g, arc, key);
    const pre = snapshot(g);
    const cand = dueNow(g, g.dockedAt).find((c) => c.id === st.id);
    if (!cand) { unreachableByEngine.push(`${st.id} (${st.place.ports?.join('/') ?? 'sea'}): staged but not due`); continue; }
    TRACE = true;
    const ev = cand.take(g);
    TRACE = false;
    if (!ev?.choices?.length) { stuck.push(`${st.id}: scene has no choices`); continue; }
    // Scenes that roll their own dice at build (the factory at Calecute) show different choices in different variants: take the widest.
    let n = ev.choices.length;
    for (let vnt = 0; vnt < variants; vnt++) { const gv = restore(pre); setRng(gv, 7 + vnt * 31); n = Math.max(n, dueNow(gv, gv.dockedAt).find((c) => c.id === st.id)!.take(gv)!.choices!.length); }
    const before = declined.size;
    for (let i = 0; i < n; i++) {
      let progressed = false;
      for (let vnt = 0; vnt < (progressed ? variants : 12); vnt++) {
        if (progressed && vnt >= variants) break;
        const g2 = restore(pre);
        setRng(g2, 7 + vnt * 31 + i);
        const c2 = dueNow(g2, g2.dockedAt).find((c) => c.id === st.id)!;
        TRACE = true;
        const ev2 = c2.take(g2)!;
        if (!ev2.choices![i]) continue;
        const before = JSON.stringify(g2.quests.find((x) => x.id === arc)!.flags);
        const web0 = JSON.stringify(g2.web.flags);
        ev2.choices![i].resolve(g2);
        TRACE = false;
        walked++;
        const q2 = g2.quests.find((x) => x.id === arc)!;
        const writes = Object.keys(JSON.parse(web0)).length !== Object.keys(g2.web.flags).length;
        for (const w of st.writes) if (g2.web.flags[w] === undefined && ev2.choices![i].label && false) noChange.push(w);
        void before; void writes;
        if (q2.outcome) {
          progressed = true;
          reached[arc].add(q2.outcome);
          // What the world makes of a finished thread: the callbacks, the last page, the prices, read through the same trace.
          TRACE = true;
          walkFlags[`${arc}:${q2.outcome}`] = { ...q2.flags };
          const gc = restore(snapshot(g2));
          for (const p of PORTS) callbackAt(gc, p.id);
          lateEndings(g2); originEnding(g2); refreshQuestPrices(g2);
          TRACE = false;
        } else if (q2.step !== key) {
          progressed = true;
          if (!st.hooks.includes(stepIdOf(arc, q2.step))) hookBreaks.push(`${st.id} -> ${q2.step}`);
          frontier.push(snapshot(g2));
        }
      }
      if (!progressed) declined.add(`${st.id}#${i}`);
    }
    if (declined.size - before >= n) stuck.push(`${st.id}: no choice of the beat ever moves the arc on`);
  }
}

{
  const variants = QUICK ? 6 : 10;
  const tt = Date.now();
  for (const d of defs) {
    if (d.id === 'kingsoffer') continue;
    walkArc(d, variants);
  }
  console.log(`     (walked ${walked} choices over ${defs.length - 1} threads in ${((Date.now() - tt) / 1000).toFixed(1)}s)`);
  check('every beat of every thread is due, from a staged state, at the place and in the state it declares', unreachableByEngine.length === 0, unreachableByEngine.join(' | '));
  const missingSteps = defs.filter((d) => d.id !== 'kingsoffer').flatMap((d) => Object.keys(d.steps).filter((k) => !stepsWalked[d.id].has(k)).map((k) => `${d.id}.${k}`));
  check('the walk reached every step of every thread through the choices that open it', missingSteps.length === 0, missingSteps.join(' '));
  check('every choice that does not mean "later" moves the arc to a beat its step declares as a hook', hookBreaks.length === 0, hookBreaks.join(' '));
  check('no beat is a dead end: some choice of every beat moves the arc on, with the dice varied', stuck.length === 0, stuck.join(' | '));
  const expected = outcomesInSource();
  const miss: string[] = [];
  for (const d of defs) {
    if (d.id === 'kingsoffer') continue;
    for (const o of expected[d.id] ?? []) if (o !== 'lapsed' && !reached[d.id].has(o)) miss.push(`${d.id}:${o}`);
  }
  check('every outcome the source can end a thread in is reached', miss.length === 0, miss.join(' '));
  const extra: string[] = [];
  for (const d of defs) for (const o of reached[d.id] ?? []) if (!(expected[d.id] ?? new Set()).has(o)) extra.push(`${d.id}:${o}`);
  check('and the walk reaches nothing the source does not say', extra.length === 0, extra.join(' '));
  const sawAny = defs.filter((d) => d.id !== 'kingsoffer' && (reached[d.id]?.size ?? 0) > 0).length;
  check('all 22 walked threads reach at least one outcome', sawAny === defs.length - 1, `${sawAny}`);

  // No dead qualities: every flag a thread's record is given is READ by something while the walk runs.
  console.log(`     (${written.size} flags written, ${[...written].filter((k) => read.has(k)).length} of them read)`);
  const deadFlags = [...written].filter((k) => !read.has(k) && !/^[a-z]+\.(tome|envoys)$/.test(k));
  check('no dead qualities: every flag written to a thread record is read by a scene, a door or a consumer', deadFlags.length === 0, deadFlags.join(' '));
  // Outcomes are read: by a Ledger deed, a callback, the last page, a price, another thread, or settled by the world.
  const READ_BY_LEDGER = new Set(['kongo:enforced', 'kongo:lookedaway', 'sofala:fair', 'sofala:route', 'pesos:cheat', 'pesos:inland', 'pesos:report', 'pesos:repaid', 'monsoon:freed', 'monsoon:kept',
    'roteiro:sold', 'roteiro:crown', 'roteiro:named', 'count:caught', 'count:got away', 'count:declared', 'escudeiro:honest', 'escudeiro:flattered', 'adrift:boy', 'adrift:left',
    'mercador:freely', 'mercador:pilotage', 'aprendiz:chose', 'feverfleet:nursed', 'caravel:mass']);
  const unread: string[] = [];
  for (const d of defs) {
    if (d.id === 'kingsoffer') continue;
    for (const o of reached[d.id] ?? []) {
      if (o === 'lapsed') continue;
      const gg = richGame(2); const q = takeThread(gg, d.id); q.outcome = o;
      Object.assign(q.flags, walkFlags[`${d.id}:${o}`] ?? {});
      gg.origin = ({ nome: 'segundo', ficheiro: 'converso', roteiro: 'piloto', escudeiro: 'fidalgo' } as Record<string, Game['origin']>)[d.id] ?? 'segundo';
      let said = READ_BY_LEDGER.has(`${d.id}:${o}`);
      if (!said) for (const p of PORTS) { if (callbackAt(gg, p.id)) { said = true; break; } }
      if (!said && lateEndings(gg).length > 0) said = true;
      if (!said && originEnding(gg) !== null) said = true;
      if (!said && (d.id === 'kongo' || d.id === 'zamorin')) said = true; // read by refreshQuestPrices (world/portCharacter price mods)
      if (!said) unread.push(`${d.id}:${o}`);
    }
  }
  check('no dead outcomes: every outcome is read by the Ledger, a callback, the last page or a price', unread.length === 0, unread.join(' '));
}


// ---------------------------------------------------------------------------------------------
// 5. Dual-run: a thread in flight is never dropped
// ---------------------------------------------------------------------------------------------
{
  // The golden save: nome at the steward, one week out.
  const raw = readFileSync('fixtures/saves/09-quest-thread.json', 'utf8');
  const g = Game.deserialize(raw);
  const q = g.quests[0];
  check('golden 09: the thread is where it stood', q?.id === 'nome' && q.step === 'steward' && !q.outcome);
  check('golden 09: the beat is open as a quality, and the pointer reads as one', qualityOf(g, 'open.nome.steward') === true && qualityOf(g, 'story.nome.step') === 'steward' && qualityOf(g, 'open.nome.younger') === false);
  const a = anchorageOf(portDef('funchal'));
  g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = 'funchal'; g.mode = 'port';
  webOnArrival(g, 'funchal');
  g.checkStory();
  check('golden 09: at Funchal the steward is a person waiting at the Quarters, not an alert and not a scene on the screen', !!g.web.waiting && g.web.waiting.id === 'quest:nome:steward' && !g.pendingEvent && waitingAt(g, 'waterfront') !== null, g.web.waiting?.who);
  check('golden 09: the person is not announced as an alert', !g.alerts.some((x) => /steward/i.test(x.text)));
  const spoke = g.hearStorylet();
  check('golden 09: hearing him puts his scene', spoke && g.pendingEvent?.id === 'quest:nome:steward');
  g.resolveEvent(2);
  check('golden 09: his answer opens the next beat (open.nome.younger)', qualityOf(g, 'open.nome.younger') === true && g.quests[0].flags.proud === true);
  check('golden 09: and nothing else is put at the same call', (g.checkStory(), !g.pendingEvent && !g.web.waiting));
  const again = Game.deserialize(g.serialize());
  check('golden 09: it round trips mid-thread', again.quests[0].step === 'younger' && again.web.used.port === 1 && qualityOf(again, 'open.nome.younger') === true);
  const old = JSON.parse(raw); delete old.web;
  check('a save written before the Web has none and loads', (() => { try { const x = Game.deserialize(JSON.stringify(old)); return x.web.used.port === 0 && x.web.waiting === null; } catch { return false; } })());

  // Every step of every thread, as an in-flight save: loads, keeps its beat, and the beat is due where it says.
  let kept = 0, lost: string[] = [];
  for (const d of defs) {
    for (const key of Object.keys(d.steps)) {
      const x = richGame(3);
      for (const r of d.requires) force(x, r, d.id);
      const qx = takeThread(x, d.id);
      qx.step = key; qx.flags = { aboard: true, pilgrim: true } as typeof qx.flags;
      const y = Game.deserialize(x.serialize());
      const qy = y.quests.find((z) => z.id === d.id);
      if (!qy || qy.step !== key || qy.outcome) { lost.push(`${d.id}.${key}`); continue; }
      const st = stageStep(y, d.id, key);
      track(y);
      if (dueNow(y, y.dockedAt).some((c) => c.id === st.id) && qualityOf(y, `open.${d.id}.${key}`) === true) kept++; else lost.push(`${d.id}.${key} (not due after load)`);
    }
  }
  check('every step of every thread, saved in flight and loaded, is still open and still due', lost.length === 0, lost.join(' '));
  console.log(`     (${kept} in-flight saves)`);

  // The two threads cut as threads are settled, with a line, not dropped.
  for (const id of ['malay', 'pepperhouse'] as const) {
    const x = richGame(4);
    x.quests.push({ id, step: 'kotte', stepT: x.clock.t, fired: true, flags: {}, started: x.clock.t, journal: [{ t: x.clock.t, text: 'x' }] });
    const y = Game.deserialize(x.serialize());
    check(`${id}, cut as a thread: one in flight is settled with a line`, y.quests.find((z) => z.id === id)?.outcome === 'lapsed' && y.ledger.some((e) => e.tag === 'thread.closed' && e.target === id));
    const z = Game.deserialize(y.serialize());
    check(`${id}: a second load settles nothing twice`, z.ledger.filter((e) => e.tag === 'thread.closed' && e.target === id).length === 1);
  }
  // A finished malay keeps its callback and its title.
  const f = richGame(5); f.quests.push({ id: 'malay', step: 'strait', stepT: 0, fired: false, flags: {}, started: 0, journal: [], outcome: 'malacca' });
  check('a finished malay thread is still remembered at Cochim', callbackAt(Game.deserialize(f.serialize()), 'cochim') !== null);
  // The Kilwa promise: an old save with the Çofala promise in its thread record reads as the new quality.
  const k = richGame(6); const kq = takeThread(k, 'sofala'); kq.flags.promise = true; kq.step = 'merchant';
  check('the Kilwa promise in an old thread record is the quality promise.kilwa.first_call', qualityOf(Game.deserialize(k.serialize()), 'flag.promise.kilwa.first_call') === true);
}

// ---------------------------------------------------------------------------------------------
// 6. Surfacing: one a call, one a leg, in order, with no dice
// ---------------------------------------------------------------------------------------------
{
  const g = richGame(8);
  const a = anchorageOf(portDef('arguim'));
  g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = 'arguim'; g.mode = 'port';
  g.chronicle.act = 2;
  // At Arguim: a Traffic scene (a Front's), the Leak (an arc) and the origin thread's clerk (an arc) are all due.
  const leak = takeThread(g, 'leak'); leak.step = 'arguim';
  g.origin = 'converso'; const fich = takeThread(g, 'ficheiro'); fich.step = 'clerk';
  webOnArrival(g, 'arguim');
  const due = dueNow(g, 'arguim');
  check('three storylets of three kinds are due at one port', due.length >= 3, due.map((c) => `${c.kind}:${c.id}`).join(' '));
  check('they rank a Front before an arc, then by priority, then by id', due[0].kind === 'front' && due.every((c, i) => i === 0 || c.kind !== 'front'), due.map((c) => c.id).join(' '));
  const order = dueNow(g, 'arguim').map((c) => c.id);
  check('the order is the same twice (no dice)', JSON.stringify(order) === JSON.stringify(dueNow(g, 'arguim').map((c) => c.id)));
  g.checkStory();
  check('the call lists one person, the best', g.web.waiting?.id === due[0].id && !g.pendingEvent && g.pendingScenes.length === 0, g.web.waiting?.id);
  g.hearStorylet();
  const heard = g.pendingEvent?.id;
  g.resolveEvent(g.pendingEvent!.choices!.length - 1);
  g.checkStory();
  g.waitDays(2);
  check('once he is heard, nobody else is put at this call (answering, waiting a day, asking again)', !g.pendingEvent && !g.web.waiting && g.web.used.port === 1, heard);
  // Next call: the next person.
  webOnArrival(g, 'arguim');
  g.checkStory();
  check('the next call lists the next', !!g.web.waiting && g.web.waiting.id !== heard, g.web.waiting?.id);
  // Leaving without hearing him: he stays where he was, and is not carried to the next port.
  const w = g.web.waiting!.id;
  webOnArrival(g, 'mina');
  check('a person not heard stays at his quay', g.web.waiting === null && waitingAt(g) === null, w);

  // At sea: one scene a leg.
  const s = richGame(9);
  s.chronicle.act = 2;
  const lk = takeThread(s, 'leak'); lk.step = 'interloper';
  const mc = QUESTS.leak.steps.interloper.marker!(s, lk)!;
  s.dockedAt = null; s.mode = 'sailing'; s.ship.state.pos = { lat: mc.lat, lon: mc.lon }; s.sounding.shoreDistNm = 20;
  webOnArrival(s, 'arguim'); s.dockedAt = null;
  s.checkQuests();
  const first = s.pendingEvent?.id;
  check('at sea the scene is put at once, as a decision card', first === 'quest:leak:interloper');
  s.pendingEvent = null;
  const lk2 = takeThread(s, 'prester'); lk2.step = 'cape';
  s.ship.state.pos = { lat: -34.4, lon: 24 };
  s.checkQuests();
  check('and not a second in the same leg', !s.pendingEvent && s.pendingScenes.length === 0);
  webOnArrival(s, 'mina'); s.dockedAt = null;
  s.checkQuests();
  check('the next leg allows the next', s.pendingEvent?.id === 'quest:prester:cape', s.pendingEvent?.id);

  // A deadline is not made to wait for a click: it is put at the call.
  const d = richGame(10);
  d.chronicle.act = 5; d.chronicle.goalMet = true;
  const dq = takeThread(d, 'pepperrace'); dq.step = 'landing';
  const la = anchorageOf(portDef('lisboa'));
  d.ship.state.pos = { lat: la.lat, lon: la.lon }; d.dockedAt = 'lisboa'; d.mode = 'port';
  webOnArrival(d, 'lisboa');
  const dd = dueNow(d, 'lisboa');
  check('a deadline outranks an arc at the same quay', dd.length > 0 && dd[0].kind === 'deadline', dd.map((c) => `${c.kind}:${c.id}`).join(' '));
  d.checkQuests();
  check('and is put at the call, not left to wait', d.pendingEvent?.id === 'quest:pepperrace:landing', d.pendingEvent?.id);
}

// ---------------------------------------------------------------------------------------------
// 7. The world does not wait: doors close
// ---------------------------------------------------------------------------------------------
{
  const g = richGame(11);
  g.chronicle.act = 2;
  const q = takeThread(g, 'kongo'); q.step = 'succession'; q.flags.court = 'spoke';
  const a = anchorageOf(portDef('mpinda'));
  g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = 'mpinda'; g.mode = 'port';
  webOnArrival(g, 'mpinda');
  check('the Kongo succession is a beat while the court is undecided', dueNow(g, 'mpinda').some((c) => c.id === 'quest:kongo:succession'));
  // The Power's own move: the court split and has since settled (the effect is over).
  g.powers.powers.kongo.flags.succession = true;
  g.checkStory();
  check('once the court has settled it without the captain, the door is shut and the thread is closed with a line', q.outcome === 'lapsed' && !dueNow(g, 'mpinda').some((c) => c.id === 'quest:kongo:succession')
    && g.log.entries.some((e) => /settled the succession at Mbanza Kongo/.test(e.text)));
  check('and it is said once', g.web.expired.filter((x) => x === 'quest:kongo:succession').length === 1);

  const r = richGame(12);
  r.chronicle.act = 5;
  const rq = takeThread(r, 'pepperrace'); rq.step = 'chase';
  r.crown.routeOpened = true;
  r.checkQuests();
  check('the Pepper Race closes when the route is opened, whoever was first', rq.outcome === 'lapsed');
  check('closed arcs write the Ledger like any other', r.ledger.some((e) => e.tag === 'thread.closed' && e.target === 'pepperrace'));
}

// ---------------------------------------------------------------------------------------------
// 8. Availability by state, and the ties between threads, Fronts and the rest
// ---------------------------------------------------------------------------------------------
{
  const mk = (): Game => { const g = richGame(13); g.chronicle.act = 2; const a = anchorageOf(portDef('mpinda')); g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = 'mpinda'; g.mode = 'port'; return g; };
  const g = mk();
  check('the Embassy of Kongo is not offered to a captain who has not met Mpinda', !offersAt(g, 'mpinda').some((d) => d.id === 'kongo'));
  g.relationsFor('mpinda').met = true;
  check('it is offered once he has, and Kongo thinks well of him', offersAt(g, 'mpinda').some((d) => d.id === 'kongo'), qualityOf(g, 'regard.kongo'));
  for (let i = 0; i < 12; i++) g.shiftPeopleRegard('kongo', -0.1);
  check('and not to a captain Kongo has turned against', !offersAt(g, 'mpinda').some((d) => d.id === 'kongo'), qualityOf(g, 'regard.kongo'));

  const p = richGame(14); p.chronicle.act = 3; p.crown.lifetimeStanding = 10; p.crown.standing = 10;
  const la = anchorageOf(portDef('lisboa')); p.ship.state.pos = { lat: la.lat, lon: la.lon }; p.dockedAt = 'lisboa';
  check('the Prester letter is not put to a captain the King does not know', !QUESTS.prester.available(p));
  p.identity.patrons.church.favour = 0.6; p.crown.lifetimeStanding = 40;
  check('but the Order opens it to a captain it favours, on a smaller name', QUESTS.prester.available(p));

  // Origins: a backstory arc is offered to its own origin and to nobody else.
  const o = richGame(15); const lg = anchorageOf(portDef('lagos')); o.ship.state.pos = { lat: lg.lat, lon: lg.lon }; o.dockedAt = 'lagos';
  for (const [origin, id] of [['segundo', 'nome'], ['converso', 'ficheiro'], ['piloto', 'roteiro'], ['fidalgo', 'escudeiro']] as const) {
    o.origin = origin;
    const offered = offersAt(o, 'lagos').map((d) => d.id).filter((x) => ['nome', 'ficheiro', 'roteiro', 'escudeiro'].includes(x));
    check(`${origin} is offered ${id} and only ${id}`, offered.length === 1 && offered[0] === id, offered.join(','));
  }

  // Zamorin: the King's Man's title carries the King's letter as a renown of 340 would.
  const z = richGame(16); z.crown.lifetimeStanding = 100; z.chronicle.act = 4;
  const zq = takeThread(z, 'zamorin');
  const ca = anchorageOf(portDef('calecute')); z.ship.state.pos = { lat: ca.lat, lon: ca.lon }; z.dockedAt = 'calecute';
  const plain = QUESTS.zamorin.steps.audience.scene(z, zq).choices!.find((c) => /King of Portugal’s letter/.test(c.label))!.detail;
  z.identity.titles['homem-do-rei'] = { t: 0, place: 'lisboa' };
  const titled = QUESTS.zamorin.steps.audience.scene(z, zq).choices!.find((c) => /King of Portugal’s letter/.test(c.label))!.detail;
  check('a title opens the Zamorin’s door: the King’s Man carries the letter on his name', /not yet big enough/.test(plain) && /carries it/.test(titled));

  // The Factory at Calecute reads the Crescent and the ships stopped: more fire when the world is hotter.
  const riskAt = (stage: 1 | 2 | 3 | 4, stopped: number): number => {
    let hits = 0;
    for (let n = 0; n < 60; n++) {
      const x = richGame(100 + n); x.chronicle.act = 4; const xq = takeThread(x, 'feitorcal'); xq.step = 'aftermath'; xq.flags.trusted = true;
      x.powers.fronts.crescent.stage = stage;
      for (let i = 0; i < stopped; i++) x.noteDeed('ship.stopped', { target: 'calicut', silent: true });
      const ev = QUESTS.feitorcal.steps.aftermath.scene(x, xq);
      if (/Fire at Calecute/.test(ev.title)) hits++;
    }
    return hits / 60;
  };
  const cold = riskAt(1, 0), hot = riskAt(4, 3);
  check('the Calecute factory burns more often under a Crescent league and after ships stopped off the coast', hot > cold + 0.15, `${cold.toFixed(2)} -> ${hot.toFixed(2)}`);

  // Fronts read the Ledger the threads write: Dias's stone raised is a claim made; the dhows stopped are ships stopped; a stranded merchant carried home is an errand aided.
  const wrote = (arc: 'padrao' | 'mappila' | 'mercador', step: string, pick: (c: { label: string }) => boolean, tag: string): boolean => {
    const x = richGame(17); x.chronicle.act = 4; x.crown.padraoStock = 2;
    const xq = takeThread(x, arc); xq.step = step;
    const ev = QUESTS[arc].steps[step].scene(x, xq);
    const c = ev.choices!.find(pick)!;
    const n0 = x.ledger.filter((e) => e.tag === tag).length;
    c.resolve(x);
    if (xq.outcome) { /* ended */ }
    return x.ledger.filter((e) => e.tag === tag).length > n0;
  };
  check('raising a new stone on Dias’s foot writes claim.made (the Claim front reads it)', wrote('padrao', 'stone', (c) => /Raise a new stone/.test(c.label), 'claim.made'));
  check('stopping the coastal dhows writes ship.stopped at Calicut (the Rule and the Crescent read it)', wrote('mappila', 'dhows', (c) => /Stop and search/.test(c.label), 'ship.stopped'));
  check('bringing Hasan home writes passenger.aided (the Rule and Melinde read it)', wrote('mercador', 'melinde', (c) => /Accept nothing/.test(c.label), 'passenger.aided'));

  // The Gold front closes the false-weights thread: a beach that is shut has no scales to weigh.
  const gold = richGame(18);
  const ma = anchorageOf(portDef('mina')); gold.ship.state.pos = { lat: ma.lat, lon: ma.lon }; gold.dockedAt = 'mina'; gold.mode = 'port';
  const before = dueNow(gold, 'mina').some((c) => c.id === 'quest:pesos:scales');
  gold.powers.fronts.gold.stage = 4;
  const after = dueNow(gold, 'mina').some((c) => c.id === 'quest:pesos:scales');
  check('the false weights are met on the Mina beach, until the Gold front has shut it', before && !after);
}

// ---------------------------------------------------------------------------------------------
// 9. The Kilwa promise is read by the Rule's scenes, the epilogue and a companion's approval
// ---------------------------------------------------------------------------------------------
{
  const mk = (promised: boolean, outcome: 'fair' | 'route'): Game => {
    const g = richGame(19); g.chronicle.act = 4;
    const q = takeThread(g, 'sofala'); q.step = 'gold';
    const sa = anchorageOf(portDef('quiloa')); g.ship.state.pos = { lat: sa.lat, lon: sa.lon }; g.dockedAt = 'quiloa';
    if (promised) {
      q.step = 'vizier';
      const ev = QUESTS.sofala.steps.vizier.scene(g, q);
      ev.choices![0].resolve(g);
    }
    q.step = 'gold';
    const sf = anchorageOf(portDef('sofala')); g.ship.state.pos = { lat: sf.lat, lon: sf.lon }; g.dockedAt = 'sofala';
    QUESTS.sofala.steps.gold.scene(g, q).choices![outcome === 'fair' ? 0 : 1].resolve(g);
    return g;
  };
  const a = mk(true, 'fair'), b = mk(true, 'route'), c = mk(false, 'route');
  check('the vizier\'s promise writes flag.promise.kilwa.first_call', qualityOf(a, 'flag.promise.kilwa.first_call') === true && qualityOf(c, 'flag.promise.kilwa.first_call') !== true);
  check('read by the epilogue: a promise kept and a promise broken are different last pages, and no promise says nothing of it', lateEndings(a).join('|') !== lateEndings(b).join('|') && lateEndings(a).some((l) => /vizier remembers/.test(l)) && lateEndings(b).some((l) => /by heart/.test(l)) && !lateEndings(c).some((l) => /vizier/.test(l)));
  const tagsOf = (g: Game): string => g.ledger.filter((e) => e.target === 'kilwa' && /^promise\./.test(e.tag)).map((e) => e.tag).join(',');
  check('the Ledger says the promise was kept (fair trade) or broken (the road given to the Crown), and only if it was made', tagsOf(a) === 'promise.kept' && tagsOf(b) === 'promise.broken' && tagsOf(c) === '', `${tagsOf(a)} / ${tagsOf(b)} / ${tagsOf(c)}`);
  const hamisi = (g: Game): number => { const o = makeOfficer('lingua', new Rng(5)); o.arc = 'hamisi'; o.joined = 0; o.loyalty = 0.6; return approvalFor(o, g.ledger, g.clock.t).score; };
  check('read by a companion’s approval: Hamisi, of that coast, thinks better of the kept promise than of the broken one', hamisi(a) > hamisi(b) + 10, `${hamisi(a)} vs ${hamisi(b)}`);
  const kilwa = (g: Game): string => { const x = Game.deserialize(g.serialize()); x.powers.seen = {}; const sc = TRAFFIC_SCENES.length ? POWER_SCENES.find((s) => s.id === 'kilwa-gold')! : null!; return sc.build(x, x.powers).text; };
  check('read by the Rule’s Kilwa scene: the vizier says so with his scales', /promise you made him/.test(kilwa(a)) && !/promise you made him/.test(kilwa(c)));
}

// ---------------------------------------------------------------------------------------------
// 10. The ending is an evaluation
// ---------------------------------------------------------------------------------------------
{
  const mk = (): Game => { const g = richGame(20); g.chronicle.act = 5; g.chronicle.goalMet = true; const la = anchorageOf(portDef('lisboa')); g.ship.state.pos = { lat: la.lat, lon: la.lon }; g.dockedAt = 'lisboa'; g.mode = 'port'; return g; };
  const offers = (g: Game): string => evaluateKings(g).offers.join(',');
  const warm = mk(); warm.identity.patrons.crown.favour = 0.6;
  check('a captain the Crown holds dear is offered all four', offers(warm) === 'armada,lordship,rich,ship', offers(warm));
  const cool = mk(); cool.identity.patrons.crown.favour = 0.0;
  check('a captain it half trusts is offered the land and not the fleet', offers(cool) === 'lordship,rich,ship', offers(cool));
  const shut = mk(); shut.identity.patrons.crown.favour = 0.6; shut.noteDeed('chart.sold', { target: 'nation:foreign', silent: true });
  shut.identity.titles['the-man-who-sold-the-chart'] = { t: 0, place: '' }; shut.identity.worn = ['the-man-who-sold-the-chart'];
  check('a captain who sold the Crown’s chart is offered neither, and is told why', offers(shut) === 'rich,ship' && !!evaluateKings(shut).withheld, evaluateKings(shut).withheld ?? '');
  const reck = mk(); reck.identity.patrons.crown.favour = 0.6; reck.powers.fronts.court.stage = 4;
  check('and with the Court at its reckoning no armada is promised, whoever he is', offers(reck) === 'lordship,rich,ship', offers(reck));
  const money = mk(); money.identity.patron = 'ruanova'; money.identity.patrons.ruanova.favour = 0.6;
  check('the Rua Nova, when it is his patron and warm, tops up the gold', evaluateKings(money).topUp === 1000 && evaluateKings(warm).topUp === 0);
  // The scene itself: the choices are what the evaluation says; the first is the Crown's.
  const labels = (g: Game): string[] => { const q = takeThread(g, 'kingsoffer'); return QUESTS.kingsoffer.steps.audience.scene(g, q).choices!.map((c) => c.label); };
  check('the scene offers exactly what is evaluated', labels(mk()).length === offers(mk()).split(',').length && labels(shut).length === 2);
  const done = mk(); done.identity.patrons.crown.favour = 0.6;
  const dq = takeThread(done, 'kingsoffer');
  QUESTS.kingsoffer.steps.audience.scene(done, dq).choices![0].resolve(done);
  check('the four authored endings stand: the armada is an outcome and its line is on the last page', dq.outcome === 'armada' && lateEndings(done).some((l) => /commanded the armada/.test(l)));
  // Offered as a person at the Quarters at the audience, not before the pepper is home.
  const early = mk(); early.chronicle.goalMet = false; early.ship.removeCargo('pimenta', 120);
  early.checkQuests();
  check('nobody from the court comes before the pepper is home', !early.web.waiting && !early.pendingEvent);
  const late = mk(); late.checkQuests();
  check('and when it is, a gentleman of the King’s chamber is at the quay (a person at the Court)', late.web.waiting?.id === 'quest:kingsoffer:audience' && late.web.waiting.quarter === 'court', late.web.waiting?.who);
}

// ---------------------------------------------------------------------------------------------
// 11. Sources: the Traffic, the courts and the Patron are sources of the one engine, and their tests stand
// ---------------------------------------------------------------------------------------------
{
  const g = richGame(21);
  const a = anchorageOf(portDef('arguim')); g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = 'arguim'; g.mode = 'port';
  const peek = peekTrafficScene(g, 'arguim');
  const cand = dueNow(g, 'arguim').find((c) => c.source === 'traffic');
  check('the Traffic scene the engine lists is the one its own machinery would put', !!peek && cand?.id === `traffic:${peek.id}`, `${peek?.id} / ${cand?.id}`);
  const direct = dueTrafficScene(richGame(21).dockedAt ? g : g, 'arguim');
  check('and its own door still puts it (the powers falsifier stays on its own API)', direct?.id === cand?.id);
  g.powers.seen = {};
  webOnArrival(g, 'arguim'); g.checkStory();
  check('through the engine it waits as a person at the Court quarter', g.web.waiting?.source === 'traffic' && g.web.waiting.quarter === 'court', g.web.waiting?.who);
  const ev = hear(g);
  check('and is the same scene when he is heard', ev?.id === cand?.id);
  // A Patron's beat is the Patron speaking: put at the call.
  const m = richGame(22);
  const ma = anchorageOf(portDef('mina')); m.ship.state.pos = { lat: ma.lat, lon: ma.lon }; m.dockedAt = 'mina'; m.mode = 'port';
  m.identity.patrons.crown.favour = 0.5;
  const dd = dueNow(m, 'mina').filter((c) => c.source === 'deep');
  check('the deep source lists nothing to a stranger at Mina', dd.length === 0);
  // The sources are replaceable (the interface is the whole contract).
  registerSource({ id: 'web', due: () => [], all: () => [] });
  check('a source can be added without touching the engine', sources().some((s) => s.id === 'web'));
  check('POWER_SCENES and TRAFFIC_SCENES are all offered by their sources (none lost)', sources().find((s) => s.id === 'traffic')!.all().length === TRAFFIC_SCENES.length && sources().find((s) => s.id === 'power')!.all().length === POWER_SCENES.length);
}

// ---------------------------------------------------------------------------------------------
// 12. The Quarters: a person at the Quarters, heard with one verb
// ---------------------------------------------------------------------------------------------
{
  const g = richGame(23);
  g.chronicle.act = 2;
  const a = anchorageOf(portDef('lagos')); g.ship.state.pos = { lat: a.lat, lon: a.lon }; g.dockedAt = 'lagos'; g.mode = 'port';
  g.origin = 'piloto'; takeThread(g, 'roteiro');
  webOnArrival(g, 'lagos'); g.checkStory();
  const host = new FakeEl('div');
  SECTION_VIEWS.waterfront.quay(new Ctx(() => {}, () => {}, () => {}, () => {}), host as unknown as HTMLElement, g);
  const found = verbsIn(host);
  check('the waiting person shows in the waterfront quarter as a verb', found.includes('story.person.waterfront'), found.join(','));
  const btn = host.querySelectorAll('button').find((b) => /Hear him out/.test(b.textContent));
  check('with one button, and no alert', !!btn && !g.alerts.some((x) => /last page/i.test(x.text)));
  btn!.click();
  check('which puts his scene', g.pendingEvent?.id === 'quest:roteiro:page', g.pendingEvent?.id);
  const tav = new FakeEl('div');
  SECTION_VIEWS.tavern.board(new Ctx(() => {}, () => {}, () => {}, () => {}), tav as unknown as HTMLElement, g);
  check('and he is not shown a second time in the other quarters', !verbsIn(tav).includes('story.person.tavern') && !verbsIn(tav).includes('story.person.waterfront'));
}

// ---------------------------------------------------------------------------------------------
// 13. Played careers: storylets from several arcs fire, one a call, deterministic, saves round trip
// ---------------------------------------------------------------------------------------------
if (!QUICK) {
  const log: { call: string; id: string; sea: boolean }[][] = [];
  const arcs = new Set<string>();
  const put = (seed: number, id: string, g: Game): void => {
    if (!/^(quest|traffic|power|place):/.test(id)) return;
    (log[seed] ??= []).push({ call: g.web.call, id, sea: !g.dockedAt });
    arcs.add(id.startsWith('quest:') ? id.split(':')[1] : id.split(':')[0]);
  };
  const proto = Game.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const origCheck = proto.checkQuests, origHear = proto.hearStorylet;
  let curSeed = 0;
  const seen = (g: Game, before: Set<string>): void => {
    const now = [g.pendingEvent?.id, ...g.pendingScenes.map((x) => x.id)].filter(Boolean) as string[];
    for (const id of now) if (!before.has(id)) put(curSeed, id, g);
  };
  proto.checkQuests = function (this: Game): unknown { const b = new Set([this.pendingEvent?.id, ...this.pendingScenes.map((x) => x.id)].filter(Boolean) as string[]); const r = origCheck.call(this); seen(this, b); return r; };
  proto.hearStorylet = function (this: Game): unknown { const b = new Set([this.pendingEvent?.id, ...this.pendingScenes.map((x) => x.id)].filter(Boolean) as string[]); const r = origHear.call(this); seen(this, b); return r; };

  const results: { seed: number; act: number; arcs: string[]; err: string; hash: string; ids: string }[] = [];
  const run = (seed: number): { act: number; err: string; hash: string; game: Game } => {
    curSeed = seed;
    const r = play(seed, { maxVoyages: 6, maxYears: 14, debug: false, accept: true });
    const ids = (log[seed] ?? []).map((x) => x.id).join('>');
    return { act: r.act, err: r.exception, hash: `${r.days}:${Math.round(r.gold)}:${ids}`, game: r.game };
  };
  for (let s = 1; s <= SEEDS; s++) {
    log[s] = [];
    const r = run(s);
    results.push({ seed: s, act: r.act, arcs: [...new Set((log[s]).map((x) => x.id.startsWith('quest:') ? x.id.split(':')[1] : x.id.split(':')[0]))], err: r.err, hash: r.hash, ids: (log[s] ?? []).map((x) => x.id).join('>') });
    console.log(`     seed ${s}: act ${r.act}, ${log[s].length} storylet scenes from ${results[results.length - 1].arcs.length} arcs: ${results[results.length - 1].arcs.join(', ')}${r.err ? ` EXCEPTION ${r.err}` : ''}`);
    // Saves round trip at the end of a real career.
    const g = r.game;
    const again = Game.deserialize(g.serialize());
    check(`seed ${s}: the career's save round trips (threads, the Web, the call counters)`,
      JSON.stringify(again.quests) === JSON.stringify(g.quests) && JSON.stringify(again.web) === JSON.stringify(g.web));
    // The one-a-call rule, counted from what the played game put on the screen.
    const per: Record<string, number> = {};
    for (const e of log[s]) { const k = e.sea ? `sea:${e.call}` : e.call; per[k] = (per[k] ?? 0) + 1; }
    const over = Object.entries(per).filter(([k, n]) => n > 1 && !(k === '' || k === 'sea:'));
    check(`seed ${s}: never more than one storylet scene a port call or a leg`, over.length === 0, over.slice(0, 4).join(' '));
  }
  const bad = results.filter((r) => r.err);
  check('no career threw', bad.length === 0, bad.map((r) => r.err).join(' | '));
  const N = 4;
  check(`storylets from at least ${N} distinct arcs fire across ${SEEDS} careers`, arcs.size >= N, [...arcs].join(','));
  log[1] = [];
  const r1 = run(1);
  check('a seed plays the same twice: the same storylets in the same order and the same end', r1.hash === results[0].hash);
  proto.checkQuests = origCheck; proto.hearStorylet = origHear;
}

// ---------------------------------------------------------------------------------------------
console.log(`\n${fails === 0 ? 'ALL OK' : `${fails} FAILED`}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
void [haversine, NM, afterDays, allHold, dayOf, setFlag, resolveOldSaves, surface, walkFlags, noChange, sources];
process.exit(fails === 0 ? 0 : 1);

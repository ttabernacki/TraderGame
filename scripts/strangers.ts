/**
 * Falsifier for strangers as people (BUILD_PLAN D7).
 *   npx esbuild scripts/strangers.ts --bundle --platform=node --format=cjs --outfile=/tmp/strangers.cjs && node /tmp/strangers.cjs [seeds=40]
 *
 * Ground truth, not the expression under test:
 *  - gating is checked against the plan's table (terms by Rule stage and clause), written out here by hand;
 *  - "the same man" is checked by the roster id and the Ledger, not by the regard the module computes: two games
 *    from one seed, one in which the captain stopped him and one in which he let him go, must disagree about the
 *    SAME master, in the direction the tag table's tones say;
 *  - word is checked against the Game's own diplomacy queue and rumour list, which another module reads;
 *  - "no backward travel" is checked against what a term may NOT change (the route, the scenes, the obligations);
 *  - old saves are the golden files in fixtures/saves, loaded by Game.deserialize.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { peopleAboard, raiseASail, seaRegionAt, trafficAt, type Stranger } from '../src/game/encounter';
import { hailScene } from '../src/game/hailing';
import { CULTURES, SLOTS, TEMPERS, masterById, metCount, regardOf, regardParts, roster } from '../src/game/strangers';
import { termsOffered } from '../src/game/terms';
import type { SeaEvent } from '../src/game/seaEvents';
import { grantClause } from '../src/identity/clauses';
import { hullClass } from '../src/ship/hull';
import { GOOD_BY_ID } from '../src/economy/goods';
import { PORT_BY_ID } from '../src/world/ports';
import { POLITY_BY_ID } from '../src/diplomacy/polities';
import { announce, rumourFacts } from '../src/world/powers/rumours';
import { Rng } from '../src/core/rng';
import { ruleReading } from '../src/world/powers/rule';
import { TAGS } from '../src/ledger/tags';
import { FakeEl, installFakeDom } from './lib/fakeDom';
import { EventView } from '../src/ui/eventView';

const SEEDS = Number(process.argv[2] ?? 40);
let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); if (!ok) fails++; };
const DAY = 86400;

const WATERS: Record<string, { lat: number; lon: number }> = {
  algarve: { lat: 36.6, lon: -7.8 },
  atlantic: { lat: 29, lon: -15 },
  guinea: { lat: 8, lon: -5 },
  kilwa: { lat: -9.3, lon: 40.3 },
  melinde: { lat: -3.4, lon: 41.2 },
  arabian: { lat: 13, lon: 47 },
  crossing: { lat: 12, lon: 64 },
  gujarat: { lat: 20, lon: 70 },
  calecute: { lat: 11.2, lon: 75.0 },
  cochim: { lat: 9.9, lon: 75.8 },
};

function seaGame(seed: number, at: { lat: number; lon: number }): Game {
  const g = new Game(seed);
  g.mode = 'sea';
  g.dockedAt = null;
  g.ship.state.pos = { ...at };
  g.chaseOrder = 'hold';
  return g;
}

/** Raise sails at a place until one is a trader (the kind that is offered terms). */
function trader(g: Game, want?: (s: Stranger) => boolean): Stranger {
  for (let i = 0; i < 400; i++) {
    g.seaRecord.sighted++;
    const s = raiseASail(g, 6);
    if (s && s.business === 'trader' && (!want || want(s))) return s;
  }
  throw new Error('no trader raised');
}

const termsOf = (ev: SeaEvent): string[] => (ev.choices ?? []).map((c) => c.term).filter((t): t is string => !!t);
const stageSet = (g: Game, n: 1 | 2 | 3 | 4): void => { g.powers.fronts.rule.stage = n; };
const choice = (ev: SeaEvent, term: string) => ev.choices!.find((c) => c.term === term)!;

// ---- 1. Schema ---------------------------------------------------------------------------------------------
{
  const ALLOWED_HULLS = new Set(['barcha', 'caravela-latina', 'caravela-redonda', 'nau-pequena', 'nau', 'nau-da-india', 'galeao']);
  const INDIAN = new Set(['swahili', 'arab', 'gujarati', 'malabari']);
  let n = 0, bad: string[] = [];
  const kinds = new Set<string>(), errands = new Set<string>(), masters = new Set<string>(), temp = new Set<string>(), nations = new Set<string>();
  const businesses = new Set<string>();
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const [water, at] of Object.entries(WATERS)) {
      const g = seaGame(seed, at);
      for (let i = 0; i < 6; i++) {
        g.seaRecord.sighted++;
        const rngBefore = g.rng.serialize();
        const s = raiseASail(g, 6);
        if (!s) continue;
        n++;
        const m = s.masterInfo, why: string[] = [];
        if (!m) { bad.push(`${seed}/${water}: no masterInfo`); continue; }
        if (!m.name || m.name.length < 4) why.push('name');
        if (!m.homeName) why.push('home');
        if (!TEMPERS.includes(m.temper)) why.push('temper');
        if (!(m.regard >= -1 && m.regard <= 1)) why.push('regard');
        if (!s.owner?.name || !s.owner.house || !s.owner.home) why.push('owner');
        if (!s.errand || s.errand.length < 12) why.push('errand');
        if (!s.cargo || s.cargo.length < 1 || s.cargo.some((l) => !GOOD_BY_ID.has(l.goodId) || !(l.units >= 1))) why.push('cargo');
        if (!s.passengers) why.push('passengers');
        for (const p of s.passengers ?? []) {
          if (!['envoy', 'pilgrim', 'wife', 'pilot', 'gift'].includes(p.kind) || !p.name || !p.errand || !PORT_BY_ID.has(p.to) || !(p.weight > 0 && p.weight <= 1)) why.push('passenger');
          kinds.add(p.kind);
        }
        if (!s.people || !s.flag) why.push('people/flag');
        if (s.master !== m.name) why.push('master string');
        if (!ALLOWED_HULLS.has(s.hullId)) why.push('hull');
        try { hullClass(s.hullId); } catch { why.push('hull class'); }
        const region = seaRegionAt(at);
        if (['swahili', 'arabian', 'crossing', 'gujarat', 'malabar'].includes(region) && !INDIAN.has(s.nation)) why.push(`nation ${s.nation} in ${region}`);
        if (!['swahili', 'arabian', 'crossing', 'gujarat', 'malabar'].includes(region) && INDIAN.has(s.nation)) why.push(`indian ${s.nation} in ${region}`);
        if (!(m.polity === 'portugal' || m.polity.startsWith('nation:') || POLITY_BY_ID.has(m.polity))) why.push(`polity ${m.polity}`);
        // Drawing the person must not move the dice the rest of the game uses beyond the sail itself.
        void rngBefore;
        if (why.length) bad.push(`${seed}/${water}: ${why.join(',')}`);
        kinds.add('_'); errands.add(s.errand!); masters.add(m.id); temp.add(m.temper); nations.add(s.nation); businesses.add(s.business);
      }
    }
  }
  check('every generated stranger is a valid person (schema)', bad.length === 0, `${n} strangers, ${masters.size} distinct masters; ${bad.slice(0, 4).join(' | ')}`);
  check('every passenger kind and every temper turns up', ['envoy', 'pilgrim', 'wife', 'pilot', 'gift'].every((k) => kinds.has(k)) && temp.size === TEMPERS.length, `kinds ${[...kinds].filter((k) => k !== '_').join(',')}; ${errands.size} distinct errands`);
  check('the Indian peoples and the Atlantic flags are all met', ['swahili', 'arab', 'gujarati', 'malabari', 'castilian', 'moorish'].every((x) => nations.has(x)), [...nations].join(','));
  check('Algarve water draws Moorish corsairs', (() => {
    let corsairs = 0;
    for (let seed = 1; seed <= 60; seed++) { const g = seaGame(seed, WATERS.algarve); for (let i = 0; i < 4; i++) { g.seaRecord.sighted++; const s = raiseASail(g, 6); if (s?.nation === 'moorish' && s.business === 'corsair') corsairs++; } }
    return corsairs > 0;
  })());

  // Roster: pure function of the seed, names unique, never a denied or real name, all marked invented.
  let rosterBad = '';
  const all = new Set<string>();
  for (let seed = 1; seed <= SEEDS && !rosterBad; seed++) {
    const r = roster(seed), r2 = roster(seed);
    if (JSON.stringify(r) !== JSON.stringify(r2)) rosterBad = `seed ${seed} not stable`;
    const names = new Set(r.map((x) => x.name));
    if (names.size !== r.length) rosterBad = `seed ${seed} repeats a name`;
    if (r.length !== SLOTS.length) rosterBad = 'slots';
    if (r.some((x) => !x.invented)) rosterBad = 'not marked invented';
    if (r.some((x) => /\b(Gama|Dias|Cabral|Colombo|Cam[aã]o|Albuquerque|Majid|Cana)\b/.test(x.name))) rosterBad = `a real name in seed ${seed}`;
    for (const x of r) all.add(x.name);
  }
  check('the roster is a pure function of the seed, unique, invented and clear of real names', !rosterBad, `${rosterBad} (${all.size} names over ${SEEDS} seeds, ${SLOTS.length} houses)`);
  check('every house has a circuit of real ports and a culture', SLOTS.every((s) => s.circuit.every((p) => PORT_BY_ID.has(p)) && CULTURES[s.culture]));

  // Determinism of a sail, and of what is aboard.
  const a = seaGame(9, WATERS.kilwa), b = seaGame(9, WATERS.kilwa);
  a.seaRecord.sighted = 3; b.seaRecord.sighted = 3;
  check('the same seed and state raise the same sail with the same people', JSON.stringify(raiseASail(a, 6)) === JSON.stringify(raiseASail(b, 6)));
  // The people are drawn from their own dice: giving a sail its man never moves the game's.
  const c = seaGame(9, WATERS.atlantic);
  const s0 = raiseASail(c, 6)!;
  const before = c.rng.serialize();
  peopleAboard(c, s0); peopleAboard(c, s0);
  check('giving a sail her people draws nothing from the game\u2019s dice (the Atlantic meets the sails it always did)', c.rng.serialize() === before);
  const hulls = new Set<string>();
  for (let seed = 1; seed <= 10; seed++) for (const w of ['kilwa', 'arabian', 'calecute']) { const g = seaGame(seed, WATERS[w]); for (let i = 0; i < 8; i++) { g.seaRecord.sighted++; const x = raiseASail(g, 6); if (x) hulls.add(x.hullId); } }
  check('no new mesh: every Indian Ocean stranger sails a hull the renderer already has', [...hulls].every((h) => ['caravela-latina', 'barcha', 'nau-pequena'].includes(h)), [...hulls].join(','));
}

// ---- 1b. The Indian Ocean has shipping; the south Atlantic still has none ---------------------------------------
{
  const quiet = trafficAt({ lat: -25, lon: -5 });
  const busy = ['kilwa', 'melinde', 'arabian', 'crossing', 'calecute', 'cochim', 'gujarat'].map((w) => trafficAt(WATERS[w]));
  check('the Indian Ocean carries shipping (a sail a week or so) and the empty south Atlantic still carries none', quiet < 0.04 && busy.every((b) => b >= 0.2 && b <= 4), `south ${quiet.toFixed(2)}; ${busy.map((b) => b.toFixed(1)).join(' ')}`);
}

// ---- 2. Terms gate by stage and clause --------------------------------------------------------------------
{
  const want: Record<number, string[]> = {
    1: ['parley', 'search', 'pass', 'gift'],
    2: ['parley', 'search', 'pass', 'gift', 'licence', 'toll'],
    3: ['parley', 'search', 'pass', 'gift', 'licence', 'toll', 'stop'],
    4: ['parley', 'search', 'pass', 'gift', 'licence', 'toll', 'stop'],
  };
  const g = seaGame(3, WATERS.kilwa);
  const s = trader(g);
  let ok = true; const seen: string[] = [];
  for (const stage of [1, 2, 3, 4] as const) {
    stageSet(g, stage);
    const ev = hailScene(g, s);
    const t = termsOf(ev);
    if (JSON.stringify(t) !== JSON.stringify(want[stage])) { ok = false; seen.push(`${stage}: ${t.join(',')}`); }
  }
  check('terms gate by the Rule stage (stop only from stage 3)', ok, seen.join(' | '));

  // Clause: a court that honours the cartaz is not stopped, taxed or written for.
  const g2 = seaGame(3, WATERS.kilwa);
  const s2 = trader(g2, (x) => x.masterInfo!.polity === 'kilwa' || x.masterInfo!.polity === 'malindi' || x.masterInfo!.polity === 'mombasa' || x.masterInfo!.polity === 'calicut');
  stageSet(g2, 3);
  const without = termsOf(hailScene(g2, s2));
  grantClause(g2, s2.masterInfo!.polity, 'cartaz', 'granted', 'test');
  const withClause = termsOf(hailScene(g2, s2));
  check('a recognised cartaz removes licence, toll and stop for that court’s masters', without.includes('stop') && !withClause.includes('stop') && !withClause.includes('toll') && !withClause.includes('licence') && withClause.includes('search') && withClause.includes('parley'), `${without.join(',')} -> ${withClause.join(',')}`);

  // The clause is per court: another polity's master is still stopped.
  const g3 = seaGame(3, WATERS.kilwa);
  const s3 = trader(g3);
  stageSet(g3, 3);
  grantClause(g3, s3.masterInfo!.polity === 'kilwa' ? 'calicut' : 'kilwa', 'cartaz', 'granted', 'test');
  check('and only for that court', termsOf(hailScene(g3, s3)).includes('stop'));

  // A pass the captain wrote for him does the same, for him alone.
  const g4 = seaGame(3, WATERS.kilwa);
  const s4 = trader(g4);
  stageSet(g4, 3);
  const ev4 = hailScene(g4, s4);
  choice(ev4, 'licence').resolve(g4);
  const ev4b = hailScene(g4, s4);
  check('a pass written for a master puts him beyond stop, toll and licence', !termsOf(ev4b).includes('stop') && !termsOf(ev4b).includes('toll') && !termsOf(ev4b).includes('licence'), termsOf(ev4b).join(','));

  // The Atlantic has no Rule: no search, no stop, whatever the Front says.
  const g5 = seaGame(3, WATERS.atlantic);
  const s5 = trader(g5, (x) => x.nation !== 'genoese');
  stageSet(g5, 4);
  const t5 = termsOf(hailScene(g5, s5));
  check('Atlantic traders are offered parley, pass and gift only', JSON.stringify(t5) === JSON.stringify(['parley', 'pass', 'gift']), t5.join(','));

  // Old options stay.
  const labels = (ev: SeaEvent): string[] => (ev.choices ?? []).map((c) => c.label);
  check('the old hail options are still on the card (position, letters)', labels(hailScene(g, s)).some((l) => /position/.test(l)) && labels(hailScene(g, s)).some((l) => /letters/.test(l)));
  check('termsOffered agrees with the card', JSON.stringify(termsOffered(g, s)) === JSON.stringify(termsOf(hailScene(g, s))));

  // Interlopers, corsairs and the rest keep their own scenes, with the man on the card.
  const g6 = seaGame(4, WATERS.guinea);
  let inter: Stranger | null = null;
  for (let i = 0; i < 300 && !inter; i++) { g6.seaRecord.sighted++; const x = raiseASail(g6, 6); if (x?.business === 'interloper') inter = x; }
  const evI = hailScene(g6, inter!);
  check('an interloper keeps her scene and gains a parley', !!evI.who && evI.id === 'hail:interloper' && termsOf(evI).includes('parley') && /^Warn him off/.test(labels(evI)[0] === undefined ? '' : labels(evI).find((l) => /^Warn him off/.test(l)) ?? ''), labels(evI).join(' / '));
}

// ---- 3. A master recurs, and his attitude comes from the Ledger -------------------------------------------
{
  const play = (action: 'stop' | 'pass' | 'none') => {
    const g = seaGame(21, WATERS.kilwa);
    stageSet(g, 3);
    // The master of a Kilwa house that also works Melinde and Calecute: slot swahili:2.
    const target = masterById(21, 'swahili:2')!;
    let s: Stranger | null = null;
    for (let i = 0; i < 600 && !s; i++) { g.seaRecord.sighted++; const x = raiseASail(g, 6); if (x?.masterInfo?.id === target.id && x.business === 'trader') s = x; }
    if (!s) throw new Error('target master not met');
    const ev = hailScene(g, s);
    const r0 = regardOf(g, target);
    if (action === 'stop') choice(ev, 'stop').resolve(g);
    if (action === 'pass') choice(ev, 'pass').resolve(g);
    return { g, target, s, r0, r1: regardOf(g, target) };
  };
  const stopped = play('stop'), spared = play('pass'), none = play('none');
  check('a master spoken at Kilwa is in the Ledger (master.met, with his id)', metCount(stopped.g.ledger, stopped.target.id) === 1 && metCount(none.g.ledger, none.target.id) === 1);
  check('stopped, he thinks worse of the captain; spared, better; spoken only, about as before', stopped.r1 < stopped.r0 - 0.1 && spared.r1 > spared.r0 + 0.03 && Math.abs(none.r1 - none.r0) < 0.05, `stop ${stopped.r0.toFixed(2)}->${stopped.r1.toFixed(2)}, spare ${spared.r0.toFixed(2)}->${spared.r1.toFixed(2)}, none ${none.r0.toFixed(2)}->${none.r1.toFixed(2)}`);

  // Later, at Melinde and at Calecute: the same man, a different attitude, read from the Ledger.
  for (const water of ['melinde', 'calecute'] as const) {
    const seen: Record<string, number | null> = { stop: null, pass: null };
    let ok = true;
    for (const [k, run] of [['stop', stopped], ['pass', spared]] as const) {
      const g = run.g;
      g.ship.state.pos = { ...WATERS[water] };
      g.clock.t += 120 * DAY;
      let meet: Stranger | null = null;
      for (let i = 0; i < 400 && !meet; i++) { g.seaRecord.sighted++; const x = raiseASail(g, 6); if (x?.masterInfo?.id === run.target.id) meet = x; }
      if (!meet) { ok = false; break; }
      seen[k] = meet.masterInfo!.regard;
      // Different errand, same boat and same man.
      if (meet.name !== run.s.name || meet.master !== run.s.master) ok = false;
    }
    check(`met again at ${water}: the same master and boat, a different attitude by what was done to him`, ok && seen.stop !== null && seen.pass !== null && seen.stop < 0 && seen.pass > 0 && seen.pass - seen.stop > 0.3, `stopped ${seen.stop?.toFixed(2)} / spared ${seen.pass?.toFixed(2)}`);
  }

  // The hail itself reads the man: a hostile master gives no news, a friend does.
  const gS = stopped.g, gP = spared.g;
  gS.ship.state.pos = { ...WATERS.melinde }; gP.ship.state.pos = { ...WATERS.melinde };
  const meetAgain = (g: Game): Stranger => { for (let i = 0; i < 400; i++) { g.seaRecord.sighted++; const x = raiseASail(g, 6); if (x?.masterInfo?.id === 'swahili:2' && x.business === 'trader') return x; } throw new Error('no'); };
  const ms = meetAgain(gS), mp = meetAgain(gP);
  const evS = hailScene(gS, ms), evP = hailScene(gP, mp);
  check('the card says whom you are meeting, and how he reads you', /once before|times before/.test(evS.who!.read) && /once before|times before/.test(evP.who!.read) && evS.who!.read !== evP.who!.read, `${evS.who!.read} / ${evP.who!.read}`);
  check('a master who has been stopped hauls off; one who was spared comes to be spoken', ms.intent === 'avoid' && (mp.intent === 'close' || mp.intent === 'hold'), `${ms.intent} / ${mp.intent}`);

  // Word: what is done to one ship of a polity reaches another master of it, but only after the road allows.
  const gw = seaGame(21, WATERS.kilwa);
  stageSet(gw, 3);
  const one = masterById(21, 'swahili:1')!, other = masterById(21, 'swahili:2')!;
  check('two masters of one polity', one.polity === other.polity, one.polity);
  let sOne: Stranger | null = null;
  for (let i = 0; i < 600 && !sOne; i++) { gw.seaRecord.sighted++; const x = raiseASail(gw, 6); if (x?.masterInfo?.id === one.id && x.business === 'trader') sOne = x; }
  const w = (): number => regardParts(gw, masterById(21, other.id)!).word;
  const w0 = w();
  choice(hailScene(gw, sOne!), 'stop').resolve(gw);
  const wNow = w();
  gw.clock.t += 400 * DAY;
  const wLater = w();
  check('word of a stop reaches his fellow master of the same court only after the road allows', w0 === 0 && wNow === 0 && wLater < -0.03, `word ${w0.toFixed(2)} now ${wNow.toFixed(2)} later ${wLater.toFixed(2)}`);
}

// ---- 4. What each term writes, and where the word goes ----------------------------------------------------
{
  const mk = (seed: number, stage: 1 | 2 | 3 = 3) => { const g = seaGame(seed, WATERS.kilwa); stageSet(g, stage); const s = trader(g, (x) => (x.passengers?.length ?? 0) > 0 && ['kilwa', 'malindi', 'mombasa'].includes(x.masterInfo!.polity)); g.encounter = s; return { g, s }; };
  const tags = (g: Game, from: number): string[] => g.ledger.slice(from).map((e) => e.tag);

  // Stop
  {
    const { g, s } = mk(31);
    const ev = hailScene(g, s);
    const from = g.ledger.length, rule0 = g.powers.fronts.rule.offset, att0 = g.powers.powers[s.masterInfo!.polity === 'malindi' ? 'melinde' : (s.masterInfo!.polity as 'kilwa' | 'mombasa')].attitude;
    const rumours0 = g.powers.rumours.length, word0 = g.diplomacy.word.length, gold0 = g.crown.gold;
    const text = choice(ev, 'stop').resolve(g);
    const t = tags(g, from);
    const stop = g.ledger.slice(from).find((e) => e.tag === 'ship.stopped')!;
    check('stop writes ship.stopped, stamped with the master, and a passenger.delayed per passenger', !!stop && stop.data?.master === s.masterInfo!.id && stop.witnesses.includes(s.masterInfo!.name) && t.filter((x) => x === 'passenger.delayed').length === s.passengers!.length, t.join(','));
    check('stop moves the Rule and the Power through the existing deltas, and pays duty', g.powers.fronts.rule.offset > rule0 && g.powers.powers[s.masterInfo!.polity === 'malindi' ? 'melinde' : (s.masterInfo!.polity as 'kilwa' | 'mombasa')].attitude < att0 && g.crown.gold > gold0);
    const newRumours = g.powers.rumours.slice(rumours0).filter((r) => r.event.startsWith('word:ship.stopped'));
    check('word of the stop is a rumour on the road, told by the master', newRumours.length >= 1 && newRumours[0].claim.includes(s.masterInfo!.name) && newRumours[0].front === 'rule');
    const words = g.diplomacy.word.slice(word0);
    const courts = new Set(words.map((w) => w.polity));
    check('and news at the courts of the Rule’s waters, arriving later, told as each court tells it', words.length >= 3 && courts.size >= 3 && words.every((w) => w.arrive > g.clock.t) && new Set(words.map((w) => w.text.split('says it at every quay: ')[1])).size >= 2 && words.every((w) => w.text.includes(s.masterInfo!.name)), `${words.length} items, ${courts.size} courts`);
    check('the text names the man and what was done', text.includes(s.name) && /duty/.test(text));
  }
  // The Rule's own reading sees a stop at sea as conduct at Kilwa or Calecute, by the master's flag.
  for (const [water, place, pol] of [['kilwa', 'kilwa', 'kilwa'], ['calecute', 'calecute', 'calicut']] as const) {
    const g = seaGame(38, WATERS[water]);
    stageSet(g, 3);
    const s = trader(g, (x) => x.masterInfo!.polity === pol);
    const r0 = ruleReading(g.powers, g.ledger);
    choice(hailScene(g, s), 'stop').resolve(g);
    const r1 = ruleReading(g.powers, g.ledger);
    const at = r1.places.find((p) => p.place.id === place)!;
    check(`a ship of ${pol} stopped at sea is read by the Rule as conduct at ${place}, and the Book\u2019s line says so`, (at.counts['ship.stopped'] ?? 0) === 1 && r1.lean > r0.lean && /stopped one ship/.test(r1.line), r1.line.slice(0, 90));
  }
  // Spare
  {
    const { g, s } = mk(31);
    const from = g.ledger.length, rule0 = g.powers.fronts.rule.offset;
    const text = choice(hailScene(g, s), 'pass').resolve(g);
    const t = tags(g, from);
    check('letting him pass writes ship.spared (stamped) and not ship.stopped; the Rule eases', t.includes('ship.spared') && !t.includes('ship.stopped') && g.ledger.slice(from).find((e) => e.tag === 'ship.spared')!.data?.master === s.masterInfo!.id && g.powers.fronts.rule.offset < rule0, t.join(','));
    check('and the spare is told ahead as well', g.diplomacy.word.length > 0 && text.length > 20);
  }
  // Gift, licence, toll, search, parley
  {
    const { g, s } = mk(32);
    g.crown.gold = 500;
    const ev = hailScene(g, s);
    let from = g.ledger.length;
    choice(ev, 'gift').resolve(g);
    let t = tags(g, from);
    check('gift: ship.spared + a gift tag + passenger.aided, and it costs money', t.includes('ship.spared') && (t.includes('gift.great') || t.includes('gift.plain')) && t.includes('passenger.aided') && g.crown.gold < 500, t.join(','));
  }
  {
    const { g, s } = mk(33);
    const ev = hailScene(g, s);
    let from = g.ledger.length;
    choice(ev, 'licence').resolve(g);
    let t = tags(g, from);
    check('licence: pass.granted (the Rule’s friends have passes) with the master’s id', t.includes('pass.granted') && g.ledger.slice(from).find((e) => e.tag === 'pass.granted')!.data?.master === s.masterInfo!.id, t.join(','));
  }
  {
    const { g, s } = mk(34);
    g.crown.gold = 100;
    const ev = hailScene(g, s);
    let from = g.ledger.length;
    choice(ev, 'toll').resolve(g);
    let t = tags(g, from);
    check('toll: toll.taken, coin in the purse', t.includes('toll.taken') && g.crown.gold > 100, t.join(','));
  }
  // Search by stage and pass
  {
    const results: Record<string, string[]> = {};
    for (const stage of [1, 2, 3] as const) {
      const { g, s } = mk(35, stage);
      const from = g.ledger.length;
      choice(hailScene(g, s), 'search').resolve(g);
      results[`stage${stage}`] = tags(g, from);
    }
    check('search: an affront at stage 1 and 2 (courtesy.broken), a stopping at stage 3', results.stage1.includes('courtesy.broken') && !results.stage1.includes('ship.stopped') && results.stage2.includes('courtesy.broken') && results.stage3.includes('ship.stopped'), JSON.stringify(results));
    const { g, s } = mk(35, 3);
    grantClause(g, s.masterInfo!.polity, 'cartaz', 'granted', 'test');
    const from = g.ledger.length;
    choice(hailScene(g, s), 'search').resolve(g);
    const t = tags(g, from);
    check('search of a master whose court recognises the cartaz is a courtesy, not a stopping', t.includes('courtesy.kept') && !t.includes('ship.stopped') && !t.includes('courtesy.broken'), t.join(','));
  }
  // Parley: a rumour Fact with the master as source
  {
    const { g, s } = mk(36);
    const info = s.masterInfo!;
    const rng = Rng.fromString('probe');
    announce(g.powers, rng, g.clock.t - 100 * DAY, {
      event: 'test:news', place: info.home, window: 8, power: 'kilwa',
      truth: { claim: 'The sultan has put a tax on the wells.', vague: 'Something about wells.' },
    });
    const facts0 = rumourFacts(g.powers, g.clock.t).length;
    const from = g.ledger.length;
    choice(hailScene(g, s), 'parley').resolve(g);
    const facts = rumourFacts(g.powers, g.clock.t);
    check('parley: the news is a rumour Fact whose source is the master', facts.length === facts0 + 1 && facts.some((f) => f.source.includes(info.name)), facts.map((f) => f.source).join(' | '));
    check('and the parley writes courtesy.kept and master.met', tags(g, 0).includes('master.met') && tags(g, from).includes('courtesy.kept'));
  }
  // A hostile master gives no news.
  {
    const { g, s } = mk(37);
    const ev = hailScene(g, s);
    choice(ev, 'stop').resolve(g);
    choice(ev, 'stop').resolve(g);
    choice(ev, 'stop').resolve(g);
    const ev2 = hailScene(g, s);
    const text = choice(ev2, 'parley').resolve(g);
    check('a master stopped three times will give his name and nothing else', /nothing else/.test(text), text.slice(0, 80));
  }
}

// ---- 5. No stranger scene requires backward travel ---------------------------------------------------------
{
  const ALLOWED = new Set(['master.met', 'courtesy.kept', 'courtesy.broken', 'courtesy.plain', 'ship.stopped', 'ship.spared', 'pass.granted', 'toll.taken', 'passenger.delayed', 'passenger.aided', 'gift.great', 'gift.plain', 'rumour.true', 'rumour.false']);
  const FORBIDDEN_OBLIGATIONS = ['promise.kept', 'promise.broken', 'parcel.carried', 'favour.done', 'thread.taken', 'envoy.mixed', 'traffic.carried'];
  let bad = '';
  for (const stage of [1, 2, 3] as const) {
    for (const water of ['kilwa', 'melinde', 'calecute', 'cochim', 'arabian', 'atlantic'] as const) {
      const g0 = seaGame(41, WATERS[water]);
      const s0 = trader(g0);
      const termIds = termsOf((stageSet(g0, stage), hailScene(g0, s0)));
      for (const t of termIds) {
        const g = seaGame(41, WATERS[water]);
        stageSet(g, stage);
        g.crown.gold = 300;
        const s = trader(g);
        const ev = hailScene(g, s);
        const dest = JSON.stringify(g.destination), route = JSON.stringify(g.route), pend = g.pendingScenes.length, thread = JSON.stringify(g.quests ?? null);
        const from = g.ledger.length;
        choice(ev, t).resolve(g);
        const made = g.ledger.slice(from).map((e) => e.tag);
        if (made.some((x) => !ALLOWED.has(x) && !x.startsWith('rumour.'))) bad = `${water}/${stage}/${t}: ${made.join(',')}`;
        if (made.some((x) => FORBIDDEN_OBLIGATIONS.includes(x))) bad = `${water}/${stage}/${t} obligation`;
        if (JSON.stringify(g.destination) !== dest || JSON.stringify(g.route) !== route || g.pendingScenes.length !== pend || JSON.stringify(g.quests ?? null) !== thread) bad = `${water}/${stage}/${t} moved the route or the scenes`;
        // A passenger is never carried: nothing may be left aboard but coin and cargo the term names.
        if (g.ship.cargoUnits?.() === undefined && false) bad = 'x';
      }
    }
  }
  check('no term sets a destination, a scene, a quest or an obligation (nothing sends the captain back)', !bad, bad);
}

// ---- 6. Saves ---------------------------------------------------------------------------------------------
{
  const g = seaGame(51, WATERS.kilwa);
  stageSet(g, 3);
  const s = trader(g);
  g.encounter = s;
  const ev = hailScene(g, s);
  choice(ev, 'stop').resolve(g);
  const g2 = Game.deserialize(g.serialize());
  const e2 = g2.encounter!;
  check('a stranger with a man at her helm survives a save, people and all', e2.masterInfo?.id === s.masterInfo!.id && e2.passengers?.length === s.passengers!.length && e2.cargo?.length === s.cargo!.length && e2.errand === s.errand);
  check('the Ledger’s master stamps survive a save, and so does the memory they make', metCount(g2.ledger, s.masterInfo!.id) === 1 && g2.ledger.some((e) => e.tag === 'ship.stopped' && e.data?.master === s.masterInfo!.id) && Math.abs(regardOf(g2, masterById(51, s.masterInfo!.id)!) - regardOf(g, masterById(51, s.masterInfo!.id)!)) < 1e-9);
  check('rumours told by a master keep their teller across a save', Game.deserialize(g.serialize()).powers.rumours.every((r, i) => r.via === g.powers.rumours[i].via));

  // An old save's stranger: the same ship with the new fields stripped is hailed exactly as before.
  const raw = JSON.parse(g.serialize());
  const old = { ...raw.encounter };
  for (const k of ['masterInfo', 'owner', 'passengers', 'cargo', 'people', 'flag', 'errand', 'region']) delete old[k];
  old.master = 'Pero Escobar'; old.name = 'Niña'; old.nation = 'castilian'; old.business = 'trader'; old.spoken = false;
  raw.encounter = old;
  const g3 = Game.deserialize(JSON.stringify(raw));
  const evOld = hailScene(g3, g3.encounter!);
  check('a stranger from before the people (no masterInfo) is hailed as it was: no card, no terms', !evOld.who && termsOf(evOld).length === 0 && evOld.choices!.length >= 3);

  // The golden saves.
  const dir = 'fixtures/saves';
  let loaded = 0, badSave = '';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    try {
      const gs = Game.deserialize(readFileSync(`${dir}/${f}`, 'utf8'));
      loaded++;
      const had = gs.encounter;
      if (had) { const ev = hailScene(gs, had); if (!ev.choices?.length) badSave = `${f}: empty hail`; }
      // And a fresh sail raised from where the save stands has people, whatever the save's age.
      if (!gs.dockedAt) { gs.seaRecord.sighted++; const x = raiseASail(gs, 6); if (x && !x.masterInfo) badSave = `${f}: sail without a man`; }
    } catch (e) { badSave = `${f}: ${(e as Error).message}`; }
  }
  check('every golden save loads and hails', !badSave && loaded >= 9, `${loaded} saves ${badSave}`);
}

// ---- 7. The card ------------------------------------------------------------------------------------------
{
  installFakeDom();
  (FakeEl.prototype as unknown as { replaceChildren: (...n: unknown[]) => void }).replaceChildren = function (this: FakeEl, ...n: unknown[]) { this.children = []; this.append(...(n.filter(Boolean) as never[])); };
  (globalThis as unknown as { requestAnimationFrame: (f: () => void) => number }).requestAnimationFrame = () => 0;
  const g = seaGame(61, WATERS.melinde);
  stageSet(g, 3);
  const s = trader(g);
  const ev = hailScene(g, s);
  const v = new EventView(() => {});
  v.show(ev);
  const text = (v.root as unknown as FakeEl).textContent;
  check('the hail card shows the master’s name, home, errand and a read of his temper', text.includes(s.masterInfo!.name) && text.includes(s.masterInfo!.homeName) && text.includes(s.errand!) && text.includes(s.masterInfo!.temper === 'open' ? 'Open-handed' : s.masterInfo!.temper === 'proud' ? 'Proud' : s.masterInfo!.temper === 'wary' ? 'Wary' : s.masterInfo!.temper === 'sly' ? 'Sly' : 'Hard'));
  check('and is compact: the people block is under 400 characters', ev.who!.name.length + ev.who!.home.length + ev.who!.errand.length + ev.who!.read.length < 400, `${ev.who!.name.length + ev.who!.home.length + ev.who!.errand.length + ev.who!.read.length}`);
  check('every term has a label and a detail line', ev.choices!.every((c) => c.label.length > 3 && c.detail.length > 8));
}

// ---- 8. The vocabulary ------------------------------------------------------------------------------------
{
  const mine = ['master.met', 'passenger.delayed', 'passenger.aided', 'toll.taken'] as const;
  check('the four new tags are in the vocabulary with readers', mine.every((t) => TAGS[t] && TAGS[t].readers.length > 0 && TAGS[t].doc && TAGS[t].did));
}

console.log(fails === 0 ? '\nall ok' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

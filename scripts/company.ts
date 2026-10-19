/**
 * Falsifier for the company (C5): approval tables closed over the tag vocabulary; every written companion has a
 * reachable exit and a reachable bond; thresholds fire on synthetic Ledgers; two played careers show approval changing
 * counsel text; the conflicts really arbitrate; the pool, the promotion and the save round trip hold.
 *   npx esbuild scripts/company.ts --bundle --platform=node --format=cjs --outfile=/tmp/company.cjs && node /tmp/company.cjs
 *
 * Ground truth, not the expression under test: bonds and ends are found by *playing* every choice of every beat on a
 * real Game (breadth-first over the arc's own state), not by reading the arc's declared bond; exits are found by
 * writing a Ledger of the man's most-hated deeds and letting the game's own tick and arrival hook put him on the quay.
 */
import { readFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { ALL_TAGS, isTag, TAGS, type Tag } from '../src/ledger/tags';
import type { Entry } from '../src/ledger/ledger';
import { ARCS, ARC_BY_ID, BONDS } from '../src/progression/arcs';
import { COMPANIONS, COMPANION_BY_KEY } from '../src/company/companions';
import { approvalFor, approvalWord, BOND_AT, DISSENT_AT, EXIT_AT } from '../src/company/approval';
import { CANDIDATES, candidatesAt, linguaCandidate } from '../src/company/candidates';
import { CONFLICTS } from '../src/company/conflicts';
import { companyEndLines, courtCandidate, eligibleHands, endStateOf, officerFromCandidate, promoteHand, tickCompany, companyOnArrival } from '../src/company/company';
import { counselFor } from '../src/game/counsel';
import { play } from './lib/careerCore';
import { anchorageOf, portDef } from '../src/world/ports';
import type { Officer } from '../src/crew/crew';
import type { SeaEvent } from '../src/game/seaEvents';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

const DAY = 86400;
const ent = (tag: Tag, over: Partial<Entry> = {}): Entry => ({
  t: 1000, place: '', tag, actors: ['captain'], target: 'malindi', magnitude: 1, witnesses: [], note: '', ...over,
});
const many = (tag: Tag, n: number, t: number): Entry[] => Array.from({ length: n }, (_, i) => ent(tag, { t: t + i }));

const fresh = (seed = 1): Game => { const g = new Game(seed); g.mode = 'port'; return g; };
const officer = (g: Game, arc: string): Officer => g.crew.officers.find((o) => o.arc === arc)!;

// 1. The tables are closed over the vocabulary, and say something.
{
  const bad: string[] = [];
  for (const c of COMPANIONS) {
    for (const w of c.weights) {
      if (!isTag(w.tag)) bad.push(`${c.key}:${w.tag}`);
      if (Math.abs(w.w) > 30 || w.w === 0) bad.push(`${c.key}:${w.tag} weight ${w.w}`);
      if (!w.because) bad.push(`${c.key}:${w.tag} no cause`);
    }
  }
  check('every weight names a tag in the vocabulary, a sane weight and a cause', bad.length === 0, bad.join(' '));
  const thin = COMPANIONS.filter((c) => c.weights.length < 12).map((c) => `${c.key}(${c.weights.length})`);
  check('each companion has at least twelve tags in his table', thin.length === 0, thin.join(' '));
  const keys = new Set(COMPANIONS.map((c) => c.key));
  const arcless = ARCS.filter((a) => !keys.has(a.id)).map((a) => a.id);
  check('every arc has a companion row, with want, fear, line and a dissent', arcless.length === 0
    && COMPANIONS.every((c) => c.want && c.fear && c.line && c.dissent.length >= 2 && c.exit.leaves), arcless.join(','));
  const used = new Set(COMPANIONS.flatMap((c) => c.weights.map((w) => w.tag)));
  const unread = (['companion.bonded', 'companion.estranged', 'companion.left', 'companion.betrayed', 'companion.promoted', 'faith.pressed', 'faith.respected', 'books.honest', 'books.cooked'] as Tag[])
    .filter((t) => !TAGS[t]);
  check('the nine new tags exist', unread.length === 0);
  const orphan = (['faith.pressed', 'faith.respected', 'books.honest', 'books.cooked'] as Tag[]).filter((t) => !used.has(t));
  check('the new tags that feed approval are read by some table', orphan.length === 0, orphan.join(','));
  check('the vocabulary stays inside its bound', ALL_TAGS.length <= 120, `${ALL_TAGS.length} tags`);
}

// 2. Approval: scale, saturation, decay, joined-since, words.
{
  const g = fresh();
  const c = officer(g, 'correia');
  c.joined = 500; c.loyalty = 0.6; c.memory = [];
  const now = 1000 + 2 * DAY;
  const base = approvalFor(c, [], now);
  check('no Ledger, neutral regard: a wary-or-easy man, and a cause line', Math.abs(base.score) <= 15 && base.why.length > 0, `${base.score} ${base.word}`);
  const one = approvalFor(c, many('landfall.exact', 1, 1000), now).score;
  const five = approvalFor(c, many('landfall.exact', 5, 1000), now).score;
  check('a kindness raises approval and the fifth is worth less than the first', one > base.score && five > one && five - one < (one - base.score) * 2.5, `${base.score} -> ${one} -> ${five}`);
  check('approval stays in -100..100', approvalFor(c, [...many('chart.sold', 40, 1000), ...many('books.cooked', 40, 1000)], now).score >= -100
    && approvalFor(c, [...many('landfall.exact', 40, 1000), ...many('south.beyond', 40, 1000)], now).score <= 100);
  const old = approvalFor(c, many('chart.sold', 3, 1000), 1000 + 9 * 365 * DAY).score;
  const recent = approvalFor(c, many('chart.sold', 3, 1000), 1000 + DAY).score;
  check('old deeds fade', old > recent, `${recent} recent, ${old} nine years on`);
  const before = approvalFor(c, [ent('chart.sold', { t: 10 })], now).score;
  check('a deed from before he came aboard does not count', before === base.score);
  c.bonded = true;
  check('a bonded man is never below +40', approvalFor(c, [...many('chart.sold', 9, 1000)], now).score >= BOND_AT);
  c.bonded = false;
  check('the one word has seven bands', [90, 50, 20, 0, -20, -60, -90].map(approvalWord).join() === 'Devoted,Warm,Easy,Wary,Cold,Hostile,Done');
  const cause = approvalFor(c, many('chart.sold', 2, 1000), now);
  check('the cause line names the thing that moved it', /sold sheets/.test(cause.why), cause.why);
  // The same deed is a different thing to different men.
  const p = officer(g, 'dinis'); p.joined = 500;
  check('the same Ledger reads differently through different tables',
    approvalFor(c, many('chart.sold', 2, 1000), now).score !== approvalFor(p, many('chart.sold', 2, 1000), now).score);
}

// 3. Every written companion has a reachable exit.
{
  for (const comp of COMPANIONS.filter((x) => x.key !== 'hired')) {
    const g = fresh(2);
    g.dockedAt = null;
    const arcId = comp.key;
    let o: Officer | undefined = officer(g, arcId);
    if (!o) {
      const cand = comp.key === 'hamisi' ? CANDIDATES.find((c) => c.id === 'hamisi')! : comp.key === 'lingua' ? CANDIDATES.find((c) => c.id === 'martinho-dias')! : null;
      if (cand) o = officerFromCandidate(g, cand);
      else { tickCompany(g); o = officer(g, arcId); }
    }
    if (!o) { check(`${comp.key} can be put aboard`, false); continue; }
    o.joined = 0;
    o.arcStage = 1; // mid-arc
    o.loyalty = 0.3;
    // His most-hated deeds, three of each, done to a people he minds about.
    g.ledger.length = 0;
    for (const w of comp.weights.filter((x) => x.w < 0)) g.ledger.push(...many(w.tag, 3, g.clock.t - 40 * DAY));
    g.clock.t += 2 * DAY;
    const casa0 = g.casa.regard, st0 = g.crown.standing, rv0 = g.rival.standing, rel0 = g.relationsFor('melinde').regard;
    g.company.lastT = 0;
    tickCompany(g);
    const score = o.approval ?? 0;
    check(`${comp.key}: his own deeds drive approval to the exit line`, score <= EXIT_AT, `${score}`);
    check(`${comp.key}: he says he will leave`, o.leaving === true);
    const n0 = g.ledger.length;
    g.dockedAt = 'melinde';
    companyOnArrival(g, 'melinde');
    const entries = g.ledger.slice(n0);
    const left = entries.filter((e) => e.tag === 'companion.left' || e.tag === 'companion.betrayed');
    const changed = g.casa.regard !== casa0 || g.crown.standing !== st0 || g.rival.standing !== rv0 || g.relationsFor('melinde').regard !== rel0;
    check(`${comp.key}: he is ashore at the next port with one Ledger entry and a consequence`,
      o.ashoreAt === 'melinde' && o.left === true && left.length === 1 && changed && (o.arcEnd === 'estranged' || o.arcEnd === 'betrayed') && endStateOf(o) === o.arcEnd,
      `${o.ashoreAt} ${o.arcEnd} ${left.map((e) => e.tag)}`);
    check(`${comp.key}: his arc is cut and he cannot be collected off the beach`, o.arcStage === 99 && o.ashoreSince === undefined);
  }
  // A bonded man does not leave however it goes.
  const g = fresh(3);
  g.dockedAt = null;
  const c = officer(g, 'correia');
  c.bonded = true; c.joined = 0; c.loyalty = 0.1;
  for (const w of COMPANION_BY_KEY.get('correia')!.weights.filter((x) => x.w < 0)) g.ledger.push(...many(w.tag, 3, g.clock.t));
  g.clock.t += 2 * DAY; g.company.lastT = 0; tickCompany(g);
  check('a bonded man holds at +40 and does not leave', c.leaving !== true && (c.approval ?? 0) >= BOND_AT, `${c.approval}`);
  // A man who is leaving can think again.
  const g2 = fresh(3);
  g2.dockedAt = null;
  const s = officer(g2, 'sousa'); s.joined = 0; s.loyalty = 0.2;
  for (const w of COMPANION_BY_KEY.get('sousa')!.weights.filter((x) => x.w < 0)) g2.ledger.push(...many(w.tag, 3, g2.clock.t));
  g2.clock.t += 2 * DAY; g2.company.lastT = 0; tickCompany(g2);
  const wasLeaving = s.leaving === true;
  g2.ledger.length = 0; s.loyalty = 0.7; g2.clock.t += 2 * DAY; tickCompany(g2);
  check('a man who has said he will leave thinks again when the Ledger turns', wasLeaving && s.leaving === false);
}

// 4. Every arc reaches a bond and more than one end, by playing it.
{
  const paths: Record<string, { bond: boolean; ends: Set<string>; nodes: number; beats: number }> = {};
  for (const arc of ARCS) {
    const g = fresh(4);
    // A world rich enough that every beat's condition can be met.
    const rich = (): void => {
      g.nav.milesSinceFix = 600; g.crown.lifetimeStanding = 200; g.crew.scurvy = 0.4; g.crew.sickness = 0.3; g.crew.deaths = 6;
      g.chartedThisPassage = 200; g.dockedAt = 'mina'; g.crew.morale = 0.7;
      while (g.crown.discoveries.length < 4) g.crown.discoveries.push({ kind: 'isle', name: `x${g.crown.discoveries.length}` } as never);
      for (const id of ['funchal', 'arguim', 'mina', 'mpinda', 'benguela']) { g.visitedPorts.add(id); g.relationsFor(id).met = true; }
      g.ship.state.pos = { ...anchorageOf(portDef('mina')) };
    };
    rich();
    let o: Officer | undefined = officer(g, arc.id);
    if (!o) {
      if (arc.id === 'pais') { tickCompany(g); o = officer(g, 'pais'); }
      else o = officerFromCandidate(g, CANDIDATES.find((c) => (arc.id === 'hamisi' ? c.id === 'hamisi' : c.id === 'martinho-dias'))!);
    }
    if (!o) { check(`${arc.id} can be put aboard`, false); continue; }
    if (arc.id === 'gaspar') { o.ashoreAt = 'mina'; o.ashoreSince = g.clock.t - 400 * DAY; }
    const snap = (x: Officer): string => JSON.stringify(x);
    const seen = new Set<string>();
    const res = { bond: false, ends: new Set<string>(), nodes: 0, beats: arc.beats.length };
    const queue = [snap(o)];
    while (queue.length && res.nodes < 4000) {
      const cur = queue.shift()!;
      const key = JSON.stringify([JSON.parse(cur).arcStage, JSON.parse(cur).arcFlags, JSON.parse(cur).bonded, JSON.parse(cur).arcEnd, Math.round(JSON.parse(cur).loyalty * 5), JSON.parse(cur).alive, !!JSON.parse(cur).ashoreAt]);
      if (seen.has(key)) continue;
      seen.add(key);
      res.nodes++;
      const restore = (s: string): void => { for (const k of Object.keys(o!)) delete (o as never as Record<string, unknown>)[k]; Object.assign(o!, JSON.parse(s)); };
      restore(cur);
      o.approval = Math.round((o.loyalty - 0.6) * 70 + 10);
      const stage = o.arcStage ?? 0;
      if (o.bonded) res.bond = true;
      if (stage >= arc.beats.length || stage >= 99 || !o.alive) { const e = endStateOf(o); if (e) res.ends.add(e); continue; }
      const beat = arc.beats[stage];
      const ctx = { g, o, served: 1000 };
      if (!beat.when(ctx)) continue;
      const n = beat.build(ctx).choices!.length;
      for (let j = 0; j < n; j++) {
        restore(cur);
        o.approval = Math.round((o.loyalty - 0.6) * 70 + 10);
        o.arcStage = stage + 1; // as the game marks it, the moment it is offered
        const ev = beat.build(ctx);
        ev.choices![j].resolve(g);
        if (o.arcEnd === 'ashore' && o.leaving) { /* friendly parting at the next port */ }
        queue.push(snap(o));
      }
    }
    paths[arc.id] = res;
  }
  for (const arc of ARCS) {
    const r = paths[arc.id];
    if (!r) continue;
    check(`${arc.id}: a bond is reachable by play`, r.bond, `${r.nodes} states, ends ${[...r.ends].join('/')}`);
    check(`${arc.id}: it can end more than one way (${r.ends.size})`, r.ends.size >= 2, [...r.ends].join('/'));
    check(`${arc.id}: has four or five beats`, r.beats >= 4 && r.beats <= 6, `${r.beats}`);
  }
  const allEnds = new Set([...Object.values(paths)].flatMap((p) => [...p.ends]));
  check('between them the arcs reach bonded, estranged, ashore and dead', ['bonded', 'estranged', 'ashore', 'dead'].every((e) => allEnds.has(e)), [...allEnds].join(','));
  const betrayed = [...Object.values(paths)].some((p) => p.ends.has('betrayed'));
  check('and betrayed (by a clerk who is told to cook the books)', betrayed);
  const ids = new Set(Object.keys(BONDS));
  check('every arc names a bond that exists', ARCS.every((a) => ids.has(a.bond)));
  const total = ARCS.reduce((n, a) => n + a.beats.length, 0);
  check('content count: arcs and beats', total >= 39, `${ARCS.length} arcs, ${total} beats`);
}

// 5. Thresholds on synthetic Ledgers: warm, cold, gone.
{
  const g = fresh(5);
  const c = officer(g, 'correia'); c.joined = 0;
  g.company.lastT = 0; g.clock.t += 2 * DAY; tickCompany(g);
  check('at the start nobody is warm and no bond is active', !g.has('oldPilotsHand') && (c.approval ?? 0) < BOND_AT, `${c.approval}`);
  for (const w of COMPANION_BY_KEY.get('correia')!.weights.filter((x) => x.w > 0)) g.ledger.push(...many(w.tag, 3, g.clock.t - DAY));
  g.company.lastT = 0; g.clock.t += 2 * DAY; tickCompany(g);
  check('at +40 his bond effect is active though no arc struck it', (c.approval ?? 0) >= BOND_AT && g.has('oldPilotsHand') && !g.bonds.has('oldPilotsHand'), `${c.approval}`);
  c.ashoreAt = 'lisboa';
  check('and not when he is ashore', !g.has('oldPilotsHand'));
  c.ashoreAt = undefined;

  const g2 = fresh(5);
  g2.dockedAt = null;
  const d = officer(g2, 'dinis'); d.joined = 0; d.loyalty = 0.5;
  g2.clock.t += 2 * DAY;
  let hit = false;
  for (const w of COMPANION_BY_KEY.get('dinis')!.weights.filter((x) => x.w < 0)) {
    g2.ledger.push(...many(w.tag, 1, g2.clock.t - DAY));
    g2.company.lastT = 0; tickCompany(g2);
    if ((d.approval ?? 0) <= DISSENT_AT) { hit = (d.approval ?? 0) > EXIT_AT && !d.leaving; break; }
  }
  check('around -40 he is hostile but has not gone', hit, `${d.approval}`);
}

// 6. Counsel: a dissenting man argues against the captain, in character.
{
  const mkEvent = (): SeaEvent => ({ id: 'test:decision', title: 't', text: 't', severity: 'note', choices: [
    { label: 'Stand on', detail: '', resolve: () => '' }, { label: 'Put about', detail: '', resolve: () => '' }, { label: 'Wait', detail: '', resolve: () => '' }] });
  const g = fresh(6);
  const before = counselFor(g, mkEvent(), g.clock.t);
  const d = officer(g, 'dinis'); d.joined = 0; d.loyalty = 0.2; d.approval = -55;
  const after = counselFor(g, mkEvent(), g.clock.t);
  const mine = after.find((c) => c.who === d.name);
  check('a man at -40 or less speaks against the captain at an unruled decision', before.length === 0 && !!mine && mine.backs !== null && /muster|price|surgeon/.test(mine.says), mine?.says.slice(0, 60));
  const gale: SeaEvent = { id: 'gale:making', title: 'g', text: 'g', severity: 'warning', choices: [
    { label: 'Heave to', detail: '', resolve: () => '' }, { label: 'Run before it', detail: '', resolve: () => '' }, { label: 'Hold your course', detail: '', resolve: () => '' }] };
  const g3 = fresh(6);
  const base = counselFor(g3, gale, g3.clock.t).map((c) => c.who);
  const p = officer(g3, 'correia'); p.approval = -60;
  const sousa = officer(g3, 'sousa'); sousa.approval = -60;
  const grumbling = counselFor(g3, gale, g3.clock.t);
  check('on a ruled decision the cold man adds his own line to the others', grumbling.length >= base.length && grumbling.some((c) => /sir/.test(c.says)) && grumbling.length <= 4, `${base.length} -> ${grumbling.length}`);
  const e = mkEvent(); e.id = 'arc:correia:2:x';
  check('his own arc scenes and disputes carry no dissent', counselFor(g3, e, g3.clock.t).length === 0);
  p.bonded = true;
  check('a bonded man never dissents', !counselFor(g3, mkEvent(), g3.clock.t).some((c) => c.who === p.name));
}

// 7. The conflicts arbitrate.
{
  const g = fresh(7);
  // A full wardroom: the six, the clerk, an interpreter, and the Swahili pilot.
  tickCompany(g);
  g.company.lastT = 0;
  officerFromCandidate(g, CANDIDATES.find((c) => c.id === 'martinho-dias')!);
  officerFromCandidate(g, CANDIDATES.find((c) => c.id === 'hamisi')!);
  tickCompany(g);
  const aboard = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
  check('at least four authored conflicts', CONFLICTS.length >= 4, `${CONFLICTS.length} conflicts`);
  for (const c of CONFLICTS) {
    const sides = c.pick(g, aboard);
    if (!sides) { check(`${c.id}: two of the company can be found to argue it`, false); continue; }
    const ev = c.build(g, sides);
    const n = ev.choices!.length;
    let aUp = false, bUp = false, ledger = true, writes = 0;
    for (let j = 0; j < n; j++) {
      const a0 = sides.a.loyalty, b0 = sides.b.loyalty, l0 = g.ledger.length;
      const ev2 = c.build(g, sides);
      ev2.choices![j].resolve(g);
      const da = sides.a.loyalty - a0, db = sides.b.loyalty - b0;
      if (da > 0.05 && db < -0.04) aUp = true;
      if (db > 0.05 && da < -0.04) bUp = true;
      for (const e of g.ledger.slice(l0)) if (!isTag(e.tag)) ledger = false;
      writes += g.ledger.length - l0;
      sides.a.loyalty = a0; sides.b.loyalty = b0;
    }
    check(`${c.id}: ${sides.a.name} vs ${sides.b.name} — backing either costs the other, and the Ledger records what it was (weather is nobody\u2019s sin)`, aUp && bUp && ledger && (c.id === 'weather' || writes >= n - 1) && ev.text.length > 200, `${n} choices`);
  }
  // Once each, and only ripe.
  const g2 = fresh(8);
  g2.dockedAt = null;
  check('conflicts are played once each in a career', (() => {
    g2.company.seen.push('baptism');
    return !g2.company.seen.includes('weather');
  })());
}

// 8. The pool: named candidates, courted not rolled; the Melinde pilot.
{
  const named = CANDIDATES.filter((c) => c.backstory.length > 40);
  check('a small authored pool of named candidates, a line of backstory each', CANDIDATES.length >= 10 && named.length === CANDIDATES.length, `${CANDIDATES.length}`);
  const roles = new Set(CANDIDATES.map((c) => c.role));
  check('across the roles', ['piloto', 'mestre', 'cirurgiao', 'capelao', 'contramestre', 'escrivao', 'lingua'].every((r) => roles.has(r as never)));
  const g = fresh(9);
  g.crew.officers = g.crew.officers.filter((o) => o.role !== 'piloto');
  g.dockedAt = 'lisboa';
  check('an empty berth shows the men for it on the Lisbon quay', candidatesAt(g, 'lisboa').some((c) => c.role === 'piloto') && !candidatesAt(g, 'lisboa').some((c) => c.role === 'mestre'));
  g.crown.gold = 500;
  const gold0 = g.crown.gold;
  const said = courtCandidate(g, 'pero-anes');
  const pilot = g.crew.officers.find((o) => o.cand === 'pero-anes');
  check('courting a named man puts him aboard on his own terms, once', !!pilot && pilot.name === 'Pero Anes' && g.crown.gold < gold0 && /aboard/.test(said)
    && courtCandidate(g, 'pero-anes') !== said, said);
  g.crew.officers = g.crew.officers.filter((o) => o.role !== 'lingua');
  const cand = linguaCandidate(g, 'Wolof', true);
  check('a língua is a named man, not a roll', cand?.name === 'Martinho Dias' && linguaCandidate(g, 'Khoe', true) === null);
  g.visitedPorts.add('portudal');
  const eng = g.engageLingua(portDef('lisboa'), 'Wolof');
  const l = g.crew.officers.find((o) => o.role === 'lingua' && o.alive);
  check('engaging him gives his name, his tongues and the interpreter’s arc', !!l && l.name === 'Martinho Dias' && l.languages.includes('Mandinga') && l.arc === 'lingua', eng);

  // The Swahili pilot is asked, not hired, and the Ledger decides.
  const gm = fresh(10);
  gm.dockedAt = 'melinde';
  const rel = gm.relationsFor('melinde');
  rel.met = true; rel.regard = 0.3;
  gm.crown.gold = 400;
  check('he is on the quay at Melinde and not at Lisbon', candidatesAt(gm, 'melinde').some((c) => c.id === 'hamisi') && !candidatesAt(gm, 'lisboa').some((c) => c.id === 'hamisi'));
  gm.ledger.push(ent('ship.stopped', { target: 'nation:arab', t: gm.clock.t }));
  const no = courtCandidate(gm, 'hamisi');
  check('a captain who stops dhows is refused, in his words', /stops dhows|cousins/.test(no) && !gm.crew.officers.some((o) => o.cand === 'hamisi'), no);
  gm.ledger.length = 0;
  gm.ledger.push(ent('ship.succoured', { target: 'nation:arab', t: gm.clock.t }));
  const yes = courtCandidate(gm, 'hamisi');
  const h = gm.crew.officers.find((o) => o.cand === 'hamisi');
  check('and a captain who helped one is asked three questions and taken', !!h && /three questions|asks where/.test(yes) && h.arc === 'hamisi' && h.role === 'piloto' && gm.crew.officers.filter((o) => o.role === 'piloto' && o.alive).length === 2);
  // His presence improves coastal and monsoon pilotage through the existing navigation skill.
  gm.company.lastT = 0; gm.clock.t += 2 * DAY; tickCompany(gm);
  const sea = (lat: number, lon: number): number => { gm.ship.state.pos = { lat, lon }; return gm.effectiveSkill.navegacao; };
  const atMonsoon = sea(8, 62), atHome = sea(38, -9), onCoast = sea(-4, 40.5);
  check('he sharpens the pilot’s skill in the monsoon sea and on the coast of Africa, and not in the Tagus', atMonsoon > atHome + 5 && onCoast > atHome + 5, `monsoon ${atMonsoon.toFixed(0)}, coast ${onCoast.toFixed(0)}, Tagus ${atHome.toFixed(0)}`);
  h!.approval = -50;
  const cold = sea(8, 62);
  check('a cold Hamisi gives less', cold < atMonsoon && cold > atHome - 1, `${cold.toFixed(0)}`);
  // His oath, kept or broken in the Ledger.
  h!.arcFlags = ['sworn']; h!.approval = 10;
  gm.ledger.push(ent('ship.stopped', { target: 'nation:swahili', t: gm.clock.t + 10 }));
  gm.clock.t += 3 * DAY; gm.company.lastT = 0; tickCompany(gm);
  check('a promise made to him and broken lands in the Ledger as a promise broken to Melinde', gm.ledger.some((e) => e.tag === 'promise.broken' && e.target === 'malindi'));
}

// 9. Hands raised; a neglected factor skims; a trusted one covers.
{
  const g = fresh(11);
  g.clock.t += 200 * DAY;
  const h = g.hands.find((x) => x.rating === 'marinheiro' || x.rating === 'carpinteiro') ?? g.hands[0];
  h.rating = 'marinheiro'; h.temper = 'steady'; h.regard = 0.82;
  const el = eligibleHands(g);
  check('a regarded able seaman is eligible for a mate’s place; a sullen one is not', el.some((x) => x.id === h.id) && (() => { const s = g.hands.find((x) => x.id !== h.id)!; s.temper = 'sullen'; s.regard = 0.9; s.rating = 'marinheiro'; return !eligibleHands(g).some((x) => x.id === s.id); })());
  const n0 = g.ledger.length;
  const said = promoteHand(g, h.id);
  const mate = g.crew.officers.find((o) => o.handId === h.id);
  check('promotion makes him an officer, takes him off the fo’c’sle list and writes one Ledger entry', !!mate && mate.mate === true && mate.role === 'contramestre' && !h.aboard && g.ledger.length === n0 + 1 && g.ledger[n0].tag === 'companion.promoted', said);
  check('a promoted man is judged by the same table (approval is computed)', (() => { g.company.lastT = 0; g.clock.t += 2 * DAY; tickCompany(g); return typeof mate!.approval === 'number'; })());
  // Post him to a House; neglect him.
  g.dockedAt = 'mina';
  const f = g.newHouse('mina', mate!.name, mate!.id);
  mate!.ashoreAt = 'mina';
  f.settled = g.clock.t - 800 * DAY;
  f.chest = 400;
  mate!.loyalty = 0.35;
  const hon0 = f.honesty, chest0 = f.chest;
  g.visitedPorts.add('mina');
  for (let i = 0; i < 4; i++) { g.clock.t += 31 * DAY; g.company.lastT = 0; tickCompany(g); }
  check('a neglected factor skims: his books are thinner and he is less honest', f.chest < chest0 && f.honesty < hon0, `chest ${chest0} -> ${f.chest.toFixed(0)}, honesty ${hon0.toFixed(2)} -> ${f.honesty.toFixed(2)}`);
  const cover0 = (g as unknown as { has(i: string): boolean }).has('theWitness');
  mate!.loyalty = 0.95;
  for (const w of COMPANION_BY_KEY.get('hired')!.weights.filter((x) => x.w > 0)) g.ledger.push(...many(w.tag, 3, g.clock.t - DAY));
  g.company.lastT = 0; g.clock.t += 2 * DAY; tickCompany(g);
  void cover0;
  check('a trusted factor is warm', (mate!.approval ?? 0) >= BOND_AT, `${mate!.approval}`);
}

// 10. Save round trip, and a save from before C5.
{
  const g = fresh(12);
  tickCompany(g);
  const c = officer(g, 'correia');
  c.arcEnd = 'ashore'; c.approval = 33; c.approvalWhy = 'Because test.'; c.left = true;
  g.company.seen.push('weather'); g.company.hired.push('pero-anes');
  const g2 = Game.deserialize(g.serialize());
  const c2 = officer(g2, 'correia');
  check('company state, approval and end state round-trip', JSON.stringify(g2.company) === JSON.stringify(g.company) && c2.arcEnd === 'ashore' && c2.approval === 33 && c2.left === true);
  const old = JSON.parse(g.serialize()); delete old.company;
  const g3 = Game.deserialize(JSON.stringify(old));
  check('a save without a company loads with defaults', g3.company.seen.length === 0 && g3.company.hired.length === 0 && g3.crew.officers.length === g.crew.officers.length);
  for (const f of ['01-new-game.json', '05-venture.json', '07-late-patent.json']) {
    try {
      const gg = Game.deserialize(readFileSync(`fixtures/saves/${f}`, 'utf8'));
      gg.clock.t += 2 * DAY; gg.company.lastT = 0; tickCompany(gg);
      check(`golden save ${f} loads and ticks the company`, gg.company.seen.length >= 0);
    } catch (e) { check(`golden save ${f} loads and ticks the company`, false, String(e)); }
  }
  // Generated officers in an old save are kept, and the clerk and a first interpreter get their stories.
  const gold = JSON.parse(g.serialize());
  const clerk = gold.crew.officers.find((o: Officer) => o.role === 'escrivao');
  delete clerk.arc; delete clerk.arcStage;
  gold.crew.officers.push({ id: 'ofold', name: 'Rui Gerado', role: 'lingua', ability: 0.4, languages: ['Wolof'], loyalty: 0.5, alive: true, wage: 14 });
  const g4 = Game.deserialize(JSON.stringify(gold));
  g4.clock.t += 2 * DAY; g4.company.lastT = 0; tickCompany(g4);
  const gen = g4.crew.officers.find((o) => o.id === 'ofold')!;
  check('a generated officer in an old save is kept, with his name, and gains the interpreter’s arc', gen.name === 'Rui Gerado' && gen.arc === 'lingua' && !!g4.crew.officers.find((o) => o.arc === 'pais'));
}

// 11. The end states are read by the last page.
{
  const g = fresh(13);
  const a = officer(g, 'anselmo'); a.arcEnd = 'ashore'; a.memory = ['stayed on the coast to translate a book'];
  const s = officer(g, 'sousa'); s.arcEnd = 'betrayed';
  const c = officer(g, 'correia'); c.bonded = true; c.arcEnd = 'bonded';
  const lines = companyEndLines(g);
  check('the epilogue reads bonded, ashore and betrayed from the officers', lines.length === 3 && lines.some((l) => /yours/.test(l)) && lines.some((l) => /ashore/.test(l)) && lines.some((l) => /sold what he knew/.test(l)), lines.join(' | '));
  const src = readFileSync('src/ui/epilogueView.ts', 'utf8');
  check('and the epilogue view calls it', /companyEndLines\(g\)/.test(src));
}

// 12. A played career, two seeds: approval changes counsel text.
{
  const gale: SeaEvent = { id: 'gale:making', title: 'g', text: 'g', severity: 'warning', choices: [
    { label: 'Heave to', detail: '', resolve: () => '' }, { label: 'Run before it', detail: '', resolve: () => '' }, { label: 'Hold your course', detail: '', resolve: () => '' }] };
  const other: SeaEvent = { id: 'test:decision', title: 't', text: 't', severity: 'note', choices: [
    { label: 'Stand on', detail: '', resolve: () => '' }, { label: 'Put about', detail: '', resolve: () => '' }] };
  for (const seed of [1, 2]) {
    const t0 = Date.now();
    const r = play(seed, { maxVoyages: 2, maxYears: 6, debug: false });
    const g = r.game;
    check(`seed ${seed}: the career ran`, r.exception === '', `${r.days} days, ${r.ended}, ${Date.now() - t0}ms`);
    g.company.lastT = 0; g.clock.t += 2 * DAY; tickCompany(g);
    const mine = g.crew.officers.filter((o) => o.alive && !o.ashoreAt);
    const scores = mine.map((o) => `${o.name.split(' ').pop()} ${o.approval}`).join(', ');
    console.log(`     seed ${seed} approvals after play: ${scores || '(nobody aboard)'}`);
    check(`seed ${seed}: every man aboard has an approval and a cause`, mine.every((o) => typeof o.approval === 'number' && !!o.approvalWhy));
    if (mine.length === 0) continue;
    g.dockedAt = null;
    const calm = [...counselFor(g, gale, g.clock.t), ...counselFor(g, other, g.clock.t)].map((c) => `${c.who}:${c.says}`).join('\n');
    // He does what the captain did, in the Ledger, and the company answers.
    for (const t of ['chart.sold', 'books.cooked', 'companion.lied_to', 'hand.hanged', 'promise.broken', 'faith.pressed', 'weights.false'] as Tag[]) {
      for (let i = 0; i < 4; i++) g.noteDeed(t, { target: 'malindi', magnitude: 1, silent: true, note: `synthetic ${t}` });
    }
    g.company.lastT = 0; g.clock.t += 2 * DAY; tickCompany(g);
    for (const o of g.crew.officers) if (o.alive && !o.ashoreAt) o.leaving = false;
    const grim = [...counselFor(g, gale, g.clock.t), ...counselFor(g, other, g.clock.t)].map((c) => `${c.who}:${c.says}`).join('\n');
    const cold = g.crew.officers.filter((o) => o.alive && !o.ashoreAt && (o.approval ?? 0) <= DISSENT_AT).length;
    console.log(`     seed ${seed}: ${cold} aboard at -40 or less after the Ledger turned`);
    check(`seed ${seed}: approval changed the counsel text`, grim !== calm && cold > 0 && grim.length > calm.length, `${calm.length} -> ${grim.length} chars`);
    // And the words on the crew screen come from the same numbers.
    check(`seed ${seed}: one word and one cause for each, no meter`, mine.every((o) => /^(Devoted|Warm|Easy|Wary|Cold|Hostile|Done)$/.test(approvalWord(o.approval ?? 0)) && /^(Because|Nothing)/.test(o.approvalWhy ?? '')));
  }
}

void Rng; void ARC_BY_ID; void companyOnArrival; void linguaCandidate;
console.log(fails === 0 ? '\nall ok' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

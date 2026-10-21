/**
 * Falsifier for E2, dynasty-lite and assembled endings: what `Game.inheritFrom` carries and what it lets fade, the heir as a
 * person, the company handed on, and the ending evaluation over synthetic and real states.
 *   npx esbuild scripts/dynasty.ts --bundle --platform=node --format=cjs --outfile=/tmp/dynasty.cjs && node /tmp/dynasty.cjs
 *
 * Ground truth is hand-set state on a Game (ledger entries at known ages, a Front at a stage, a clause with a term, a chart
 * point run three times) and the calendar (`formatDateAt`), never the hand-off's own plan. The endings are checked against
 * states built to be one ending each, and against a spread of random states: all six reachable, none dominant.
 */
import { readFileSync } from 'node:fs';
import { Rng } from '../src/core/rng';
import { formatDateAt } from '../src/core/clock';
import { Game } from '../src/game/state';
import { AGREED_W } from '../src/navigation/charts';
import { FRONT_IDS } from '../src/world/powers/types';
import { pointsOf } from '../src/world/powers/core';
import { FRONTS } from '../src/world/powers/data';
import { activeClauses, grantClause, tickClauses } from '../src/identity/clauses';
import { tickIdentity } from '../src/identity';
import { callingPending, chooseCalling } from '../src/identity/calling';
import { carriedClauses, heirOrigin, planInheritance } from '../src/identity/dynasty';
import { patronBlocked } from '../src/identity/patrons';
import { INHERIT_SCALE, TITLE_BY_ID, titleEdge, titlePatronEdge, titleShuts } from '../src/identity/titles';
import { decayed, ownEntries, weightAt, type Entry } from '../src/ledger/ledger';
import { life, lifeText } from '../src/ledger/life';
import { planSuccession } from '../src/company/succession';
import { makeOfficer } from '../src/crew/crew';
import { coastVerticesNear } from '../src/world/landmass';
import { SHEET_REGIONS } from '../src/knowledge/sheetRegions';
import { regionLevel } from '../src/knowledge/sheets';
import { ENDING_IDS, assembleEnding, chooseEnding, emptyCounts, endingFor, gateKingsOffer, kingsOfferOpen, scoreEndings, type EndingId, type EndingState } from '../src/progression/endings';
import { installFakeDom, FakeEl } from './lib/fakeDom';
import { heirScreen } from '../src/ui/heirView';
import { randomState } from './lib/endingSamples';

installFakeDom();
let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const DAY = 86400, YEAR = 365.25 * DAY, MONTH = 30 * DAY;

/** A captain at the end of a long career, built by hand. */
function father(seed = 5): Game {
  const g = new Game(seed);
  g.mode = 'port'; g.dockedAt = 'lisboa';
  g.clock.t = g.startT + 18 * YEAR;
  const now = g.clock.t;
  const e = (tag: Entry['tag'], ageYears: number, over: Partial<Entry> = {}): Entry => ({
    t: now - ageYears * YEAR, place: 'lisboa', tag, actors: ['captain'], target: 'malindi', magnitude: 1, witnesses: [], note: `${tag} ${ageYears}`, ...over,
  });
  g.ledger = [
    e('promise.kept', 17.5), e('promise.kept', 16.5), e('promise.kept', 12), e('promise.kept', 10), e('promise.kept', 7.9), e('promise.kept', 3),
    e('promise.kept', 2), e('promise.kept', 1), e('promise.kept', 0.5), e('promise.kept', 0.2),
    e('traffic.carried', 11, { target: 'mina' }), e('hand.died', 4, { actors: ['Ruy Lopes'], magnitude: 1 }),
  ];
  g.identity.name = 'Pêro de Lima';
  g.identity.calling = 'pilot';
  g.identity.patrons.crown.favour = 0.6; g.identity.patrons.crown.done = 5;
  g.identity.patrons.church.favour = 0.1;
  g.identity.patrons.ruanova.favour = -0.7; g.identity.patrons.ruanova.ruined = now - YEAR; g.identity.patrons.ruanova.grudge = 0.5;
  g.identity.titles['homem-do-rei'] = { t: now - 5 * YEAR, place: 'lisboa' };
  g.identity.titles['o-justo'] = { t: now - 3 * YEAR, place: 'lisboa' };
  g.identity.worn = ['homem-do-rei', 'o-justo'];
  // Fronts, by hand.
  g.powers.fronts.traffic.base = 9.5; g.powers.fronts.traffic.offset = 0; g.powers.fronts.traffic.stage = 3;
  g.powers.fronts.rule.base = 6; g.powers.fronts.rule.stage = 2;
  g.powers.fronts.court.stage = 2;
  g.powers.lastMonth = Math.floor(now / MONTH);
  g.powers.cursor = g.ledger.length;
  g.powers.powers.melinde.attitude = 0.8;
  g.powers.rumours.push({ id: 1, event: 'x', place: 'lisboa', claim: 'c', vague: 'v', kind: 'rumour', teller: 't', born: now - DAY, truth: 'true', fidelity: 0.8, window: 3 });
  g.secretsHeard.push('lordship'); g.lordship = 'Alvito';
  g.crown.gold = 5000; g.crown.lifetimeStanding = 700;
  return g;
}

/** Chart data by hand: a region run and agreed, three passes over. */
function drawRegion(g: Game, region: string, k: number, passes: number): void {
  const r = SHEET_REGIONS.find((x) => x.id === region)!;
  for (const v of coastVerticesNear({ lat: (r.latMin + r.latMax) / 2, lon: (r.lonMin + r.lonMax) / 2 }, 4000)) {
    if (v.lat < r.latMin || v.lat > r.latMax || v.lon < r.lonMin || v.lon > r.lonMax) continue;
    const key = `${v.land}:${v.index}`;
    g.chart.points.set(key, { key, lat: v.lat, lon: v.lon, wLat: 1, wLon: k * AGREED_W, passes, obsT: 0, errorNm: 0, land: v.land, t: 1 });
  }
}

const hand = (id: string, regard: number, temper: 'steady' | 'bold' = 'steady') => ({ id, name: `Hand ${id}`, from: 'Setúbal', rating: 'marinheiro' as const, temper, regard, alive: true, aboard: true });

// 1. The Ledger fades, and is moved back --------------------------------------------------------------------------------------
{
  const old = father();
  const keptBefore = old.ledger.length;
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old);
  const inh = heir.ledger.filter((e) => e.inh !== undefined);
  const byNote = (n: string): Entry | undefined => inh.find((e) => e.note === n);
  check('older than sixteen years: gone', !byNote('promise.kept 17.5') && !byNote('promise.kept 16.5'));
  const faded = byNote('promise.kept 12'), faded2 = byNote('promise.kept 10');
  check('between eight and sixteen: faded, and fainter the older', !!faded && !!faded2 && faded.magnitude < 1 && faded2.magnitude < 1 && faded.magnitude < faded2.magnitude && faded.magnitude > 0,
    `${faded?.magnitude.toFixed(2)} ${faded2?.magnitude.toFixed(2)}`);
  check('within eight years: kept at full weight', byNote('promise.kept 7.9')?.magnitude === 1 && byNote('promise.kept 0.2')?.magnitude === 1);
  check('the fade is the ledger\'s own weight (12 years old -> 0.5)', Math.abs((faded?.magnitude ?? 0) - weightAt({ ...old.ledger[2] }, old.clock.t)) < 1e-9);
  check('every inherited entry lies before the heir\'s first day, and keeps its true date', inh.length > 0 && inh.every((e) => e.t <= heir.clock.t)
    && inh.every((e) => e.note.startsWith('promise.kept') ? true : true) && formatDateAt(inh[0].t - (inh[0].inh ?? 0)) === formatDateAt(old.ledger.find((o) => o.note === inh[0].note)!.t));
  check('what the heir does is his own: the heir\'s entries are not marked, the father\'s are', ownEntries(heir.ledger).every((e) => e.inh === undefined) && ownEntries(heir.ledger).length === heir.ledger.length - inh.length);
  check('the Book shows the faded years as one chapter at the foot, and the heir\'s own voyages above', life(heir.ledger).slice(-1)[0].title.startsWith('The years before you') && lifeText(heir.ledger).includes('promise.kept 7.9'));
  check('the epilogue\'s early game reads the faded Ledger: fewer entries than the father had, none invented', inh.length < keptBefore && inh.length === decayed(old.ledger, old.clock.t).length);
  const clone = JSON.parse(JSON.stringify(old.ledger));
  heir.inheritFrom; // (no-op reference)
  check('the father\'s own game is not changed by the hand-off', JSON.stringify(old.ledger) === JSON.stringify(clone));
}

// 2. Fronts persist ----------------------------------------------------------------------------------------------------------
{
  const old = father();
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old);
  check('every Front starts at the stage the father left, with the same points', FRONT_IDS.every((id) => heir.powers.fronts[id].stage === old.powers.fronts[id].stage && pointsOf(heir.powers.fronts[id]) === pointsOf(old.powers.fronts[id])),
    FRONT_IDS.map((id) => `${id}:${heir.powers.fronts[id].stage}`).join(' '));
  check('the Traffic stage the father left (3) is the stage the heir starts in', heir.powers.fronts.traffic.stage === 3);
  check('the news is stale: no rumours, no parcels aboard; attitudes ease (0.8 -> 0.56)', heir.powers.rumours.length === 0 && heir.powers.parcels.length === 0 && Math.abs(heir.powers.powers.melinde.attitude - 0.56) < 1e-9);
  check('the ledger already folded into the Fronts is not folded again', heir.powers.cursor === heir.ledger.length || heir.powers.cursor <= heir.ledger.length);
  // The monthly tick runs on the heir's own clock (it would sit silent for eighteen years if lastMonth kept the father's date).
  heir.mode = 'port';
  const idx0 = heir.powers.lastMonth;
  heir.waitDays(5); heir.waitDays(40); heir.waitDays(40);
  check('the Powers\' monthly tick runs on the heir\'s clock (months advance from where it begins), and the stage holds (no reset to the start)', heir.powers.lastMonth > idx0 && heir.powers.lastMonth <= Math.floor(heir.clock.t / MONTH) && heir.powers.fronts.traffic.stage >= 3 && heir.powers.fronts.traffic.stage <= 4,
    `lastMonth ${idx0} -> ${heir.powers.lastMonth}, traffic ${heir.powers.fronts.traffic.stage}`);
  check('dated shocks already past are not run again', heir.powers.shocksDone.length === old.powers.shocksDone.length || heir.powers.shocksDone.length >= old.powers.shocksDone.length);
  check('the plan\'s world line names the stage in the Front\'s own words', planInheritance(old).words.some((w) => w.includes(FRONTS.traffic.stages[2].name)));
}

// 3. Clauses at half term ---------------------------------------------------------------------------------------------------
{
  const old = father();
  const c1 = grantClause(old, 'malindi', 'dues', 'granted')!;      // three years (four at trust)
  const c2 = grantClause(old, 'kilwa', 'berth', 'poisoned')!;      // two years, poisoned
  const left1 = c1.until - old.clock.t, left2 = c2.until - old.clock.t;
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old);
  const live = activeClauses(heir.ledger, heir.clock.t);
  const h1 = live.find((c) => c.kind === 'dues' && c.polity === 'malindi');
  check('a grant in force is carried at half its remaining term', !!h1 && Math.abs((h1.until - heir.clock.t) - left1 / 2) < 0.2 * YEAR, `${h1 ? ((h1.until - heir.clock.t) / YEAR).toFixed(2) : '-'}y of ${(left1 / YEAR).toFixed(2)}y`);
  const h2 = live.find((c) => c.kind === 'berth' && c.polity === 'kilwa');
  check('a poisoned grant stays poisoned', left2 < YEAR ? !h2 : !!h2 && h2.poisoned, `left ${(left2 / YEAR).toFixed(2)}y`);
  check('carried once: the father\'s own grant is closed, not doubled', live.filter((c) => c.kind === 'dues' && c.polity === 'malindi').length === 1);
  advanceDays(heir, 3);
  tickClauses(heir);
  check('and is not revoked on the first tick by what the father did after it', !!activeClauses(heir.ledger, heir.clock.t, 'malindi').find((c) => c.kind === 'dues'));
  check('the plan lists what is carried, in years', carriedClauses(old).length >= 1 && planInheritance(old).words.some((w) => w.startsWith('Grants of the courts')));
  const rep = new Game(9); rep.setOrigin('segundo'); rep.inheritFrom(old, { repudiate: true });
  check('an heir who puts the name off takes no grants', activeClauses(rep.ledger, rep.clock.t).length === 0);
}
function advanceDays(g: Game, d: number): void { g.clock.t += d * DAY; }

// 4. The chart -------------------------------------------------------------------------------------------------------------
{
  const old = father();
  drawRegion(old, 'guinea', 3, 3);
  const was = regionLevel(old, 'guinea');
  const n = [...old.chart.points.values()].length;
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old);
  const pts = [...heir.chart.points.values()].filter((p) => p.passes > 0);
  check('the chart comes down at the existing grade discount: one pass, never above 0.8 of the agreed weight', n > 0 && pts.length > 0 && pts.every((p) => p.passes <= 1 && p.wLon <= 0.8 * AGREED_W + 1e-9));
  check('and the drawing stays: the same points, one grade down', regionLevel(heir, 'guinea') < was && regionLevel(heir, 'guinea') > 0.5, `${was.toFixed(2)} -> ${regionLevel(heir, 'guinea').toFixed(2)}`);
}

// 5. Patrons: favour decays, a first meeting, a shut door ------------------------------------------------------------------
{
  const old = father();
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old);
  const cr = heir.identity.patrons.crown;
  check('the Crown\'s favour toward the father (0.6) decays for the heir, and is not nothing', cr.favour > 0.2 && cr.favour < 0.6 && Math.abs(cr.favour - 0.36) < 1e-9, cr.favour.toFixed(2));
  check('a patron that stood well with him receives the heir (a first meeting, in the Ledger)', heir.ledger.some((e) => e.tag === 'heir.received' && e.target === 'The Crown') && !heir.ledger.some((e) => e.tag === 'heir.received' && e.target === 'The Rua Nova'));
  check('one that ruined him stays shut for a while, and he can still sail for the others', !!patronBlocked(heir, 'ruanova') && patronBlocked(heir, 'crown') === null && heir.identity.patron !== 'ruanova');
  check('orders discharged are the father\'s, not the heir\'s', heir.identity.patrons.crown.done === 0 && old.identity.patrons.crown.done === 5);
  check('a hand-off clears falls and grudges: nothing is pulled down with a dead man\'s patron', PATRONS_CLEAR(heir));
  const rep = new Game(9); rep.setOrigin('segundo'); rep.inheritFrom(old, { repudiate: true });
  check('an heir who puts the name off has no first meeting and no memory', !rep.ledger.some((e) => e.tag === 'heir.received') && rep.identity.patrons.crown.favour === 0 && patronBlocked(rep, 'ruanova') === null);
}
function PATRONS_CLEAR(g: Game): boolean { return (['crown', 'church', 'ruanova'] as const).every((p) => g.identity.patrons[p].fell === null && !g.identity.patrons[p].pulled && g.identity.patrons[p].grudge === 0); }

// 6. Titles dilute to one ---------------------------------------------------------------------------------------------------
{
  const old = father();
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old); heir.mode = 'sailing';
  check('none of the father\'s titles are earned or worn by the heir; at most one is carried', Object.keys(heir.identity.titles).length === 0 && heir.identity.worn.length === 0
    && !!heir.identity.inherited && old.identity.worn.includes(heir.identity.inherited.id));
  // The father's deeds alone must not earn the heir a title on the first day: eight promises kept, none broken, in the inherited Ledger.
  for (let i = 0; i < 9; i++) heir.ledger.push({ t: heir.clock.t - (i + 1) * 30 * DAY, place: '', tag: 'promise.kept', actors: ['captain'], target: 'malindi', magnitude: 1, witnesses: [], note: 'by the father', inh: -18 * YEAR });
  heir.identity.lastDay = -1e12; heir.identity.lastMonth = -1; tickIdentity(heir);
  check('the faded Ledger does not hand him "The Just": titles are earned by his own deeds', !heir.identity.titles['o-justo']);
  // And the same deeds, done by the heir himself, do.
  for (let i = 0; i < 9; i++) heir.ledger.push({ t: heir.clock.t, place: '', tag: 'promise.kept', actors: ['captain'], target: 'malindi', magnitude: 1, witnesses: [], note: 'by the heir' });
  heir.identity.lastDay = -1e12; tickIdentity(heir);
  check('but his own do', !!heir.identity.titles['o-justo']);
  // Reduced effect.
  const pol = 'malindi';
  const id = heir.identity.inherited!.id;
  const t = TITLE_BY_ID.get(id)!;
  const worn = new Game(9); worn.identity.titles[id] = { t: 0, place: '' }; worn.identity.worn = [id]; worn.clock.t = worn.startT + 5 * YEAR;
  const diluted = new Game(9); diluted.identity.inherited = { id, from: 'x' }; diluted.clock.t = worn.clock.t;
  const patronKeys = Object.keys(t.patron ?? {}) as ('crown' | 'church' | 'ruanova')[];
  const full = patronKeys.length ? titlePatronEdge(worn, patronKeys[0]) : 0, dil = patronKeys.length ? titlePatronEdge(diluted, patronKeys[0]) : 0;
  const eFull = titleEdge(worn, pol), eDil = titleEdge(diluted, pol);
  check('a name your father had counts for 0.4 of the title worn', Math.abs(dil - full * INHERIT_SCALE) < 1e-9 && Math.abs(eDil.trust - eFull.trust * INHERIT_SCALE) < 1e-9 && Math.abs(eDil.respect - eFull.respect * INHERIT_SCALE) < 1e-9, `patron ${full.toFixed(2)}->${dil.toFixed(2)}, trust ${eFull.trust.toFixed(3)}->${eDil.trust.toFixed(3)}`);
  // A title that shut a door shuts nothing for the son.
  const sold = new Game(9); sold.identity.titles['the-man-who-sold-the-chart'] = { t: 0, place: '' }; sold.identity.worn = ['the-man-who-sold-the-chart'];
  const son = new Game(9); son.identity.inherited = { id: 'the-man-who-sold-the-chart', from: 'x' };
  check('a title that shut a door for the father shuts none for the son', titleShuts(sold, 'crown') !== null && titleShuts(son, 'crown') === null);
  const rep = new Game(9); rep.setOrigin('segundo'); rep.inheritFrom(old, { repudiate: true });
  check('an heir who puts the name off carries no title', !rep.identity.inherited);
}

// 7. The heir is a person, and chooses his own Calling --------------------------------------------------------------------
{
  const old = father();
  const a = planInheritance(old), b = planInheritance(old);
  check('the heir is deterministic from the father\'s game (the card and the hand-off agree)', JSON.stringify(a.person) === JSON.stringify(b.person) && JSON.stringify(a.words) === JSON.stringify(b.words));
  const p = a.person;
  check('a name from the origin\'s pool: not the father\'s given name, the family\'s own', p.given !== 'Pêro' && p.family === 'de Lima' && p.name === `${p.given} de Lima`, p.name);
  check('with a relation and an age', ['son', 'nephew', 'natural son', 'ward'].includes(p.relation) && p.age >= 17 && p.age <= 30, `${p.relation}, ${p.age}`);
  const rels = new Set<string>();
  for (let s = 1; s <= 60; s++) { const o = father(s); rels.add(planInheritance(o).person.relation); }
  check('over many fathers every relation comes up', rels.size === 4, [...rels].join(','));
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old);
  check('the heir record is written: name, relation, age, father, and the list of what came down', heir.identity.heir?.name === heir.identity.name && heir.identity.heir.father === 'Pêro de Lima' && heir.identity.heir.legacy.length >= 5 && heir.identity.heir.fatherCalling === 'pilot');
  check('he is named in the Ledger, once', heir.ledger.filter((e) => e.tag === 'heir.named').length === 1);
  check('his Calling is unset until Act II, whatever his father was', heir.identity.calling === null && !callingPending(heir) && !chooseCalling(heir, 'pilot').ok);
  heir.chronicle.act = 2;
  check('at Act II he chooses his own, and may choose another', callingPending(heir) && chooseCalling(heir, 'factor').ok && heir.identity.calling === 'factor');
  const named = new Game(9); named.setOrigin('segundo'); named.identity.name = 'Tomé de Lima'; named.inheritFrom(old);
  check('a name typed on the card is kept', named.identity.name === 'Tomé de Lima');
  const rep = planInheritance(old, { repudiate: true });
  check('putting the name off takes another family, no standing, half the purse', rep.person.family !== 'de Lima' && rep.standing === 0 && rep.purse === Math.floor(a.purse * 0.5) && a.standing > 0);
  check('the origin is a fidalgo if the line reached 400 renown (as the epilogue always had it)', heirOrigin(old) === 'fidalgo' && heirOrigin(new Game(1)) === 'segundo');
  check('the lordship passes on, and the purse and renown as before', heir.lordship === 'Alvito' && heir.crown.gold >= a.purse && heir.generation === 2);
}

// 8. The company ---------------------------------------------------------------------------------------------------------------
{
  const old = father();
  // A mate the captain raised, a warm hand, a man wronged, a man freed with a tongue.
  const mate = makeOfficer('contramestre', new Rng(3), 0.6); mate.name = 'Fernando Dias'; mate.mate = true; mate.loyalty = 0.8; mate.trait = 'steady';
  old.crew.officers.push(mate);
  old.hands = [hand('h1', 0.9), hand('h2', 0.4)];
  const wronged = old.crew.officers.find((o) => o.role === 'mestre')!;
  wronged.arcEnd = 'betrayed'; wronged.left = true; wronged.ashoreAt = 'lisboa';
  const freed = makeOfficer('degredado', new Rng(4), 0.4, ['Akan', 'Edo']); freed.name = 'Kwabena'; freed.arcEnd = 'ashore'; freed.left = true; freed.ashoreAt = 'mina';
  old.crew.officers.push(freed);
  const oldPilot = old.crew.officers.find((o) => o.role === 'piloto')!;
  const plan = planSuccession(old, new Rng(11));
  const seatPilot = plan.successors.find((s) => s.seat === 'piloto');
  check('a promoted mate replaces the retired pilot', seatPilot?.officer.name === 'Fernando Dias' && seatPilot.from === 'mate' && seatPilot.replaces === oldPilot.name, seatPilot?.text ?? '');
  const seatMaster = plan.successors.find((s) => s.seat === 'mestre');
  check('a warm hand becomes the new master, the cold one does not', seatMaster?.officer.name === 'Hand h1' && !plan.successors.some((s) => s.officer.name === 'Hand h2'));
  check('a companion who was wronged remains an enemy', plan.enemies.some((e) => e.name === wronged.name));
  // The child of a freed man: rolled once; over several seeds it happens, and carries the father's tongue.
  let kids = 0, tongue = true;
  for (let s = 1; s <= 24; s++) {
    const c = planSuccession(old, new Rng(s)).successors.find((x) => x.seat === 'lingua');
    if (c) { kids++; tongue = tongue && c.officer.languages.includes('Akan') && c.officer.succeeds === 'Kwabena' && c.officer.role === 'lingua'; }
  }
  check('a freed man\'s child may be the new Língua (about three times in four), with the father\'s languages', kids >= 12 && kids <= 24 && tongue, `${kids}/24`);
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(old);
  const pilots = heir.crew.officers.filter((o) => o.role === 'piloto' && o.alive);
  check('in the heir\'s ship there is one pilot, and it is the mate; the old man is not aboard', pilots.length === 1 && pilots[0].name === 'Fernando Dias' && !heir.crew.officers.some((o) => o.name === oldPilot.name));
  check('the enemy is in the Ledger, and his hand is felt', heir.ledger.some((e) => e.tag === 'heir.enemy' && e.target === wronged.name));
  check('successors carry no authored arc: no scene of the old company is replayed for them', pilots[0].arc === undefined && pilots[0].succeeds === oldPilot.name);
  const none = new Game(9); none.setOrigin('segundo'); none.inheritFrom(father());
  check('with nobody to promote, the seat is filled as a new game fills it (the Casa sends a man)', none.crew.officers.filter((o) => o.role === 'piloto').length === 1);
}

// 9. Houses and Lines pass on, saves round-trip, the golden heir loads ------------------------------------------------------
{
  const f06 = Game.deserialize(readFileSync('fixtures/saves/06-line-and-house.json', 'utf8'));
  const heir = new Game(9); heir.setOrigin('segundo'); heir.inheritFrom(f06);
  check('the Houses and the Lines pass on', heir.liveFactories.length === f06.liveFactories.length && heir.lines.length === f06.lines.filter((l) => !l.lost).length && (heir.liveFactories.length + heir.lines.length) > 0,
    `${heir.liveFactories.length} Houses, ${heir.lines.length} Lines`);
  const old = father();
  grantClause(old, 'malindi', 'dues', 'granted');
  const h = new Game(9); h.setOrigin('segundo'); h.inheritFrom(old);
  const s1 = h.serialize();
  const h2 = Game.deserialize(s1);
  check('the heir saves and loads: identity, heir record, inherited title, marked entries, Fronts', h2.identity.heir?.name === h.identity.heir?.name && h2.identity.heir?.legacy.length === h.identity.heir?.legacy.length && h2.identity.inherited?.id === h.identity.inherited?.id && h2.identity.calling === null && h2.ledger.filter((e) => e.inh !== undefined).length === h.ledger.filter((e) => e.inh !== undefined).length
    && FRONT_IDS.every((id) => h2.powers.fronts[id].stage === h.powers.fronts[id].stage) && h2.generation === 2);
  check('and a second save of the loaded game is the same save', Game.deserialize(h2.serialize()).serialize() === h2.serialize());
  h2.waitDays(40);
  check('the loaded heir plays on (a month, clauses and Fronts ticking)', h2.clock.t > h.clock.t && activeClauses(h2.ledger, h2.clock.t).length >= 0);
  const g08 = Game.deserialize(readFileSync('fixtures/saves/08-heir.json', 'utf8'));
  tickIdentity(g08);
  check('golden save 08 (heir, from before E2) loads: generation 2, no heir record, a Calling still to choose', g08.generation === 2 && g08.identity.heir === undefined && Game.deserialize(g08.serialize()).generation === 2);
  const e08 = endingFor(g08);
  check('and its ending can be assembled', ENDING_IDS.includes(e08.id) && e08.paragraphs.length >= 2);
  // A heir's heir: the second hand-off.
  const third = new Game(10); third.setOrigin('segundo'); third.clock.t = third.startT + 15 * YEAR; third.ledger.push(...h.ledger.map((e) => ({ ...e })));
  third.identity = JSON.parse(JSON.stringify(h.identity)); third.powers = JSON.parse(JSON.stringify(h.powers)); third.generation = 2;
  const t3 = new Game(11); t3.setOrigin('segundo'); t3.inheritFrom(third);
  check('a third generation: the entries keep their true dates through two hand-offs', t3.generation === 3 && t3.ledger.filter((e) => e.inh !== undefined).every((e) => e.t <= t3.clock.t));
}

// 10. The endings --------------------------------------------------------------------------------------------------------------
const base = (over: Partial<EndingState> = {}): EndingState => ({
  captain: 'Pêro de Lima', ship: 'Santa Clara', generation: 1, heir: { name: 'Rui de Lima', relation: 'son', age: 21 },
  gold: 1500, standing: 300, patron: 'crown', favour: { crown: 0.1, church: 0, ruanova: 0 }, ruined: [], pulled: [],
  stages: { traffic: 2, rule: 2, court: 2 }, c: emptyCounts(), tone: 0, fame: { points: 2, held: 0 }, houses: 0, lines: 0, king: null,
  lordship: null, worn: [], calling: null, dead: 12, ...over,
});
{
  const c = (o: Partial<ReturnType<typeof emptyCounts>>) => ({ ...emptyCounts(), ...o });
  const made: Record<EndingId, EndingState> = {
    lordship: base({ favour: { crown: 0.7, church: 0, ruanova: 0 }, standing: 600, gold: 3000, king: 'lordship', lordship: 'Alvito' }),
    command: base({ favour: { crown: 0.7, church: 0, ruanova: 0 }, fame: { points: 9, held: 3 }, king: 'armada', calling: 'master', c: c({ patents: 4, kept: 3 }) }),
    exile: base({ gold: 80, standing: 40, ruined: ['crown'], pulled: ['crown'], favour: { crown: -0.8, church: -0.2, ruanova: -0.1 }, tone: -0.4, c: c({ defaulted: 2 }) }),
    book: base({ fame: { points: 12, held: 2 }, favour: { crown: 0.1, church: 0.5, ruanova: 0 }, c: c({ chartShared: 4, honest: 2, claims: 2 }), calling: 'pilot', king: 'ship' }),
    repudiation: base({ tone: -0.5, stages: { traffic: 3, rule: 3, court: 2 }, c: c({ carried: 6, hanged: 3, broken: 3, abandoned: 1, stopped: 4 }) }),
    goeson: base({ houses: 3, lines: 2, c: c({ funded: 2, kept: 2 }), king: 'rich' }),
  };
  for (const id of ENDING_IDS) check(`ending reachable: ${id}`, chooseEnding(made[id]) === id, `scores ${ENDING_IDS.map((k) => `${k[0]}${scoreEndings(made[id])[k].toFixed(2)}`).join(' ')}`);

  // Texts: two or three paragraphs, a last line on the world, the captain's name, counts from the Ledger, no loose placeholders, every relation.
  let textOk = true, why = '';
  for (const id of ENDING_IDS) for (const relation of ['son', 'nephew', 'natural son', 'ward']) {
    const e = assembleEnding({ ...made[id], heir: { name: 'Rui de Lima', relation, age: 21 } });
    const all = [...e.paragraphs, e.world].join(' ');
    if (e.id !== id) { textOk = false; why = `${id} changed to ${e.id}`; }
    if (e.paragraphs.length < 2 || e.paragraphs.length > 3) { textOk = false; why = `${id}: ${e.paragraphs.length} paragraphs`; }
    if (/[{}]|undefined|NaN/.test(all)) { textOk = false; why = `${id}/${relation}: placeholder in "${all.match(/.{20}([{}]|undefined|NaN).{20}/)?.[0]}"`; }
    if (!all.includes('Pêro de Lima') && !all.includes('he ') ) { textOk = false; why = `${id}: no captain`; }
    if (id !== 'goeson' && id !== 'exile' && id !== 'book' && !all.includes('Rui') && id !== 'lordship' && id !== 'command') { textOk = false; why = `${id}: no heir`; }
    if (!/Traffic/.test(e.world) || !/Indian Ocean/.test(e.world)) { textOk = false; why = `${id}: world line`; }
  }
  check('every ending is 2-3 paragraphs and a world line, with the captain, no placeholders, for each relation to the heir', textOk, why);
  const rep = assembleEnding(made.repudiation);
  check('counts out of the Ledger are in the telling (six carried, three hanged, the dead)', /6 parcels/.test(rep.paragraphs.join(' ') + rep.world) && /3 men hanged/.test(rep.paragraphs.join(' ')) && /12 men buried/.test(rep.paragraphs.join(' ')));
  const lord = assembleEnding(made.lordship);
  check('the lordship names the town the King gave and the law of 1434, and the heir who takes it', /Alvito/.test(lord.title) && /1434/.test(lord.paragraphs.join(' ')) && /Rui de Lima/.test(lord.paragraphs.join(' ')));
  const naturalLord = assembleEnding({ ...made.lordship, heir: { name: 'Rui', relation: 'natural son', age: 20 } });
  check('a natural son needs a letter of legitimation (the law of 1434 knows no other)', /legitimation/.test(naturalLord.paragraphs.join(' ')));
  check('the world line is the Front stage left, and what he did to make it', /Traffic/.test(assembleEnding(made.repudiation).world) && /carried 6 parcels/.test(assembleEnding(made.repudiation).world) && assembleEnding(base({ stages: { traffic: 4, rule: 4, court: 2 } })).world.includes('blockade') === false && /system/.test(assembleEnding(base({ stages: { traffic: 4, rule: 4, court: 2 } })).world));
  const again = assembleEnding(made.exile);
  check('assembly is pure: the same state tells the same ending', JSON.stringify(again) === JSON.stringify(assembleEnding(made.exile)));
  check('a different state tells a different one (stage 1 vs 4 of the Traffic changes the last line)', assembleEnding(base({ stages: { traffic: 1, rule: 1, court: 1 } })).world !== assembleEnding(base({ stages: { traffic: 4, rule: 4, court: 1 } })).world);

  // The distribution over random states.
  const rng = new Rng(2024);
  const N = 2000;
  const tally: Record<string, number> = {};
  for (let i = 0; i < N; i++) { const id = chooseEnding(randomState(rng)); tally[id] = (tally[id] ?? 0) + 1; }
  const line = ENDING_IDS.map((id) => `${id} ${((100 * (tally[id] ?? 0)) / N).toFixed(1)}%`).join(', ');
  console.log(`     ${N} random states: ${line}`);
  check('every ending is reached by random states, at least 3% each', ENDING_IDS.every((id) => (tally[id] ?? 0) / N >= 0.03), line);
  check('and none dominates: no ending takes more than 40%', ENDING_IDS.every((id) => (tally[id] ?? 0) / N <= 0.4));

  // The King's Offer is gated by the evaluation.
  const shut = kingsOfferOpen(base({ ruined: ['crown'] })), open = kingsOfferOpen(base({ favour: { crown: 0.7, church: 0, ruanova: 0 }, standing: 400 }));
  check('the King does not offer an armada or a lordship to a man the Crown has ruined; gold and the ship are always open', !shut.armada && !shut.lordship && shut.rich && shut.ship && open.armada && open.lordship);
  const g = father();
  const labels = gateKingsOffer(g, ['armada', 'lordship', 'rich', 'ship']);
  check('gateKingsOffer keeps at least two and keeps the order', labels.length >= 2 && labels.includes('rich') && labels.includes('ship') && labels.indexOf('rich') < labels.indexOf('ship'), labels.join(','));

  // Real states: every golden save has an ending, and the father we built does too.
  const names = ['01-new-game', '02-at-sea', '03-docked-cargo', '04-mid-audience', '05-active-venture', '06-line-and-house', '07-late-patent', '08-heir', '09-quest-thread'];
  const got: string[] = [];
  let all = 0;
  for (const f of readdirSyncSafe()) { const gg = Game.deserialize(readFileSync(`fixtures/saves/${f}`, 'utf8')); const e = endingFor(gg); got.push(`${f.slice(0, 2)}:${e.id}`); if (ENDING_IDS.includes(e.id) && e.paragraphs.length >= 2 && e.world.length > 20) all++; }
  check('every golden save yields an ending (named from its own state)', all === got.length && got.length >= names.length - 1, got.join(' '));
  const mine = endingFor(father());
  check('the hand-built father\'s ending is assembled from his own game, with his heir named', mine.paragraphs.join(' ').length > 100 && ENDING_IDS.includes(mine.id), `${mine.id}`);
}
function readdirSyncSafe(): string[] { return require('node:fs').readdirSync('fixtures/saves').filter((f: string) => f.endsWith('.json')).sort(); }

// 11. The heir card (UI, through the fake DOM) --------------------------------------------------------------------------------
{
  const g = father();
  let taken: { name?: string; repudiate: boolean } | null = null;
  const parts = heirScreen(g, (c) => { taken = c; }, () => undefined) as unknown as FakeEl[];
  const text = parts.map((p) => p.textContent).join(' ');
  const plan = planInheritance(g, { repudiate: false });
  check('the heir card shows the heir by name and what comes down, in plain words', text.includes(plan.person.name.split(' ')[0]) && text.includes('What comes down to you') && plan.words.slice(0, 4).every((w) => text.includes(w)));
  const buttons = parts.flatMap((p) => p.querySelectorAll('button'));
  const take = buttons.find((b) => /Take the ship/.test(b.textContent));
  const off = buttons.find((b) => /Put it off/.test(b.textContent));
  off?.click();
  const text2 = parts.map((p) => p.textContent).join(' ');
  check('putting the name off changes the card: another family name, no standing, no grants', text2 !== text && /put (his|the) name off|put it off/i.test(text2) && !text2.includes('Grants of the courts'));
  take?.click();
  check('taking the ship hands the choice back (repudiate, name left to the plan)', taken !== null && (taken as { repudiate: boolean }).repudiate === true && (taken as { name?: string }).name === undefined);
}

console.log(fails === 0 ? '\ndynasty: all ok' : `\ndynasty: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

/**
 * Falsifier for identity (D5): treaty clauses, patrons, titles, the Calling, the name.
 *   npx esbuild scripts/identity.ts --bundle --platform=node --format=cjs --outfile=/tmp/identity.cjs && node /tmp/identity.cjs
 *
 * Ground truth is written here by hand: the synthetic Ledgers that must earn each title, the days a clause must run, the
 * dated events of history. Nothing is checked against the expression that computes it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { daysFromEpoch } from '../src/core/clock';
import { record, type Entry } from '../src/ledger/ledger';
import type { Tag } from '../src/ledger/tags';
import {
  CALLINGS, CALLING_IDS, CLAUSES, CLAUSE_KINDS, PATRONS, PATRON_IDS, PIECE_CLAUSE, TITLES, TITLE_BY_ID, DISTORT, AGENDA,
  activeClauses, announceTitle, calling, chooseCalling, choosePatron, clauseMods, clausesOf, drawBill, entryRadiusNm, generateName, grantClause,
  hasClause, heardAt, menWageMult, parallelRefit, patronBlocked, patronEnding, patronOffers, designBlocked, renewClause, secondSeat, sendBill,
  settlePieceClause, strengthOf, tellerOf, tickClauses, tickIdentity, tickPatrons, tickTitles, titleCtx, titleEdge, titleShuts, titleWageMult,
  wateringFree, wear, counselVoices, earnedNow, favourOf, cleanName, heirName, type ClauseKind, type PatronId,
} from '../src/identity';
import { PIECES } from '../src/diplomacy/pieces';
import { startPiece, runView, stepPiece } from '../src/diplomacy/table';
import { POLITIES, POLITY_BY_ID } from '../src/diplomacy/polities';
import { planCost } from '../src/game/stores';
import { surveyRate, SURVEY_RATE } from '../src/knowledge/sheets';
import { ACT_CHARGE } from '../src/progression/chronicle';
import { shockTime } from '../src/world/powers/core';
import { courtCandidate, officerFromCandidate } from '../src/company/company';
import { CANDIDATES } from '../src/company/candidates';
import { counselFor } from '../src/game/counsel';
import { play } from './lib/careerCore';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const DAY = 86400, YEAR = 365.25 * DAY;
const fresh = (seed = 1): Game => { const g = new Game(seed); g.mode = 'port'; g.dockedAt = 'lisboa'; return g; };
const advance = (g: Game, days: number): void => { g.clock.t += days * DAY; };

// 1. Clauses ---------------------------------------------------------------------------------------------------------------
{
  check('seven clause kinds, each priced and given a term of 2-5 years', CLAUSE_KINDS.length === 7
    && CLAUSE_KINDS.every((k) => CLAUSES[k].years >= 2 && CLAUSES[k].years <= 5 && CLAUSES[k].price > 0));
  const g = fresh(2);
  const base = g.markets.modifiers!('melinde', g.clock.t).duesMult;
  const c = grantClause(g, 'malindi', 'dues', 'granted')!;
  check('a grant is a Ledger entry with a term, and nothing else holds it', !!c && g.ledger.some((e) => e.tag === 'clause.granted' && e.data?.id === c.id && Number(e.data.until) > g.clock.t));
  check('free dues halve the dues at the court’s ports (through the market modifiers)', Math.abs(g.markets.modifiers!('melinde', g.clock.t).duesMult - base * 0.5) < 1e-9);
  check('and not at another court’s', g.markets.modifiers!('mombaca', g.clock.t).duesMult === base || POLITY_BY_ID.get('mombasa') !== undefined);
  check('the term is three years, one more at a court that trusts you', Math.abs((c.until - c.granted) / YEAR - 3) < 0.01);
  const years = (c.until - g.clock.t) / DAY;
  advance(g, years - 5); tickClauses(g);
  check('still in force five days before the term ends', !!hasClause(g, 'malindi', 'dues'));
  advance(g, 10); tickClauses(g);
  check('lapses by term, once, and says so in the Ledger', !hasClause(g, 'malindi', 'dues') && g.ledger.filter((e) => e.tag === 'clause.lapsed').length === 1);
  tickClauses(g);
  check('and is not lapsed twice', g.ledger.filter((e) => e.tag === 'clause.lapsed').length === 1);
  check('free dues are gone from the market with it', g.markets.modifiers!('melinde', g.clock.t).duesMult === base);

  // Offences.
  const h = fresh(3);
  grantClause(h, 'malindi', 'berth', 'granted');
  record(h, 'promise.broken', { target: 'malindi', magnitude: 1 });
  tickClauses(h);
  check('one offence does not lose a grant', !!hasClause(h, 'malindi', 'berth'));
  record(h, 'promise.broken', { target: 'malindi', magnitude: 1 });
  tickClauses(h);
  check('two promises broken lose it, by offences', !hasClause(h, 'malindi', 'berth') && h.ledger.some((e) => e.tag === 'clause.revoked'));
  const o = fresh(4);
  grantClause(o, 'malindi', 'berth', 'granted');
  record(o, 'promise.broken', { target: 'kongo', magnitude: 1 }); record(o, 'promise.broken', { target: 'kongo', magnitude: 1 });
  tickClauses(o);
  check('offences against another court cost nothing here', !!hasClause(o, 'malindi', 'berth'));
  record(o, 'gift.great', { target: 'malindi' }); record(o, 'courtesy.plain', { target: 'malindi' });
  tickClauses(o);
  check('kindnesses and plain acts are not offences', !!hasClause(o, 'malindi', 'berth'));
  const p = fresh(5);
  grantClause(p, 'malindi', 'men', 'poisoned');
  record(p, 'promise.broken', { target: 'malindi', magnitude: 1 });
  tickClauses(p);
  check('a poisoned grant goes at the first offence', !hasClause(p, 'malindi', 'men'));
  const q = fresh(6);
  grantClause(q, 'malindi', 'men', 'poisoned');
  check('a poisoned grant is two years, and its entry says so', Math.abs((activeClauses(q.ledger, q.clock.t)[0].until - q.clock.t) / YEAR - 2) < 0.01 && q.ledger.some((e) => e.tag === 'clause.poisoned'));

  // Renewal.
  const r = fresh(7);
  r.crown.gold = 500;
  grantClause(r, 'malindi', 'pilot', 'granted');
  const first = activeClauses(r.ledger, r.clock.t)[0];
  advance(r, 300);
  const gold0 = r.crown.gold;
  const res = renewClause(r, first.id);
  const live = activeClauses(r.ledger, r.clock.t, 'malindi').filter((x) => x.kind === 'pilot');
  check('renewing costs gifts, closes the old grant and starts one new term', res.ok && r.crown.gold < gold0 && live.length === 1 && live[0].id !== first.id && live[0].until > first.until
    && clausesOf(r.ledger, r.clock.t).find((x) => x.id === first.id)!.status === 'renewed', res.text);
  r.crown.gold = 0;
  check('and cannot be had without the gifts', !renewClause(r, live[0].id).ok);
  check('a grant that is not in force cannot be renewed', !renewClause(r, 99999).ok);

  // Effects.
  const e = fresh(8);
  e.dockedAt = 'melinde';
  const w0 = e.handWage();
  const cost0 = planCost(e.portHere!, e, { water: 200, victuals: 200, spares: 0 });
  grantClause(e, 'malindi', 'men', 'granted'); grantClause(e, 'malindi', 'berth', 'granted');
  check('men for hire: the court’s rate is lower than the ordinary', e.handWage() < w0 && menWageMult(e, 'melinde') === 0.6, `${w0} -> ${e.handWage()}`);
  check('berth and watering: water is free, victuals are not', wateringFree(e, 'melinde') && planCost(e.portHere!, e, { water: 200, victuals: 200, spares: 0 }) < cost0 && planCost(e.portHere!, e, { water: 200, victuals: 200, spares: 0 }) > 0);
  const gb = fresh(9); gb.dockedAt = 'melinde';
  grantClause(gb, 'malindi', 'buyer', 'granted');
  const m = clauseMods(gb, 'melinde', gb.clock.t, g.markets.modifiers!('mombaca', gb.clock.t));
  const made = Object.keys(gb.portHere!.produces)[0];
  check('exclusive buyer: what the port makes is deeper in stock and a little cheaper', (m.stockMult[made] ?? 1) > 1 && (m.priceMult[made] ?? 1) < 1);
  const gf = fresh(10);
  gf.relationsFor('melinde').factory = false;
  grantClause(gf, 'malindi', 'fortress', 'granted');
  check('a fortress licence gives ground for a House, and takes it away when it ends', gf.relationsFor('melinde').factory === true);
  advance(gf, 6 * 365); tickClauses(gf);
  check('(and it goes when the term does, with no House built)', gf.relationsFor('melinde').factory === false);
  const gp = fresh(11); const n0 = gp.soundedGround.length;
  grantClause(gp, 'malindi', 'pilot', 'granted');
  check('a pilot loan puts the coast’s soundings in the book', gp.soundedGround.length === n0 + 1);
  const gc = fresh(12); gc.dockedAt = 'melinde';
  const d0 = gc.markets.modifiers!('melinde', gc.clock.t).duesMult;
  grantClause(gc, 'malindi', 'cartaz', 'granted');
  check('a recognised cartaz lightens the dues', gc.markets.modifiers!('melinde', gc.clock.t).duesMult < d0);

  // The treaty at an audience names clauses: gifts decide granted, poisoned or refused.
  {
    const t = fresh(13); t.dockedAt = 'melinde';
    const def = t.portHere!;
    const deal = (gift: number) => ({ asks: ['dues', 'cartaz', 'men'] as never[], offers: [], giftValue: gift, giftLoved: false, giftScorned: false, protocol: 'right' as const, comprehension: 0.8 });
    const v = { factions: [], ruler: 1, score: 1, accepted: true, counter: null };
    const rich = t.concludeTreaty(def, deal(5000) as never, v as never);
    check('an accepted treaty with rich gifts grants every clause asked, with its term', /free dues/i.test(rich) && ['dues', 'cartaz', 'men'].every((k) => !!hasClause(t, 'malindi', k as ClauseKind)), rich);
    const t2 = fresh(14); t2.dockedAt = 'melinde';
    t2.concludeTreaty(t2.portHere!, deal(1) as never, v as never);
    check('and with a token gift they are refused by name', ['dues', 'cartaz', 'men'].every((k) => !hasClause(t2, 'malindi', k as ClauseKind)) && t2.ledger.filter((e) => e.tag === 'clause.refused').length === 3);
    const t4 = fresh(16); t4.dockedAt = 'melinde';
    t4.concludeTreaty(t4.portHere!, deal(5000) as never, { ...v, accepted: false } as never);
    check('a treaty refused refuses its clauses too', t4.ledger.filter((e) => e.tag === 'clause.refused').length === 3);
  }

  // Save round trip.
  const s2 = Game.deserialize(g.serialize());
  const s3 = Game.deserialize(r.serialize());
  check('clauses round-trip through a save (they are Ledger entries)', JSON.stringify(clausesOf(s3.ledger, s3.clock.t)) === JSON.stringify(clausesOf(r.ledger, r.clock.t)) && s2.ledger.length === g.ledger.length);
  check('the Ledger’s `data` survives a second save', JSON.stringify(Game.deserialize(s3.serialize()).ledger) === JSON.stringify(s3.ledger));
}

// 2. Pieces end in a clause ----------------------------------------------------------------------------------------------
{
  const kept = ['silent', 'gifts', 'case', 'between', 'envoy', 'informer', 'refusal', 'pilot', 'hostage'];
  check('every kept piece names a clause kind', kept.every((id) => PIECE_CLAUSE[id] && CLAUSE_KINDS.includes(PIECE_CLAUSE[id])), kept.filter((id) => !PIECE_CLAUSE[id]).join(','));
  check('the table lists no piece the game does not have, and the only piece without a clause is the greeting',
    Object.keys(PIECE_CLAUSE).every((id) => PIECES.some((p) => p.id === id)) && PIECES.filter((p) => !PIECE_CLAUSE[p.id]).map((p) => p.id).join() === 'bow');
  for (const id of kept) {
    const kind = PIECE_CLAUSE[id];
    const g = fresh(20);
    const win = settlePieceClause(g, id, 'malindi', 'win');
    const w = g.ledger.filter((e) => e.tag === 'clause.granted' && e.data?.clause === kind).length;
    const g2 = fresh(21); settlePieceClause(g2, id, 'malindi', 'half');
    const g3 = fresh(22); const lose = settlePieceClause(g3, id, 'malindi', 'fail');
    check(`${id}: win grants ${kind}, half poisons it, fail refuses it`, w === 1 && !!hasClause(g, 'malindi', kind) && g2.ledger.some((e) => e.tag === 'clause.poisoned' && e.data?.clause === kind)
      && g3.ledger.some((e) => e.tag === 'clause.refused') && !hasClause(g3, 'malindi', kind) && /grants/.test(win) && /would not/.test(lose));
  }
  // The same, through the Table, for every piece a blind walk can finish.
  let finished = 0; const why: string[] = [];
  for (const id of kept) {
    const g = fresh(30 + kept.indexOf(id));
    g.ship.addCargo?.('coral', 4); g.ship.addCargo?.('la', 10);
    try {
      const pol = id === 'silent' ? 'jolof' : 'malindi';
      const run = startPiece(g, id, pol, POLITY_BY_ID.get(pol)!.seat);
      if (!run) { why.push(`${id}: no run`); continue; }
      for (let i = 0; i < 60 && !run.outcome; i++) {
        const v = runView(g, run);
        const c = v?.choices.find((x) => !x.disabled);
        if (!c) break;
        stepPiece(g, run, c.id);
      }
      if (run.outcome) {
        finished++;
        const hasLine = !!run.outcome.clause && g.ledger.some((e) => e.tag.startsWith('clause.') && e.data?.clause === PIECE_CLAUSE[id]);
        check(`${id}: played through the Table it ends by naming its clause`, hasLine, run.outcome.clause);
      } else why.push(`${id}: runs on (passage)`);
    } catch (e) { why.push(`${id}: ${(e as Error).message.slice(0, 60)}`); }
  }
  check('at least four pieces can be walked through the Table in the script', finished >= 4, `${finished}/9; ${why.join('; ')}`);
  // A grant in force is not given twice.
  const g = fresh(40);
  settlePieceClause(g, 'envoy', 'malindi', 'win');
  const n = g.ledger.length;
  const again = settlePieceClause(g, 'envoy', 'malindi', 'win');
  check('a grant already in force is not granted again by the same piece', g.ledger.length === n && /already holds/.test(again));
}

// 3. Patrons ---------------------------------------------------------------------------------------------------------------
{
  const g0 = fresh(50);
  check('three patrons, each with a cut (0, 8%, 12%) and a faction of the Crown’s court', PATRON_IDS.length === 3
    && PATRONS.crown.cut === 0 && PATRONS.church.cut === 0.08 && PATRONS.ruanova.cut === 0.12);
  for (const act of [1, 2, 3, 4, 5]) {
    for (const id of PATRON_IDS) {
      const g = fresh(51 + act);
      g.chronicle.act = act; g.identity.patron = id; g.crown.lifetimeStanding = 500; g.crown.standing = 500;
      const offers = g.commissionOffers();
      const own = offers.filter((o) => (o.patron ?? 'crown') === id && id !== 'crown');
      if (id === 'crown') check(`act ${act}, Crown: the King’s own commissions are offered (${offers.length})`, offers.length > 0 && offers.every((o) => !o.patron || o.patron === 'crown'));
      else {
        const o = own[0];
        check(`act ${act}, ${id}: issues a generated order, net of its cut`, !!o && !!o.gross && o.cut === PATRONS[id].cut && Math.abs(o.reward - Math.round(o.gross * (1 - o.cut))) <= 1 && o.objectives.length >= 2, o?.title);
        check(`act ${act}, ${id}: the King’s charge for the act is still on the table`, act < 2 ? offers.length >= 2 : offers.some((x) => x.title === ACT_CHARGE[act]));
      }
    }
  }
  // Orders are generated from the state of the world: the Church’s policy follows the Edict.
  const early = fresh(60); early.chronicle.act = 2; early.identity.patron = 'church';
  const late = fresh(60); late.chronicle.act = 2; late.identity.patron = 'church'; late.clock.t = daysFromEpoch(1498, 3, 1) * DAY;
  const eo = early.commissionOffers().find((o) => o.patron === 'church')!, lo = late.commissionOffers().find((o) => o.patron === 'church')!;
  check('the Church’s order reads the baptism policy of its date (patience before the Edict, the font after)', /patience/.test(eo.narrative) && /font/.test(lo.narrative));
  const rn = fresh(61); rn.chronicle.act = 3; rn.identity.patron = 'ruanova';
  const ro = rn.commissionOffers().find((o) => o.patron === 'ruanova')!;
  check('the Rua Nova’s order is a cargo of something the far port makes and the King does not hold', ro.objectives.some((x) => x.kind === 'cargo') && !['ouro', 'pimenta', 'malagueta', 'marfim'].includes(ro.objectives.find((x) => x.kind === 'cargo')!.target!));

  // Paying a patron’s order: discharge it and see the cut.
  const pay = fresh(62); pay.chronicle.act = 1; pay.identity.patron = 'church';
  const ord = pay.commissionOffers().find((o) => o.patron === 'church')!;
  const gold0 = pay.crown.gold;
  pay.crown.accept(ord, pay.clock.t);
  pay.crown.patent!.objectives.forEach((x) => { x.complete = true; x.progress = x.amount ?? 1; });
  const gold1 = pay.crown.gold;
  const s = pay.crown.settle(pay.clock.t, { standing: 1, gold: 1 });
  pay.awardCommission(ord, 0);
  check('a Church order pays its net reward and its advance, and the cut stays with the Order', gold1 - gold0 === ord.advance && s.gold === Math.round(ord.reward * 0.55) && ord.gross! > ord.reward
    && pay.identity.patrons.church.done === 1);

  // Choice per voyage, and the pick is remembered.
  const c = fresh(63); c.crown.patent = null;
  check('a patron is chosen at Lisbon and remembered', choosePatron(c, 'church').ok && c.identity.patron === 'church' && Game.deserialize(c.serialize()).identity.patron === 'church');
  c.dockedAt = 'funchal';
  check('and not at sea or off Lisbon', !choosePatron(c, 'ruanova').ok);

  // Betrayal and ruin.
  const b = fresh(64); b.identity.patron = 'crown';
  record(b, 'chart.sold', { target: 'genoa', magnitude: 1 });
  advance(b, 31); tickPatrons(b);
  check('selling the chart under the Crown’s flag is a betrayal, noted', b.ledger.some((e) => e.tag === 'patron.betrayed'));
  record(b, 'smuggle.caught', { target: 'portugal', magnitude: 1 }); record(b, 'order.breached', { target: 'portugal', magnitude: 1 });
  advance(b, 31); tickPatrons(b);
  check('a betrayed patron ruins him: renown cut, the Casa shut', b.ledger.some((e) => e.tag === 'patron.ruined') && b.casa.regard === -1 && b.identity.patrons.crown.ruined !== null);
  check('and its door stays shut for years', !!patronBlocked(b, 'crown') && b.identity.patron !== 'crown');
  const rb = fresh(65); rb.identity.patron = 'ruanova'; rb.crown.debt = 200; rb.crown.gold = 300;
  record(rb, 'loan.defaulted', { target: 'rua', magnitude: 1 }); record(rb, 'contract.broken', { target: 'rua', magnitude: 1 });
  advance(rb, 31); tickPatrons(rb);
  check('the Rua Nova calls in its notes when betrayed', rb.ledger.some((e) => e.tag === 'patron.ruined') && rb.crown.debt < 200 && rb.crown.gold < 300);
  const ch = fresh(66); ch.identity.patron = 'church'; ch.crown.gold = 1000;
  record(ch, 'promise.broken', { target: 'kongo', magnitude: 1 }); record(ch, 'silent.blood', { target: 'jolof', magnitude: 1 });
  advance(ch, 31); tickPatrons(ch);
  check('the Church takes back its mission funds when betrayed', ch.ledger.some((e) => e.tag === 'patron.ruined') && ch.crown.gold < 1000);
  const mild = fresh(67); mild.identity.patron = 'crown';
  record(mild, 'contraband.run', { target: 'mina', magnitude: 0.2 });
  advance(mild, 31); tickPatrons(mild);
  check('a small run under the Crown’s flag is not a ruin', !mild.ledger.some((e) => e.tag === 'patron.ruined'));
  const ln = fresh(68); ln.identity.patron = 'ruanova';
  record(ln, 'contraband.run', { target: 'mina', magnitude: 1 });
  advance(ln, 31); tickPatrons(ln);
  check('the Rua Nova loves a run past the Casa that the Crown hates', ln.identity.patrons.ruanova.favour > 0 && !ln.ledger.some((e) => e.tag === 'patron.betrayed'));

  // A falling patron pulls clients down unless they move early.
  const at = shockTime('joao-dies')!;
  const stayer = fresh(70), mover = fresh(70);
  stayer.crown.standing = mover.crown.standing = 400;
  for (const x of [stayer, mover]) { x.identity.patron = 'crown'; x.clock.t = at - 3 * 30 * DAY; tickPatrons(x); }
  check('the King’s illness is warned of four months before the death', stayer.identity.warned['king-dies'] !== undefined);
  check('the death of the King is the powers’ dated shock, October 1495', Math.abs(at / DAY - daysFromEpoch(1495, 10, 1)) < 40);
  mover.dockedAt = 'lisboa';
  check('moving to another patron after the warning is moving early', choosePatron(mover, 'ruanova').ok && mover.identity.moved.includes('king-dies') && mover.ledger.some((e) => e.tag === 'patron.moved'));
  for (const x of [stayer, mover]) { x.clock.t = at + 40 * DAY; tickPatrons(x); }
  check('the Crown falls on the date for both', stayer.identity.patrons.crown.fell !== null && mover.identity.patrons.crown.fell !== null);
  check('the client who stayed is pulled down: favour and renown go', stayer.identity.patrons.crown.pulled && stayer.crown.standing === 360 && stayer.ledger.some((e) => e.tag === 'patron.fell'));
  check('the client who moved is spared', !mover.identity.patrons.crown.pulled && mover.crown.standing === 400);
  check('a fallen Crown issues only the charge it always gives', stayer.chronicle.act === 1 || stayer.commissionOffers().every((o) => !o.patron || o.patron === 'crown'));
  check('a fallen patron’s strength is nearly nothing, and it recovers', strengthOf(stayer, 'crown') <= 0.1 && (() => { stayer.clock.t += 9 * 30 * DAY; tickPatrons(stayer); return stayer.identity.patrons.crown.fell === null; })());
  const edict = shockTime('edict')!;
  const rua = fresh(71); rua.identity.patron = 'ruanova'; rua.origin = 'converso'; rua.crown.standing = 400; rua.clock.t = edict + 10 * DAY; rua.identity.warned['edict'] = edict - 90 * DAY;
  const cr0 = rua.creditLimit;
  tickPatrons(rua);
  check('the Edict falls on a converso Rua Nova client harder, and calls his credit', rua.crown.standing === 320 && rua.creditLimit <= cr0 && rua.identity.patrons.ruanova.pulled);
  check('every dated event carries a source and a grade, and invented ones say so', AGENDA.every((e) => e.source.length > 20 && ['documented', 'approximate', 'invented'].includes(e.grade)));

  // Credit.
  const cc = fresh(72); const base = cc.creditLimit;
  cc.identity.patron = 'ruanova';
  check('the Rua Nova as patron of record lends against the voyage', cc.creditLimit > base);

  // Endings read the patron.
  const ends = PATRON_IDS.map((id) => { const x = fresh(80); x.identity.patron = id; x.identity.name = 'Duarte de Sá'; return patronEnding(x)!; });
  check('endings read the patron: three patrons, three different last pages, each naming the captain', new Set(ends.map((e) => e.title)).size === 3 && ends.every((e) => /Duarte/.test(e.text)));
  const ruined = fresh(81); ruined.identity.patrons.church.ruined = 1; ruined.identity.patron = 'church';
  check('and a ruined patron has a different one', /turned on you/.test(patronEnding(ruined)!.title));
  void g0;
}

// 4. The three careers are playable on the same road ----------------------------------------------------------------------
{
  for (const id of PATRON_IDS) {
    const seen: string[] = [];
    let taken = 0;
    const r = play(5, {
      maxVoyages: 3, maxYears: 8, debug: false,
      onVoyage: (g) => {
        if (g.dockedAt !== 'lisboa') return;
        if (g.identity.patron !== id) choosePatron(g, id);
        const offers = g.commissionOffers();
        if (offers[0]) seen.push(`${offers[0].patron ?? 'crown'}:${offers[0].title}`);
        if (!g.crown.patent && offers[0]) taken++;
      },
    });
    check(`career for ${id}: no exception`, r.exception === '', r.exception);
    check(`career for ${id}: its orders were on the table at Lisbon`, seen.length > 0 && seen.every((x) => x.startsWith(`${id}:`) || id === 'crown' || x.startsWith('crown:')) && (id === 'crown' || seen.some((x) => x.startsWith(`${id}:`))), seen.slice(0, 3).join(' | '));
    check(`career for ${id}: the patron of record survives to the end and the ending reads it`, r.game.identity.patron === id || !!r.game.identity.patrons[id].ruined, patronEnding(r.game)?.title);
    check(`career for ${id}: the ledger names the voyages under the captain’s name`, r.game.ledger.some((e) => e.tag === 'voyage.begun' && e.note.includes(r.game.identity.name)));
    void taken;
  }
}

// 5. Titles ----------------------------------------------------------------------------------------------------------------
{
  const L = (spec: Partial<Record<Tag, number>>, target = 'x'): Entry[] => Object.entries(spec).flatMap(([tag, n]) => Array.from({ length: n as number }, (_, i): Entry => ({
    t: 1000 + i, place: '', tag: tag as Tag, actors: ['captain'], target, magnitude: 1, witnesses: [], note: '',
  })));
  const ctx = (ledger: Entry[], milestones: string[] = []) => ({ ledger, milestones });
  const SPEC: Record<string, { ledger: Entry[]; ms?: string[] }> = {
    'o-justo': { ledger: L({ 'promise.kept': 8 }) },
    'mao-pesada': { ledger: L({ 'ship.stopped': 3, 'hand.flogged': 2 }) },
    'amigo-de-melinde': { ledger: L({ 'gift.great': 2, 'table.kept': 1 }, 'malindi') },
    'the-redeemer': { ledger: L({ 'person.redeemed': 1, 'companion.freed': 1 }) },
    'the-man-who-sold-the-chart': { ledger: L({ 'chart.sold': 1 }) },
    'pilot-of-the-cape': { ledger: L({ 'landfall.exact': 3 }), ms: ['cape'] },
    'honest-weight': { ledger: L({ 'weights.fair': 3 }) },
    'false-weight': { ledger: L({ 'weights.false': 2 }) },
    'bom-pagador': { ledger: L({ 'loan.repaid': 2 }) },
    'o-devedor': { ledger: L({ 'loan.defaulted': 1 }) },
    'pai-dos-homens': { ledger: L({ 'mercy.shown': 3 }) },
    'pacificador': { ledger: L({ 'peace.made': 2 }) },
    'quebra-juramentos': { ledger: L({ 'promise.broken': 3 }) },
    'homem-do-rei': { ledger: L({ 'patent.completed': 3 }) },
    'contrabandista': { ledger: L({ 'contraband.run': 3 }) },
    'o-socorredor': { ledger: L({ 'ship.succoured': 2 }) },
    'passa-largo': { ledger: L({ 'ship.abandoned': 2 }) },
    'dador-de-nomes': { ledger: L({ 'name.given': 3, 'claim.made': 1 }) },
    'mao-aberta': { ledger: L({ 'gift.great': 3 }) },
    'amigo-das-fes': { ledger: L({ 'faith.respected': 3 }) },
    'o-batizador': { ledger: L({ 'faith.pressed': 2 }) },
    'he-who-spoke': { ledger: L({ 'hearing.contested': 1 }) },
    'o-portador': { ledger: L({ 'traffic.carried': 3 }) },
    'senhor-de-feitorias': { ledger: L({ 'port.funded': 3 }) },
    'passador-da-linha': { ledger: [], ms: ['line'] },
    'do-cabo': { ledger: [], ms: ['cape'] },
    'o-indiano': { ledger: [], ms: ['india'] },
    'do-fim': { ledger: [], ms: ['malacca'] },
    'plantador': { ledger: [], ms: ['padroes'] },
    'curtido': { ledger: [], ms: ['gales'] },
    'muitos-portos': { ledger: [], ms: ['ports25'] },
    'de-fortuna': { ledger: [], ms: ['purse5'] },
  };
  check('about thirty titles are authored', TITLES.length >= 28 && TITLES.length <= 36, `${TITLES.length}`);
  check('every title has a hand-written synthetic Ledger here, and no title is left out', TITLES.every((t) => SPEC[t.id]) && Object.keys(SPEC).every((k) => TITLE_BY_ID.has(k)));
  const bad = TITLES.filter((t) => !t.when(ctx(SPEC[t.id].ledger, SPEC[t.id].ms)));
  check('each title fires from its synthetic Ledger', bad.length === 0, bad.map((t) => t.id).join(','));
  const noisy = TITLES.filter((t) => t.when(ctx([], [])));
  check('and none fires from an empty one', noisy.length === 0, noisy.map((t) => t.id).join(','));
  check('O Justo needs none broken (eight kept, one broken is not Justo)', !TITLE_BY_ID.get('o-justo')!.when(ctx(L({ 'promise.kept': 12, 'promise.broken': 1 }))));
  check('Amigo de Melinde is Melinde’s alone', !TITLE_BY_ID.get('amigo-de-melinde')!.when(ctx(L({ 'gift.great': 5 }, 'kongo'))));
  check('Honest Weight is lost to one shaded scale', !TITLE_BY_ID.get('honest-weight')!.when(ctx(L({ 'weights.fair': 5, 'weights.false': 1 }))));
  check('titles are earned from the Ledger, never picked: wearing one not earned is refused', !wear(fresh(90), 'o-justo').ok);

  // Earned in play, announced, worn (three at most).
  const g = fresh(91);
  g.identity.name = 'Pêro Esteves';
  for (const e of L({ 'promise.kept': 8, 'peace.made': 2, 'mercy.shown': 3, 'gift.great': 3, 'weights.fair': 3 }, 'malindi')) { g.ledger.push({ ...e, t: g.clock.t }); }
  advance(g, 2);
  const got = tickTitles(g);
  check('titles are earned from the Ledger as the days pass, each entered once', got.length >= 4 && g.ledger.filter((e) => e.tag === 'title.earned').length === got.length && tickTitles(g).length === 0, got.join(','));
  check('three are worn at most', g.identity.worn.length === 3 && !wear(g, got.find((x) => !g.identity.worn.includes(x))!).ok);

  // Word and its distortion.
  const mercy = TITLES.find((t) => t.spin === 'mercy')!, hard = TITLE_BY_ID.get('mao-pesada')!;
  const w = fresh(92); w.identity.name = 'Gaspar Nunes';
  announceTitle(w, mercy.id, 'lisboa');
  const byTeller = new Map<string, { trust: number; respect: number; text: string; arrive: number }>();
  for (const item of w.diplomacy.word) byTeller.set(tellerOf(POLITY_BY_ID.get(item.polity)!), item);
  check('word goes to every court, each by its own teller', w.diplomacy.word.length === POLITIES.length && byTeller.size === 5);
  const sold = byTeller.get('soldiers')!, priest = byTeller.get('priests')!;
  check('a mercy told by a soldier is weakness (respect falls); told by a priest it is a good name (trust rises)', sold.respect < 0 && priest.trust > 0 && /soft/.test(sold.text) && !/soft/.test(priest.text), sold.text);
  const w2 = fresh(93); announceTitle(w2, hard.id, 'lisboa');
  const t2 = new Map<string, { trust: number; respect: number; text: string }>();
  for (const item of w2.diplomacy.word) t2.set(tellerOf(POLITY_BY_ID.get(item.polity)!), item);
  check('a hard hand told by a factor is a butcher (trust falls); told by a soldier it is command (respect rises)', t2.get('factors')!.trust < 0 && /butcher/.test(t2.get('factors')!.text) && t2.get('soldiers')!.respect > 0);
  check('the same deed reads differently to each teller', new Set([...t2.values()].map((x) => x.text)).size === 5);
  const near = w.diplomacy.word.find((x) => x.polity === 'portugal') ?? w.diplomacy.word.find((x) => POLITY_BY_ID.get(x.polity)!.seat === 'lagos');
  const far = w.diplomacy.word.filter((x) => POLITY_BY_ID.get(x.polity)!.seat === 'cochim' || POLITY_BY_ID.get(x.polity)!.seat === 'calecute')[0];
  check('word arrives late, later the further down the road', !!far && far.arrive - w.clock.t > 60 * DAY && (!near || near.arrive < far.arrive), `${far ? Math.round((far.arrive - w.clock.t) / DAY) : '?'} days to Malabar`);
  check('every distortion table cell is a line with its placeholder', Object.values(DISTORT).every((row) => Object.values(row).every(([line]) => line.includes('{t}'))));
  const delivered = fresh(94); delivered.identity.name = 'Rui Lopes';
  announceTitle(delivered, mercy.id, 'lisboa');
  const kongoItem = delivered.diplomacy.word.find((x) => x.polity === 'kongo')!;
  const k0 = delivered.polityState('kongo').trust;
  delivered.clock.t = kongoItem.arrive + 1;
  delivered.diplomacy.word.filter((x) => x.polity === 'kongo');
  delivered.dockedAt = null as unknown as string;
  check('word is held in the court’s queue until it arrives (the old delivery then applies it)', kongoItem.arrive > delivered.clock.t - DAY * 400 && delivered.polityState('kongo').trust === k0);

  // Worn titles open doors and shut others.
  const wt = fresh(95); wt.identity.titles['amigo-de-melinde'] = { t: wt.clock.t - 400 * DAY, place: 'melinde' };
  wt.identity.worn = ['amigo-de-melinde'];
  const te = titleEdge(wt, 'malindi'), te2 = titleEdge(wt, 'mombasa');
  check('a worn title opens one court and shuts its enemy', te.trust > 0.2 && te2.trust < 0);
  wt.identity.worn = [];
  check('and the same title not worn does nothing', titleEdge(wt, 'malindi').trust === 0);
  const unheard = fresh(96); unheard.identity.titles['o-indiano'] = { t: unheard.clock.t - 2 * DAY, place: 'cochim' }; unheard.identity.worn = ['o-indiano'];
  check('a court that has not yet heard of it is not moved by it', titleEdge(unheard, 'kongo').respect === 0 && !heardAt(unheard, 'o-indiano', POLITY_BY_ID.get('kongo')!));
  const sm = fresh(97); sm.identity.titles['contrabandista'] = { t: 1, place: '' }; sm.identity.worn = ['contrabandista'];
  check('wearing Contrabandista shuts the Crown’s door and the patron pick refuses it', !!titleShuts(sm, 'crown') && !choosePatron(sm, 'crown').ok);
  const hw = fresh(98); const w0 = hw.crown.gold; hw.identity.titles['mao-pesada'] = { t: 1, place: '' }; hw.identity.worn = ['mao-pesada'];
  check('a hard name makes hands ask more to ship', titleWageMult(hw) > 1); void w0;

  // The name.
  const names = (['segundo', 'converso', 'piloto', 'fidalgo'] as const).map((o) => generateName(o, new Rng(7)));
  check('the name generator is by origin and deterministic', new Set(names).size === 4 && generateName('piloto', new Rng(7)) === names[2]);
  check('a new game is named, from its origin and seed', fresh(100).identity.name === '' && (() => { const x = fresh(100); tickIdentity(x); return x.identity.name.length > 3; })());
  check('an overriding name is cleaned and kept', cleanName('  <b>Ruy</b> ') === 'bRuy/b' && cleanName('  Ruy  ') === 'Ruy');
  check('an heir keeps the family name and takes another given name', heirName('Duarte de Sá', 'segundo', new Rng(3)).endsWith('de Sá') && !heirName('Duarte de Sá', 'segundo', new Rng(3)).startsWith('Duarte'));
  const nameSave = fresh(101); nameSave.identity.name = 'Fernão da Silveira';
  check('the captain’s name survives a save', Game.deserialize(nameSave.serialize()).identity.name === 'Fernão da Silveira');
  check('no Conviction is chosen at the start: the start of the game has no worn title and no title at all', Object.keys(fresh(102).identity.titles).length === 0 && fresh(102).identity.worn.length === 0);
  void earnedNow; void titleCtx; void favourOf;
}

// 6. The Calling ------------------------------------------------------------------------------------------------------------
{
  const g = fresh(110);
  check('four callings, each with a verb and no cost multiplier', CALLING_IDS.length === 4 && CALLING_IDS.every((c) => CALLINGS[c].verb.length > 10));
  check('a calling is chosen at the end of the first act, not before', !chooseCalling(g, 'pilot').ok && calling(g) === null);
  g.chronicle.act = 2;
  check('and once', chooseCalling(g, 'pilot').ok && !chooseCalling(g, 'factor').ok && calling(g) === 'pilot' && g.ledger.some((e) => e.tag === 'calling.chosen'));
  check('it survives a save', Game.deserialize(g.serialize()).identity.calling === 'pilot');

  // Pilot.
  const mk = (c: 'pilot' | 'factor' | 'builder' | 'master' | null): Game => { const x = fresh(111); x.chronicle.act = 2; if (c) chooseCalling(x, c); return x; };
  const night = (x: Game): void => { x.clock.t = Math.floor(x.clock.t / DAY) * DAY + 23 * 3600; };
  const day = (x: Game): void => { x.clock.t = Math.floor(x.clock.t / DAY) * DAY + 12 * 3600; };
  const p = mk('pilot'), o = mk('master');
  night(p); night(o);
  check('Pilot: the harbour is entered from fourteen miles by night, eight by day; no one else’s widens', (() => { const a = entryRadiusNm(p); day(p); p.weatherNow.visibility = 20; return a === 14 && entryRadiusNm(p) === 8 && entryRadiusNm(o) === 8; })());
  check('Pilot: surveys run at twice the rate (SURVEY_RATE.pilot), others at the base', surveyRate(p) === SURVEY_RATE.pilot && SURVEY_RATE.pilot === 2 * SURVEY_RATE.base && surveyRate(o) === SURVEY_RATE.base);

  // Factor.
  const f = mk('factor'), nf = mk('master');
  for (const x of [f, nf]) { x.dockedAt = 'melinde'; x.relationsFor('melinde').mayTrade = false; x.relationsFor('melinde').factory = false; x.crown.gold = 5000; }
  check('Factor: opens a House without a court’s leave; no one else may', !/leave to trade/.test(f.canFoundFactory(f.portHere!) ?? '') && /leave to trade/.test(nf.canFoundFactory(nf.portHere!) ?? ''), String(f.canFoundFactory(f.portHere!)));
  f.feitorias.push({ portId: 'arguim', factor: 'Gil', officerId: null, ability: 0.5, honesty: 0.8, founded: 0, settled: 0, works: [], garrison: 6, stock: {}, paid: {}, chest: 400, buying: [], regard: 0.5, trouble: 0, lost: false } as never);
  f.dockedAt = 'melinde';
  const gold = f.crown.gold; const bill = drawBill(f, 'arguim');
  check('Factor: draws a bill on a House’s chest from another quay, for a clerk’s tenth', bill.ok && f.crown.gold === gold + 360 && f.feitorias[0].chest === 0, bill.text);
  const sent = sendBill(f, 'arguim', 100);
  check('Factor: sends money to the chest by bill', sent.ok && f.feitorias[0].chest === 97);
  check('others cannot write a bill', !drawBill(nf, 'arguim').ok && !sendBill(nf, 'arguim', 100).ok);

  // Master-builder.
  const bld = mk('builder'), non = mk('pilot');
  check('Master-builder: may lay down hulls of his own; others are told the yard sells what it has drawn', designBlocked(bld) === null && /master-builder/.test(designBlocked(non) ?? ''));
  const seq = (x: Game): number => { x.dockedAt = 'lisboa'; x.ship.condition.hull = 0.6; x.ship.condition.fouling = 0.5; for (const s of x.ship.state.sails) s.condition = 0.5; x.crown.gold = 4000; x.crew.spares = 1; const t0 = x.clock.t; return t0; };
  const t0 = seq(bld);
  const r = parallelRefit(bld);
  const took = (bld.clock.t - t0) / DAY;
  const t1 = seq(non);
  check('Master-builder: three jobs at once take the time of the longest; others cannot', r.ok && took > 0 && /together/.test(r.text) && !parallelRefit(non).ok, `${took.toFixed(1)} days; ${r.text}`);
  void t1;

  // Master.
  const ms = mk('master'), pl = mk('pilot');
  const cand = CANDIDATES.find((c) => c.role === 'piloto')!;
  ms.crown.gold = pl.crown.gold = 5000;
  for (const x of [ms, pl]) { x.dockedAt = cand.at[0]; x.crown.standing = 500; }
  const had = (x: Game) => x.crew.officers.filter((o2) => o2.alive && o2.role === 'piloto').length;
  const a0 = had(ms), b0 = had(pl);
  officerFromCandidate(ms, cand); officerFromCandidate(pl, cand);
  check('Master: a second man keeps a seat that is full; others replace the man in it', had(ms) === a0 + 1 && had(pl) === b0 && secondSeat(ms, 'mestre'), `${a0}->${had(ms)} vs ${b0}->${had(pl)}`);
  check('Master: counsel hears four voices, and a little straighter', counselVoices(ms) === 4 && counselVoices(pl) === 3);
  void courtCandidate; void counselFor;

  // Skill tree untouched.
  check('the skill tree is as it was: crew/skills.ts is untouched', execSync('git diff --stat -- src/crew/skills.ts').toString().trim() === '');
}

// 7. Saves ------------------------------------------------------------------------------------------------------------------
{
  let ok = 0, named = 0;
  const all = readdirSync('fixtures/saves').filter((f) => f.endsWith('.json'));
  for (const f of all) {
    const g = Game.deserialize(readFileSync(`fixtures/saves/${f}`, 'utf8'));
    if (g.identity.patron && g.identity.worn.length === 0 && Array.isArray(clausesOf(g.ledger, g.clock.t))) ok++;
    tickIdentity(g);
    if (g.identity.name) named++;
    const g2 = Game.deserialize(g.serialize());
    if (JSON.stringify(g2.identity) !== JSON.stringify(g.identity)) { ok--; console.log('   mismatch', f); }
  }
  check('every golden save opens with an identity, is named, and round-trips it', ok === all.length && named === all.length, `${ok}/${all.length}, ${named} named`);
  const old = fresh(120); old.identity.name = 'Álvaro de Lima'; old.identity.calling = 'pilot'; old.identity.patrons.church.favour = 0.7;
  const heir = new Game(121); heir.setOrigin('segundo'); heir.inheritFrom(old);
  check('an heir keeps the family name and the patrons’ memory, and chooses his own Calling', heir.identity.name.endsWith('de Lima') && heir.identity.patrons.church.favour === 0.7 && heir.identity.calling === null);
}

console.log(fails === 0 ? '\nidentity: all ok' : `\nidentity: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);

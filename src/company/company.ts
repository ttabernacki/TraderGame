import { clamp, smoothstep } from '../core/math';
import { makeOfficer, type Officer } from '../crew/crew';
import { aboardHands, shiftAll, type Hand, type Temper } from '../crew/hands';
import type { Game } from '../game/state';
import { secondSeat } from '../identity/calling';
import { monsoonGrip } from '../navigation/monsoon';
import { ARC_BY_ID, BONDS, dueBeat, type BondId } from '../progression/arcs';
import { PORT_BY_ID } from '../world/ports';
import { BOND_AT, DISSENT_AT, EXIT_AT, approvalFor, companionOf } from './approval';
import { CANDIDATE_BY_ID, type Candidate } from './candidates';
import { hisPeople, type ConsequenceKind } from './companions';

/**
 * The company, in play (C5): approval kept up to date, the thresholds that
 * follow from it, the way men leave, the men who can be courted, and the hands
 * who are raised.
 *
 * Nothing here is rolled. A man leaves because the Ledger, read through his own
 * table, says he has had enough; he is warm because it says he has not; and the
 * one word and the one cause the crew screen shows are the same numbers.
 */

export interface CompanyState {
  /** Conflicts already played (once each in a career). */
  seen: string[];
  /** Named candidates already taken aboard, so nobody is offered twice. */
  hired: string[];
  /** When approval was last reckoned. */
  lastT: number;
  /** Threshold last announced per man: 1 warm, 0 neither, -1 cold, -2 leaving. */
  band: Record<string, number>;
  /** An interpreter has been given the arc. */
  linguaArc: boolean;
  /** A Swahili pilot is aboard (a quick test for the pilotage hook). */
  muallim: boolean;
  /** When a factor was last allowed to skim, per port. */
  skim: Record<string, number>;
  /** Ports where a thin set of books has been remarked. */
  skimmed: string[];
}

export function newCompany(): CompanyState {
  return { seen: [], hired: [], lastT: 0, band: {}, linguaArc: false, muallim: false, skim: {}, skimmed: [] };
}

/** Saves from before C5 have none: every field defaults, nothing else is read. */
export function migrateCompany(raw: unknown): CompanyState {
  const d = newCompany();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<CompanyState>;
  return {
    seen: Array.isArray(r.seen) ? r.seen.filter((x) => typeof x === 'string') : d.seen,
    hired: Array.isArray(r.hired) ? r.hired.filter((x) => typeof x === 'string') : d.hired,
    lastT: typeof r.lastT === 'number' ? r.lastT : 0,
    band: r.band && typeof r.band === 'object' ? { ...r.band } : {},
    linguaArc: !!r.linguaArc,
    muallim: !!r.muallim,
    skim: r.skim && typeof r.skim === 'object' ? { ...r.skim } : {},
    skimmed: Array.isArray(r.skimmed) ? r.skimmed.filter((x) => typeof x === 'string') : d.skimmed,
  };
}

const portName = (id: string): string => PORT_BY_ID.get(id)?.name ?? id;
const aboard = (g: Game): Officer[] => g.crew.officers.filter((o) => o.alive && !o.ashoreAt);

// -- Approval, kept ----------------------------------------------------------

/** Live approval for one man (what the crew screen shows). */
export function approvalOf(g: Game, o: Officer): ReturnType<typeof approvalFor> {
  return approvalFor(o, g.ledger, g.clock.t);
}

/**
 * Once a day of ship-time: reckon every man's approval, announce a threshold
 * crossed, and let the ones who have had enough say so.
 */
export function tickCompany(g: Game): void {
  if (g.campaign === 'xiyang') return;
  const c = g.company;
  if (g.clock.t - c.lastT < 86400) return;
  c.lastT = g.clock.t;
  layArcs(g);
  c.muallim = g.crew.officers.some((o) => o.arc === 'hamisi' && o.alive && !o.ashoreAt);

  for (const o of g.crew.officers) {
    if (!o.alive) continue;
    const a = approvalFor(o, g.ledger, g.clock.t);
    o.approval = a.score;
    o.approvalWhy = a.why;
    if (o.ashoreAt || o.left) continue;

    const band = a.score >= BOND_AT ? 1 : a.score <= EXIT_AT ? -2 : a.score <= DISSENT_AT ? -1 : 0;
    const prev = c.band[o.id] ?? 0;
    if (band !== prev) {
      c.band[o.id] = band;
      if (band === 1) {
        const bond = o.arc ? ARC_BY_ID.get(o.arc)?.bond : undefined;
        g.pushAlert(`${o.name} has come round to you.`, 'note');
        if (bond && !o.bonded) g.logEvent('crew', `${o.name} has come round to you: ${BONDS[bond].name} is yours while he is aboard and thinks as he does. ${BONDS[bond].effect}`, true);
      } else if (band === -1 && prev > -1) {
        g.pushAlert(`${o.name} has stopped keeping his opinions to himself.`, 'note');
        g.logEvent('crew', `${o.name} has stopped keeping his opinions to himself. ${a.why}`, true);
      }
    }

    if (a.score <= EXIT_AT && !o.bonded && !o.leaving) {
      o.leaving = true;
      c.band[o.id] = -2;
      g.pushAlert(`${o.name} has said he will leave at the next port.`, 'warning');
      g.logEvent('crew', `${o.name} has said he will leave at the next port. ${a.why}`, true);
      if (g.dockedAt) performExit(g, o, g.dockedAt);
    } else if (o.leaving && o.arcEnd !== 'ashore' && a.score > EXIT_AT + 15) {
      o.leaving = false;
      g.logEvent('crew', `${o.name} has thought again, and will stay.`, true);
    }
  }

  checkOath(g);
  skimming(g);
}

/** The Swahili pilot's one promise, and what it is worth. */
function checkOath(g: Game): void {
  const h = g.crew.officers.find((o) => o.arc === 'hamisi' && o.alive);
  if (!h || !(h.arcFlags ?? []).includes('sworn') || (h.arcFlags ?? []).includes('oathbroken')) return;
  const since = h.joined ?? 0;
  const broke = g.ledger.some((e) => e.tag === 'ship.stopped' && e.t >= since && e.target !== 'portugal' && e.target !== 'castile' && e.target !== 'nation:genoese');
  if (!broke) return;
  h.arcFlags = [...(h.arcFlags ?? []), 'oathbroken'];
  g.noteDeed('promise.broken', { target: 'malindi', magnitude: 0.8, note: `Promised ${h.name} this ship would not stop a ship of his coast, and stopped one.` });
}

/** A factor you have not seen in a year, who has no reason to love you, takes a little. */
function skimming(g: Game): void {
  const c = g.company;
  for (const f of g.feitorias) {
    if (f.lost || !f.officerId) continue;
    const o = g.crew.officers.find((x) => x.id === f.officerId);
    if (!o || !o.alive) continue;
    const last = Math.max(f.settled, f.seen ?? 0);
    const neglected = g.clock.t - last > 365 * 86400;
    const a = o.approval ?? 0;
    if (!((neglected && a < BOND_AT - 10) || a <= DISSENT_AT)) continue;
    if (g.clock.t - (c.skim[f.portId] ?? 0) < 30 * 86400) continue;
    c.skim[f.portId] = g.clock.t;
    f.chest = Math.max(0, f.chest - Math.min(f.chest * 0.06, 40));
    f.honesty = clamp(f.honesty - 0.02, 0, 1);
    if (!c.skimmed.includes(f.portId) && (g.visitedPorts.has(f.portId))) {
      c.skimmed.push(f.portId);
      g.logEvent('crown', `The books at ${portName(f.portId)} are thinner than the trade there should have made them. ${f.factor} has had a long time without a ship, and ${neglected ? 'nobody has been to read his accounts' : 'no great opinion of you'}.`, true);
    }
  }
}

/** The weigh-house, and the Casa's auditors: a witness or a trusted factor makes a search turn up less. */
export function auditCover(g: Game): number {
  let m = g.has('theWitness') ? 0.5 : 1;
  for (const f of g.feitorias) {
    if (f.lost || !f.officerId) continue;
    const o = g.crew.officers.find((x) => x.id === f.officerId);
    if (o && o.alive && (o.approval ?? 0) >= BOND_AT) m *= 0.85;
  }
  return Math.max(0.35, m);
}

/** The bond a man gives while he is aboard and warm (approval of +40), struck or not. */
export function bondByApproval(g: Game, id: BondId): boolean {
  for (const o of g.crew.officers) {
    if (!o.alive || o.ashoreAt || !o.arc) continue;
    if ((o.approval ?? 0) < BOND_AT) continue;
    if (ARC_BY_ID.get(o.arc)?.bond === id) return true;
  }
  return false;
}

/**
 * The Swahili pilot's reckoning, as a fraction added to the captain's own navigation
 * (the same unit `officerBonus` returns). Where the monsoon owns the water, and along
 * the coast of east Africa, he knows what the Casa's pilots have only been told; a cold
 * man gives less, a bonded one more.
 */
export function coastPilotBonus(g: Game): number {
  if (!g.company.muallim) return 0;
  const o = g.crew.officers.find((x) => x.arc === 'hamisi' && x.alive && !x.ashoreAt);
  if (!o) return 0;
  const p = g.ship.state.pos;
  const coast = smoothstep(28, 36, p.lon) * (1 - smoothstep(44, 56, p.lon)) * smoothstep(-28, -20, p.lat) * (1 - smoothstep(10, 16, p.lat));
  const grip = Math.max(monsoonGrip(p), coast);
  if (grip <= 0) return 0;
  const mood = (o.approval ?? 0) >= 0 ? 1 : 0.6;
  return 0.2 * grip * mood * (o.bonded ? 1.3 : 1) * (0.6 + o.ability * 0.6);
}

// -- Arcs laid on the men the game already had --------------------------------

/** The Crown's clerk and a first interpreter get their stories, in new games and old. */
function layArcs(g: Game): void {
  const c = g.company;
  const clerk = g.crew.officers.find((o) => o.role === 'escrivao' && o.alive && o.name === 'Diogo Pais');
  if (clerk && !clerk.arc) {
    clerk.arc = 'pais';
    clerk.arcStage = 0;
    clerk.arcFlags = [];
    clerk.trait ??= 'exact';
    clerk.joined ??= g.startT;
  }
  if (!c.linguaArc) {
    const l = g.crew.officers.find((o) => o.role === 'lingua' && o.alive && !o.ashoreAt && !o.arc);
    if (l) giveLinguaArc(g, l);
  }
}

function giveLinguaArc(g: Game, o: Officer): void {
  o.arc = 'lingua';
  o.arcStage = 0;
  o.arcFlags = [];
  o.joined ??= g.clock.t;
  g.company.linguaArc = true;
}

// -- Leaving ------------------------------------------------------------------

/** Called from `enterPort`: the men who are going, go; the stories that need a quay are told. */
export function companyOnArrival(g: Game, portId: string): void {
  if (g.campaign === 'xiyang') return;
  for (const o of g.crew.officers) {
    if (o.alive && !o.ashoreAt && o.leaving) performExit(g, o, portId);
  }
  // Codas that need a quay to end in.
  for (const o of g.crew.officers) {
    if (!o.alive || o.ashoreAt || !o.arc) continue;
    const served = (g.clock.t - (o.joined ?? g.startT)) / 86400;
    const due = dueBeat({ g, o, served }, 'port');
    if (!due) continue;
    o.arcStage = due.index + 1;
    g.queueScene(due.beat.build({ g, o, served }));
    break;
  }
  if (portId === 'melinde' && !g.company.seen.includes('hamisi:seen') && !g.company.hired.includes('hamisi')) {
    g.company.seen.push('hamisi:seen');
    g.logEvent('note', 'A mu’allim of the quay, a man called Hamisi bin Nasir, has been seen at the water-stairs asking which ship this is, and what she carries, and who has her. He has not asked to be hired. He has asked a number of other things.', true);
  }
}

/** Put him on the quay. A friendly parting costs nothing; the other kind takes something with it. */
export function performExit(g: Game, o: Officer, portId: string): void {
  const friendly = o.arcEnd === 'ashore';
  const comp = companionOf(o);
  o.leaving = false;
  o.left = true;
  o.ashoreAt = portId;
  o.ashoreSince = undefined;
  g.company.band[o.id] = 0;
  if (friendly) {
    g.noteDeed('companion.left', { target: o.name, place: portId, magnitude: 0.4, note: `${o.name} went ashore at ${portName(portId)}, with your leave.` });
    g.logEvent('crew', `${o.name} went ashore at ${portName(portId)}, with your leave. The berth is empty.`, true);
    return;
  }
  const end = comp.exit.end;
  o.arcEnd = end;
  if (o.arc) o.arcStage = 99;
  const cost = consequence(g, portId, comp.exit.consequence);
  g.noteDeed(end === 'betrayed' ? 'companion.betrayed' : 'companion.left', {
    target: o.name, place: portId, magnitude: end === 'betrayed' ? 0.8 : 0.6,
    note: `${o.name} left the ship at ${portName(portId)}. ${o.approvalWhy ?? ''}`.trim(),
  });
  g.logEvent('crew', `${comp.exit.leaves} ${cost}`, true);
  g.pushAlert(`${o.name} has left the ship at ${portName(portId)}.`, 'warning');
}

function consequence(g: Game, portId: string, kind: ConsequenceKind): string {
  switch (kind) {
    case 'chart':
      g.casa.regard = clamp(g.casa.regard - 0.15, -1, 1);
      g.crown.standing = Math.max(0, g.crown.standing - 5);
      g.rival.standing += 4;
      g.rival.frontierLat -= 0.3;
      return `He has sold his copy of your sheets: the Casa will hear it, and the rival has a coast he had not had.`;
    case 'rival':
      g.casa.regard = clamp(g.casa.regard - 0.08, -1, 1);
      g.crown.standing = Math.max(0, g.crown.standing - 4);
      g.rival.standing += 8;
      g.rival.frontierLat -= 0.4;
      return 'He has gone over to the rival with what he knew, and will be a pilot in a ship that sails your courses.';
    case 'report':
      g.casa.regard = clamp(g.casa.regard - 0.15, -1, 1);
      g.crown.standing = Math.max(0, g.crown.standing - 5);
      return 'What he has to say will reach the Casa by the next ship, in his own hand.';
    case 'gossip':
    default: {
      const rel = g.relationsFor(portId);
      rel.regard = clamp(rel.regard - 0.06, -1, 1);
      g.crown.standing = Math.max(0, g.crown.standing - 3);
      return `He will not need to say anything. What a man leaves a ship over is told on the quay at ${portName(portId)} before the tide turns.`;
    }
  }
}

// -- Counsel ---------------------------------------------------------------

/** Men who have stopped holding their tongues: approval of -40 or less, not bonded, aboard. */
export function dissenters(g: Game): Officer[] {
  return aboard(g).filter((o) => (o.approval ?? 0) <= DISSENT_AT && !o.bonded);
}

/** His line, in his voice; the same man says the same thing about the same question. */
export function dissentLine(o: Officer, salt: number): string {
  const lines = companionOf(o).dissent;
  return lines[Math.floor(salt * lines.length) % lines.length];
}

// -- Courting ----------------------------------------------------------------

/** What the roll said: a candidate's own terms, no dice. */
export function officerFromCandidate(g: Game, c: Candidate): Officer {
  const o = makeOfficer(c.role, g.rng, c.ability, c.languages);
  o.name = c.name;
  o.trait = c.trait;
  o.wage = c.wage;
  o.loyalty = 0.55;
  o.cand = c.id;
  o.joined = g.clock.t;
  o.memory = [];
  if (c.arc) {
    o.arc = c.arc;
    o.arcStage = 0;
    o.arcFlags = [];
  } else if (c.role === 'lingua' && !g.company.linguaArc) {
    giveLinguaArc(g, o);
  }
  g.company.hired.push(c.id);
  // A Master keeps a second man in the seat (identity/calling).
  const second = c.second || secondSeat(g, c.role);
  if (second && !c.second) g.identity.seats += 1;
  g.crew.officers = g.crew.officers.filter((x) => x.role !== c.role || !x.alive || c.id === 'hamisi' || second || x.arc === 'hamisi');
  g.crew.officers.push(o);
  return o;
}

/** Court a named man at the quay you are on. */
export function courtCandidate(g: Game, id: string): string {
  const c = CANDIDATE_BY_ID.get(id);
  const port = g.dockedAt;
  if (!c || !port || !c.at.includes(port)) return 'He is not on this quay.';
  if (g.company.hired.includes(c.id)) return 'He has already taken service.';
  const why = c.gate?.(g);
  if (why) return why;
  if (g.crown.standing < c.standing) return `${c.name} will not talk to a captain the Crown does not yet know.`;
  if (g.crown.gold + g.creditFree < c.cost) return `${c.name} wants ${c.cost} cruzados down and you have not got it.`;
  if (g.crown.gold < c.cost) g.drawCredit(c.cost);
  g.crown.gold -= c.cost;
  const o = officerFromCandidate(g, c);
  g.logEvent('crew', `${c.name} took service as ${c.role === 'piloto' ? 'pilot' : c.role}, for ${c.cost} cruzados down and ${c.wage} the month. ${c.backstory}`, true);
  if (c.id === 'hamisi') return courtHamisi(g, o);
  return `${c.name} is aboard.`;
}

/** He asks three questions, and the Ledger decides how he takes the answers. */
function courtHamisi(g: Game, o: Officer): string {
  const spared = g.ledger.some((e) => e.tag === 'ship.spared' && e.target !== 'portugal' && e.target !== 'castile');
  const parcel = g.ledger.some((e) => e.tag === 'parcel.carried');
  const succoured = g.ledger.some((e) => e.tag === 'ship.succoured');
  const eastGood = g.ledger.some((e) => (e.tag === 'gift.great' || e.tag === 'table.kept' || e.tag === 'promise.kept') && hisPeople(e));
  let text = 'He asks where the ship goes, what she carries, and what she does when she meets a dhow. ';
  if (spared || succoured || eastGood) {
    text += 'You have answers that have the advantage of being in the Ledger, and he has already asked about them on the quay.';
    o.loyalty = clamp(o.loyalty + 0.1, 0, 1);
  } else {
    text += 'You have not been asked it before by anybody, and you answer as honestly as you can. He listens as a man listens to the wind before he reefs.';
  }
  if (parcel) {
    text += ' He asks about the parcel you carried at the weigh-house, and you tell him; he does not say what he thinks of it.';
    o.loyalty = clamp(o.loyalty - 0.1, 0, 1);
  }
  text += ' He signs on as pilot beside Correia, and not under him.';
  return text;
}

// -- Hands raised ----------------------------------------------------------

const TEMPER_TRAIT: Record<Temper, string> = {
  steady: 'steady', bold: 'hardhorse', devout: 'pious', young: 'curious', sullen: 'sullen', sly: 'ambitious',
};

/** A man forward who has earned a mate's place: well regarded, a rating that counts, not a sullen or a sly one. */
export function eligibleHands(g: Game): Hand[] {
  if ((g.clock.t - g.startT) / 86400 < 120) return [];
  return aboardHands(g.hands).filter((h) => h.regard >= 0.7
    && (h.rating === 'marinheiro' || h.rating === 'carpinteiro' || h.rating === 'bombardeiro' || h.rating === 'calafate')
    && h.temper !== 'sullen' && h.temper !== 'sly' && h.temper !== 'young');
}

/** Raise him out of the fo'c'sle. He is an officer aboard, and, later, a man you can post to a House. */
export function promoteHand(g: Game, handId: string): string {
  const h = eligibleHands(g).find((x) => x.id === handId);
  if (!h) return 'He is not the man for it yet.';
  h.aboard = false;
  h.fate = 'Raised to mate.';
  h.fateT = g.clock.t;
  const o: Officer = {
    id: `m-${h.id}`, name: h.name, role: 'contramestre',
    ability: clamp(0.34 + h.regard * 0.3 + (h.rating === 'carpinteiro' ? 0.04 : 0), 0.3, 0.66),
    languages: [], loyalty: clamp(h.regard, 0, 1), alive: true, wage: 16,
    trait: TEMPER_TRAIT[h.temper], memory: (h.memory ?? []).slice(0, 3),
    joined: g.clock.t, handId: h.id, mate: true,
  };
  g.crew.officers.push(o);
  shiftAll(g.hands, 0.03, `${h.name} was raised to mate.`);
  g.noteDeed('companion.promoted', { target: h.name, magnitude: 0.5, note: `Raised ${h.name} of ${h.from} out of the fo'c'sle to mate.` });
  g.logEvent('crew', `${h.name} of ${h.from} is raised to mate. The fo'c'sle has noticed, and so has he. If he does well he can be left in a House.`, true);
  return `${h.name} is mate.`;
}

// -- Ends ------------------------------------------------------------------

export type EndState = NonNullable<Officer['arcEnd']>;

/** Where his story ended up, if it has: stored on him, or read from what is plainly so. */
export function endStateOf(o: Officer): EndState | null {
  if (!o.alive) return 'dead';
  if (o.arcEnd) return o.arcEnd;
  if (o.bonded) return 'bonded';
  if ((o.arcStage ?? 0) >= 99) return 'estranged';
  return null;
}

/** A line for each written man whose story ended, for the last page. */
export function companyEndLines(g: Game): string[] {
  const out: string[] = [];
  for (const o of g.crew.officers) {
    if (!o.arc && !o.cand && !o.mate) continue;
    const s = endStateOf(o);
    const why = o.memory?.[0];
    if (s === 'bonded' && o.alive) out.push(`${o.name} stayed to the end of his story and is yours: ${o.arc ? BONDS[ARC_BY_ID.get(o.arc)!.bond].name.toLowerCase() : 'a true man'}.`);
    else if (s === 'ashore') out.push(`${o.name} went ashore with your leave${why ? ` (he ${why.replace(/^was /, 'was ')})` : ''}.`);
    else if (s === 'estranged') out.push(`${o.name} did his work to the end, and no more. ${o.approvalWhy ?? ''}`.trim());
    else if (s === 'betrayed') out.push(`${o.name} sold what he knew of you, and the Casa had it from him.`);
  }
  return out;
}

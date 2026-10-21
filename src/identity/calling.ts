import type { Game } from '../game/state';
import { record } from '../ledger/ledger';
import { doRefit, quoteRefit, type RefitJob } from '../game/refit';
import { portDef } from '../world/ports';
import { CALLING_IDS, type CallingId } from './state';

/**
 * The Calling (BUILD_PLAN D5): chosen once, at the end of Act I. Each one UNLOCKS A VERB; none changes a cost. The skill
 * tree is as it was.
 *
 *   Pilot          — run in on the lead at night or in fog (the harbour radius widens), and survey at twice the rate
 *                    (`SURVEY_RATE.pilot`, knowledge/sheets).
 *   Factor         — open a House without a court's leave; draw and send bills on a House's chest from anywhere.
 *   Master-builder — draw and lay down hulls of his own lines (ship/design); refit hull, rig and bottom in parallel.
 *   Master         — keep a second man in any seat of the company; hear one more voice in counsel, and better.
 */

export interface CallingDef { id: CallingId; name: string; english: string; verb: string; blurb: string }

export const CALLINGS: Record<CallingId, CallingDef> = {
  pilot: { id: 'pilot', name: 'Piloto', english: 'Pilot', verb: 'Run in on the lead', blurb: 'At night or in fog you may let go in a harbour you cannot see, on the lead and the reckoning, from further off than anyone else would dare. Your offing surveys run at twice the rate.' },
  factor: { id: 'factor', name: 'Feitor', english: 'Factor', verb: 'Open a House without a court; draw bills on Houses', blurb: 'You may found a House where no court has given leave to trade, and draw on any House’s chest from any quay, or send money to it, for a clerk’s fee.' },
  builder: { id: 'builder', name: 'Mestre de Obras', english: 'Master-builder', verb: 'Draw and lay down hulls; refit in parallel', blurb: 'The Ribeira will take your lines and lay a keel to them, and when she wants hull, rig and bottom done you have the yard do all three at once.' },
  master: { id: 'master', name: 'Mestre', english: 'Master', verb: 'A second man in any seat; one more voice in counsel', blurb: 'You may keep a second officer in a seat that is already filled, and your wardroom speaks with four voices instead of three, and a little straighter.' },
};

export const calling = (g: Pick<Game, 'identity'>): CallingId | null => g.identity.calling;
export const is = (g: Pick<Game, 'identity'>, c: CallingId): boolean => g.identity.calling === c;

/** The end of Act I has come, and he has not chosen. */
export const callingPending = (g: Game): boolean => g.chronicle.act >= 2 && g.identity.calling === null && g.campaign !== 'xiyang';

export function chooseCalling(g: Game, id: CallingId): { ok: boolean; text: string } {
  if (!CALLING_IDS.includes(id)) return { ok: false, text: 'There is no such calling.' };
  if (g.identity.calling) return { ok: false, text: 'A calling is chosen once.' };
  if (g.chronicle.act < 2) return { ok: false, text: 'A calling is chosen at the end of the first act.' };
  g.identity.calling = id;
  const d = CALLINGS[id];
  record(g, 'calling.chosen', { target: d.english, magnitude: 0.5, note: `Chose the ${d.english}’s calling: ${d.verb.toLowerCase()}.` });
  return { ok: true, text: `You are a ${d.english}. ${d.blurb}` };
}

// -- Pilot ------------------------------------------------------------------------

export const PILOT_ENTRY_NM = 14;
export const BASE_ENTRY_NM = 8;
export function entryRadiusNm(g: Game): number {
  if (!is(g, 'pilot')) return BASE_ENTRY_NM;
  const h = g.clock.hour;
  const dark = h < 5 || h >= 20;
  return dark || g.weatherNow.visibility < 4 ? PILOT_ENTRY_NM : BASE_ENTRY_NM;
}
export function noteLeadEntry(g: Game, distNm: number): void {
  if (is(g, 'pilot') && distNm > BASE_ENTRY_NM) record(g, 'calling.used', { magnitude: 0.2, note: 'Ran in on the lead from further off than any other captain would, in the dark.' });
}

// -- Factor -----------------------------------------------------------------------

export const BILL_FEE = 0.1;
export const SEND_FEE = 0.03;
export const canFoundWithoutCourt = (g: Game): boolean => is(g, 'factor');

/** Draw on a House's chest from where you lie. The clerk keeps a tenth. */
export function drawBill(g: Game, portId: string): { ok: boolean; text: string } {
  if (!is(g, 'factor')) return { ok: false, text: 'Only a factor writes bills on a House.' };
  if (!g.dockedAt) return { ok: false, text: 'A bill is written ashore.' };
  const f = g.feitorias.find((x) => x.portId === portId && !x.lost);
  if (!f) return { ok: false, text: 'You have no House there.' };
  const sum = Math.floor(f.chest);
  if (sum < 10) return { ok: false, text: 'The chest there is all but empty.' };
  const got = Math.floor(sum * (1 - BILL_FEE));
  f.chest -= sum;
  g.crown.gold += got;
  record(g, 'calling.used', { target: portId, magnitude: 0.3, note: `Drew a bill on the House at ${portDef(portId).name}: ${got} cruzados, ${sum - got} to the clerk.` });
  return { ok: true, text: `A bill on ${portDef(portId).name}: ${got} cruzados in the purse.` };
}

/** Send money to a House's chest from any quay. */
export function sendBill(g: Game, portId: string, sum: number): { ok: boolean; text: string } {
  if (!is(g, 'factor')) return { ok: false, text: 'Only a factor writes bills on a House.' };
  const f = g.feitorias.find((x) => x.portId === portId && !x.lost);
  if (!f) return { ok: false, text: 'You have no House there.' };
  sum = Math.floor(Math.min(sum, g.crown.gold));
  if (sum < 10) return { ok: false, text: 'Not enough in the purse to be worth a bill.' };
  g.crown.gold -= sum;
  f.chest += Math.floor(sum * (1 - SEND_FEE));
  record(g, 'calling.used', { target: portId, magnitude: 0.2, note: `Sent ${sum} cruzados to the chest at ${portDef(portId).name} by bill.` });
  return { ok: true, text: `${sum} cruzados to the chest at ${portDef(portId).name}.` };
}

// -- Master-builder ---------------------------------------------------------------

export const canDesign = (g: Game): boolean => is(g, 'builder') || g.designs.length > 0;
export function designBlocked(g: Game): string | null {
  return canDesign(g) ? null : 'Only a master-builder draws lines of his own. The yard sells you what it has drawn.';
}

/** Hull, rig and bottom at once: the yard does all three in the time of the longest. */
export function parallelRefit(g: Game): { ok: boolean; text: string } {
  if (!is(g, 'builder')) return { ok: false, text: 'Only a master-builder has the yard work three jobs at once.' };
  const jobs: RefitJob[] = (['careen', 'hull', 'rig'] as RefitJob[]).filter((j) => quoteRefit(g, j).ok);
  if (jobs.length < 2) return { ok: false, text: 'There is not enough to do for it to be worth running together.' };
  const quotes = jobs.map((j) => quoteRefit(g, j));
  const cost = quotes.reduce((s, q) => s + q.gold, 0);
  if (g.crown.gold < cost) return { ok: false, text: `The three jobs come to ${cost} cruzados.` };
  const days = Math.max(...quotes.map((q) => q.days));
  const serial = quotes.reduce((s, q) => s + q.days, 0);
  for (const j of jobs) doRefit(g, j, false);
  g.waitDays(days);
  record(g, 'calling.used', { magnitude: 0.3, note: `Had the yard do ${jobs.length} jobs together: ${days} days instead of ${serial}.` });
  return { ok: true, text: `${jobs.join(', ')} done together in ${days} days (${serial} one after another).` };
}

// -- Master -----------------------------------------------------------------------

export const counselVoices = (g: Pick<Game, 'identity'>): number => (g.identity.calling === 'master' ? 4 : 3);
export const counselEdge = (g: Pick<Game, 'identity'>): number => (g.identity.calling === 'master' ? 0.08 : 0);
/** Whether an occupied seat may take a second man. */
export function secondSeat(g: Game, role: string): boolean {
  if (!is(g, 'master')) return false;
  return g.crew.officers.filter((o) => o.alive && o.role === role).length < 2;
}

import { ledgerFaith } from './faithData';
import type { Game } from '../../game/state';
import { placeMods } from '../../places';
import { portDef } from '../../world/ports';
import {
  FRONTS, FRONT_IDS, POWER_BY_ID, activeEffects, marketModifiers, powerOfName, rumourFacts, type FrontId, type PowerId,
} from '../../world/powers';
import type { QuarterId } from './model';

/**
 * The state of the Fronts and the Powers at this place, per quarter (BUILD_PLAN C4: "each quarter shows the state of the
 * Fronts here"). A pure function of the game: an embargo that closes the Market is a line in the Market's strip, a
 * garrison on edge is a line in the Court's, a rumour board is the Tavern's. Nothing here moves anything.
 */

export type Tone = 'ok' | 'warn' | 'bad';
export interface FrontLine { front?: FrontId; text: string; tone: Tone }

const attitudeWord = (a: number): string =>
  a <= -0.5 ? 'hostile' : a <= -0.2 ? 'cool' : a < 0.2 ? 'indifferent' : a < 0.5 ? 'warm' : 'friendly';

const KIND_WORD: Record<string, string> = {
  embargo: 'An embargo', war: 'A war', blockade: 'A blockade', register: 'The register', push: 'A push', succession: 'A succession', stub: 'A season',
};

const QUIET: FrontLine = { text: 'Nothing out of the ordinary stirs here.', tone: 'ok' };

export function frontsAt(g: Game, port: string): Record<QuarterId, FrontLine[]> {
  const t = g.clock.t;
  const st = g.powers;
  const out: Record<QuarterId, FrontLine[]> = { waterfront: [], tavern: [], yard: [], market: [], court: [], faith: [] };

  // The market: what the Powers, the calendar and the place's memory are doing to prices, stock and dues.
  const mods = placeMods(g, port, t, marketModifiers(port, t, st));
  if (mods.closed) out.market.push({ text: `The market is shut to you here. ${mods.reason}`, tone: 'bad' });
  else if (mods.laneClosed) out.market.push({ text: `The lane is shut; the ship is let in at a toll. ${mods.reason}`, tone: 'warn' });
  else for (const r of mods.reasons) out.market.push({ text: r, tone: 'warn' });
  if (Math.abs(mods.duesMult - 1) > 0.005) out.market.push({ text: `Dues here run at ${(mods.duesMult * 100).toFixed(0)}% of the ordinary.`, tone: mods.duesMult > 1 ? 'warn' : 'ok' });

  // Effects in force at the port, by what they do.
  for (const e of activeEffects(st, t)) {
    if (!e.ports.includes(port)) continue;
    const line: FrontLine = { text: `${KIND_WORD[e.kind] ?? 'An effect'}: ${e.reason}`, tone: e.closes ? 'bad' : 'warn' };
    if (e.kind === 'embargo' || e.kind === 'blockade') { out.yard.push(line); out.waterfront.push(line); }
    else if (e.kind === 'stub') out.waterfront.push(line);
    else out.court.push(line);
  }

  // A Front's stage that touches this port.
  for (const id of FRONT_IDS) {
    const f = FRONTS[id];
    const stage = st.fronts[id].stage;
    const fx = f.effects.find((x) => x.ports.includes(port) && stage >= x.minStage && (x.maxStage === undefined || stage <= x.maxStage));
    if (!fx) continue;
    const line: FrontLine = { front: id, text: `${f.name}, “${f.stages[stage - 1].name}”: ${fx.line}`, tone: stage >= 3 ? 'bad' : stage >= 2 ? 'warn' : 'ok' };
    out.court.push(line);
    if (fx.closes) out.market.push(line);
    if (id === 'traffic') out.faith.push(line);
  }

  // The Power that owns the place, and how the Ledger has left it feeling.
  const pid: PowerId | null = powerOfName(port);
  if (pid) {
    const a = st.powers[pid].attitude;
    out.court.push({ text: `${POWER_BY_ID.get(pid)?.name ?? pid} regards you as ${attitudeWord(a)}.`, tone: a <= -0.2 ? 'bad' : a >= 0.2 ? 'ok' : 'ok' });
    for (const m of st.powers[pid].moves.slice(-1)) out.court.push({ text: m.text, tone: 'warn' });
  }

  // The tavern: what the mill has put about, as the captain heard it here.
  const heard = rumourFacts(st, t).filter((f) => f.place === port || f.id.startsWith('rumour:'));
  const here = heard.filter((f) => st.rumours.find((r) => `rumour:${r.id}` === f.id)?.heard?.port === port);
  out.tavern.push({
    text: here.length === 0 ? 'No new word has reached this quay that you have not heard.'
      : `${here.length} tale${here.length === 1 ? ' is' : 's are'} going about this quay that you have heard.`,
    tone: here.length ? 'warn' : 'ok',
  });

  // The faith: what the Ledger holds of how the place's worship was treated.
  out.faith.push(...ledgerFaith(g, port));

  for (const q of Object.keys(out) as QuarterId[]) if (out[q].length === 0) out[q].push(QUIET);
  return out;
}

/** For the head of the screen: the port's own name, for the strip. */
export const portNameOf = (port: string): string => portDef(port).name;

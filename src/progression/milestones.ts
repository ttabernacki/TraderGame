import { PORTS } from '../world/ports';
import type { Game } from '../game/state';

/**
 * Things a career does along the way that nobody commissioned.
 *
 * The acts say what the King wants and the threads say what the road holds.
 * These are the captain's own: a purse, a line crossed, a coast laid down. Each
 * pays a little renown when it is first done and is listed on the Road, so there
 * is always a next small thing to be doing as well as the big one.
 */
export interface Milestone {
  id: string;
  title: string;
  /** What to do, for the list. */
  hint: string;
  done: (g: Game) => boolean;
  renown: number;
  gold?: number;
}

const portsVisited = (g: Game): number => [...g.visitedPorts].filter((id) => PORTS.some((p) => p.id === id)).length;
const threads = (g: Game): number => g.quests.filter((q) => q.outcome).length;

export const MILESTONES: Milestone[] = [
  { id: 'purse1', title: 'A thousand cruzados', hint: 'Hold a thousand cruzados at once.', done: (g) => g.crown.gold >= 1000, renown: 10 },
  { id: 'purse5', title: 'A fortune', hint: 'Hold five thousand cruzados at once.', done: (g) => g.crown.gold >= 5000, renown: 25 },
  { id: 'line', title: 'Crossed the line', hint: 'Sail across the equator.', done: (g) => g.crown.landmarksFound.has('equator'), renown: 10 },
  { id: 'ports10', title: 'Ten harbours', hint: 'Make ten different ports.', done: (g) => portsVisited(g) >= 10, renown: 15 },
  { id: 'ports25', title: 'Twenty-five harbours', hint: 'Make twenty-five different ports.', done: (g) => portsVisited(g) >= 25, renown: 40, gold: 200 },
  { id: 'cape', title: 'The Cape', hint: 'Round the Cape of Good Hope.', done: (g) => g.crown.landmarksFound.has('boa-esperanca'), renown: 25 },
  { id: 'india', title: 'India', hint: 'Make a port on the coast of India.', done: (g) => g.crown.landmarksFound.has('india'), renown: 40, gold: 300 },
  { id: 'padroes', title: 'Three padrões', hint: 'Raise three padrões on new coasts.', done: (g) => g.crown.padroesRaised >= 3, renown: 20 },
  { id: 'gales', title: 'Hard weather', hint: 'Weather three gales.', done: (g) => g.galeRecord.weathered >= 3, renown: 15 },
  { id: 'threads3', title: 'Three stories told', hint: 'Finish three of the long threads.', done: (g) => threads(g) >= 3, renown: 20 },
  { id: 'threads8', title: 'A life’s stories', hint: 'Finish eight of the long threads.', done: (g) => threads(g) >= 8, renown: 50, gold: 400 },
  { id: 'years3', title: 'Three years out', hint: 'Keep the sea for three years.', done: (g) => (g.clock.t - g.startT) / (86400 * 365) >= 3, renown: 20 },
];

/** Claim whatever has just been done; returns the ones newly claimed. */
export function checkMilestones(g: Game): Milestone[] {
  const out: Milestone[] = [];
  for (const m of MILESTONES) {
    if (g.milestones.includes(m.id) || !m.done(g)) continue;
    g.milestones.push(m.id);
    g.crown.standing += m.renown;
    g.crown.lifetimeStanding += m.renown;
    if (m.gold) g.crown.gold += m.gold;
    out.push(m);
  }
  return out;
}

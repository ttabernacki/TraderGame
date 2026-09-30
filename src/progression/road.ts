import { NM, haversine, type LatLon } from '../core/math';
import { PORTS, anchorageOf, portDef } from '../world/ports';
import type { Game } from '../game/state';
import { ACTS, ACT_CHARGE, actGoal } from './chronicle';
import { LANDMARKS } from './crown';
import { QUESTS, goalOf, markerOf } from './quests';
import { daysLeft, ventureLine } from './ventures';

/**
 * The road.
 *
 * The career is one road, not a star: Lisbon, the Canaries, Arguim, Mina, the
 * Congo, the Cape, the Swahili coast, Malabar. Everything the captain is bound
 * to — the act's goal, the King's commission, the long stories, the merchants'
 * charters, and the people on the quays who have something to say — lies at
 * some point along it, and a good voyage does all of the things at a place in
 * one call and goes on. This puts them all in one list, in the order the ship
 * will meet them, so the next leg can be planned instead of discovered.
 */

/** The trunk, in the order a voyage meets it. */
const TRUNK: string[] = [
  'lisboa', 'lagos', 'funchal', 'las-palmas', 'arguim', 'mina', 'mpinda', 'benguela',
  'mocambique', 'melinde', 'calecute', 'cochim',
];

// The Cape is not a port, but it is on the road between Benguela and
// Moçambique, so the trunk carries it as a point.
const TRUNK_POINTS: LatLon[] = TRUNK.flatMap((id, i): LatLon[] => {
  const p = anchorageOf(portDef(id));
  return id === 'benguela' && TRUNK[i + 1] === 'mocambique'
    ? [p, { lat: -34.4, lon: 18.5 }, { lat: -26, lon: 34 }]
    : [p];
});

/** How far along the road a point lies, in nautical miles from Lisbon, by its nearest stretch of it. */
export function along(at: LatLon): number {
  let run = 0;
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < TRUNK_POINTS.length; i++) {
    const a = TRUNK_POINTS[i - 1];
    const b = TRUNK_POINTS[i];
    const len = haversine(a, b) / NM;
    const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    const ax = a.lon * k; const bx = b.lon * k;
    const px = at.lon * k;
    const vx = bx - ax; const vy = b.lat - a.lat;
    const wx = px - ax; const wy = at.lat - a.lat;
    const vv = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
    const cx = ax + vx * t; const cy = a.lat + vy * t;
    const d = Math.hypot(px - cx, at.lat - cy);
    if (d < best.d) best = { d, s: run + len * t };
    run += len;
  }
  return best.s;
}

export type TaskKind = 'act' | 'commission' | 'story' | 'offer' | 'charter' | 'home';

export interface RoadTask {
  kind: TaskKind;
  text: string;
  /** A short tag for the row: what sort of thing this is. */
  tag: string;
}

export interface RoadStop {
  /** The place, in the words the chart uses. */
  where: string;
  portId: string | null;
  at: LatLon;
  along: number;
  /** Miles from the ship, on the sphere. */
  nm: number;
  here: boolean;
  tasks: RoadTask[];
}

/** The port a point is at, or within a short sail of. */
function portNear(at: LatLon, withinNm = 45): string | null {
  let best: { id: string; nm: number } | null = null;
  for (const p of PORTS) {
    const nm = haversine(at, anchorageOf(p)) / NM;
    if (nm <= withinNm && (!best || nm < best.nm)) best = { id: p.id, nm };
  }
  return best?.id ?? null;
}

function landmark(id: string): LatLon | null {
  const l = LANDMARKS.find((x) => x.id === id);
  return l ? { lat: l.lat, lon: l.lon } : null;
}

/** Where a commission or act target is on the map: a port, a landmark, or nothing fixed. */
function locate(target: string | undefined): LatLon | null {
  if (!target) return null;
  const p = PORTS.find((x) => x.id === target);
  if (p) return anchorageOf(p);
  return landmark(target);
}

/** The people's nearest port on the road, for a commission that wants contact with them. */
function peoplePort(people: string): LatLon | null {
  const ports = PORTS.filter((p) => p.people === people);
  if (ports.length === 0) return null;
  const at = ports.map((p) => anchorageOf(p));
  return at.sort((a, b) => along(a) - along(b))[0];
}

export function roadPlan(g: Game): RoadStop[] {
  const ship = g.ship.state.pos;
  const stops = new Map<string, RoadStop>();
  const put = (at: LatLon, label: string, task: RoadTask): void => {
    const port = portNear(at);
    const key = port ?? `${label}@${at.lat.toFixed(1)},${at.lon.toFixed(1)}`;
    let s = stops.get(key);
    if (!s) {
      const def = port ? portDef(port) : null;
      const pos = def ? anchorageOf(def) : at;
      s = {
        where: def ? def.name : label,
        portId: port,
        at: pos,
        along: along(pos),
        nm: Math.round(haversine(ship, pos) / NM),
        here: !!port && g.dockedAt === port,
        tasks: [],
      };
      stops.set(key, s);
    }
    s.tasks.push(task);
  };

  // Things with no fixed place: a cargo to bring home, miles of coast to chart.
  const anywhere = (label: string, task: RoadTask): void => {
    let s = stops.get('*');
    if (!s) {
      s = { where: label, portId: null, at: ship, along: -1, nm: 0, here: false, tasks: [] };
      stops.set('*', s);
    }
    s.tasks.push(task);
  };

  // The act, which is the spine.
  const c = g.chronicle;
  const act = ACTS[Math.min(ACTS.length, c.act) - 1];
  if (c.goalMet && c.act < ACTS.length) {
    // The answer comes to the captain, not the other way about.
    put(ship, 'At sea', {
      kind: 'act',
      tag: `Act ${c.act}`,
      text: `${act.english}: done. The King’s answer will find you at the next port you make.`,
    });
  } else {
    const at = c.act === 1 ? locate('mina')
      : c.act === 2 ? landmark('congo')
        : c.act === 3 ? landmark('boa-esperanca')
          : c.act === 4 ? landmark('india')
            : locate('lisboa');
    if (at) put(at, act.english, { kind: 'act', tag: `Act ${c.act}`, text: actGoal(g, c.act) });
  }

  // The King's commission, one objective at a time.
  const patent = g.crown.patent;
  if (patent && !patent.complete) {
    for (const o of patent.objectives) {
      if (o.complete || o.kind === 'return') continue;
      const at = o.kind === 'contact' && o.target ? peoplePort(o.target) : locate(o.target);
      const text = o.amount && o.kind !== 'cargo'
        ? `${o.description} (${Math.floor(o.progress)}/${o.amount})`
        : o.description;
      if (at) put(at, o.description, { kind: 'commission', tag: 'Commission', text });
      else anywhere('Along the way', { kind: 'commission', tag: 'Commission', text });
    }
  }

  // The long stories, at wherever their next beat is.
  for (const q of g.quests) {
    if (q.outcome) continue;
    const m = markerOf(g, q);
    const line = { kind: 'story' as const, tag: QUESTS[q.id].title, text: goalOf(g, q) };
    if (m) put({ lat: m.lat, lon: m.lon }, m.label, line);
    else anywhere('Along the way', line);
  }

  // People on the quays with something to say, shown at the first such port the road reaches.
  const shipAlong = along(ship);
  for (const def of Object.values(QUESTS)) {
    if (g.quests.some((q) => q.id === def.id) || !def.available(g)) continue;
    const ports = def.offeredAt.filter((id) => PORTS.some((p) => p.id === id));
    if (ports.length === 0) continue;
    const ahead = ports
      .map((id) => ({ id, a: along(anchorageOf(portDef(id))) }))
      .sort((x, y) => x.a - y.a);
    const pick = ahead.find((p) => p.a >= shipAlong - 40) ?? ahead[ahead.length - 1];
    const more = ports.length > 1 ? ` (also at ${ports.filter((p) => p !== pick.id).map((p) => portDef(p).name).join(', ')})` : '';
    put(anchorageOf(portDef(pick.id)), pick.id, {
      kind: 'offer', tag: 'Somebody has a story', text: `${def.title}: ${def.blurb}${more}`,
    });
  }

  // Merchants' charters: deliveries, with the days left.
  for (const v of g.activeVentures) {
    const days = Math.round(daysLeft(v, g.clock.t));
    put(anchorageOf(portDef(v.toPort)), portDef(v.toPort).name, {
      kind: 'charter', tag: 'Charter',
      text: `${ventureLine(v)} — ${days >= 0 ? `${days} days left` : `${-days} days overdue`}`,
    });
  }

  // Standing errands with Lisbon: only the ones that really are there.
  const home = g.crown.discoveries.filter((d) => !d.reported).length;
  if (home > 0 && (!patent || patent.title !== ACT_CHARGE[c.act])) {
    put(anchorageOf(portDef('lisboa')), 'Lisboa', {
      kind: 'home', tag: 'At court',
      text: `${home} discoveries not yet entered on the padrão real. Any port with the King’s factor will do; the court pays best.`,
    });
  }

  return [...stops.values()].sort((a, b) => a.along - b.along);
}

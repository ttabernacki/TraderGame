import { NM, haversine, type LatLon } from '../core/math';
import type { Game } from '../game/state';
import { along } from '../progression/road';
import { anchorageOf, portDef } from '../world/ports';
import type { Place, SeaSpot } from './types';

/** Where a storylet may be had: builders and the test. */

export const ports = (...ids: string[]): Place => ({ ports: ids });
export const anyPort = (): Place => ({ anyPort: true });
export const either = (...places: Place[]): Place => ({ either: places });

/** At sea (or on a coast not at a port) within `nm` of a point; optional nearest-land limits. */
export function seaNear(lat: number, lon: number, nm: number, o: { shoreMin?: number; shoreMax?: number } = {}): Place {
  return { sea: { at: { lat, lon }, nm, ...o } };
}

/** At sea where a shape says; `at` is a representative point for the road. */
export function seaWhere(at: LatLon, where: (g: Game) => boolean): Place {
  return { sea: { at, where } };
}

/** Within reach of a point, whether the ship is docked at a port nearby or in the offing (stories that happen "off Calecute"). */
export function nearPoint(lat: number, lon: number, nm: number, o: { shoreMin?: number; shoreMax?: number } = {}): Place {
  return { sea: { at: { lat, lon }, nm, ...o } };
}

const here = (g: Game): LatLon => (g.dockedAt ? anchorageOf(portDef(g.dockedAt)) : g.ship.state.pos);

function inSpot(g: Game, s: SeaSpot): boolean {
  if (g.dockedAt) return false;
  if (s.nm !== undefined && haversine(g.ship.state.pos, s.at) / NM > s.nm) return false;
  const shore = g.sounding.shoreDistNm;
  if (s.shoreMin !== undefined && shore < s.shoreMin) return false;
  if (s.shoreMax !== undefined && shore > s.shoreMax) return false;
  return s.where ? s.where(g) : true;
}

/** Whether the ship is in the place now. */
export function inPlace(g: Game, p: Place): boolean {
  if (p.either) return p.either.some((x) => inPlace(g, x));
  if (p.months && !p.months.includes(g.clock.date.month)) return false;
  if (p.span) {
    const a = along(here(g));
    if (a < p.span[0] || a > p.span[1]) return false;
  }
  if (p.ports) return !!g.dockedAt && p.ports.includes(g.dockedAt);
  if (p.anyPort) return !!g.dockedAt;
  if (p.sea) return inSpot(g, p.sea);
  return false;
}

/** The places a storylet can be had, as points on the road, for the falsifier. */
export function pointsOf(p: Place): { at: LatLon; port: string | null }[] {
  if (p.either) return p.either.flatMap(pointsOf);
  if (p.ports) return p.ports.map((id) => ({ at: anchorageOf(portDef(id)), port: id }));
  if (p.sea) return [{ at: p.sea.at, port: null }];
  return [];
}

/** Nautical miles along the road of each place the storylet can be had. */
export const alongOf = (p: Place): number[] => pointsOf(p).map((x) => along(x.at));

/** Ports named by a place, if it is only ports. */
export function portsOf(p: Place): string[] {
  if (p.ports) return p.ports;
  if (p.either) return p.either.flatMap(portsOf);
  return [];
}

/** A place that is a port (any of the Portuguese home ports). */
export const HOME_PORTS = ['lisboa', 'lagos', 'funchal'];

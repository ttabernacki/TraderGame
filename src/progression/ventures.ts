import { NM, clamp, haversine } from '../core/math';
import {
  contractLine, contractTons, daysLeft as contractDaysLeft, type PortContract,
} from '../world/contracts';

/**
 * Private ventures, as they were: the merchants' charters. DEPRECATED (BUILD_PLAN D1).
 *
 * The generator is gone. Charters are now contracts, posted by quays that run short of a good
 * (`world/contracts`), and a charter found in an old save becomes a contract with `kind: 'venture'`
 * (`game/saveResolvers migrateVentures`), keeping its date, its advance and any cargo loaded for the
 * merchant. What is left here is the names the screens already import, so that they keep reading the
 * one record: `Venture` is a `PortContract`, `ventureLine` is `contractLine`.
 *
 * Nothing new should import this module; use `world/contracts`.
 */

/** @deprecated a charter is a PortContract (world/contracts). */
export type Venture = PortContract;

/** @deprecated use contractLine. */
export const ventureLine = contractLine;
/** @deprecated use contractTons. */
export const ventureTons = contractTons;
/** @deprecated use daysLeft from world/contracts. */
export const daysLeft = contractDaysLeft;

/**
 * Where the volta do mar turns: the latitude of the Azores, well out to the
 * westward, which is where every ship homeward from Guinea actually goes.
 */
const VOLTA_TURN = { lat: 36, lon: -32 };

/**
 * Days allowed for a passage between two places, measured by the road a ship really sails,
 * not the line on the chart. Home to Portugal from anywhere down in the trades is not north up
 * the coast but the volta, getting on for twice the straight line. Used when old charters are
 * brought across, to put them on the same footing as the straight-line allowance they were
 * written with.
 */
export function charterDays(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const straight = haversine(from, to) / NM;
  const homeward = to.lat > 30 && to.lon < 5 && from.lat < 28 && from.lon < 20
    && from.lat > -36 && to.lat - from.lat > 6;
  if (!homeward) return clamp(straight / 78 + 26, 34, 260);
  const road = (haversine(from, VOLTA_TURN) + haversine(VOLTA_TURN, to)) / NM;
  return clamp(Math.max(road, straight) / 70 + 32, 45, 260);
}

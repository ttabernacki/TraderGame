import { NM, clamp, haversine, wrap360, type LatLon } from '../core/math';
import { LANDMASSES } from '../world/coastlines';
import { coastSegmentsNear, nearestShore } from '../world/landmass';
import { ISLES, PHANTOMS, RUMOUR_SOURCES, isleByLand, landIndexOf, type OceanIsle } from '../world/isles';
import { portDef } from '../world/ports';
import { sightingRangeNm } from '../navigation/charts';
import type { Lead } from '../progression/leads';
import type { SeaEvent } from './seaEvents';
import type { Game } from './state';

/**
 * Land beyond the horizon, and how a ship found it before anyone could see it.
 *
 * An island five miles across in three thousand miles of ocean is found by
 * accident or not at all, unless the ship reads what the sea is telling her.
 * Every pilot of the period did: boobies and terns fly out from land at dawn
 * and home to it at dusk, and a flight of them at sunset is a bearing; a high
 * island wears a cap of cloud that stays put while every other cloud in the sky
 * goes by, and can be seen long before the rock under it; branches and weed
 * come off a wooded shore; a swell thrown back off a coast crosses the one the
 * wind is making. None of them is certain, and a lone bird two hundred miles
 * from anything means nothing at all.
 *
 * The signs are laid on the chart as rays from where the pilot thought the ship
 * was when he saw them — his reckoning, so they are wrong in the same way the
 * rest of his chart is — and two of them crossing is where to look.
 */

export type SignKind = 'birds' | 'cloud' | 'drift' | 'swell' | 'stray';

export interface LandSign {
  t: number;
  /** Where the reckoning had her when it was seen. */
  lat: number;
  lon: number;
  /** True bearing the sign points along; null for signs with no direction. */
  bearing: number | null;
  /** How far either side of that bearing it might be, in degrees. */
  spread: number;
  kind: SignKind;
  text: string;
}

export interface IsleFind {
  name: string;
  t: number;
  landed: boolean;
  /** 'you', or the historical finder when history got there first. */
  by: string;
}

export interface IsleState {
  found: Record<string, IsleFind>;
  signs: LandSign[];
  /** Port id → year it was last asked, so each quay tells one tale a year. */
  heard: Record<string, number>;
  lastSignT: number;
  lastCheckT: number;
  lastSightT: number;
}

export function newIsleState(): IsleState {
  return { found: {}, signs: [], heard: {}, lastSignT: -1e9, lastCheckT: -1e9, lastSightT: -1e9 };
}

const SIGN_EVERY = 2 * 3600;
const SIGN_QUIET = 5 * 3600;
const SIGN_KEEP = 20 * 86400;

const WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** A bearing as a seaman says it aloud. */
export function dirWord(b: number): string {
  return WORDS[Math.round(wrap360(b) / 45) % 8];
}

/** Hour of the day where she is, from the sun. */
function localHour(g: Game): number {
  return ((g.clock.hour + g.ship.state.pos.lon / 15) % 24 + 24) % 24;
}

/** Whether the pilot has any of this land on his sheet near where it lies. */
function landCharted(g: Game, land: number, near: LatLon): boolean {
  for (const seg of coastSegmentsNear(near, 80)) {
    if (seg.land !== land) continue;
    if (g.chart.points.has(`${seg.land}:${seg.aIndex}`)) return true;
  }
  return false;
}

function jitter(g: Game, bearing: number, sd: number): number {
  return wrap360(bearing + g.rng.normal(0, sd));
}

/**
 * Read the sea, every two hours of ship's time while no land is in sight.
 * Returns the sign seen, if any; the caller announces it.
 */
export function readTheSea(g: Game): LandSign | null {
  const st = g.isles;
  const t = g.clock.t;
  if (t - st.lastCheckT < SIGN_EVERY) return null;
  st.lastCheckT = t;
  st.signs = st.signs.filter((s) => t - s.t < SIGN_KEEP);
  if (t - st.lastSignT < SIGN_QUIET) return null;

  const pos = g.ship.state.pos;
  const reach = g.can('farSight') ? 190 : 160;
  const shore = nearestShore(pos, reach);
  const hour = localHour(g);
  const vis = g.weatherNow.visibility;
  const at = g.nav.estimated;
  const make = (kind: SignKind, bearing: number | null, spread: number, text: string): LandSign => {
    const s: LandSign = { t, lat: at.lat, lon: at.lon, bearing, spread, kind, text };
    st.signs.push(s);
    st.lastSignT = t;
    return s;
  };

  if (shore.land < 0) {
    // Nothing out there. Now and again a bird anyway, which proves nothing.
    if (g.rng.next() < 0.02) {
      const b = g.rng.range(0, 360);
      return make('stray', b, 60,
        `A single tern, going ${dirWord(b)} very high and very fast. The master says one bird is not land; the boatswain says one bird is one bird more than yesterday.`);
    }
    return null;
  }

  const dNm = shore.distance / NM;
  const range = sightingRangeNm(g.ship.mastHeight, vis, LANDMASSES[shore.land].relief);
  if (dNm < range) return null;
  const shorePt: LatLon = {
    lat: pos.lat + (dNm * Math.cos(shore.bearing * Math.PI / 180)) / 60,
    lon: pos.lon + (dNm * Math.sin(shore.bearing * Math.PI / 180)) / (60 * Math.max(Math.cos(pos.lat * Math.PI / 180), 0.2)),
  };
  // A coast already on the sheet is steered for, not searched for.
  if (landCharted(g, shore.land, shorePt)) return null;

  const relief = LANDMASSES[shore.land].relief;
  const isle = isleByLand(shore.land);
  const wood = isle ? isle.wood : 0.6;
  const trueB = shore.bearing;
  const sharp = g.can('pilotsInstinct') ? 0.65 : 1;

  // A cap of cloud that does not move, over a high island in daylight.
  const cloudRange = 25 + relief / 30;
  if (hour > 7 && hour < 17.5 && vis > 8 && relief >= 500 && dNm < cloudRange && g.rng.next() < 0.6) {
    const b = jitter(g, trueB, 4 * sharp);
    g.cueLook(b);
    return make('cloud', b, 6 * sharp,
      `A cloud on the horizon to the ${dirWord(b)} that has not moved since the forenoon watch, while every other cloud in the sky has gone by it. The master says that is a cloud sitting on a mountain, and he will stake his wages on it.`);
  }

  // Birds going home at dusk, or coming out at dawn.
  const dusk = hour > 17 && hour < 20;
  const dawn = hour > 5 && hour < 8;
  if ((dusk || dawn) && dNm < 95 && g.rng.next() < 0.75 * (1 - dNm / 95)) {
    const b = jitter(g, trueB, (dusk ? 10 : 16) * sharp);
    return make('birds', b, (dusk ? 14 : 22) * sharp, dusk
      ? `Boobies, a long string of them low over the water, all going ${dirWord(b)} as the sun goes down. They sleep ashore. Wherever they are going is land.`
      : `Terns coming out of the ${dirWord(b)} at first light, low and purposeful, to fish. They slept somewhere last night that was not the sea.`);
  }

  // A swell thrown back off a coast, crossing the one the wind is making.
  if (dNm < 45 && g.rng.next() < 0.3) {
    const b = jitter(g, trueB, 22 * sharp);
    return make('swell', b, 30 * sharp,
      `The pilot has been lying in his bunk feeling the ship, and says there is a second swell under the first, a short one out of the ${dirWord(b)}. Something out there is throwing the sea back.`);
  }

  // Wood and weed off a green shore.
  if (wood > 0.3 && dNm < 150 && g.rng.next() < 0.22) {
    const b = jitter(g, trueB, 40 * sharp);
    return make('drift', b, 50 * sharp,
      `A branch alongside with the leaves still green on it, and then a raft of weed with a crab riding it. It came off land, and not long ago — somewhere ${dirWord(b)}, by the look of the drift.`);
  }
  return null;
}

/**
 * Talk on the quay about land to seaward: once a year a port, entered as a
 * lead (progression/leads) so it is drawn and kept like any other hearsay.
 */
export function hearOfIsland(g: Game, portId: string): Lead | null {
  const st = g.isles;
  const year = g.clock.date.year;
  if (st.heard[portId] === year) return null;
  const src = RUMOUR_SOURCES.find((s) => s.ports.includes(portId));
  if (!src) return null;
  st.heard[portId] = year;
  const open = src.tells.filter((id) => !st.found[id] && !g.leads.some((l) => l.isle === id));
  if (open.length === 0 || g.rng.next() > 0.65) return null;
  const id = open[Math.floor(g.rng.next() * open.length)];
  const isle = ISLES.find((i) => i.id === id);
  const phantom = PHANTOMS.find((p) => p.id === id);
  const base = isle ?? phantom!;
  const sd = src.sigma;
  const lat = base.lat + g.rng.normal(0, sd);
  const lon = base.lon + g.rng.normal(0, sd) / Math.max(Math.cos(base.lat * Math.PI / 180), 0.3);
  const name = phantom ? phantom.name : `an island ${isleHint(isle!)}`;
  const tale = phantom ? phantom.tale : isleTale(isle!);
  const where = `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? 'north' : 'south'}, ${Math.abs(lon).toFixed(0)}° ${lon >= 0 ? 'east' : 'west'}`;
  const errorNm = Math.round(sd * 60 * 1.2);
  const text = `At ${portDef(portId).name}, ${src.who} talk of ${name}: ${tale}. They put it about ${where}, `
    + `give or take ${Math.round(errorNm / 3)} leagues. The pilot has pricked it on the chart with a question mark.`;
  return g.addIsleLead({
    kind: 'island', text, source: `${src.who} at ${portDef(portId).name}`,
    lat, lon, errorNm, value: phantom ? 14 : 0, isle: id, phantom: !!phantom,
  });
}

function isleHint(i: OceanIsle): string {
  if (i.id === 'brasil') return 'to the west';
  if (i.id === 'madagascar') return 'of São Lourenço';
  if (i.water > 0.7) return 'with water';
  if (i.water < 0.1) return 'of birds';
  return 'far out';
}

function isleTale(i: OceanIsle): string {
  switch (i.id) {
    case 'brasil': return 'a caravel blown off the islands saw a coast to the west with a round mountain over it, and trees down to the water';
    case 'fernando': return 'there is a green island with a needle of rock on it, a long way west of the islands';
    case 'ascension': return 'a homeward ship ran past an island of black cinders covered in birds, and did not stop because there was no water to be seen';
    case 'santa-helena': return 'there is a green rock alone in the middle of the southern ocean with water running down it, and one of the men swears he smelled it before he saw it';
    case 'madagascar': return 'the great island of the Moon lies across from Sofala, bigger than Portugal, and they trade there for slaves and rice';
    case 'mauricia': return 'there are islands to the east of the great island with nobody on them, where the birds do not know to be afraid';
    case 'reuniao': return 'east of the great island there is a mountain that burns, and another island beyond it greener than the first';
    default: return 'there is land out there that is on no Christian chart';
  }
}

/**
 * An island on nobody's chart has come up over the horizon.
 */
export function isleScene(g: Game, isle: OceanIsle, saint: string): SeaEvent {
  const saintName = `Ilha de ${saint}`;
  const thin = g.crew.provisions.water < 25;
  return {
    id: `isle:${isle.id}`,
    title: isle.id === 'brasil' || isle.id === 'madagascar' ? 'Land, where there ought to be none' : 'An island on no chart',
    severity: 'warning',
    text: `${isle.sighting}\n\nIt is on no chart in Lisbon, or in Seville, or anywhere else a Christian pilot `
      + 'has ever drawn one. Whatever you call it now is what it will be called.',
    choices: [
      {
        label: `Send the boats in, and call it ${isle.suggested}`,
        detail: `A day at it${thin ? ', with the casks near empty' : ''}: water, food and wood if it has any, and the whole of it put on the sheet. The master's name for it, ${isle.because}.`,
        resolve: (gg) => gg.nameTheIsle(isle, isle.suggested, true),
      },
      {
        label: `Call it ${saintName}, and stand on`,
        detail: `The chaplain's, it being the feast of ${saint}. Nothing spent but the ink.`,
        resolve: (gg) => gg.nameTheIsle(isle, saintName, false),
      },
      {
        label: 'Enter it without a name, and stand on',
        detail: 'A position in the book and nothing more. Somebody else will name it.',
        resolve: (gg) => gg.nameTheIsle(isle, '', false),
      },
    ],
  };
}

/** The first undiscovered island whose coast is now in sight, if any. */
export function isleInSight(g: Game): OceanIsle | null {
  const pos = g.ship.state.pos;
  for (const isle of ISLES) {
    if (g.isles.found[isle.id]) continue;
    const li = landIndexOf(isle);
    if (li < 0) continue;
    const range = sightingRangeNm(g.ship.mastHeight, g.weatherNow.visibility, LANDMASSES[li].relief);
    if (coastSegmentsNear(pos, range).some((s) => s.land === li)) return isle;
  }
  return null;
}

/**
 * The rumoured spot reached. A phantom is struck off; a real island that was
 * not where the tale put it leaves the pilot knowing only that it is not here.
 */
export function searchRumours(g: Game): string | null {
  const at = g.nav.estimated;
  const hour = localHour(g);
  if (hour < 7 || hour > 18 || g.weatherNow.visibility < 10) return null;
  for (const l of g.leads) {
    if (!l.isle || l.followed || l.searched) continue;
    if (haversine(at, l) / NM > 20) continue;
    l.searched = true;
    const name = PHANTOMS.find((p) => p.id === l.isle)?.name ?? 'the island';
    if (l.phantom) {
      l.followed = true;
      l.false = true;
      g.crown.record('island', `${name} — not there`, at, l.value, g.clock.t);
      g.crew.morale = clamp(g.crew.morale - 0.03, 0, 1);
      const text = `Here, by the reckoning, is where ${name} ought to be, and there is nothing: `
        + 'a clear horizon all round and no bottom with the deep-sea lead. The pilot rules a line '
        + 'through it on the chart. The Casa will want to hear it, because men have been given '
        + 'letters patent for this place, and it is worth knowing that there is no such place.';
      g.logEvent('discovery', text, true);
      return text;
    }
    // Something real, but not here. The next reading of the sea comes sooner.
    g.isles.lastSignT = -1e9;
    g.isles.lastCheckT = -1e9;
    const text = `Nothing in sight where the tale put ${name}. The tale may be wrong about where, `
      + 'or wrong about everything. The masthead is doubled and the pilot is watching the birds.';
    g.logEvent('note', text, true);
    return text;
  }
  return null;
}

/**
 * What history found while the player was elsewhere. On the Casa's sheet from
 * the year after, under the finder's name.
 */
export function historyCatchesUp(g: Game): OceanIsle[] {
  const year = g.clock.date.year;
  const out: OceanIsle[] = [];
  for (const isle of ISLES) {
    if (g.isles.found[isle.id] || year <= isle.year) continue;
    g.isles.found[isle.id] = { name: isle.suggested, t: g.clock.t, landed: false, by: isle.by };
    closeIsleLeads(g, isle.id);
    const li = landIndexOf(isle);
    if (li >= 0) g.chart.seedLand(li);
    out.push(isle);
  }
  return out;
}


/** A tale about an island that has now been found is run down. */
export function closeIsleLeads(g: Game, id: string): void {
  for (const l of g.leads) {
    if (l.isle !== id || l.followed) continue;
    l.followed = true;
    l.false = false;
  }
}

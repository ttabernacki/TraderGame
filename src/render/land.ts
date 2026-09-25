import * as THREE from 'three';
import { NM, clamp, cosd, lerp, wrap180, type LatLon } from '../core/math';
import { LANDMASSES, elevationAt, isLand } from '../world/landmass';
import { CoastScenery, hash3, regionAt } from './coastScenery';
import { anchorageOf, portsNear } from '../world/ports';
import { townHillsNear } from './settlement';

/**
 * Depth of each rendered coastal band inland, in metres. Beyond the last of
 * them nothing is visible from sea level.
 *
 * Six bands, the outer ones nine and seventeen kilometres apart, sampled the
 * height field about twice across a small island — so however much shape the
 * field had, the mesh could not hold any of it, and the coast came out as one
 * flat-topped ribbon of a single colour. The normals were all but vertical
 * everywhere, so there was nothing for the light to model either. Nine bands,
 * spaced more evenly, give a coast a profile and give the sun something to
 * catch, at a cost of about four hundred vertices.
 */
const BANDS = [0, 200, 550, 1200, 2400, 4200, 7000, 11000, 17000];
/**
 * How the ground is shaded band by band, from the beach inland.
 *
 * This used to brighten with distance — the interior nearly white — which is
 * the wrong way round for the one thing the picture has to do. A coast is read
 * against the sky, and at dawn or dusk the sun sits low behind it and the land
 * is a silhouette; brightening the far ground turned that silhouette into
 * something the same value as the haze it stood in, and the coast disappeared.
 * Near ground is now a little the brightest and the interior settles darker, so
 * there is always tone between the land and the sky.
 */
const BAND_TINT = [0.74, 0.73, 0.71, 0.69, 0.67, 0.65, 0.63, 0.61, 0.59];

/**
 * How much *low* land is drawn higher than it is.
 *
 * Every chart and every panorama in the sailing directions exaggerates, for the
 * same reason: at true scale a low coast is almost nothing. Fifty metres of
 * dune eight miles off subtends a tenth of a degree, the curve of the earth has
 * already taken the beach under it, and a flat shore arrives as a hairline you
 * cannot see until you are on it — which is how a player ends up aground
 * without ever having been shown the shore.
 *
 * But it applies to low ground only. It used to be a flat two and a half times
 * on everything, which was compensating for a height field that was returning
 * an eighth of the real elevation; with the field fixed, the same multiplier
 * would put Madeira's peak at four thousand metres. So the exaggeration is now
 * faded out as the ground rises, and a mountain is drawn very nearly true.
 *
 * The beach itself is never lifted: the shoreline has to meet the water at the
 * water, or the coast stands on a cliff of its own making. The exaggeration
 * comes in over the first band inland.
 */
const LAND_LIFT = 2.4;

/** Above this height the land is drawn at its true scale. */
const LIFT_FADES_BY = 700;

/**
 * How far inland the band may run before it has walked off the far side.
 *
 * The bands used to march a fixed nine miles inland from every segment of
 * coast, which is fine for Africa and wrong for everything smaller than
 * eighteen miles across: on Madeira, twelve miles wide, the band raised off the
 * north coast and the band raised off the south coast shot straight past each
 * other and out into the open sea beyond. One vertex in ten of the "land" was
 * standing over water, which is the thing that looked like a slab floating
 * above the surface. The band is now measured against the land actually under
 * it and compressed to fit, so it always stops at the far shore — and a small
 * island gets all six bands across its real width, which is what finally gives
 * it a profile.
 */
const MIN_BAND_DEPTH = 700;

/**
 * How much the slope is exaggerated when building the normals.
 *
 * The same argument as LAND_LIFT, applied to the shading rather than the
 * outline: ground that climbs three hundred metres over four miles stands at
 * two and a half degrees, and two and a half degrees of Lambert is a flat
 * wash. Steepening what the light sees — not what the silhouette shows — puts
 * the modelling back without moving the coast.
 */
const SLOPE_RELIEF = 7;

const EARTH_RADIUS_M = 6371000;

/** Grid for looking up the drawn land's height, metres. */
const GROUND_CELL = 1000;

/**
 * How far the earth's curve hides a point, in metres, at a given distance from
 * an eye a given height above the water.
 *
 * The sea is drawn as a flat plane, which is the right approximation for water
 * the ship is sailing on, but land is not: without this a beach fifty miles off
 * is drawn at sea level, which on a flat plane is exactly the horizon, and it
 * comes out as a bright hairline ruled along the skyline. Sinking the terrain by
 * the curve instead puts it where it belongs — hull-down, high ground first —
 * so a landfall opens as it really does, a peak lifting out of the sea long
 * before the shore beneath it is anywhere in sight.
 *
 * But the drop is measured from the *horizon*, not from the ship. Nothing this
 * side of the horizon is hidden by the curve at all — that is what a horizon
 * is — and sinking it anyway drowned the near shore in the flat sea plane and
 * drew the waterline a mile inland of where the waterline is. A player then
 * steers confidently at what looks like open water and takes the ground in it,
 * which is exactly the complaint, and the model was innocent: she strikes four
 * metres from the coastline, and the picture was putting that coastline in the
 * wrong place.
 *
 * From twenty metres up the horizon is about eight and a half miles, so the
 * beach is drawn honestly out to there and hull-down beyond it.
 */
/**
 * How much of a vertex survives the haze, from 1 close to 0 at the far edge of
 * what is built.
 *
 * The band of coast is built out to a fixed range and simply stopped there, so
 * the whole far edge of a continent used to arrive at once, fully lit, the
 * moment the ship came close enough for it to be inside the circle — the coast
 * of Africa appearing out of nothing along a straight line. Fading the last
 * third of the range to nothing means the land is already gone before the
 * boundary is reached, so what crosses it is invisible and there is nothing to
 * see arrive. It is also simply what distance does to land.
 */
function hazeAt(distanceM: number, rangeNm: number): number {
  const rangeM = rangeNm * 1852;
  const from = rangeM * 0.55;
  const to = rangeM * 0.97;
  if (distanceM <= from) return 1;
  if (distanceM >= to) return 0;
  const t = (distanceM - from) / (to - from);
  // Smooth at both ends, so neither the near edge of the fade nor the far one
  // draws a line across the sea.
  return 1 - t * t * (3 - 2 * t);
}

function curvatureDrop(distanceM: number, eyeM: number): number {
  const horizonM = Math.sqrt(2 * EARTH_RADIUS_M * Math.max(eyeM, 1.5));
  const beyond = Math.max(distanceM - horizonM, 0);
  return (beyond * beyond) / (2 * EARTH_RADIUS_M);
}

interface Segment {
  aLat: number; aLon: number;
  bLat: number; bLon: number;
  land: number;
  /** +1 or -1: which perpendicular points into the land. */
  inward: number;
  /**
   * The ring vertices either side of this one, and whether each end of the
   * drawn piece is a real corner of the coast or just where the sighting
   * circle cut it. Only a real corner is mitred — see {@link Land.rebuild}.
   */
  prevLat: number; prevLon: number;
  nextLat: number; nextLon: number;
  cornerA: boolean; cornerB: boolean;
  /**
   * Which ring segment this piece was cut from, and where along it, so things
   * standing on the coast can be placed at fixed points on the earth rather
   * than at fixed points on whatever piece the sighting circle happened to cut.
   */
  ringIdx: number;
  u0: number; u1: number;
  fullALat: number; fullALon: number;
  fullBLat: number; fullBLon: number;
}

/** How far off the trees and cliffs are drawn at all, metres. */
const SCENERY_RANGE = 21000;
/**
 * How much bigger than life the things on the coast are drawn. The same
 * argument as LAND_LIFT: a real palm at five miles is a pixel.
 */
const PROP_LIFT = 2.2;

/**
 * Coastline terrain.
 *
 * Only a band along the shore is built, because from a ship's deck that is all
 * anyone can see: the beach, the ground behind it, and the hills beyond that,
 * fading into haze. The interior of a continent is never in view, so it is
 * never built.
 */
export class Land {
  group = new THREE.Group();

  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshLambertMaterial;
  private surfMaterial: THREE.MeshBasicMaterial;
  private surf: THREE.Mesh | null = null;
  private inwardCache = new Map<string, number>();
  private depthCache = new Map<string, number>();
  private lastOrigin: LatLon = { lat: 999, lon: 999 };
  private lastRangeNm = 0;
  /** Height of the eye above the water, which decides where the horizon is. */
  private eyeM = 20;
  /** Palms, forest, dunes and cliffs. See render/coastScenery. */
  private scenery = new CoastScenery();

  constructor() {
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      // Land carries its own fade in the alpha of its vertex colours, so the
      // far edge of the built band dissolves into the haze instead of ending.
      transparent: true,
      depthWrite: true,
    });
    this.group.add(this.scenery.group);
    this.surfMaterial = new THREE.MeshBasicMaterial({
      color: 0xdfeef2, transparent: true, opacity: 0.55, depthWrite: false,
    });
  }

  /**
   * Slide the built band under the ship between rebuilds.
   *
   * The scene is drawn round the ship, and the band is built in metres from
   * wherever she was when it was last rebuilt — but nothing moved it after
   * that. So for the quarter mile between rebuilds the coast sailed along with
   * her, fixed to the ship, and then jumped a quarter of a mile at once when the
   * next rebuild caught up: a coastline that advanced in steps rather than going
   * by. This carries it the ship's own displacement since the build, every
   * frame, by the same projection the build used, so between rebuilds it moves
   * exactly as the land would and the rebuild itself lands on the same place.
   */
  follow(pos: LatLon): void {
    if (this.lastOrigin.lat > 900) return;
    const mPerDegLat = NM * 60;
    const mPerDegLon = mPerDegLat * Math.max(cosd(this.lastOrigin.lat), 1e-6);
    this.group.position.x = -wrap180(pos.lon - this.lastOrigin.lon) * mPerDegLon;
    this.group.position.z = (pos.lat - this.lastOrigin.lat) * mPerDegLat;
  }

  /** True when the terrain needs rebuilding for the ship's new position. */
  needsRebuild(origin: LatLon, rangeNm: number, eyeM: number): boolean {
    const dLat = Math.abs(origin.lat - this.lastOrigin.lat) * 60;
    const dLon = Math.abs(wrap180(origin.lon - this.lastOrigin.lon)) * 60 * cosd(origin.lat);
    // Two and a half miles between rebuilds is nothing in open water and far
    // too much with the land aboard: the coast is then drawn where it was two
    // and a half miles ago, which at the fast clock rates is a beach that sits
    // visibly out ahead of the ship while she is already on it. Where there is
    // land in the mesh at all, it is rebuilt every quarter mile — about a
    // millisecond of work, and only ever while closing a coast.
    const step = this.mesh ? 0.25 : 2.5;
    return Math.hypot(dLat, dLon) > step || Math.abs(rangeNm - this.lastRangeNm) > 8
      // Going aloft moves the horizon, and the horizon is where the coast is
      // cut off, so the band has to be built again for the new eye.
      || Math.abs(eyeM - this.eyeM) > 4;
  }

  rebuild(origin: LatLon, rangeNm: number, eyeM: number): void {
    this.lastOrigin = { ...origin };
    this.lastRangeNm = rangeNm;
    this.eyeM = eyeM;

    const segments = this.segmentsNear(origin, rangeNm);
    this.clear();
    this.scenery.begin();
    try {
      this.build(origin, rangeNm, eyeM, segments);
    } finally {
      this.scenery.end();
    }
  }

  private build(origin: LatLon, rangeNm: number, eyeM: number, segments: Segment[]): void {
    if (segments.length === 0) return;

    const positions: number[] = [];
    const normals: number[] = [];
    // Four components: the fourth is how much of this vertex the haze has
    // eaten. See `hazeAt`.
    const colors: number[] = [];
    const indices: number[] = [];
    const surfPositions: number[] = [];
    const surfIndices: number[] = [];

    const mPerDegLat = NM * 60;
    const mPerDegLon = mPerDegLat * Math.max(cosd(origin.lat), 1e-6);

    // Towns are built on the smooth field, so the folds are laid flat where a
    // town stands, or its houses would hang off the tops of the ridges.
    const towns = portsNear(origin, rangeNm + 5).map(({ def }) => anchorageOf(def));
    const settled = (lat: number, lon: number): number => {
      let m = 1;
      for (const t of towns) {
        const d = Math.hypot((lat - t.lat) * mPerDegLat, wrap180(lon - t.lon) * mPerDegLon);
        m = Math.min(m, clamp((d - 2600) / 1600, 0, 1));
      }
      return m;
    };

    const hills = townHillsNear(origin, rangeNm);
    const hillAt = (lat: number, lon: number): number => {
      let h = 0;
      for (const hl of hills) {
        const d = Math.hypot((lat - hl.lat) * mPerDegLat, wrap180(lon - hl.lon) * mPerDegLon) / hl.radiusM;
        h += hl.height * Math.exp(-d * d * 1.6);
      }
      return h;
    };
    const drawnHeights: number[] = [];

    const toLocal = (lat: number, lon: number): [number, number] => [
      wrap180(lon - origin.lon) * mPerDegLon,
      -(lat - origin.lat) * mPerDegLat,
    ];

    for (const seg of segments) {
      const [ax, az] = toLocal(seg.aLat, seg.aLon);
      const [bx, bz] = toLocal(seg.bLat, seg.bLon);

      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;

      // Perpendicular pointing inland.
      const nx = (-dz / len) * seg.inward;
      const nz = (dx / len) * seg.inward;

      // Mitred at the corners of the coast.
      //
      // Each segment used to raise its band on its own perpendicular, and the
      // band runs seventeen kilometres inland — so at every bend in the coast
      // the two neighbouring bands splayed apart and left a wedge of open sky
      // cut clean through the middle of a continent, which is precisely what a
      // continent does not do. A shared corner now uses the average of the two
      // perpendiculars, lengthened by the secant of the half-angle so the two
      // bands meet exactly, the way a mitred joint does. Only real corners are
      // mitred: an end that is merely where the sighting circle cut the segment
      // has no neighbour to meet.
      const mitre = (
        px: number, pz: number, otherLat: number, otherLon: number, corner: boolean,
        // +1 when the neighbouring segment runs *into* this corner (the vertex
        // before A), -1 when it runs out of it (the vertex after B). Getting
        // this backwards reverses the neighbour's perpendicular and mitres the
        // joint the wrong way, which opens the gap instead of closing it.
        toward: number,
      ): [number, number] => {
        if (!corner) return [nx, nz];
        const [ox, oz] = toLocal(otherLat, otherLon);
        const ex = (px - ox) * toward, ez = (pz - oz) * toward;
        const elen = Math.hypot(ex, ez);
        if (elen < 1) return [nx, nz];
        const mx = (-ez / elen) * seg.inward;
        const mz = (ex / elen) * seg.inward;
        let sx = nx + mx, sz = nz + mz;
        const slen = Math.hypot(sx, sz);
        if (slen < 1e-6) return [nx, nz];
        sx /= slen; sz /= slen;
        // 1/cos(half-angle), capped so a hairpin does not throw the band out
        // to the far side of the world. Kept tight: a long mitre at a sharp
        // headland slides the inland vertices sideways off the land and leaves
        // them standing over open water.
        const scale = Math.min(1 / Math.max(sx * nx + sz * nz, 1e-3), 1.6);
        return [sx * scale, sz * scale];
      };
      const [naX, naZ] = mitre(ax, az, seg.prevLat, seg.prevLon, seg.cornerA, 1);
      const [nbX, nbZ] = mitre(bx, bz, seg.nextLat, seg.nextLon, seg.cornerB, -1);

      const base = positions.length / 3;
      const relief = LANDMASSES[seg.land].relief;
      // The Atlantic islands are green whatever their latitude says: Madeira
      // was named for its forests, and the Azores are the wettest land a
      // Portuguese ship ever raised. Drawn by the latitude alone they came out
      // the same dun as the Barbary coast across the water.
      const lush = regionAt((seg.aLat + seg.bLat) / 2, (seg.aLon + seg.bLon) / 2).name === 'islands' ? 1 : 0;

      // How much of the band this piece of coast has room for. Measured at
      // both ends and the narrower taken, or the far end of a piece running
      // onto a point of land walks out over the water beyond it.
      const depth = Math.min(
        this.landDepth(seg.aLat, seg.aLon, naX, naZ, mPerDegLat, mPerDegLon),
        this.landDepth(seg.bLat, seg.bLon, nbX, nbZ, mPerDegLat, mPerDegLon),
      );
      const bandScale = clamp(depth / BANDS[BANDS.length - 1], 0, 1);

      // Heights first, then normals from them.
      //
      // computeVertexNormals() gave this mesh normals that were all but
      // straight up: the bands are hundreds of metres apart on the ground and
      // the ground climbs a few hundred metres over miles, so every face is
      // within a few degrees of flat and Lambert shaded the whole coast one
      // even tone — cut paper, with no modelling anywhere on it. The gradient
      // of the height field is known exactly here, so the normals are built
      // from it and the slope is exaggerated to the same end as the heights.
      const strip: { x: number; z: number; h: number; lat: number; lon: number }[] = [];

      for (let b = 0; b < BANDS.length; b++) {
        const inland = BANDS[b] * bandScale;
        for (const [px, pz, ex, ez] of [
          [ax, az, naX, naZ], [bx, bz, nbX, nbZ],
        ] as const) {
          const x = px + ex * inland;
          const z = pz + ez * inland;
          // Sample the real elevation field at this inland point.
          const lat = origin.lat - z / mPerDegLat;
          const lon = origin.lon + x / mPerDegLon;
          const h = b === 0 ? 0.4 : elevationAt({ lat, lon });
          // A coast stands up out of the water within the first mile — dunes,
          // cliffs, the first line of hills — so there is always an edge to see
          // even where the interior is flat.
          //
          // This used to be twenty-two per cent of the peak, which on Madeira
          // came to 409 metres and, lifted, to a flat 1022 — a table-top that
          // beat the real terrain at every point on the island and drew the
          // whole thing as one level plateau. It is now a coastal bluff and
          // nothing more: the height field does the work everywhere else.
          const floor = relief * 0.06 * (1 - Math.exp(-inland / 1200));
          // The height field is smooth at the scale of miles, and from the deck
          // that reads as a painted backdrop: one slope, no spurs, no valleys,
          // nothing for the light to fall into. A little ridged detail on top —
          // drawn only, the chart and the lead never see it — gives a coast its
          // folds. None at the strand, so the shoreline stays where it is.
          const detail = b === 0 ? 0
            : terrainDetail(lat, lon) * (22 + relief * 0.07) * Math.min(inland / 1500, 1) * settled(lat, lon);
          const raw = Math.max(h + detail, floor) + (b === 0 ? 0 : hillAt(lat, lon) * Math.min(inland / 500, 1));
          // Low ground is exaggerated and high ground is left nearly true.
          const exagg = lerp(LAND_LIFT, 1.05, clamp(raw / LIFT_FADES_BY, 0, 1));
          // Eased in over the first band so the shoreline still meets the sea.
          const height = raw * (1 + (exagg - 1) * Math.min(inland / 900, 1));
          positions.push(x, height - curvatureDrop(Math.hypot(x, z), eyeM), z);
          drawnHeights.push(height);
          strip.push({ x, z, h: height, lat, lon });

          // The strand: a pale edge where the ground meets the water, so the
          // coastline itself is a thing on the screen rather than the place two
          // shades of haze happen to meet.
          const tint = b === 0 ? BAND_TINT[0] * 1.5 : BAND_TINT[b];
          // Vegetation and rock tinted by latitude: desert coasts are pale,
          // equatorial ones green, southern capes brown and scrubby.
          const c = groundColour(lat, height, relief);
          if (lush) c.lerp(LUSH, 0.55 * (1 - clamp(height / Math.max(relief, 1), 0, 1) * 0.6));
          colors.push(c.r * tint, c.g * tint, c.b * tint, hazeAt(Math.hypot(x, z), rangeNm));
        }
      }

      // Normals from the height field's own gradient, inland and alongshore.
      const alongLen = Math.max(len, 1);
      for (let b = 0; b < BANDS.length; b++) {
        for (let side = 0; side < 2; side++) {
          const here = strip[b * 2 + side];
          const lo = strip[Math.max(b - 1, 0) * 2 + side];
          const hi = strip[Math.min(b + 1, BANDS.length - 1) * 2 + side];
          const run = Math.max(Math.hypot(hi.x - lo.x, hi.z - lo.z), 1);
          // Slope going inland, and slope running along the shore.
          const gIn = (hi.h - lo.h) / run;
          const gAlong = (strip[b * 2 + 1].h - strip[b * 2].h) / alongLen;
          // The inward and alongshore unit vectors this vertex is measured on.
          const ix = side === 0 ? naX : nbX;
          const iz = side === 0 ? naZ : nbZ;
          const ilen = Math.max(Math.hypot(ix, iz), 1e-6);
          const ux = ix / ilen, uz = iz / ilen;
          const sx = dx / alongLen, sz = dz / alongLen;
          // Exaggerated to match the heights: a real coast at this range slopes
          // a few degrees, and a few degrees of Lambert is no modelling at all.
          const k = SLOPE_RELIEF;
          // Bare ground where it is steep: grass and scrub do not hold on a
          // cliff, and a coast's rock faces are what a pilot draws in his
          // panorama. Measured on the true slope, not the exaggerated one.
          const steep = clamp((Math.hypot(gIn, gAlong) - 0.2) / 0.35, 0, 1) * (b === 0 ? 0 : 0.8);
          if (steep > 0) {
            const ci = (base + b * 2 + side) * 4;
            const t = BAND_TINT[b];
            colors[ci] = lerp(colors[ci], ROCK.r * t, steep * 0.7);
            colors[ci + 1] = lerp(colors[ci + 1], ROCK.g * t, steep * 0.7);
            colors[ci + 2] = lerp(colors[ci + 2], ROCK.b * t, steep * 0.7);
          }
          let nX = -(gIn * k) * ux - (gAlong * k) * sx;
          let nZ = -(gIn * k) * uz - (gAlong * k) * sz;
          let nY = 1;
          const nl = Math.hypot(nX, nY, nZ) || 1;
          normals.push(nX / nl, nY / nl, nZ / nl);
          void here;
        }
      }

      this.dress(seg, strip, bandScale, ax, az, bx, bz, naX, naZ, nbX, nbZ, origin, rangeNm, eyeM);

      for (let b = 0; b < BANDS.length - 1; b++) {
        const i0 = base + b * 2;
        const i1 = i0 + 1;
        const i2 = i0 + 2;
        const i3 = i0 + 3;
        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }

      // A strip of surf just seaward of the shoreline. It sinks with the curve
      // like everything else ashore, so it drops out of sight long before the
      // headland behind it does — and it is not drawn at all beyond a few
      // miles, because surf is not visible from a few miles and a bright line
      // of it along a hazed-out coast is the whole pop-in problem again.
      if (Math.min(Math.hypot(ax, az), Math.hypot(bx, bz)) > 15 * 1852) continue;
      const sBase = surfPositions.length / 3;
      const outward = 130;
      const cx = ax - nx * outward, cz = az - nz * outward;
      const dx2 = bx - nx * outward, dz2 = bz - nz * outward;
      surfPositions.push(ax, 0.35 - curvatureDrop(Math.hypot(ax, az), eyeM), az);
      surfPositions.push(bx, 0.35 - curvatureDrop(Math.hypot(bx, bz), eyeM), bz);
      surfPositions.push(cx, 0.3 - curvatureDrop(Math.hypot(cx, cz), eyeM), cz);
      surfPositions.push(dx2, 0.3 - curvatureDrop(Math.hypot(dx2, dz2), eyeM), dz2);
      surfIndices.push(sBase, sBase + 2, sBase + 1);
      surfIndices.push(sBase + 1, sBase + 2, sBase + 3);
    }

    if (indices.length === 0) return;
    this.indexGround(origin, positions, drawnHeights, indices);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 1;
    this.group.add(this.mesh);

    const surfGeo = new THREE.BufferGeometry();
    surfGeo.setAttribute('position', new THREE.Float32BufferAttribute(surfPositions, 3));
    surfGeo.setIndex(surfIndices);
    surfGeo.computeBoundingSphere();
    this.surf = new THREE.Mesh(surfGeo, this.surfMaterial);
    this.surf.renderOrder = 3;
    this.group.add(this.surf);
  }

  /**
   * Put the region's trees, dunes and cliffs on this piece of coast.
   *
   * Slots are counted from the start of the whole ring segment, so a palm is
   * always the same palm however the segment was cut; heights are read off the
   * same band strip the mesh was built from, so nothing floats or sinks.
   */
  private dress(
    seg: Segment, strip: { x: number; z: number; h: number }[], bandScale: number,
    ax: number, az: number, bx: number, bz: number,
    naX: number, naZ: number, nbX: number, nbZ: number,
    origin: LatLon, rangeNm: number, eyeM: number,
  ): void {
    if (Math.min(Math.hypot(ax, az), Math.hypot(bx, bz)) > SCENERY_RANGE) return;
    const mPerDegLat = NM * 60;
    const cosLat = Math.max(cosd(origin.lat), 1e-6);
    const fullLen = Math.hypot(
      wrap180(seg.fullBLon - seg.fullALon) * mPerDegLat * cosLat,
      (seg.fullBLat - seg.fullALat) * mPerDegLat,
    );
    if (fullLen < 1 || seg.u1 <= seg.u0) return;
    const region = regionAt((seg.aLat + seg.bLat) / 2, (seg.aLon + seg.bLon) / 2);
    const ringKey = seg.land * 100003 + seg.ringIdx;
    const dx = bx - ax, dz = bz - az;
    const along = Math.hypot(dx, dz) || 1;
    const ux = dx / along, uz = dz / along;
    const shoreYaw = Math.atan2(-uz, ux);
    const maxIn = BANDS[BANDS.length - 1] * bandScale;

    region.layers.forEach((layer, li) => {
      const from = Math.ceil((seg.u0 * fullLen) / layer.spacing);
      const to = Math.ceil((seg.u1 * fullLen) / layer.spacing);
      for (let k = from; k < to; k++) {
        const roll = hash3(ringKey, k, li * 7 + 1);
        if (roll > layer.chance) continue;
        const r1 = hash3(ringKey, k, li * 7 + 2);
        const r2 = hash3(ringKey, k, li * 7 + 3);
        const r3 = hash3(ringKey, k, li * 7 + 4);
        const u = (k * layer.spacing) / fullLen;
        const w = clamp((u - seg.u0) / (seg.u1 - seg.u0), 0, 1);
        const inland = lerp(layer.inland[0], layer.inland[1], r1 * r1);
        if (inland > maxIn * 0.97) continue;
        // Which band it stands in, and how far across.
        let b = 0;
        while (b < BANDS.length - 2 && BANDS[b + 1] * bandScale < inland) b++;
        const b0 = BANDS[b] * bandScale;
        const b1 = Math.max(BANDS[b + 1] * bandScale, b0 + 1e-3);
        const f = clamp((inland - b0) / (b1 - b0), 0, 1);
        const h00 = strip[b * 2].h, h01 = strip[b * 2 + 1].h;
        const h10 = strip[(b + 1) * 2].h, h11 = strip[(b + 1) * 2 + 1].h;
        const ground = lerp(lerp(h00, h01, w), lerp(h10, h11, w), f);
        const nX = lerp(naX, nbX, w), nZ = lerp(naZ, nbZ, w);
        const x = ax + dx * w + nX * inland;
        const z = az + dz * w + nZ * inland;
        const dist = Math.hypot(x, z);
        if (dist > SCENERY_RANGE) continue;
        const height = lerp(layer.height[0], layer.height[1], r2) * PROP_LIFT;
        const width = height * lerp(layer.aspect[0], layer.aspect[1], r3);
        const long = layer.kind === 'cliff' || layer.kind === 'dune';
        const yaw = long ? shoreYaw + (r2 - 0.5) * 0.3 : r3 * Math.PI * 2;
        const shade = 1 + (r1 - 0.5) * 2 * (layer.vary ?? 0.1);
        // Fading out well before the edge of what is dressed, so trees are
        // never seen to arrive.
        const fade = hazeAt(dist, rangeNm) * clamp((SCENERY_RANGE - dist) / 5000, 0, 1);
        this.scenery.place(
          layer.kind, x, ground - curvatureDrop(dist, eyeM) - 1.5, z, yaw,
          width, height, long ? width : width,
          layer.colour, shade, fade,
        );
      }
    });
  }

  /** Triangles of the drawn land, bucketed on a grid, for asking its height. */
  private ground: {
    origin: LatLon; xs: Float32Array; zs: Float32Array; hs: Float32Array;
    tris: Uint32Array; cells: Map<number, number[]>;
  } | null = null;

  private indexGround(origin: LatLon, positions: number[], heights: number[], indices: number[]): void {
    const n = heights.length;
    const xs = new Float32Array(n), zs = new Float32Array(n), hs = new Float32Array(heights);
    for (let i = 0; i < n; i++) { xs[i] = positions[i * 3]; zs[i] = positions[i * 3 + 2]; }
    const cells = new Map<number, number[]>();
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t], b = indices[t + 1], c = indices[t + 2];
      const x0 = Math.floor(Math.min(xs[a], xs[b], xs[c]) / GROUND_CELL);
      const x1 = Math.floor(Math.max(xs[a], xs[b], xs[c]) / GROUND_CELL);
      const z0 = Math.floor(Math.min(zs[a], zs[b], zs[c]) / GROUND_CELL);
      const z1 = Math.floor(Math.max(zs[a], zs[b], zs[c]) / GROUND_CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 400) continue;
      for (let i = x0; i <= x1; i++) {
        for (let j = z0; j <= z1; j++) {
          const key = i * 100003 + j;
          let list = cells.get(key);
          if (!list) { list = []; cells.set(key, list); }
          list.push(t);
        }
      }
    }
    this.ground = { origin: { ...origin }, xs, zs, hs, tris: new Uint32Array(indices), cells };
  }

  /**
   * The height of the ground as it is drawn here, without the earth's curve,
   * or null if this is not on the land that is built.
   */
  groundAt(lat: number, lon: number): number | null {
    const g = this.ground;
    if (!g) return null;
    const mPerDegLat = NM * 60;
    const mPerDegLon = mPerDegLat * Math.max(cosd(g.origin.lat), 1e-6);
    const x = wrap180(lon - g.origin.lon) * mPerDegLon;
    const z = -(lat - g.origin.lat) * mPerDegLat;
    const list = g.cells.get(Math.floor(x / GROUND_CELL) * 100003 + Math.floor(z / GROUND_CELL));
    if (!list) return null;
    for (const t of list) {
      const a = g.tris[t], b = g.tris[t + 1], c = g.tris[t + 2];
      const x0 = g.xs[a], z0 = g.zs[a];
      const d1x = g.xs[b] - x0, d1z = g.zs[b] - z0, d2x = g.xs[c] - x0, d2z = g.zs[c] - z0;
      const det = d1x * d2z - d2x * d1z;
      if (Math.abs(det) < 1e-6) continue;
      const px = x - x0, pz = z - z0;
      const u = (px * d2z - d2x * pz) / det;
      const v = (d1x * pz - px * d1z) / det;
      if (u < -1e-4 || v < -1e-4 || u + v > 1 + 1e-4) continue;
      return g.hs[a] + (g.hs[b] - g.hs[a]) * u + (g.hs[c] - g.hs[a]) * v;
    }
    return null;
  }

  /**
   * The pieces of coastline actually within sight, clipped to the horizon.
   *
   * Each segment is clipped against the circle of visibility rather than merely
   * tested for it. A coastline ring's segments run for whole degrees at a time,
   * so rejecting them by their midpoints keeps every segment whose middle is
   * anywhere near — and then builds the entire thing, hundreds of miles of it,
   * stretching away past the horizon. From the middle of the Atlantic that draws
   * the coast of Africa as a hairline right along the skyline.
   */
  private segmentsNear(origin: LatLon, nm: number): Segment[] {
    const out: Segment[] = [];
    const cosLat = Math.max(cosd(origin.lat), 0.2);
    // Local coordinates in nautical miles, east and north of the ship.
    const toNm = (lat: number, lon: number): [number, number] =>
      [wrap180(lon - origin.lon) * 60 * cosLat, (lat - origin.lat) * 60];
    const toLatLon = (x: number, y: number): [number, number] =>
      [origin.lat + y / 60, origin.lon + x / (60 * cosLat)];

    for (let li = 0; li < LANDMASSES.length; li++) {
      const ring = LANDMASSES[li].ring;
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const aLat = ring[i * 2], aLon = ring[i * 2 + 1];
        const bLat = ring[j * 2], bLon = ring[j * 2 + 1];

        const [ax, ay] = toNm(aLat, aLon);
        const [bx, by] = toNm(bLat, bLon);
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-9) continue;

        // Where the segment crosses the circle of radius nm about the ship.
        // Solving |a + t d| = nm for t, and keeping the part inside.
        const b2 = ax * dx + ay * dy;
        const c = ax * ax + ay * ay - nm * nm;
        const disc = b2 * b2 - lenSq * c;
        if (disc <= 0) continue;
        const root = Math.sqrt(disc);
        const t0 = Math.max((-b2 - root) / lenSq, 0);
        const t1 = Math.min((-b2 + root) / lenSq, 1);
        if (t1 <= t0) continue;

        const h = (i + n - 1) % n;
        const k = (j + 1) % n;
        const inward = this.inwardFor(li, i, aLat, aLon, bLat, bLon);

        // Cut the visible piece into lengths the eye can read.
        //
        // A coastline ring runs for whole degrees between vertices — forty
        // miles and more — and each piece was drawn as one quad per band. So a
        // continent was four flat ribbons, its elevation sampled at two points
        // forty miles apart, and there was no coast *shape* anywhere in it: no
        // bay, no headland, nothing for the eye to fix on. Cut to about a mile
        // and a half, the same ring becomes ground with a profile, and the
        // height field it is already sampling starts to show.
        const spanNm = Math.hypot(dx, dy) * (t1 - t0);
        const pieces = clamp(Math.ceil(spanNm / 1.5), 1, 80);
        for (let q = 0; q < pieces; q++) {
          const u0 = t0 + ((t1 - t0) * q) / pieces;
          const u1 = t0 + ((t1 - t0) * (q + 1)) / pieces;
          const [pALat, pALon] = toLatLon(ax + dx * u0, ay + dy * u0);
          const [pBLat, pBLon] = toLatLon(ax + dx * u1, ay + dy * u1);
          out.push({
            aLat: pALat, aLon: pALon, bLat: pBLat, bLon: pBLon, land: li,
            // Taken from the whole segment, whose orientation clipping does not change.
            inward,
            prevLat: ring[h * 2], prevLon: ring[h * 2 + 1],
            nextLat: ring[k * 2], nextLon: ring[k * 2 + 1],
            // Only the true ends of the ring segment are corners of the coast;
            // the cuts between pieces are straight through and must not be
            // mitred, or every one of them kinks the band.
            cornerA: q === 0 && u0 <= 1e-9,
            cornerB: q === pieces - 1 && u1 >= 1 - 1e-9,
            ringIdx: i, u0, u1,
            fullALat: aLat, fullALon: aLon, fullBLat: bLat, fullBLon: bLon,
          });
        }
      }
    }
    return out;
  }

  /**
   * How far the land runs inland from this point before the far shore, in
   * metres, capped at the depth of the widest band.
   *
   * Marched rather than derived, because the only thing that knows where the
   * land stops is the ring itself. The march stops at the *first* exit so a bay
   * or a strait is never jumped: a band that leapt a sound would put ground
   * across open water a ship can sail through, which is worse than stopping
   * short.
   */
  private landDepth(
    lat: number, lon: number, nx: number, nz: number,
    mPerDegLat: number, mPerDegLon: number,
  ): number {
    const full = BANDS[BANDS.length - 1];
    // Cached on a coarse grid — a tenth of a minute of arc, about 200 metres —
    // because rebuild() runs every quarter mile and asks for the same stretch
    // of coast each time.
    const key = `${Math.round(lat * 600)}:${Math.round(lon * 600)}`;
    const hit = this.depthCache.get(key);
    if (hit !== undefined) return hit;

    const STEPS = 12;
    let depth = MIN_BAND_DEPTH;
    for (let s = 1; s <= STEPS; s++) {
      const d = (full * s) / STEPS;
      const q = {
        lat: lat - (nz * d) / mPerDegLat,
        lon: lon + (nx * d) / mPerDegLon,
      };
      if (!isLand(q)) break;
      depth = d;
    }
    if (this.depthCache.size > 20000) this.depthCache.clear();
    this.depthCache.set(key, depth);
    return depth;
  }

  /**
   * Which perpendicular points into the land. Determined once per segment by
   * probing, because the coastline rings are not wound consistently.
   */
  private inwardFor(
    land: number, index: number,
    aLat: number, aLon: number, bLat: number, bLon: number,
  ): number {
    const key = `${land}:${index}`;
    const hit = this.inwardCache.get(key);
    if (hit !== undefined) return hit;

    const midLat = (aLat + bLat) / 2;
    const midLon = (aLon + bLon) / 2;
    const dLat = bLat - aLat;
    const dLon = (bLon - aLon) * cosd(midLat);
    const len = Math.hypot(dLat, dLon) || 1e-9;
    // Perpendicular in degrees, stepped a short way in.
    const probe = 0.06;
    const pLat = (-dLon / len) * probe;
    const pLon = ((dLat / len) * probe) / Math.max(cosd(midLat), 1e-6);

    const plus = isLand({ lat: midLat + pLat, lon: midLon + pLon });
    const minus = isLand({ lat: midLat - pLat, lon: midLon - pLon });
    const inward = plus && !minus ? 1 : minus && !plus ? -1 : 1;
    this.inwardCache.set(key, inward);
    return inward;
  }

  setFog(color: THREE.Color, intensity: number): void {
    this.scenery.setFog(color, intensity);
    this.material.color.setRGB(1, 1, 1).lerp(color, clamp(intensity, 0, 0.7));
    this.surfMaterial.opacity = 0.55 * (1 - clamp(intensity, 0, 0.8));
  }

  clear(): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    if (this.surf) {
      this.group.remove(this.surf);
      this.surf.geometry.dispose();
      this.surf = null;
    }
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.surfMaterial.dispose();
  }
}

const ROCK = new THREE.Color(0.47, 0.41, 0.35);
const LUSH = new THREE.Color(0.20, 0.40, 0.15);

/** Smooth value noise on a lattice, -1 to 1. */
function valueNoise(x: number, y: number, salt: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (i: number, j: number) => hash3(xi + i, yi + j, salt) * 2 - 1;
  return lerp(lerp(h(0, 0), h(1, 0), u), lerp(h(0, 1), h(1, 1), u), v);
}

/**
 * Ridges and gullies at the scale a deck can see, from a few hundred metres to
 * a few miles, -1 to 1. Fixed to the earth, so the same spur is on the same
 * headland every time the band is rebuilt.
 */
function terrainDetail(lat: number, lon: number): number {
  const x = lon * 111 * Math.max(cosd(lat), 0.2), y = lat * 111; // kilometres
  let sum = 0, amp = 1, norm = 0, f = 1 / 4.5;
  for (let o = 0; o < 4; o++) {
    // Ridged: folded about zero, so the tops are sharp and the valleys round.
    const n = 1 - Math.abs(valueNoise(x * f, y * f, 911 + o * 17));
    sum += (n * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

function groundColour(lat: number, height: number, relief: number): THREE.Color {
  const a = Math.abs(lat);
  // Desert belts around the tropics, green near the equator and in the temperate zones.
  const desert = Math.exp(-Math.pow((a - 24) / 9, 2));
  const equatorial = Math.exp(-Math.pow(lat / 11, 2));
  const temperate = clamp((a - 33) / 14, 0, 1);

  // The coast, in the colours it actually is.
  //
  // These were mixed to be safe and came out as four shades of the same olive:
  // at any distance the Guinea forest, the Sahel scrub and the Barbary sand all
  // resolved to one dun mass with no edge between them. The whole point of
  // running down this coast is watching it change — a thousand miles of desert
  // that turns green in an afternoon at Cabo Verde — and that only reads if the
  // sand is really sand-coloured and the forest is really green.
  const sand = new THREE.Color(0.88, 0.76, 0.50);
  const jungle = new THREE.Color(0.11, 0.34, 0.11);
  const scrub = new THREE.Color(0.52, 0.47, 0.22);
  const green = new THREE.Color(0.24, 0.45, 0.18);

  const c = new THREE.Color();
  c.copy(scrub)
    .lerp(sand, desert * 0.85)
    .lerp(jungle, equatorial * 0.8)
    .lerp(green, temperate * 0.6);

  // Bare rock high up, measured against the land's own peak.
  //
  // The divisor used to be 0.55 of the relief, which happened to be exactly the
  // height of the flat plateau the mesh was building — so every island came out
  // at the top of this scale and was drawn as bare rock under a snow cap, one
  // even grey from the beach to the skyline. Against the true peak, rock
  // appears where there is rock.
  const alt = clamp(height / Math.max(relief, 1), 0, 1);
  // Rock, which is warmer and browner than the neutral grey it was.
  c.lerp(new THREE.Color(0.50, 0.42, 0.34), clamp((alt - 0.35) / 0.5, 0, 1) * 0.6);

  // Snow, where there is any. On a real summit, not a fraction of one: Madeira
  // stands 1861 metres over a subtropical sea and has none, and drawing a cap
  // on it was most of why it read as a white slab.
  const snowline = 2400 - clamp((Math.abs(lat) - 30) / 30, 0, 1) * 1400;
  if (height > snowline) {
    c.lerp(new THREE.Color(0.86, 0.87, 0.9), clamp((height - snowline) / 600, 0, 1) * 0.75);
  }

  return c;
}

export { lerp };

import * as THREE from 'three';
import { NM, clamp, cosd, lerp, wrap180, type LatLon } from '../core/math';
import { LANDMASSES, elevationAt, isLand } from '../world/landmass';

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
}

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

  constructor() {
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      // Land carries its own fade in the alpha of its vertex colours, so the
      // far edge of the built band dissolves into the haze instead of ending.
      transparent: true,
      depthWrite: true,
    });
    this.surfMaterial = new THREE.MeshBasicMaterial({
      color: 0xdfeef2, transparent: true, opacity: 0.55, depthWrite: false,
    });
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
          const raw = Math.max(h, floor);
          // Low ground is exaggerated and high ground is left nearly true.
          const exagg = lerp(LAND_LIFT, 1.05, clamp(raw / LIFT_FADES_BY, 0, 1));
          // Eased in over the first band so the shoreline still meets the sea.
          const height = raw * (1 + (exagg - 1) * Math.min(inland / 900, 1));
          positions.push(x, height - curvatureDrop(Math.hypot(x, z), eyeM), z);
          strip.push({ x, z, h: height, lat, lon });

          // The strand: a pale edge where the ground meets the water, so the
          // coastline itself is a thing on the screen rather than the place two
          // shades of haze happen to meet.
          const tint = b === 0 ? BAND_TINT[0] * 1.5 : BAND_TINT[b];
          // Vegetation and rock tinted by latitude: desert coasts are pale,
          // equatorial ones green, southern capes brown and scrubby.
          const c = groundColour(lat, height, relief);
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
          let nX = -(gIn * k) * ux - (gAlong * k) * sx;
          let nZ = -(gIn * k) * uz - (gAlong * k) * sz;
          let nY = 1;
          const nl = Math.hypot(nX, nY, nZ) || 1;
          normals.push(nX / nl, nY / nl, nZ / nl);
          void here;
        }
      }

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

function groundColour(lat: number, height: number, relief: number): THREE.Color {
  const a = Math.abs(lat);
  // Desert belts around the tropics, green near the equator and in the temperate zones.
  const desert = Math.exp(-Math.pow((a - 24) / 9, 2));
  const equatorial = Math.exp(-Math.pow(lat / 11, 2));
  const temperate = clamp((a - 33) / 14, 0, 1);

  const sand = new THREE.Color(0.78, 0.68, 0.48);
  const jungle = new THREE.Color(0.16, 0.32, 0.14);
  const scrub = new THREE.Color(0.42, 0.40, 0.24);
  const green = new THREE.Color(0.26, 0.38, 0.20);

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
  c.lerp(new THREE.Color(0.46, 0.42, 0.38), clamp((alt - 0.35) / 0.5, 0, 1) * 0.6);

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

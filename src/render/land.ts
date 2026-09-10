import * as THREE from 'three';
import { NM, clamp, cosd, lerp, wrap180, type LatLon } from '../core/math';
import { LANDMASSES, elevationAt, isLand } from '../world/landmass';

/** Depth of the rendered coastal band inland, in metres. Beyond this nothing is visible from sea level. */
const BANDS = [0, 320, 1100, 3200, 8000, 17000];
const BAND_TINT = [0.55, 0.62, 0.72, 0.84, 0.95, 1.0];

const EARTH_RADIUS_M = 6371000;

/**
 * How far the earth's curve carries a point below the level of the eye, in
 * metres, at a given distance.
 *
 * The sea is drawn as a flat plane, which is the right approximation for water
 * the ship is sailing on, but land is not: without this a beach fifty miles off
 * is drawn at sea level, which on a flat plane is exactly the horizon, and it
 * comes out as a bright hairline ruled along the skyline. Sinking the terrain by
 * the curve instead puts it where it belongs — hull-down, high ground first —
 * so a landfall opens as it really does, a peak lifting out of the sea long
 * before the shore beneath it is anywhere in sight.
 */
function curvatureDrop(distanceM: number): number {
  return (distanceM * distanceM) / (2 * EARTH_RADIUS_M);
}

interface Segment {
  aLat: number; aLon: number;
  bLat: number; bLon: number;
  land: number;
  /** +1 or -1: which perpendicular points into the land. */
  inward: number;
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
  private lastOrigin: LatLon = { lat: 999, lon: 999 };
  private lastRangeNm = 0;

  constructor() {
    this.material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.surfMaterial = new THREE.MeshBasicMaterial({
      color: 0xdfeef2, transparent: true, opacity: 0.55, depthWrite: false,
    });
  }

  /** True when the terrain needs rebuilding for the ship's new position. */
  needsRebuild(origin: LatLon, rangeNm: number): boolean {
    const dLat = Math.abs(origin.lat - this.lastOrigin.lat) * 60;
    const dLon = Math.abs(wrap180(origin.lon - this.lastOrigin.lon)) * 60 * cosd(origin.lat);
    return Math.hypot(dLat, dLon) > 2.5 || Math.abs(rangeNm - this.lastRangeNm) > 8;
  }

  rebuild(origin: LatLon, rangeNm: number): void {
    this.lastOrigin = { ...origin };
    this.lastRangeNm = rangeNm;

    const segments = this.segmentsNear(origin, rangeNm);
    this.clear();
    if (segments.length === 0) return;

    const positions: number[] = [];
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

      const base = positions.length / 3;
      const relief = LANDMASSES[seg.land].relief;

      for (let b = 0; b < BANDS.length; b++) {
        const inland = BANDS[b];
        for (const [px, pz] of [[ax, az], [bx, bz]] as const) {
          const x = px + nx * inland;
          const z = pz + nz * inland;
          // Sample the real elevation field at this inland point.
          const lat = origin.lat - z / mPerDegLat;
          const lon = origin.lon + x / mPerDegLon;
          const h = b === 0 ? 0.4 : elevationAt({ lat, lon });
          // Guarantee the band rises even where the elevation field is flat.
          const floor = relief * 0.12 * (inland / 17000);
          const height = Math.max(h, floor);
          positions.push(x, height - curvatureDrop(Math.hypot(x, z)), z);

          const tint = BAND_TINT[b];
          // Vegetation and rock tinted by latitude: desert coasts are pale,
          // equatorial ones green, southern capes brown and scrubby.
          const c = groundColour(lat, height, relief);
          colors.push(c.r * tint, c.g * tint, c.b * tint);
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
      // headland behind it does.
      const sBase = surfPositions.length / 3;
      const outward = 130;
      const cx = ax - nx * outward, cz = az - nz * outward;
      const dx2 = bx - nx * outward, dz2 = bz - nz * outward;
      surfPositions.push(ax, 0.35 - curvatureDrop(Math.hypot(ax, az)), az);
      surfPositions.push(bx, 0.35 - curvatureDrop(Math.hypot(bx, bz)), bz);
      surfPositions.push(cx, 0.3 - curvatureDrop(Math.hypot(cx, cz)), cz);
      surfPositions.push(dx2, 0.3 - curvatureDrop(Math.hypot(dx2, dz2)), dz2);
      surfIndices.push(sBase, sBase + 2, sBase + 1);
      surfIndices.push(sBase + 1, sBase + 2, sBase + 3);
    }

    if (indices.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
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

        const [clipALat, clipALon] = toLatLon(ax + dx * t0, ay + dy * t0);
        const [clipBLat, clipBLon] = toLatLon(ax + dx * t1, ay + dy * t1);

        out.push({
          aLat: clipALat, aLon: clipALon, bLat: clipBLat, bLon: clipBLon, land: li,
          // Taken from the whole segment, whose orientation clipping does not change.
          inward: this.inwardFor(li, i, aLat, aLon, bLat, bLon),
        });
      }
    }
    return out;
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

  // Bare rock and, on the highest ground, a paler cap.
  const alt = clamp(height / Math.max(relief * 0.55, 1), 0, 1);
  c.lerp(new THREE.Color(0.46, 0.42, 0.38), alt * 0.55);
  if (alt > 0.85) c.lerp(new THREE.Color(0.82, 0.82, 0.84), (alt - 0.85) / 0.15 * 0.6);

  return c;
}

export { lerp };

import * as THREE from 'three';
import { NM, clamp, cosd, lerp, wrap180, type LatLon } from '../core/math';
import { LANDMASSES, elevationAt, isLand } from '../world/landmass';

/** Depth of the rendered coastal band inland, in metres. Beyond this nothing is visible from sea level. */
const BANDS = [0, 320, 1100, 3200, 8000, 17000];
const BAND_TINT = [0.55, 0.62, 0.72, 0.84, 0.95, 1.0];

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
          positions.push(x, Math.max(h, floor), z);

          const tint = BAND_TINT[b];
          // Vegetation and rock tinted by latitude: desert coasts are pale,
          // equatorial ones green, southern capes brown and scrubby.
          const c = groundColour(lat, Math.max(h, floor), relief);
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

      // A strip of surf just seaward of the shoreline.
      const sBase = surfPositions.length / 3;
      const outward = 130;
      surfPositions.push(ax, 0.35, az);
      surfPositions.push(bx, 0.35, bz);
      surfPositions.push(ax - nx * outward, 0.3, az - nz * outward);
      surfPositions.push(bx - nx * outward, 0.3, bz - nz * outward);
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

  private segmentsNear(origin: LatLon, nm: number): Segment[] {
    const out: Segment[] = [];
    const radiusDeg = nm / 60;
    const lonSpan = radiusDeg / Math.max(cosd(origin.lat), 0.2);

    for (let li = 0; li < LANDMASSES.length; li++) {
      const ring = LANDMASSES[li].ring;
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const aLat = ring[i * 2], aLon = ring[i * 2 + 1];
        const bLat = ring[j * 2], bLon = ring[j * 2 + 1];

        // Cheap bounding rejection on the segment's midpoint and extent.
        const midLat = (aLat + bLat) / 2;
        const midLon = (aLon + bLon) / 2;
        const half = Math.max(Math.abs(aLat - bLat), Math.abs(aLon - bLon)) / 2;
        if (Math.abs(midLat - origin.lat) > radiusDeg + half) continue;
        if (Math.abs(wrap180(midLon - origin.lon)) > lonSpan + half) continue;

        out.push({
          aLat, aLon, bLat, bLon, land: li,
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

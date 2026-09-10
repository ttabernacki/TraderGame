import { clamp, lerp, lerpAngle, smoothstep, wrap360, haversine, bearingTo, NM, type LatLon } from '../core/math';
import { Rng, fbm1 } from '../core/rng';
import { prevailingWind, type WindSample, seaState } from './wind';
import { dateFromDays } from '../core/clock';

export type StormKind = 'gale' | 'cyclone' | 'squall';

export interface StormSystem {
  id: number;
  kind: StormKind;
  lat: number;
  lon: number;
  /** Radius of the circulation in nautical miles. */
  radius: number;
  /** Peak sustained wind in knots. */
  peak: number;
  /** Direction the system itself travels, degrees true. */
  trackDir: number;
  /** Speed of the system in knots. */
  trackSpeed: number;
  /** Seconds of life remaining. */
  life: number;
  maxLife: number;
  /** Ramps up then down so a storm builds and dies rather than snapping on. */
  age: number;
}

export interface WeatherSample {
  wind: WindSample;
  /** Significant wave height, metres. */
  waveHeight: number;
  /** Dominant swell direction (from), degrees. */
  swellFrom: number;
  /** Visibility in nautical miles. */
  visibility: number;
  /** 0 clear, 1 overcast. Blocks celestial sights. */
  cloud: number;
  rain: number;
  /** Nearest storm within range, if any. */
  storm: StormSystem | null;
  stormDistanceNm: number;
  /** Human-readable summary for the log and HUD. */
  description: string;
}

/**
 * Weather simulation. Holds a small population of moving storm systems and
 * blends their circulation into the prevailing belt wind.
 */
export class Weather {
  systems: StormSystem[] = [];
  private rng: Rng;
  private nextId = 1;
  private spawnTimer = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed ^ 0x5eed11);
  }

  update(dtSeconds: number, t: number, focus: LatLon): void {
    if (dtSeconds <= 0) return;

    for (const s of this.systems) {
      const dist = s.trackSpeed * NM * (dtSeconds / 3600);
      s.lat = clamp(s.lat + (dist * Math.cos((s.trackDir * Math.PI) / 180)) / (NM * 60), -70, 70);
      s.lon = wrap360(s.lon + (dist * Math.sin((s.trackDir * Math.PI) / 180)) / (NM * 60 * Math.max(Math.cos((s.lat * Math.PI) / 180), 0.15)) + 180) - 180;
      s.life -= dtSeconds;
      s.age += dtSeconds;
      // Systems curve poleward and to the east as they mature, as real ones do.
      s.trackDir = wrap360(s.trackDir + (s.lat >= 0 ? 1 : -1) * dtSeconds * 0.0004);
    }
    this.systems = this.systems.filter((s) => s.life > 0);

    this.spawnTimer -= dtSeconds;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.rng.range(6, 30) * 3600;
      if (this.systems.length < 6) this.trySpawnNear(focus, t);
    }
  }

  /**
   * Storms are seeded within a few hundred miles of the player so the world
   * stays cheap, but they are seeded by the climatology of that place and season.
   */
  private trySpawnNear(focus: LatLon, t: number): void {
    const day = Math.floor(t / 86400);
    const { month } = dateFromDays(day);
    const lat = focus.lat + this.rng.range(-14, 14);
    const lon = focus.lon + this.rng.range(-18, 18);
    const absLat = Math.abs(lat);

    let kind: StormKind = 'squall';
    let chance = 0.25;
    let peak = this.rng.range(28, 38);
    let radius = this.rng.range(30, 70);
    let life = this.rng.range(4, 10) * 3600;
    let trackDir = this.rng.range(0, 360);
    let trackSpeed = this.rng.range(8, 16);

    if (absLat > 34 && absLat < 62) {
      // Extratropical depressions marching through the westerlies.
      kind = 'gale';
      chance = 0.55 + (isWinterAt(lat, month) ? 0.25 : 0);
      peak = this.rng.range(38, 62);
      radius = this.rng.range(180, 420);
      life = this.rng.range(24, 72) * 3600;
      trackDir = lat >= 0 ? this.rng.range(50, 95) : this.rng.range(85, 130);
      trackSpeed = this.rng.range(14, 28);
    } else if (absLat > 7 && absLat < 24 && isCycloneSeason(lat, lon, month)) {
      // Tropical revolving storms. The Indian Ocean basins are the ones that
      // wrecked the carreira da Índia fleets.
      kind = 'cyclone';
      chance = 0.4;
      peak = this.rng.range(64, 105);
      radius = this.rng.range(90, 200);
      life = this.rng.range(48, 140) * 3600;
      trackDir = lat >= 0 ? this.rng.range(270, 330) : this.rng.range(210, 260);
      trackSpeed = this.rng.range(8, 16);
    } else if (absLat < 9) {
      // Doldrum thunder squalls: violent, brief, and from any direction at all.
      kind = 'squall';
      chance = 0.5;
      peak = this.rng.range(25, 45);
      radius = this.rng.range(8, 25);
      life = this.rng.range(0.5, 3) * 3600;
      trackSpeed = this.rng.range(4, 12);
    }

    if (!this.rng.chance(chance)) return;

    this.systems.push({
      id: this.nextId++,
      kind, lat, lon, radius, peak, trackDir, trackSpeed,
      life, maxLife: life, age: 0,
    });
  }

  /** Deliberately introduce a storm, used by scripted events. */
  spawnAt(p: LatLon, kind: StormKind, peak: number): StormSystem {
    const s: StormSystem = {
      id: this.nextId++,
      kind, lat: p.lat, lon: p.lon,
      radius: kind === 'cyclone' ? 140 : kind === 'gale' ? 260 : 18,
      peak,
      trackDir: this.rng.range(0, 360),
      trackSpeed: this.rng.range(8, 18),
      life: (kind === 'squall' ? 2 : 40) * 3600,
      maxLife: (kind === 'squall' ? 2 : 40) * 3600,
      age: 0,
    };
    this.systems.push(s);
    return s;
  }

  /** Full weather at a point: belt wind plus any storm circulation on top. */
  sample(p: LatLon, dayOfYear: number, t: number): WeatherSample {
    const base = prevailingWind(p, dayOfYear, t);
    let from = base.from;
    let speed = base.speed;
    let cloud = clamp(0.25 + fbm1(t / 90000 + p.lat * 0.2, 2, 71) * 0.55, 0, 1);
    let rain = 0;

    let nearest: StormSystem | null = null;
    let nearestDist = Infinity;

    for (const s of this.systems) {
      const centre = { lat: s.lat, lon: s.lon };
      const dNm = haversine(p, centre) / NM;
      if (dNm < nearestDist) { nearestDist = dNm; nearest = s; }
      if (dNm > s.radius * 1.6) continue;

      // Intensity envelope: builds over the first fifth of life, fades over the last third.
      const lifeT = 1 - s.life / s.maxLife;
      const envelope = smoothstep(0, 0.18, lifeT) * (1 - smoothstep(0.7, 1, lifeT));

      // Radial profile: calm eye, peak at the radius of maximum wind, then decay.
      const rMax = s.radius * 0.35;
      let profile: number;
      if (dNm < rMax) {
        profile = s.kind === 'cyclone'
          ? smoothstep(0, rMax * 0.55, dNm)
          : dNm / rMax;
      } else {
        profile = Math.exp(-(dNm - rMax) / (s.radius * 0.6));
      }

      const strength = envelope * profile;
      if (strength < 0.02) continue;

      // Cyclonic rotation with inflow toward the centre.
      const toCentre = bearingTo(p, centre);
      const spin = p.lat >= 0 ? -90 : 90;
      const inflow = p.lat >= 0 ? 18 : -18;
      const stormFrom = wrap360(toCentre + spin + inflow + 180);
      const stormSpeed = s.peak * strength;

      const blend = clamp(stormSpeed / Math.max(stormSpeed + speed, 1e-3), 0, 1);
      from = lerpAngle(from, stormFrom, blend);
      speed = Math.hypot(speed * (1 - blend * 0.6), stormSpeed);
      cloud = Math.max(cloud, clamp(strength * 1.5, 0, 1));
      rain = Math.max(rain, clamp(strength * 1.4, 0, 1));
    }

    let visibility = lerp(22, 6, cloud) * lerp(1, 0.25, rain);

    // Persistent regional fogs: the Benguela coast of Namibia and the harmattan
    // haze that blows off the Sahara in the dry season.
    if (p.lat < -14 && p.lat > -30 && p.lon > 8 && p.lon < 16) {
      const fog = clamp(0.4 + fbm1(t / 60000 + p.lat, 2, 13) * 0.6, 0, 1);
      if (fog > 0.6) visibility = Math.min(visibility, lerp(4, 0.3, (fog - 0.6) / 0.4));
    }
    if (p.lat > 6 && p.lat < 20 && p.lon > -20 && p.lon < 5) {
      const haze = clamp(fbm1(t / 120000 + p.lon * 0.3, 2, 5), 0, 1);
      visibility = Math.min(visibility, lerp(20, 3, haze));
    }

    const waveBase = seaState(speed);
    // Swell persists after the wind that raised it, so it lags the local wind.
    const swellFrom = lerpAngle(from, base.from, 0.4);

    return {
      wind: { from, speed, steadiness: base.steadiness, doldrums: base.doldrums },
      waveHeight: waveBase,
      swellFrom,
      visibility: clamp(visibility, 0.1, 30),
      cloud,
      rain,
      storm: nearest && nearestDist < (nearest.radius * 1.6) ? nearest : null,
      stormDistanceNm: nearestDist,
      description: describe(speed, rain, visibility, base.doldrums),
    };
  }
}

function describe(speed: number, rain: number, vis: number, doldrums: boolean): string {
  if (doldrums && speed < 4) return 'Becalmed under a white sky';
  if (speed > 60) return 'A furious storm';
  if (speed > 45) return 'Hard gale, seas breaking aboard';
  if (speed > 33) return 'Gale of wind';
  if (rain > 0.5) return 'Heavy rain and squalls';
  if (vis < 1) return 'Thick fog, nothing to be seen';
  if (vis < 4) return 'Hazy, land obscured';
  if (speed < 3) return 'Flat calm, sails slatting';
  if (speed < 10) return 'Light airs';
  if (speed < 20) return 'A fine sailing breeze';
  return 'Fresh breeze, a lively sea';
}

function isWinterAt(lat: number, month: number): boolean {
  return lat >= 0 ? month <= 3 || month >= 10 : month >= 4 && month <= 9;
}

function isCycloneSeason(lat: number, lon: number, month: number): boolean {
  // North Indian Ocean: two peaks either side of the monsoon.
  if (lat > 0 && lon > 50 && lon < 100) return month === 5 || month === 6 || month === 10 || month === 11;
  // South Indian Ocean, including the Mozambique Channel.
  if (lat < 0 && lon > 35 && lon < 100) return month >= 11 || month <= 4;
  // North Atlantic.
  if (lat > 0 && lon < -15) return month >= 8 && month <= 10;
  return false;
}

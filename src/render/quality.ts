/**
 * How hard to work the GPU.
 *
 * Three levels, and "auto", which starts from what the device looks like and
 * steps down by itself if the frame rate says it has to. A phone at sea for an
 * hour is a phone getting hot, and a smooth picture beats a detailed one that
 * judders every time she rolls.
 */
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = QualityLevel | 'auto';

export interface QualitySpec {
  pixelRatio: number;
  shadowSize: number;
  softShadows: boolean;
  /** Frames between refreshes of the sky the sea reflects. */
  envEvery: number;
  cloudOctaves: number;
  /** 0 to 1: rain, birds, dolphins and the rest. */
  life: number;
}

export const QUALITY: Record<QualityLevel, QualitySpec> = {
  low: { pixelRatio: 1.25, shadowSize: 1024, softShadows: false, envEvery: 40, cloudOctaves: 3, life: 0.4 },
  medium: { pixelRatio: 2, shadowSize: 2048, softShadows: false, envEvery: 16, cloudOctaves: 5, life: 0.75 },
  high: { pixelRatio: 2.75, shadowSize: 2048, softShadows: true, envEvery: 8, cloudOctaves: 6, life: 1 },
};

const KEY = 'carreira.quality';
const AUTO_KEY = 'carreira.quality.auto';

export function loadSetting(): QualitySetting {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'auto') return v;
  } catch { /* storage blocked: fall through */ }
  return 'auto';
}

export function saveSetting(s: QualitySetting): void {
  try { localStorage.setItem(KEY, s); } catch { /* ignore */ }
}

/** What "auto" last settled on for this device, if it has had to step down. */
export function loadAutoLevel(phone: boolean): QualityLevel {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch { /* ignore */ }
  return phone ? 'medium' : 'high';
}

export function saveAutoLevel(l: QualityLevel): void {
  try { localStorage.setItem(AUTO_KEY, l); } catch { /* ignore */ }
}

export function stepDown(l: QualityLevel): QualityLevel {
  return l === 'high' ? 'medium' : 'low';
}

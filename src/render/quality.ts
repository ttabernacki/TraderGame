/**
 * How hard to work the GPU.
 *
 * Four levels, and "auto", which starts from what the device looks like and
 * steps down by itself if the frame rate says it has to. A phone at sea for an
 * hour is a phone getting hot, and a smooth picture beats a detailed one that
 * judders every time she rolls. `ultra` is opt-in only and is never chosen, or
 * stepped to, by auto.
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type QualitySetting = QualityLevel | 'auto';

/** What the HDR post stack does at a level. See render/post/stack.ts. */
export interface PostSpec {
  /** Samples for the multisampled HDR scene target (0 or 1: none). */
  msaa: number;
  /** Mips in the bloom chain below half resolution; 0 turns bloom off. */
  bloomLevels: number;
  bloomStrength: number;
  fxaa: boolean;
  /** Colour grade and vignette in the final pass (low keeps the CSS vignette instead). */
  grade: boolean;
}

export interface QualitySpec {
  pixelRatio: number;
  shadowSize: number;
  softShadows: boolean;
  /** Frames between refreshes of the sky the sea reflects. */
  envEvery: number;
  /** Edge of each face of the sky the sea reflects, in pixels. */
  envSize: number;
  cloudOctaves: number;
  /** 0 to 1: rain, birds, dolphins and the rest. */
  life: number;
  post: PostSpec;
  /** Cascades for the key light's shadow: 1 is the old ship-only box. */
  cascades: number;
}

export const QUALITY: Record<QualityLevel, QualitySpec> = {
  low: {
    pixelRatio: 1.25, shadowSize: 1024, softShadows: false, envEvery: 40, envSize: 128, cloudOctaves: 3, life: 0.4,
    post: { msaa: 0, bloomLevels: 0, bloomStrength: 0, fxaa: true, grade: false }, cascades: 1,
  },
  medium: {
    pixelRatio: 1.75, shadowSize: 1024, softShadows: false, envEvery: 16, envSize: 128, cloudOctaves: 5, life: 0.75,
    post: { msaa: 0, bloomLevels: 4, bloomStrength: 1, fxaa: true, grade: true }, cascades: 1,
  },
  high: {
    pixelRatio: 2.5, shadowSize: 2048, softShadows: true, envEvery: 8, envSize: 256, cloudOctaves: 6, life: 1,
    post: { msaa: 4, bloomLevels: 5, bloomStrength: 1, fxaa: false, grade: true }, cascades: 2,
  },
  ultra: {
    pixelRatio: 2.75, shadowSize: 4096, softShadows: true, envEvery: 4, envSize: 256, cloudOctaves: 6, life: 1,
    post: { msaa: 4, bloomLevels: 6, bloomStrength: 1.15, fxaa: false, grade: true }, cascades: 2,
  },
};

/** Which render path is in force. `legacy` is the pre-upgrade look: no post stack, CSS vignette. */
export type RenderMode = 'new' | 'legacy';
const MODE_KEY = 'carreira.render';

/** `?render=legacy` / `?render=new` in the URL wins and is remembered. */
export function loadRenderMode(): RenderMode {
  try {
    const q = new URLSearchParams(location.search).get('render');
    if (q === 'legacy' || q === 'new') { localStorage.setItem(MODE_KEY, q); return q; }
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'legacy' || v === 'new') return v;
  } catch { /* storage blocked: fall through */ }
  return 'new';
}

export function saveRenderMode(m: RenderMode): void {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
}

const KEY = 'carreira.quality';
const AUTO_KEY = 'carreira.quality.auto';

export function loadSetting(): QualitySetting {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'ultra' || v === 'auto') return v;
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
    if (v === 'low' || v === 'medium' || v === 'high') return v;  // never ultra: auto does not choose it
  } catch { /* ignore */ }
  return phone ? 'medium' : 'high';
}

export function saveAutoLevel(l: QualityLevel): void {
  try { localStorage.setItem(AUTO_KEY, l); } catch { /* ignore */ }
}

export function stepDown(l: QualityLevel): QualityLevel {
  return l === 'high' || l === 'ultra' ? 'medium' : 'low';
}

import type { CampaignId } from '../game/campaign';

/**
 * Which campaign's world this page is running.
 *
 * Coastlines, ports, peoples and states are module-level data that dozens of
 * caches are built from at load, so the world is chosen once, before any of it
 * is read, and changing campaign means reloading the page. The Carreira world
 * is the default and is untouched unless a campaign asks otherwise: a page
 * opened with `?campaign=xiyang`, or one that the title screen reloaded after a
 * choice was kept.
 */
/**
 * The Zheng He campaign is shelved: finished enough to keep, not part of the
 * game. While this is true the page always runs the Carreira world, the title
 * screen offers no other voyage, and `?campaign=` and a kept choice are
 * ignored. Node scripts may still ask for it with the CAMPAIGN environment
 * variable, so its tests keep passing. Set it false to bring the campaign back.
 * See docs/SHELVED.md.
 */
export const XIYANG_SHELVED = true;

function read(): CampaignId {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CAMPAIGN;
    if (env === 'xiyang' || env === 'carreira') return env;
    if (XIYANG_SHELVED) return 'carreira';
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('campaign');
    if (q === 'xiyang' || q === 'carreira') return q;
    const kept = globalThis.sessionStorage?.getItem('carreira.campaign');
    if (kept === 'xiyang') return 'xiyang';
  } catch { /* storage may be refused; the default world is right */ }
  return 'carreira';
}

export const ACTIVE_CAMPAIGN: CampaignId = read();
export const IS_XIYANG = ACTIVE_CAMPAIGN === 'xiyang';

/** Choose a campaign for the next load of the page. */
export function keepCampaign(id: CampaignId): void {
  try { globalThis.sessionStorage?.setItem('carreira.campaign', id); } catch { /* the query string still works */ }
}

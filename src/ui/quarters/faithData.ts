import type { Game } from '../../game/state';
import { people } from '../../world/peoples';
import { portDef } from '../../world/ports';
import { memoryLines } from '../../places';
import type { FrontLine } from './fronts';

/** What the Ledger holds of how this place's worship was treated: the town's own lines, for the Faith quarter. */
export function ledgerFaith(g: Game, port: string): FrontLine[] {
  const lines = memoryLines(g, port, 8).filter((l) => l.tag === 'faith.pressed' || l.tag === 'faith.respected');
  return lines.map((l) => ({ text: l.text, tone: l.tone < 0 ? 'bad' as const : 'ok' as const }));
}

/** The people's faith in a word, for the quarter's head. */
export function faithOf(g: Game, port: string): string {
  const pe = people(portDef(port).people);
  return ({ catholic: 'Catholic', muslim: 'Muslim', hindu: 'Hindu', traditional: 'their own gods', buddhist: 'Buddhist', confucian: 'of the Ming order' } as Record<string, string>)[pe.faith] ?? pe.faith;
}

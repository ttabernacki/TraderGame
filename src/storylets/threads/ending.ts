import { clamp } from '../../core/math';
import type { Game } from '../../game/state';
import type { SeaChoice } from '../../game/seaEvents';
import { favourOf, patronBlocked } from '../../identity/patrons';
import { end, portMark, renown, scene, thread } from '../arc';
import { ports } from '../places';
import { anyOf, gte, has } from '../qualities';

/**
 * What the King Offers: the ending EVALUATION (BUILD_PLAN E1, Pillar 6).
 *
 * It used to be a menu of four. It is now what the career has made of the captain, read at the last audience: the
 * Crown's offers (a command, a lordship) are on the table only for a man the Crown still has use for (its favour, the
 * patron of record, the doors the Ledger and the Titles have shut, the Court Front's stage), the money's (gold, and the
 * freedom of the quay) for anyone, and the ship for everyone. The choice is the last of many: most of the work was
 * done by what he did on the way. The authored lines of all four endings stand as they were (`LATE_ENDINGS`).
 *
 * The thresholds are the game's own judgement, not history.
 */

export type KingsOffer = 'armada' | 'lordship' | 'rich' | 'ship';

export interface KingsEvaluation {
  offers: KingsOffer[];
  /** Why the Crown's offers are not made, if they are not; the Patrons' own words. */
  withheld: string | null;
  /** What the Rua Nova adds to the gold, when it is the patron of record and warm. */
  topUp: number;
}

export function evaluateKings(g: Game): KingsEvaluation {
  const blocked = patronBlocked(g, 'crown');
  const fav = favourOf(g, 'crown');
  const court = g.powers.fronts.court.stage;
  const offers: KingsOffer[] = [];
  const crownOpen = blocked === null;
  if (crownOpen && fav >= 0.15 && court <= 3) offers.push('armada');
  if (crownOpen && fav > -0.2) offers.push('lordship');
  offers.push('rich', 'ship');
  const withheld = !crownOpen ? blocked
    : !offers.includes('armada') && !offers.includes('lordship') ? 'The court says the captain is a useful man, and not a trusted one.'
      : !offers.includes('armada') ? (court >= 4 ? 'The reckoning has come to the court, and nobody there can promise a fleet.' : 'The command of an armada is not a thing the court will put in the hands of a man it only half trusts.')
        : null;
  const topUp = g.identity.patron === 'ruanova' && favourOf(g, 'ruanova') >= 0.3 ? 1000 : 0;
  return { offers, withheld, topUp };
}

const PATRON_LINE: Record<string, string> = {
  crown: 'You come in as the Crown’s own man, and the King knows whose letter it was.',
  church: 'You come in as the Order’s man, and a friar of the Order is in the antechamber.',
  ruanova: 'You come in as the Rua Nova’s man, and the King knows who lent for the voyage.',
};

export const kingsOffer = thread({
  id: 'kingsoffer',
  title: 'What the King Offers',
  blurb: 'The pepper is home. The King wants to know what you would like.',
  offeredAt: ['lisboa'],
  requires: [gte('act', 5)],
  offer: () => ({
    who: 'A gentleman of the King’s chamber',
    text: 'The King has been told about the pepper, and about the road, and about the ship. He would like '
      + 'to see you privately, and has asked that you come in the evening when the court has gone home. '
      + 'The gentleman does not say what for. He says it is nothing to worry about, in a tone that '
      + 'suggests it is.',
    accept: 'Go, in the evening',
  }),
  // An evaluation, not a quest: nobody asks the captain to take it up; the gentleman is simply at the quay when the pepper is home.
  auto: true,
  first: 'audience',
  steps: {
    audience: {
      goal: () => 'Go to the King, privately, at Lisbon.',
      marker: () => portMark('lisboa', 'The King, in the evening'),
      at: ports('lisboa'),
      needs: [anyOf(has('goal.met'), gte('hold.pimenta', 100))],
      kind: 'arc',
      priority: 90,
      quarter: 'court',
      hooks: [],
      scene: (g, q) => {
        const ev = evaluateKings(g);
        const choices: SeaChoice[] = [];
        if (ev.offers.includes('armada')) {
          choices.push({
            label: 'The command of the next armada',
            detail: 'A captain-major’s flag, forty ships, and a road that is yours. The Crown’s business from here to the end of your life.',
            resolve: (gg) => {
              gg.secretsHeard.push('captain-major');
              renown(gg, 120);
              gg.crown.gold += 2000;
              return end(gg, q, 'armada', 'The King named you captain-major of the next armada to the Indies. The road is yours, and so is whatever the road brings.');
            },
          });
        }
        if (ev.offers.includes('lordship')) {
          choices.push({
            label: 'A lordship, and the quiet of the land',
            detail: 'Senhor de a town with rents and a gallows. The sea is a long way from it.',
            resolve: (gg) => {
              gg.lordship = ['Alvito', 'Sortelha', 'Ferreira de Aves', 'Castelo Rodrigo'][Math.floor(gg.rng.next() * 4)];
              gg.secretsHeard.push('lordship');
              renown(gg, 90);
              return end(gg, q, 'lordship', `The King made you Senhor de ${gg.lordship}, with its rents and its gallows. He was kind about it.`);
            },
          });
        }
        choices.push({
          label: 'Gold, and be let alone',
          detail: `${5000 + ev.topUp} cruzados and the freedom of the quay. No office, and no enemies made at court.${ev.topUp ? ' The Rua Nova will see to the rest.' : ''}`,
          resolve: (gg) => {
            gg.crown.gold += 5000 + ev.topUp;
            gg.secretsHeard.push('retired-rich');
            renown(gg, 30);
            return end(gg, q, 'rich', 'Asked the King for gold and to be let alone. He laughed, and paid, and said that was the most honest answer he had had in years.');
          },
        });
        choices.push({
          label: 'Ask for the ship, and nothing else',
          detail: 'The caravel, the crew, the next voyage. Nothing from the Crown that cannot be taken back.',
          resolve: (gg) => {
            gg.crew.morale = clamp(gg.crew.morale + 0.1, 0, 1);
            gg.secretsHeard.push('ship-only');
            renown(gg, 70);
            return end(gg, q, 'ship', 'Asked the King for nothing but the ship and the next voyage. He looked at you for a while, and said that in that case he would have to find something else to give.');
          },
        });
        return scene(q, 'audience', 'The King, in the evening',
          'He is in a small room with a window on the river, in an old coat, and he waves away the usher. '
          + 'He has a map on the table, the one you made, and he has put his glass on the Indies. "I have been '
          + 'told," he says, "that a great many men would like to have done what you have done. I find I '
          + 'would like to know what you want. Nobody ever asks the men who have it."'
          + `\n\n${PATRON_LINE[g.identity.patron] ?? PATRON_LINE.crown}`
          + (ev.withheld ? `\n\nHe does not speak of a command, or of a lordship. ${ev.withheld}` : ''),
          choices);
      },
    },
  },
});

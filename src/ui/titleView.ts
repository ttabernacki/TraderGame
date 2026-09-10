import { formatLat, formatLon } from '../core/math';
import type { Game } from '../game/state';
import { button, card, el, kv } from './dom';

export class TitleView {
  root = el('div', { class: 'screen title-screen' });

  constructor(onNew: () => void, onContinue: () => void, hasSave: boolean) {
    this.root.append(
      el('h1', {}, 'Carreira da Índia'),
      el('div', { class: 'tagline' }, 'Portugal, 1482'),
      el('div', { class: 'blurb' },
        'Eighty years of caravels have worked their way a headland at a time down the western side of Africa, and nobody yet knows whether it has an end. ' +
        'You have a lateen caravel, a crew who have heard what happens south of the line, a quadrant, and a set of tables that do not run past the equator. ' +
        'The wind belts will carry you south whether you like it or not, and will not carry you back the way you came. ' +
        'Your latitude you can find from the sun and the pole star. Your longitude nobody on earth can find, and will not for another two hundred and sixty years.'),
      el('div', { class: 'actions' },
        button('Sail', onNew, { primary: true }),
        hasSave ? button('Continue the voyage', onContinue) : null,
      ),
      el('div', { style: { marginTop: '30px', fontSize: '12px', color: '#6f8296', maxWidth: '560px', lineHeight: '1.7' } },
        'The wind belts, ocean currents, monsoons, coastlines, ports, trade goods, instruments and star positions in this game are the real ones. ' +
        'Latitude is found the way it was actually found. Longitude cannot be found at all.'),
    );
  }
}

export class GameOverView {
  root = el('div', { class: 'screen' });

  constructor(g: Game, reason: string, onRestart: () => void) {
    const days = Math.floor((g.clock.t - 0) / 86400);
    const body = el('div', { class: 'screen-body' },
      el('div', { class: 'scroll-narrow' },
        el('div', { class: 'notice grave', style: { fontSize: '15px', lineHeight: '1.65' } }, reason),
        card('The voyage',
          kv('Ended', g.clock.formatDate()),
          kv('Last reckoned position', `${formatLat(g.nav.estimated.lat)}, ${formatLon(g.nav.estimated.lon)}`),
          kv('Days out from a port', `${g.crew.daysSinceLandfall.toFixed(0)}`),
          kv('Men lost', `${g.crew.deaths}`),
          kv('Men living', `${g.crew.count}`),
        ),
        card('What you found',
          kv('Discoveries entered', String(g.crown.discoveries.length)),
          kv('Renown earned', String(g.crown.lifetimeStanding)),
          kv('Title', g.crown.title.name),
          kv('Coastline charted', `${(g.chart.coverage() * 100).toFixed(1)}%`),
          kv('Landmarks of the route reached', `${g.crown.landmarksFound.size}`),
        ),
        el('p', { class: 'quote' },
          days > 400
            ? 'Ships were lost on this route at a rate that would close any trade but this one, and the survivors went out again the following season.'
            : 'It happened to better navigators than you, and it happened to most of them within sight of land.'),
      ),
    );

    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'The voyage ends'),
        el('div', { class: 'sub' }, g.ship.name),
      ),
      body,
      el('div', { class: 'screen-foot' }, button('Fit out another ship', onRestart, { primary: true })),
    );
  }
}

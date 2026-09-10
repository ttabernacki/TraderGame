import { clamp, compassPoint, formatBearing, wrap360 } from '../core/math';
import { beaufortName } from '../world/wind';
import { moraleWord } from '../crew/crew';
import { enduranceDays } from '../crew/crew';
import type { Game } from '../game/state';
import { append, clear, el, hudRow, svg } from './dom';
import { HeadingTape } from './headingTape';

/**
 * The sailing head-up display: everything a captain would have in front of him
 * on deck, and nothing he would not. There is no position marker anywhere on it.
 */
export class Hud {
  root = el('div', { id: 'hud' });

  private nav = el('div', { class: 'hud-panel', id: 'hud-nav' });
  private wind = el('div', { class: 'hud-panel', id: 'hud-wind' });
  private time = el('div', { class: 'hud-panel', id: 'hud-time' });
  private ship = el('div', { class: 'hud-panel', id: 'hud-ship' });
  private alerts = el('div', { class: 'hud-panel', id: 'hud-alerts' });
  private course = el('div', { class: 'hud-panel', id: 'hud-course' });
  tape = new HeadingTape();
  private hint = el('div', { class: 'hint' });

  private compassSvg: SVGElement;
  private compassCard: SVGElement;
  private compassShip: SVGElement;
  private windSvg: SVGElement;
  private windNeedle: SVGElement;
  private windShip: SVGElement;
  private windCurrent: SVGElement;

  constructor() {
    const c = buildCompass();
    this.compassSvg = c.root;
    this.compassCard = c.card;
    this.compassShip = c.shipMark;

    const w = buildWindDial();
    this.windSvg = w.root;
    this.windNeedle = w.needle;
    this.windShip = w.ship;
    this.windCurrent = w.current;

    this.root.append(
      this.tape.root, this.nav, this.wind, this.time, this.ship,
      this.course, this.alerts, this.hint,
    );
    this.hint.innerHTML =
      '<b>A</b>/<b>D</b> helm &nbsp; <b>X</b> midships &nbsp; <b>W</b>/<b>S</b> canvas &nbsp; ' +
      '<b>Q</b>/<b>E</b> trim &nbsp; <b>C</b> chart &nbsp; <b>N</b> sight &nbsp; <b>L</b> log &nbsp; ' +
      '<b>K</b> crew &nbsp; <b>V</b> view &nbsp; <b>H</b> hold course &nbsp; ' +
      '<b>[</b>/<b>]</b> time &nbsp; <b>Space</b> anchor';
  }

  update(g: Game): void {
    this.tape.update(g);
    const r = g.helmReport();
    const p = g.positionText();

    // --- Reckoning ---------------------------------------------------------
    clear(this.nav);
    this.nav.append(
      el('div', { class: 'hud-title' }, 'The reckoning'),
      el('div', { class: 'hud-big' }, r.compass.toFixed(0).padStart(3, '0') + '°',
        el('span', { class: 'hud-unit' }, compassPoint(r.compass) + ' by compass')),
      this.compassSvg,
      hudRow('Speed', `${Math.abs(r.speed).toFixed(1)} kn${r.sternway ? ' astern' : ''}`),
      hudRow('Made good', `${r.groundSpeed.toFixed(1)} kn ${compassPoint(r.cog)}`),
      hudRow('Latitude', p.lat),
      hudRow('Longitude', p.lon),
      el('div', { class: 'hud-row', style: { marginTop: '3px' } },
        el('span', { class: 'k', style: { fontSize: '11px', fontStyle: 'italic' } }, p.certainty)),
    );
    this.compassCard.setAttribute('transform', `rotate(${-r.compass} 44 44)`);
    this.compassShip.setAttribute('transform', `rotate(${wrap360(r.cog - r.heading)} 44 44)`);

    // --- Wind --------------------------------------------------------------
    const wx = g.weatherNow;
    clear(this.wind);
    this.wind.append(
      el('div', { class: 'hud-title' }, 'Wind and sea'),
      el('div', { class: 'hud-big' }, wx.wind.speed.toFixed(0),
        el('span', { class: 'hud-unit' }, `kn from ${compassPoint(wx.wind.from)}`)),
      this.windSvg,
      hudRow('Point of sail', r.inIrons ? 'IN IRONS' : `${r.pointOfSail}${r.tack ? ', ' + r.tack : ''}`),
      hudRow('Apparent', `${r.apparent.toFixed(0)} kn at ${Math.abs(r.beta).toFixed(0)}°`),
      hudRow('Sea', `${wx.waveHeight.toFixed(1)} m — ${beaufortName(wx.wind.speed)}`),
      hudRow('Set', g.currentKnots > 0.15 ? `${g.currentKnots.toFixed(1)} kn ${compassPoint(g.currentToward)}` : 'none felt'),
      hudRow('Visibility', wx.visibility > 20 ? 'clear' : `${wx.visibility.toFixed(1)} miles`),
    );
    this.windNeedle.setAttribute('transform', `rotate(${wx.wind.from} 44 44)`);
    this.windShip.setAttribute('transform', `rotate(${g.ship.state.heading} 44 44)`);
    if (g.currentKnots > 0.15) {
      this.windCurrent.setAttribute('transform', `rotate(${g.currentToward} 44 44)`);
      this.windCurrent.setAttribute('opacity', String(clamp(g.currentKnots / 2, 0.2, 0.9)));
    } else {
      this.windCurrent.setAttribute('opacity', '0');
    }

    // --- Ship --------------------------------------------------------------
    clear(this.ship);
    const overCanvas = r.canvas > r.prudent + 0.03;
    const trimBar = el('div', { class: 'trim-bar' },
      el('div', { class: `trim-fill${overCanvas ? ' over' : ''}`, style: { width: `${r.canvas * 100}%` } }),
      el('div', { class: 'trim-mark', style: { left: `${r.prudent * 100}%` } }),
    );
    // Helm: which way the rudder is over, and how far.
    const helmBar = el('div', { class: 'trim-bar', style: { marginTop: '2px' } },
      el('div', {
        class: 'trim-fill',
        style: {
          left: r.rudder >= 0 ? '50%' : `${50 + r.rudder * 50}%`,
          width: `${Math.abs(r.rudder) * 50}%`,
          background: '#7fa8c8',
        },
      }),
      el('div', { class: 'trim-mark', style: { left: '50%' } }),
    );

    const trim = r.trim;
    const trimBarQuality = el('div', { class: 'trim-bar', style: { marginTop: '2px' } },
      el('div', {
        class: 'trim-fill',
        style: {
          width: `${trim.quality * 100}%`,
          background: trim.quality > 0.94 ? '#4d7a3e' : trim.quality > 0.7 ? '#c8a44e' : '#c47d2a',
        },
      }),
    );

    const endurance = enduranceDays(g.crew, g.ration);
    append(this.ship,
      el('div', { class: 'hud-title' }, g.ship.name),
      el('div', { class: 'hud-row' },
        el('span', { class: 'k' }, `Canvas ${(r.canvas * 100).toFixed(0)}%`),
        el('span', { class: 'v', style: { color: overCanvas ? '#d4553f' : '#efe4cc' } },
          overCanvas ? 'MORE THAN SHE WILL BEAR' : `prudent to ${(r.prudent * 100).toFixed(0)}%`)),
      trimBar,
      el('div', { class: 'hud-row' },
        el('span', { class: 'k' }, 'Trim'),
        el('span', {
          class: 'v',
          style: { color: trim.quality > 0.94 ? '#8fbf7a' : '#e0b96a' },
        }, g.autoTrim && !trim.shifting ? 'kept by the watch' : trim.advice)),
      trimBarQuality,
      el('div', { class: 'hud-row' },
        el('span', { class: 'k' }, 'Helm'),
        el('span', { class: 'v' },
          Math.abs(r.rudder) < 0.04
            ? 'amidships'
            : `${(Math.abs(r.rudder) * 100).toFixed(0)}% to ${r.rudder > 0 ? 'starboard' : 'port'}`)),
      helmBar,
      hudRow('Heel', `${Math.abs(g.ship.state.heel).toFixed(0)}° to ${g.ship.state.heel >= 0 ? 'starboard' : 'port'}`),
      hudRow('Leeway', `${Math.abs(r.leeway).toFixed(1)}°`),
      hudRow('Hands', `${r.ableHands} of ${g.crew.count} able`),
      hudRow('Crew', moraleWord(g.crew.morale)),
      hudRow('Stores', `${endurance.toFixed(0)} days`),
      hudRow('By the lead', g.sounding.depth > 200 ? 'no bottom' : `${g.sounding.depth.toFixed(0)} fathoms`),
      g.ship.condition.bilge > 0.5
        ? hudRow('Bilge', `${g.ship.condition.bilge.toFixed(1)} tons`)
        : null,
    );

    // --- Time --------------------------------------------------------------
    clear(this.time);
    append(this.time,
      el('div', { class: 'hud-title' }, g.clock.watchName),
      el('div', { class: 'hud-big' }, g.clock.formatTime()),
      hudRow('Date', g.clock.formatDate()),
      hudRow('Rate', g.clock.scaleLabel),
      hudRow('Weather', wx.description),
      hudRow('Days out', `${g.crew.daysSinceLandfall.toFixed(0)}`),
      g.crown.patent ? hudRow('Commission', g.crown.patent.title) : null,
    );

    // --- The course she is steering -----------------------------------------
    // Only shown when there is somewhere to steer for. A passage with a mark on
    // the end of it is a passage; without one it is an afternoon on the water.
    const dest = g.courseToDestination();
    clear(this.course);
    this.course.style.display = dest ? '' : 'none';
    if (dest) {
      const off = dest.off;
      const near = dest.distNm < 3;
      const helm = near
        ? 'you are up with it'
        : Math.abs(off) < 2.5
          ? 'steady as she goes'
          : `${Math.abs(off).toFixed(0)}° to ${off > 0 ? 'starboard' : 'larboard'}`;
      append(this.course,
        el('div', { class: 'hud-title' }, 'Bound for'),
        el('div', { class: 'hud-big' }, dest.name),
        hudRow('Course to steer', `${dest.bearing.toFixed(0).padStart(3, '0')}° ${compassPoint(dest.bearing)}`),
        el('div', { class: 'hud-row' },
          el('span', { class: 'k' }, 'Put the helm'),
          el('span', {
            class: 'v',
            style: { color: Math.abs(off) < 2.5 ? '#7fa86a' : '#c8a44e' },
          }, helm)),
        hudRow('Distance', dest.distNm < 1
          ? 'less than a mile'
          : `${dest.distNm.toFixed(0)} miles`),
        hudRow('At this rate', formatEta(dest.hours)),
        el('div', { class: 'hud-row' },
          el('span', { class: 'k' }, 'The helm'),
          el('span', {
            class: 'v',
            style: { color: g.holdCourse ? '#7fa86a' : '#c8a44e' },
          }, g.holdCourse ? 'kept by the watch' : 'yours (H to hand over)')),
      );
    }

    // --- Alerts ------------------------------------------------------------
    clear(this.alerts);
    for (const a of g.alerts.slice(-3)) {
      this.alerts.append(el('div', { class: `alert ${a.severity}` }, a.text));
      this.alerts.append(el('br'));
    }

    // --- Context hint ------------------------------------------------------
    const near = g.approachablePorts();
    if (g.sounding.aground) {
      this.hint.innerHTML = '<b>Aground.</b> Press <b>R</b> to try to warp her off.';
    } else if (near.length > 0 && !g.dockedAt) {
      this.hint.innerHTML = `<b>${near[0].def.name}</b> lies ${near[0].distNm.toFixed(1)} miles off. Press <b>Space</b> to come to an anchor.`;
    } else if (g.dockedAt) {
      this.hint.innerHTML = `At anchor off <b>${g.portHere?.name}</b>. Press <b>P</b> to go ashore, <b>Space</b> to weigh.`;
    } else {
      this.hint.innerHTML =
        '<b>A</b>/<b>D</b> helm &nbsp; <b>W</b>/<b>S</b> canvas &nbsp; <b>Q</b>/<b>E</b> trim &nbsp; ' +
        '<b>C</b> chart &nbsp; <b>N</b> sight &nbsp; <b>L</b> log &nbsp; <b>K</b> crew &nbsp; ' +
        '<b>V</b> view &nbsp; <b>[</b>/<b>]</b> time &nbsp; <b>Space</b> anchor';
    }
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }
}

function buildCompass(): { root: SVGElement; card: SVGElement; shipMark: SVGElement } {
  const root = svg('svg', { class: 'dial', width: 88, height: 88, viewBox: '0 0 88 88' });
  const card = svg('g', {});

  card.append(svg('circle', { cx: 44, cy: 44, r: 34, fill: 'rgba(0,0,0,0.35)', stroke: '#7a6446', 'stroke-width': 1 }));

  for (let i = 0; i < 32; i++) {
    const a = (i * 11.25 * Math.PI) / 180;
    const major = i % 4 === 0;
    const r1 = major ? 25 : 30;
    root.setAttribute('data-x', '');
    card.append(svg('line', {
      x1: 44 + Math.sin(a) * r1, y1: 44 - Math.cos(a) * r1,
      x2: 44 + Math.sin(a) * 33, y2: 44 - Math.cos(a) * 33,
      stroke: major ? '#c8a44e' : '#6d5a3f', 'stroke-width': major ? 1.3 : 0.7,
    }));
  }

  const labels: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  for (const [t, deg] of labels) {
    const a = (deg * Math.PI) / 180;
    card.append(svg('text', {
      x: 44 + Math.sin(a) * 17.5, y: 44 - Math.cos(a) * 17.5 + 4,
      'text-anchor': 'middle', fill: t === 'N' ? '#d4553f' : '#b09a72',
      'font-size': 10.5, 'font-family': 'serif',
    }, document.createTextNode(t)) as SVGElement);
  }

  // Fleur de lis marking north on the card.
  card.append(svg('path', {
    d: 'M44 6 L47 13 L44 11 L41 13 Z', fill: '#d4553f',
  }));

  root.append(card);

  // The ship's head is fixed at the top; the card turns beneath it.
  root.append(svg('path', { d: 'M44 4 L40 12 L48 12 Z', fill: '#efe4cc' }));

  // A mark showing the course actually made good, which is not the heading.
  const shipMark = svg('g', {});
  shipMark.append(svg('line', {
    x1: 44, y1: 44, x2: 44, y2: 15,
    stroke: '#4d7a3e', 'stroke-width': 1.6, 'stroke-dasharray': '3 2',
  }));
  root.append(shipMark);

  return { root, card, shipMark };
}

function buildWindDial(): { root: SVGElement; needle: SVGElement; ship: SVGElement; current: SVGElement } {
  const root = svg('svg', { class: 'dial', width: 88, height: 88, viewBox: '0 0 88 88' });
  root.append(svg('circle', { cx: 44, cy: 44, r: 34, fill: 'rgba(0,0,0,0.35)', stroke: '#7a6446' }));

  // The no-go sector, shaded, so the player can see where she will not sail.
  root.append(svg('path', {
    d: describeSector(44, 44, 33, -45, 45),
    fill: 'rgba(168,50,40,0.16)', stroke: 'none',
  }));

  for (let i = 0; i < 16; i++) {
    const a = (i * 22.5 * Math.PI) / 180;
    root.append(svg('line', {
      x1: 44 + Math.sin(a) * 29, y1: 44 - Math.cos(a) * 29,
      x2: 44 + Math.sin(a) * 33, y2: 44 - Math.cos(a) * 33,
      stroke: '#6d5a3f', 'stroke-width': 0.7,
    }));
  }

  // The ship, which turns within the dial: the dial is oriented to true north.
  const ship = svg('g', {});
  ship.append(svg('path', { d: 'M44 30 L39 52 L44 48 L49 52 Z', fill: '#efe4cc', opacity: 0.9 }));
  root.append(ship);

  // Wind arrow, pointing from where the wind blows.
  const needle = svg('g', {});
  needle.append(svg('line', { x1: 44, y1: 12, x2: 44, y2: 34, stroke: '#c8a44e', 'stroke-width': 2.2 }));
  needle.append(svg('path', { d: 'M44 36 L40 27 L48 27 Z', fill: '#c8a44e' }));
  root.append(needle);

  // Current arrow, pointing the way the water sets.
  const current = svg('g', { opacity: 0 });
  current.append(svg('line', { x1: 44, y1: 44, x2: 44, y2: 68, stroke: '#5aa0c8', 'stroke-width': 1.6 }));
  current.append(svg('path', { d: 'M44 72 L40 64 L48 64 Z', fill: '#5aa0c8' }));
  root.append(current);

  return { root, needle, ship, current };
}

function describeSector(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
}

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r };
}

export { formatBearing };

/**
 * How long until she is up with the mark, in the words a log would use. An
 * infinite figure means she is not closing it at all — hove to, becalmed, or
 * standing the wrong way entirely — and saying so is more use than a number.
 */
function formatEta(hours: number): string {
  if (!Number.isFinite(hours)) return 'not closing';
  if (hours < 1) return 'within the hour';
  if (hours < 36) return `${hours.toFixed(0)} hours`;
  const days = hours / 24;
  if (days < 14) return `${days.toFixed(1)} days`;
  return `${(days / 7).toFixed(0)} weeks`;
}

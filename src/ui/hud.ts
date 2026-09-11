import { angleDelta, clamp, compassPoint, formatBearing, wrap360 } from '../core/math';
import { beaufortName } from '../world/wind';
import { moraleWord } from '../crew/crew';
import { enduranceDays } from '../crew/crew';
import { daysLeft } from '../progression/ventures';
import type { Game, MastTrim } from '../game/state';
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
  // Deliberately NOT a .hud-panel. It is a message overlay, not an instrument,
  // and inheriting the panels' backdrop-filter put an invisible 480×60 pane of
  // frosted glass across the exact centre of the screen — see the CSS.
  private alerts = el('div', { id: 'hud-alerts' });
  private course = el('div', { class: 'hud-panel', id: 'hud-course' });
  private orders = el('div', { class: 'hud-panel', id: 'hud-orders' });
  tape = new HeadingTape();
  private hint = el('div', { class: 'hint' });
  /** The alert ids currently drawn, so the panel is only rebuilt when they change. */
  private alertKey = '';

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

    // One flowing column down each side, rather than six panels pinned to fixed
    // offsets from the top and the bottom.
    //
    // Half of these appear and disappear with the situation — the course panel
    // only when a course is laid off, the orders panel only when the ship owes
    // somebody something — so anything anchored at a fixed distance down the
    // screen eventually lands on top of something else, which it did on any
    // window shorter than about seven hundred pixels. Anchored at the top and
    // allowed to flow, a panel appearing pushes the ones below it instead, and
    // the whole side clips cleanly when the screen genuinely runs out. It also
    // leaves the bottom corners entirely to the thumb controls.
    //
    // Ordered by what a captain looks at first, because that is the order they
    // survive being clipped in.
    const left = el('div', { class: 'hud-col', id: 'hud-left' },
      this.nav, this.course, this.ship);
    const right = el('div', { class: 'hud-col', id: 'hud-right' },
      this.wind, this.orders, this.time);
    this.root.append(this.tape.root, left, right, this.alerts, this.hint);
    this.hint.innerHTML =
      '<b>A</b>/<b>D</b> helm (alter course above x15) &nbsp; <b>X</b> steady &nbsp; <b>W</b>/<b>S</b> canvas &nbsp; ' +
      '<b>Q</b>/<b>E</b> trim &nbsp; <b>C</b> chart &nbsp; <b>N</b> sight &nbsp; <b>L</b> log &nbsp; ' +
      '<b>K</b> crew &nbsp; <b>V</b> view &nbsp; <b>H</b> hold course &nbsp; ' +
      '<b>O</b> orders &nbsp; <b>[</b>/<b>]</b> time &nbsp; <b>Space</b> anchor';
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
      // When the last observation was. Without this the player has no way to
      // know the reckoning is going stale except by reading a sigma he does not
      // understand, and the whole sextant is content nobody opens.
      hudRow('Last observed', lastObserved(g)),
      // Colour it, because the whole point of this line is that the player
      // should notice when it changes.
      el('div', { class: 'hud-row', style: { marginTop: '3px' } },
        el('span', {
          class: 'k',
          style: {
            fontSize: '11px',
            fontStyle: 'italic',
            lineHeight: '1.4',
            whiteSpace: 'normal',
            color: p.doubt > 26 ? '#d4553f' : p.doubt > 12 ? '#e0b96a' : '#8a7a63',
          },
        }, p.certainty)),
    );
    this.compassCard.setAttribute('transform', `rotate(${-r.compass} 44 44)`);
    this.compassShip.setAttribute('transform', `rotate(${wrap360(r.cog - r.heading)} 44 44)`);

    // --- Wind --------------------------------------------------------------
    const wx = g.weatherNow;
    // The dial reads the shown wind, not the instantaneous one, so the needle
    // and the sea it is describing never disagree — and so it does not spin
    // through twenty-six degrees a frame when the clock is wound up.
    const shown = g.displayWind;
    clear(this.wind);
    this.wind.append(
      el('div', { class: 'hud-title' }, 'Wind and sea'),
      el('div', { class: 'hud-big' }, shown.speed.toFixed(0),
        el('span', { class: 'hud-unit' }, `kn from ${compassPoint(shown.from)}`)),
      this.windSvg,
      hudRow('Point of sail', r.inIrons ? 'IN IRONS' : `${r.pointOfSail}${r.tack ? ', ' + r.tack : ''}`),
      hudRow('Apparent', `${r.apparent.toFixed(0)} kn at ${Math.abs(r.beta).toFixed(0)}°`),
      hudRow('Sea', `${g.displayWave.toFixed(1)} m — ${beaufortName(shown.speed)}`),
      hudRow('Set', g.currentKnots > 0.15 ? `${g.currentKnots.toFixed(1)} kn ${compassPoint(g.currentToward)}` : 'none felt'),
      hudRow('Visibility', wx.visibility > 20 ? 'clear' : `${wx.visibility.toFixed(1)} miles`),
    );
    this.windNeedle.setAttribute('transform', `rotate(${shown.from} 44 44)`);
    this.windShip.setAttribute('transform', `rotate(${g.displayHeading} 44 44)`);
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
    // One bar per mast, showing the angle the yard is braced to against the
    // angle that would draw best. A single percentage score told the player his
    // trim was eighty-four per cent right, which is not something anyone can act
    // on; where the yard is and where it wants to be, he can.
    //
    // When the watch have the sheets and are keeping them well, the bars are
    // only telling the player about work he is not doing — so they go away, and
    // come back the moment either of those stops being true.
    const kept = g.autoTrim && !trim.shifting && trim.quality > 0.9;
    const trimBars = kept
      ? null
      : el('div', { class: 'trim-stack' }, ...trim.masts.map((m) => trimBarFor(m)));

    const endurance = enduranceDays(g.crew, g.ration);
    append(this.ship,
      el('div', { class: 'hud-title' }, g.ship.name),
      el('div', { class: 'hud-row' },
        el('span', { class: 'k' }, `Canvas ${(r.canvas * 100).toFixed(0)}%`),
        el('span', {
          class: 'v',
          style: { color: overCanvas ? '#d4553f' : g.rules.autoCanvas ? '#8fbf7a' : '#efe4cc' },
        }, overCanvas
          ? 'MORE THAN SHE WILL BEAR'
          : g.rules.autoCanvas
            // The watch are handling it, so the number to watch is not the
            // prudent limit — it is what the captain has asked for and has not
            // got yet, which is the only part still up to him.
            ? r.canvas < g.orderedCanvas - 0.03
              ? `shortened from ${(g.orderedCanvas * 100).toFixed(0)}%`
              : 'the watch have her'
            : `prudent to ${(r.prudent * 100).toFixed(0)}%`)),
      trimBar,
      el('div', { class: 'hud-row' },
        el('span', { class: 'k' }, 'Trim'),
        el('span', {
          class: 'v',
          style: { color: kept ? '#8fbf7a' : trim.quality > 0.94 ? '#8fbf7a' : '#e0b96a' },
        }, kept
          ? 'kept by the watch'
          : g.autoTrim && trim.shifting
            ? 'sails coming across'
            : trim.advice)),
      trimBars,
      el('div', { class: 'hud-row' },
        el('span', { class: 'k' }, 'Helm'),
        el('span', { class: 'v' },
          Math.abs(r.rudder) < 0.04
            ? 'amidships'
            : `${(Math.abs(r.rudder) * 100).toFixed(0)}% to ${r.rudder > 0 ? 'starboard' : 'port'}`)),
      helmBar,
      hudRow('Heel', `${Math.abs(g.displayHeel).toFixed(0)}° to ${g.displayHeel >= 0 ? 'starboard' : 'port'}`),
      hudRow('Leeway', `${Math.abs(r.leeway).toFixed(1)}°`),
      hudRow('Hands', `${r.ableHands} of ${g.crew.count} able`),
      hudRow('Crew', moraleWord(g.crew.morale)),
      hudRow('Stores', `${endurance.toFixed(0)} days`),
      hudRow('By the lead', g.sounding.depth > 200 ? 'no bottom' : `${g.sounding.depth.toFixed(0)} fathoms`),
      // The pump, which is the thing that quietly sinks ships.
      //
      // She makes water after any damage, the slider that decides whether the
      // pumps keep up is three clicks deep in the crew screen, and nothing ever
      // pointed at it. Playtesting sank her in eight days from a single
      // grounding without the player ever being told there was a decision to
      // make. It belongs on the deck, next to the leak.
      g.ship.condition.bilge > 0.3
        ? el('div', { class: 'hud-row' },
            el('span', { class: 'k' }, 'Bilge'),
            el('span', {
              class: 'v',
              style: { color: pumpLosing(g) ? '#d4553f' : '#e0b96a' },
            }, `${g.ship.condition.bilge.toFixed(1)} tons — ${
              pumpLosing(g) ? 'GAINING' : 'holding'}`))
        : null,
      g.ship.condition.bilge > 0.3
        ? el('div', { class: 'hud-row' },
            el('span', { class: 'k' }, 'At the pumps'),
            el('span', { class: 'v' },
              `${(g.pumpEffort * 100).toFixed(0)}% of the watch (K)`))
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
      // Miles behind her. A ship held at the origin gives the eye nothing to
      // measure headway by; this is what a navigator used instead.
      hudRow('Run', `${g.groundRun.toFixed(0)} miles`),
      // The other thing the voyage is for. Charting is done quietly by the
      // escrivão every quarter of an hour and used to leave no trace on the
      // screen at all, which made the game's own title an activity the player
      // never saw happen.
      g.chartedThisPassage > 0
        ? hudRow('Coast drawn', `${g.chartedThisPassage.toFixed(0)} miles`)
        : null,
      g.dayRuns.length > 0
        ? hudRow(g.dayRuns[0].hours < 20 ? 'Since sailing' : 'Last day\u2019s run',
            `${g.dayRuns[0].nm.toFixed(0)} miles`)
        : null,
      g.crown.patent ? hudRow('Commission', g.crown.patent.title) : null,
    );

    // --- The course she is steering -----------------------------------------
    // Shown whenever she is being steered for something: a mark, or a course
    // the captain has ordered. A passage with a mark on the end of it is a
    // passage; without one it is an afternoon on the water.
    const dest = g.courseToDestination();
    const steer = g.courseToSteer();
    clear(this.course);
    this.course.style.display = dest || steer !== null ? '' : 'none';
    if (dest || steer !== null) {
      const off = dest ? dest.off : steer !== null ? angleDelta(g.displayHeading, steer) : 0;
      const near = dest ? dest.distNm < 3 : false;
      const helm = near
        ? 'you are up with it'
        : Math.abs(off) < 2.5
          ? 'steady as she goes'
          : `${Math.abs(off).toFixed(0)}° to ${off > 0 ? 'starboard' : 'larboard'}`;

      append(this.course,
        el('div', { class: 'hud-title' },
          g.helmOrder !== null ? 'Course ordered' : 'Bound for'),
        el('div', { class: 'hud-big' },
          g.helmOrder !== null
            ? `${g.helmOrder.toFixed(0).padStart(3, '0')}°`
            : dest!.name),
        // Where she is actually being steered, which is not the bearing of the
        // mark when the mark lies inside the no-go.
        steer !== null
          ? hudRow('Steering', `${steer.toFixed(0).padStart(3, '0')}° ${compassPoint(steer)}`)
          : null,
        g.helmOrder !== null && dest
          ? hudRow('The mark bears', `${dest.bearing.toFixed(0).padStart(3, '0')}° — H to resume`)
          : null,
        el('div', { class: 'hud-row' },
          el('span', { class: 'k' }, 'Put the helm'),
          el('span', {
            class: 'v',
            style: { color: Math.abs(off) < 2.5 ? '#7fa86a' : '#c8a44e' },
          }, helm)),
        dest ? hudRow('Distance', dest.distNm < 1
          ? 'less than a mile'
          : `${dest.distNm.toFixed(0)} miles`) : null,
        dest ? hudRow('At this rate', formatEta(dest.hours)) : null,
        // How much of the passage is behind her. This is the single readout
        // that answers "am I getting anywhere", and at the fast clock rates it
        // is the only one that visibly moves.
        dest && g.markDistNm > 1 ? progressBar(1 - dest.distNm / g.markDistNm) : null,
        el('div', { class: 'hud-row' },
          el('span', { class: 'k' }, 'The helm'),
          el('span', {
            class: 'v',
            style: { color: g.holdCourse ? '#7fa86a' : '#c8a44e' },
          }, g.holdCourse ? 'kept by the watch' : 'yours (H to hand over)')),
      );
    }

    // --- What she is at sea for --------------------------------------------
    // The single most important thing on the screen on the fortieth day of a
    // passage, when the sailing has become automatic and the reason for it has
    // not been in front of the player for a week.
    this.renderOrders(g);

    // --- Alerts ------------------------------------------------------------
    //
    // Rebuilt only when the list actually changes, not every frame.
    //
    // This whole panel is redrawn sixty times a second along with the rest of
    // the head-up display, and `.alert` carries a 0.3s fade-in. A brand-new
    // element every frame means the animation restarts every frame, so it never
    // got past the first tick of `from { opacity: 0 }` — every warning the game
    // has ever raised was in the DOM, correctly positioned, and drawn at zero
    // opacity. Land ho, the pilot asking for a sight, the watch shortening
    // sail, the noon report: none of them were ever visible.
    const key = g.alerts.slice(-3).map((a) => a.id).join(',');
    if (key !== this.alertKey) {
      this.alertKey = key;
      clear(this.alerts);
      for (const a of g.alerts.slice(-3)) {
        this.alerts.append(el('div', { class: `alert ${a.severity}` }, a.text));
        this.alerts.append(el('br'));
      }
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
        '<b>A</b>/<b>D</b> helm — alter course when the clock is up &nbsp; ' +
        '<b>W</b>/<b>S</b> canvas &nbsp; <b>Q</b>/<b>E</b> trim &nbsp; ' +
        '<b>O</b> orders &nbsp; <b>C</b> chart &nbsp; <b>N</b> sight &nbsp; <b>L</b> log &nbsp; ' +
        '<b>K</b> crew &nbsp; <b>V</b> view &nbsp; <b>M</b> sound &nbsp; <b>[</b>/<b>]</b> time &nbsp; <b>Space</b> anchor';
    }
  }

  /**
   * A short standing list of what the ship owes: the next unfinished article of
   * the commission, the charter nearest its date, and the freshest rumour. Not
   * the whole of any of them — that is what the orders screen is for — but
   * enough that the reason for the passage is never more than a glance away.
   */
  private renderOrders(g: Game): void {
    const lines: { k: string; v: string; urgent?: boolean }[] = [];

    const patent = g.crown.patent;
    if (patent) {
      const next = patent.objectives.find((o) => !o.complete && o.kind !== 'return')
        ?? patent.objectives.find((o) => !o.complete);
      if (next) {
        const want = next.amount ?? 1;
        lines.push({
          k: 'The King',
          v: want > 1
            ? `${next.description} (${Math.min(next.progress, want)}/${want})`
            : next.description,
        });
      } else {
        lines.push({ k: 'The King', v: 'Discharged. Bring her home.' });
      }
    }

    const soonest = g.activeVentures
      .slice()
      .sort((a, b) => a.dueBy - b.dueBy)[0];
    if (soonest) {
      const left = daysLeft(soonest, g.clock.t);
      lines.push({
        k: 'Freight',
        v: left < 0
          ? `${soonest.patron} — ${Math.abs(left).toFixed(0)} days overdue`
          : `${soonest.patron} — ${left.toFixed(0)} days`,
        urgent: left < 14,
      });
    }

    const lead = g.openLeads[g.openLeads.length - 1];
    if (lead) lines.push({ k: 'Hearsay', v: kindShort(lead.kind) });

    const padrao = g.padraoCheck();
    if (padrao.ok) {
      lines.push({ k: 'Ashore', v: 'A pillar may be landed here — U' });
    }

    clear(this.orders);
    this.orders.style.display = lines.length > 0 ? '' : 'none';
    if (lines.length === 0) return;

    append(this.orders,
      el('div', { class: 'hud-title' }, 'Under orders'),
      ...lines.map(({ k, v, urgent }) => el('div', { class: 'hud-row' },
        el('span', { class: 'k' }, k),
        el('span', { class: 'v', style: urgent ? { color: '#d4553f' } : {} }, v))),
      el('div', { class: 'hud-row', style: { marginTop: '3px' } },
        el('span', { class: 'k', style: { fontSize: '11px', fontStyle: 'italic' } },
          'O for the full orders')),
    );
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }
}

/**
 * How much of the passage is behind her, as a bar.
 *
 * The one readout that visibly moves at the high clock rates, which is exactly
 * when the player most needs to be told he is getting somewhere.
 */
function progressBar(fraction: number): HTMLElement {
  const pct = clamp(fraction, 0, 1) * 100;
  return el('div', { class: 'run-bar' },
    el('i', { style: { width: `${pct}%` } }),
    // Short enough to survive a phone-width column without being clipped.
    el('span', {}, `${pct.toFixed(0)}% of the way`),
  );
}

/** How long since anything corrected the reckoning, in a pilot's words. */
function lastObserved(g: Game): string {
  const days = (g.clock.t - g.nav.lastFixT) / 86400;
  if (g.nav.lastFixT <= 0 || days > 3000) return 'never';
  if (days < 0.4) return 'this watch';
  if (days < 1.4) return 'yesterday';
  if (days < 14) return `${days.toFixed(0)} days ago`;
  return `${(days / 7).toFixed(0)} weeks ago`;
}

/** Whether she is making more water than the pumps are clearing. */
function pumpLosing(g: Game): boolean {
  const leak = g.ship.condition.leak * (2 - g.ship.condition.hull);
  const pumped = g.pumpEffort * g.ship.effects.pumping * 3.2;
  return leak > pumped;
}

function kindShort(kind: string): string {
  switch (kind) {
    case 'goods': return 'a place that trades, to the south';
    case 'water': return 'a bay with good water';
    case 'passage': return 'a way through';
    case 'peril': return 'a warning worth heeding';
    default: return 'a town nobody has charted';
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

/**
 * The trim bar for one mast.
 *
 * The bar spans the whole arc the rig can actually be braced through — which is
 * a very different arc for a lateen than for a square course — with the yard's
 * present angle filled in and a mark where it would draw best. Closing the gap
 * between the two is the whole of sail trimming, and drawing them on the same
 * scale is what makes that visible at a glance.
 */
function trimBarFor(m: MastTrim): HTMLElement {
  const span = Math.max(m.max - m.min, 1);
  const norm = (deg: number) => clamp((deg - m.min) / span, 0, 1);
  const at = norm(m.trim);
  const want = norm(m.want);
  const lo = norm(m.bandLo);
  const hi = norm(m.bandHi);
  const inBand = m.trim >= m.bandLo - 0.6 && m.trim <= m.bandHi + 0.6;
  const good = m.quality > 0.975 || inBand;
  const off = Math.abs(m.trim - m.want);

  return el('div', { class: 'trim-mast' },
    el('div', { class: 'trim-mast-head' },
      el('span', { class: 'k' }, m.name),
      el('span', {
        class: 'v',
        style: { color: !m.drawing ? '#c47d2a' : good ? '#8fbf7a' : '#e0b96a' },
      }, !m.drawing
        ? 'will not draw'
        : good
          ? `${m.trim.toFixed(0)}° — well set`
          : `${m.trim.toFixed(0)}° → ${m.want.toFixed(0)}° (${
              m.trim < m.want ? 'ease' : 'harden'} ${off.toFixed(0)}°)`),
    ),
    el('div', { class: 'trim-bar' },
      el('div', {
        class: 'trim-fill',
        style: {
          width: `${at * 100}%`,
          background: !m.drawing ? '#8a5a2a' : good ? '#4d7a3e' : m.quality > 0.7 ? '#c8a44e' : '#c47d2a',
        },
      }),
      // The band that draws well enough, then the peak within it. Both are
      // drawn over the fill, so they read whether the yard is sheeted inside
      // them or outside them.
      m.drawing
        ? el('div', {
            class: 'trim-band',
            style: { left: `${lo * 100}%`, width: `${Math.max(hi - lo, 0.004) * 100}%` },
          })
        : null,
      m.drawing
        ? el('div', { class: 'trim-want', style: { left: `${want * 100}%` } })
        : null,
    ),
  );
}

import { clamp, formatLat } from '../core/math';
import { Rng } from '../core/rng';
import {
  sightOpportunities, takeSight, workMeridian,
  type MeridianReading, type SightOpportunity, type SightOutcome,
} from '../navigation/navigator';
import { sightError } from '../navigation/instruments';
import { moonPosition } from '../navigation/celestial';
import { skill } from '../crew/skills';
import type { Game } from '../game/state';
import { append, button, card, clear, el, kv } from './dom';

/**
 * Taking a sight.
 *
 * The instrument does not read the altitude for you. The body rises and falls
 * with the ship, and what you are trying to do is judge where it stands when
 * she is on an even keel. Everything about this is harder in a seaway, which is
 * exactly the complaint every pilot of the period made about it.
 */
export class SightView {
  root = el('div', { class: 'screen' });

  private body = el('div', { class: 'screen-body' });
  private game: Game | null = null;
  private onClose: () => void;

  private opportunities: SightOpportunity[] = [];
  private selected = 0;
  private index = 30;
  private outcome: SightOutcome | null = null;
  /**
   * The meridian session: altitudes taken so far on this run at the sun.
   *
   * Local noon is the moment the sun stops climbing and nobody is told when
   * that is. The session is the hunt for it — see workMeridian.
   */
  private readings: MeridianReading[] = [];
  private raf = 0;
  private phase = 0;
  private rng = new Rng(7);

  private stage = el('div', { class: 'sight-stage' });
  private bodyDot = el('div', { class: 'sight-body' });
  private indexLine = el('div', { class: 'sight-index' });
  private readout = el('div', { class: 'sight-readout' });

  constructor(onClose: () => void) {
    this.onClose = onClose;
    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'Take a sight'),
        el('div', { class: 'sub' }, 'Bring the body down to the horizon and mark it'),
      ),
      this.body,
      el('div', { class: 'screen-foot' }, button('Close  (N)', () => this.close())),
    );
  }

  open(g: Game): void {
    this.game = g;
    this.outcome = null;
    this.refreshOpportunities();
    const first = this.opportunities.findIndex((o) => o.available);
    this.selected = first >= 0 ? first : 0;
    this.index = clamp(this.opportunities[this.selected]?.altitude ?? 30, 0, 90);
    this.render();
    this.startAnimation();
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onClose();
  }

  private refreshOpportunities(): void {
    const g = this.game;
    if (!g) return;
    this.opportunities = sightOpportunities(
      g.ship.state.pos,
      g.clock.day,
      g.clock.hour,
      g.clock.dayOfYear,
      g.clock.date.year,
      g.weatherNow.cloud,
      g.weatherNow.visibility,
      g.nav.almanac,
    );
  }

  private startAnimation(): void {
    const tick = () => {
      this.phase += 0.016;
      this.updateStage();
      this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  /** How far the body swings, in degrees, from the ship's motion. */
  private bobAmplitude(): number {
    const g = this.game;
    if (!g) return 0;
    const inst = g.nav.altitudeInstrument;
    const sea = clamp(g.observingSea, 0, 10);
    return sea * inst.motionSensitivity * 0.85;
  }

  private currentBob(): number {
    const a = this.bobAmplitude();
    // Two superposed periods, so the motion is not a clean sine the player can
    // simply average by eye.
    return a * (Math.sin(this.phase * 1.35) * 0.68 + Math.sin(this.phase * 0.61 + 1.2) * 0.32);
  }

  private updateStage(): void {
    const opp = this.opportunities[this.selected];
    if (!opp || !this.game) return;

    const displayed = clamp(opp.altitude + this.currentBob(), -5, 92);
    // The stage shows 0 to 90 degrees, with the horizon at 72% height.
    const horizonY = 0.72;
    const top = 0.04;
    const y = horizonY - (displayed / 90) * (horizonY - top);
    this.bodyDot.style.top = `${y * 100}%`;
    this.bodyDot.style.left = '50%';

    const iy = horizonY - (this.index / 90) * (horizonY - top);
    this.indexLine.style.top = `${iy * 100}%`;
    this.indexLine.setAttribute('data-label', `${this.index.toFixed(1)}°`);

    this.readout.textContent =
      `Index ${this.index.toFixed(1)}°   ·   body swinging ±${this.bobAmplitude().toFixed(1)}°   ·   ` +
      `${this.game.nav.altitudeInstrument.name}`;
  }

  private render(): void {
    const g = this.game;
    if (!g) return;
    clear(this.body);

    const inst = g.nav.altitudeInstrument;
    const alm = g.nav.almanac;
    const opp = this.opportunities[this.selected];
    const night = g.weatherNow.cloud < 1 && (g.clock.hour < 5.5 || g.clock.hour > 18.5);

    this.stage.className = `sight-stage${night ? ' night' : ''}`;
    clear(this.stage);
    this.bodyDot.className = `sight-body${opp && opp.body !== 'sun' ? ' star' : ''}`;
    this.stage.append(
      el('div', { class: 'sight-horizon' }),
      this.bodyDot,
      this.indexLine,
      this.readout,
    );

    const left = el('div', {});
    append(left,
      this.stage,
      el('div', { style: { marginBottom: '12px' } },
        el('label', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, 'Index'),
        el('input', {
          type: 'range', min: '0', max: '90', step: '0.1', value: String(this.index),
          oninput: (e: Event) => { this.index = Number((e.target as HTMLInputElement).value); },
        }),
      ),
      opp?.body === 'sun'
        ? el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap' } },
            button('Take an altitude', () => this.takeReading(), {
              primary: true, disabled: !opp?.available,
              title: 'Five minutes. The sun will be a little higher when you look again \u2014 until she is not.',
            }),
            button(`Work the sight (${this.readings.length})`, () => this.workIt(), {
              disabled: this.readings.length === 0,
              title: 'Take the greatest altitude you have and turn it into a latitude.',
            }),
            this.readings.length > 0
              ? button('Start again', () => { this.readings = []; this.outcome = null; this.render(); }, { ghost: true })
              : null,
            g.can('lunars') ? this.lunarButton(g) : null,
          )
        : el('div', { style: { display: 'flex', gap: '9px' } },
            button('Mark!', () => this.mark(), { primary: true, disabled: !opp?.available }),
            button('Steady her first', () => this.steady(), {
              title: 'Heave to and wait for a smoother moment. Costs an hour.',
              disabled: !opp?.available,
            }),
            g.can('lunars') ? this.lunarButton(g) : null,
          ),
      this.readings.length > 0 ? this.renderLadder() : null,
      this.outcome ? this.renderOutcome() : el('div', { class: 'quote', style: { marginTop: '14px' } },
        opp?.body === 'sun'
          ? 'Noon is not a time anybody can tell you. It is the moment the sun stops climbing, '
            + 'and the only way to find it is to keep measuring until she does. Take altitudes '
            + 'until one comes out lower than the last \u2014 that one before it was the meridian.'
          : 'Watch the body rise and fall with the ship. Set the index where it stands when she is on an even keel, then mark. The swing is the whole difficulty: a quadrant on a pitching deck is a guess with a brass instrument attached to it.'),
    );

    // Why this is worth doing right now, in miles rather than in sigmas.
    //
    // A pilot knows perfectly well whether his reckoning is fresher than his
    // quadrant. The player has no way to know unless he is told, and without
    // being told he cannot tell a sight that is worth an hour from one that
    // will make his position worse — which is a real decision and the reason
    // this screen exists.
    const drift = g.nav.sigmaLat;
    const daysSince = (g.clock.t - g.nav.lastFixT) / 86400;
    const expected = sightError(inst, g.weatherNow.waveHeight,
      g.skills.navegacao / 100, opp?.body === 'sun') * 60;
    const worth = expected < drift * 0.85;

    const right = el('div', {});
    right.append(
      card('Is it worth the trouble?',
        kv('The reckoning is good to', `± ${drift.toFixed(0)} miles`),
        kv('Last observation', g.nav.lastFixT > 0
          ? `${daysSince < 1 ? 'today' : `${daysSince.toFixed(0)} days ago`}`
          : 'none this voyage'),
        kv('This instrument, this sea', `± ${expected.toFixed(0)} miles`),
        el('p', { class: worth ? 'good' : '' },
          worth
            ? 'The observation is better than the reckoning. Take it.'
            : 'Your reckoning is fresher than anything this instrument will give '
              + 'you in this sea. Sail on, or wait for a smoother day.'),
      ),
      card('What can be shot',
        ...this.opportunities.map((o, i) => this.renderOpportunity(o, i)),
      ),
      card('Your instruments',
        kv('Altitude', inst.name),
        kv('Tables', alm.name),
        // What the books aboard can and cannot do, said here rather than
        // discovered after a sight has been worked. The two are genuinely
        // different books: a rule for the pole star is not a table of solar
        // declination, and a captain who does not know that goes south with the
        // wrong one and loses his latitude at the line.
        kv('The pole star', alm.declinationError < 2
          ? `Good to about ${(alm.declinationError * 60).toFixed(0)} miles`
          : 'No rule for the Guards — three degrees either way'),
        kv('The sun', alm.solarError === null
          ? 'No declination tables — cannot be worked'
          : alm.southern
            ? `Good to about ${(alm.solarError * 60).toFixed(0)} miles, north or south`
            : `Good to about ${(alm.solarError * 60).toFixed(0)} miles, north of the line only`),
        kv('Speed', g.nav.speedInstrument.name),
        kv('Compass', g.nav.compass.name),
        el('p', { style: { marginTop: '9px', fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-soft)' } }, inst.blurb),
        alm.solarError === null
          ? el('p', { class: 'notice', style: { marginTop: '10px' } },
            'You are carrying a rule for the pole star and nothing else, which is what a '
            + 'caravel of this date carried. Take the North Star by night. The sun wants a '
            + 'table of declination for the day, which is a separate book, sold at Lisbon — '
            + 'and you will need it south of the line, where the pole star sets astern of you '
            + 'and never comes up again.')
          : !alm.southern
            ? el('p', { class: 'notice', style: { marginTop: '10px' } },
              'Your tables stop at the equator. South of the line neither the pole star nor '
              + 'these tables will give you a latitude, and the Casa sells ones that go further.')
            : el('span', {}),
      ),
      card('The reckoning',
        kv('Latitude', formatLat(g.nav.estimated.lat)),
        kv('Doubt in latitude', `± ${g.nav.sigmaLat.toFixed(0)} miles`),
        kv('Doubt in longitude', `± ${g.nav.sigmaLon.toFixed(0)} miles`),
        el('p', { style: { marginTop: '9px', fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: '1.55' } },
          'A sight corrects your latitude. Nothing corrects your longitude, because there is no way in this century to measure it at sea. You close the east-west error only by making a landfall on something you recognise.'),
      ),
    );

    const cols = el('div', { class: 'cols side' }, left, right);
    this.body.append(cols);
    this.updateStage();
  }

  private renderOpportunity(o: SightOpportunity, i: number): HTMLElement {
    const selected = i === this.selected;
    const row = el('div', {
      style: {
        padding: '8px 10px',
        marginBottom: '5px',
        borderRadius: '2px',
        cursor: o.available ? 'pointer' : 'default',
        background: selected ? 'rgba(42,31,20,0.1)' : 'transparent',
        borderLeft: `2px solid ${o.available ? 'var(--green)' : 'rgba(90,74,55,0.25)'}`,
        opacity: o.available ? '1' : '0.62',
      },
      onclick: () => {
        if (!o.available) return;
        this.selected = i;
        this.index = clamp(o.altitude, 0, 90);
        this.outcome = null;
        this.render();
      },
    },
    );
    append(row,
      el('div', { style: { fontSize: '13.5px' } }, o.label),
      el('div', { style: { fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' } },
        o.available ? `Standing ${o.altitude.toFixed(1)}° above the horizon` : (o.reason ?? '')),
      // The pilot had yesterday's noon and knows how far she has run since, so
      // he can say when to be at the rail. Without it the player cannot know
      // when to start and the hunt becomes a clicking exercise.
      o.body === 'sun' && o.minutesToNoon !== undefined
        ? el('div', {
            style: {
              fontSize: '11.5px', marginTop: '3px',
              color: Math.abs(o.minutesToNoon) < 6 ? 'var(--green)' : 'var(--ink-soft)',
            },
          },
          o.minutesToNoon > 1
            ? `The pilot makes it about ${o.minutesToNoon} minutes to the meridian.`
            : o.minutesToNoon < -1
              ? `She turned about ${-o.minutesToNoon} minutes ago and is falling.`
              : 'She is on the meridian now.')
        : null,
    );
    return row;
  }

  private steady(): void {
    const g = this.game;
    if (!g) return;
    g.clock.t += 3600;
    g.crew.fatigue = clamp(g.crew.fatigue + 0.02, 0, 1);
    g.refreshEnvironment();
    this.refreshOpportunities();
    this.outcome = null;
    this.render();
  }

  /**
   * The lunar, which exists only for the captain who has learned it.
   *
   * Deliberately not an opportunity in the list beside the sun and the pole
   * star: those give a latitude, this gives a longitude, and the difference is
   * the whole reason the node costs four points. It wants the moon well up and
   * a sky clear enough to measure a distance across, and it costs four hours of
   * working — which on a good day is fifteen miles of easting given up to learn
   * where you are within fifteen miles of easting.
   */
  private lunarButton(g: Game): HTMLElement {
    const m = moonPosition(
      g.ship.state.pos.lat, g.ship.state.pos.lon, g.clock.day, g.clock.hour);
    const why = m.altitude < 12
      ? 'The moon is too low to measure a distance from.'
      : m.phase > 0.96 || m.phase < 0.06
        ? 'The moon is too near the sun to work a distance.'
        : g.weatherNow.cloud > 0.55
          ? 'Too much cloud to bring the moon and a star together.'
          : null;
    return button('Work a lunar', () => this.lunar(), {
      title: why ?? 'Four hours of observation and working, for a longitude.',
      disabled: !!why,
    });
  }

  private lunar(): void {
    const g = this.game;
    if (!g || !g.can('lunars')) return;
    const m = moonPosition(
      g.ship.state.pos.lat, g.ship.state.pos.lon, g.clock.day, g.clock.hour);

    // A quarter of a degree of lunar distance is half a degree of longitude,
    // and everything about the sea makes it worse: the moon low, the ship
    // lively, the instrument coarse.
    const inst = g.nav.altitudeInstrument;
    const sigmaNm = clamp(
      26 * inst.baseError
        * (1 + inst.motionSensitivity * Math.min(g.observingSea, 8) * 0.2)
        * (1 + Math.max(0, 40 - m.altitude) / 55),
      11, 95,
    );
    const observed = g.ship.state.pos.lon + this.rng.normal(0, sigmaNm / (60 * Math.max(0.25, Math.cos(g.ship.state.pos.lat * Math.PI / 180))));
    const before = g.nav.sigmaLon;
    g.nav.applyLongitude(observed, sigmaNm, g.clock.t);
    g.clock.t += 4 * 3600;
    g.crew.fatigue = clamp(g.crew.fatigue + 0.05, 0, 1);
    g.refreshEnvironment();
    this.outcome = {
      ok: true,
      method: 'Lunar distance',
      message:
        `Four hours at the tables. The distance of the moon from the star, worked back to the hour at Lisbon, `
        + `puts her longitude at ${Math.abs(g.nav.estimated.lon).toFixed(2)}\u00b0 ${g.nav.estimated.lon >= 0 ? 'E' : 'W'}, `
        + `within some ${sigmaNm.toFixed(0)} miles. The doubt in her easting was ${before.toFixed(0)} miles; it is now ${g.nav.sigmaLon.toFixed(0)}.`,
    };
    g.logEvent('navigation',
      `Lunar distance worked. Longitude by observation ${Math.abs(g.nav.estimated.lon).toFixed(2)}\u00b0 ${g.nav.estimated.lon >= 0 ? 'E' : 'W'}, doubt ${g.nav.sigmaLon.toFixed(0)} miles.`, true);
    this.refreshOpportunities();
    this.render();
  }

  /**
   * One altitude, and five minutes gone.
   *
   * The reading is what the player judged — the index against a body that is
   * swinging — and the truth at that instant is kept beside it so the session
   * can be scored honestly afterwards. Time passes, which is the whole cost:
   * the meridian window is not wide and the sun does not wait.
   */
  private takeReading(): void {
    const g = this.game;
    const opp = this.opportunities[this.selected];
    if (!g || !opp?.available) return;

    this.readings.push({
      hour: g.clock.hour,
      observed: this.index,
      truth: opp.altitude,
    });

    // Five minutes with the instrument, and the sun has moved.
    g.clock.t += 5 * 60;
    g.refreshEnvironment();
    this.refreshOpportunities();
    this.outcome = null;
    this.render();
  }

  /** Turn the session into a latitude. */
  private workIt(): void {
    const g = this.game;
    if (!g || this.readings.length === 0) return;
    const sun = this.opportunities.find((o) => o.body === 'sun');
    const boreSouth = (sun?.azimuth ?? 180) > 90 && (sun?.azimuth ?? 180) < 270;

    const outcome = workMeridian(
      g.nav, this.readings, g.ship.state.pos, g.clock.dayOfYear,
      boreSouth, g.clock.t, this.rng,
    );
    this.outcome = outcome;
    if (outcome.ok) {
      g.logEvent('navigation',
        `${outcome.method}: ${this.readings.length} altitudes, the greatest `
        + `${(outcome.peak ?? 0).toFixed(1)}\u00b0. The reckoning is amended to `
        + `${formatLat(g.nav.estimated.lat)}.`);
      // Working the figures takes a while, on top of the observing.
      g.clock.t += 20 * 60;
    }
    this.readings = [];
    g.refreshEnvironment();
    this.refreshOpportunities();
    this.render();
  }

  /**
   * The altitudes so far, as a ladder.
   *
   * Reading down it is the whole skill: while the numbers keep rising the sun
   * is still climbing and noon has not come. The moment one comes out lower
   * than the one before, the previous one was the meridian, and stopping before
   * that has put your latitude out in a direction the figures will not show.
   */
  private renderLadder(): HTMLElement {
    const peak = Math.max(...this.readings.map((r) => r.observed));
    const turned = this.readings.length > 1
      && this.readings[this.readings.length - 1].observed < peak - 0.02;
    return el('div', { class: 'card', style: { marginTop: '14px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        el('h2', { style: { margin: 0, fontSize: '15px' } }, 'The altitudes'),
        el('span', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
          `${(this.readings.length * 5)} minutes at the rail`),
      ),
      el('table', { class: 'ledger', style: { marginTop: '8px' } },
        el('tbody', {}, ...this.readings.map((r, i) => {
          const prev = i > 0 ? this.readings[i - 1].observed : null;
          const rising = prev === null ? null : r.observed > prev;
          return el('tr', {},
            el('td', {}, `${Math.floor(r.hour)}h${String(Math.round((r.hour % 1) * 60)).padStart(2, '0')}`),
            el('td', { class: 'num', style: { fontWeight: r.observed === peak ? '600' : '400' } },
              `${r.observed.toFixed(1)}\u00b0`),
            el('td', { style: { color: 'var(--ink-soft)', fontSize: '12.5px' } },
              rising === null ? 'the first' : rising ? 'higher' : 'lower \u2014 she has turned'),
          );
        })),
      ),
      el('p', { style: { fontSize: '12.5px', marginTop: '8px', color: turned ? 'var(--green)' : 'var(--ink-soft)' } },
        turned
          ? 'She has turned. The greatest of these is the meridian altitude and the sight is good.'
          : 'Still climbing. Stop now and your latitude will be out, and the figures will not say so.'),
    );
  }

  private mark(): void {
    const g = this.game;
    const opp = this.opportunities[this.selected];
    if (!g || !opp) return;

    // The player's own reading error: how far the index sits from where the
    // body truly stands, judged through the ship's motion.
    const aimError = this.index - opp.altitude;

    const eff = g.effectiveSkill;
    const outcome = takeSight(
      g.nav, opp, g.ship.state.pos, g.clock.day, g.clock.hour,
      g.clock.dayOfYear, g.clock.date.year, g.observingSea,
      skill(eff, 'navegacao'), aimError, g.clock.t, this.rng,
    );

    this.outcome = outcome;
    if (outcome.ok) {
      g.logEvent('navigation',
        `${outcome.method}: ${outcome.message} The reckoning is amended to ${formatLat(g.nav.estimated.lat)}.`);
      g.clock.t += 900;
    }
    g.refreshEnvironment();
    this.render();
  }

  private renderOutcome(): HTMLElement {
    const o = this.outcome!;
    const g = this.game!;
    if (!o.ok) {
      return el('div', { class: 'notice grave', style: { marginTop: '14px' } }, o.message);
    }
    // A lunar gives a longitude, so none of the latitude talk below applies.
    if (o.latitude === undefined) {
      return el('div', { class: 'notice', style: { marginTop: '14px' } }, o.message);
    }
    const err = Math.abs((o.latitude ?? 0) - g.ship.state.pos.lat) * 60;
    // The working, which is what turns a dice roll into navigation. A player
    // who can see the zenith distance and the declination go into the answer
    // is doing the sight; one who is shown a number is being told a result.
    const working = (o as { working?: string[] }).working;
    const box = el('div', { class: 'notice', style: { marginTop: '14px' } });
    append(box,
      el('div', { style: { marginBottom: '6px' } }, o.message),
      working
        ? el('div', {
            style: {
              margin: '8px 0', padding: '8px 10px', fontSize: '12.5px', lineHeight: '1.7',
              borderLeft: '2px solid rgba(90,74,55,0.35)', fontVariantNumeric: 'tabular-nums',
            },
          }, ...working.map((l) => el('div', {}, l)))
        : null,
      el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
        `Latitude now reckoned ${formatLat(g.nav.estimated.lat)}, with a doubt of ${g.nav.sigmaLat.toFixed(0)} miles. ` +
        (err < 8
          ? 'A good observation.'
          : err < 25
            ? 'Serviceable, though the swing beat you a little.'
            : 'A poor sight. Take another when she is steadier, or with a better instrument.')),
    );
    return box;
  }
}

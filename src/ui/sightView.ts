import { clamp, formatLat } from '../core/math';
import { Rng } from '../core/rng';
import {
  sightOpportunities, takeSight, type SightOpportunity, type SightOutcome,
} from '../navigation/navigator';
import { sightError } from '../navigation/instruments';
import { skill } from '../crew/skills';
import type { Game } from '../game/state';
import { button, card, clear, el, kv } from './dom';

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
    const sea = clamp(g.weatherNow.waveHeight, 0, 10);
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
    left.append(
      this.stage,
      el('div', { style: { marginBottom: '12px' } },
        el('label', { style: { fontSize: '12px', color: 'var(--ink-soft)' } }, 'Index'),
        el('input', {
          type: 'range', min: '0', max: '90', step: '0.1', value: String(this.index),
          oninput: (e: Event) => { this.index = Number((e.target as HTMLInputElement).value); },
        }),
      ),
      el('div', { style: { display: 'flex', gap: '9px' } },
        button('Mark!', () => this.mark(), { primary: true, disabled: !opp?.available }),
        button('Steady her first', () => this.steady(), {
          title: 'Heave to and wait for a smoother moment. Costs an hour.',
          disabled: !opp?.available,
        }),
      ),
      this.outcome ? this.renderOutcome() : el('div', { class: 'quote', style: { marginTop: '14px' } },
        'Watch the body rise and fall with the ship. Set the index where it stands when she is on an even keel, then mark. The swing is the whole difficulty: a quadrant on a pitching deck is a guess with a brass instrument attached to it.'),
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
        kv('Speed', g.nav.speedInstrument.name),
        kv('Compass', g.nav.compass.name),
        el('p', { style: { marginTop: '9px', fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-soft)' } }, inst.blurb),
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
    return el('div', {
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
      el('div', { style: { fontSize: '13.5px' } }, o.label),
      el('div', { style: { fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' } },
        o.available ? `Standing ${o.altitude.toFixed(1)}° above the horizon` : (o.reason ?? '')),
    );
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
      g.clock.dayOfYear, g.clock.date.year, g.weatherNow.waveHeight,
      skill(eff, 'navegacao'), aimError, g.clock.t, this.rng,
    );

    this.outcome = outcome;
    if (outcome.ok) {
      g.logEvent('navigation',
        `${outcome.method}: ${outcome.message} The reckoning is amended to ${formatLat(g.nav.estimated.lat)}.`);
      const accuracy = Math.abs(aimError);
      const reward = clamp(2.2 - accuracy * 0.9, 0.2, 2.2);
      const before = g.skills.navegacao;
      g.skills.navegacao = Math.min(100, before + reward);
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
    const err = Math.abs((o.latitude ?? 0) - g.ship.state.pos.lat) * 60;
    return el('div', { class: 'notice', style: { marginTop: '14px' } },
      el('div', { style: { marginBottom: '6px' } }, o.message),
      el('div', { style: { fontSize: '12.5px', color: 'var(--ink-soft)' } },
        `Latitude now reckoned ${formatLat(g.nav.estimated.lat)}, with a doubt of ${g.nav.sigmaLat.toFixed(0)} miles. ` +
        (err < 8
          ? 'A good observation.'
          : err < 25
            ? 'Serviceable, though the swing beat you a little.'
            : 'A poor sight. Take another when she is steadier, or with a better instrument.')),
    );
  }
}

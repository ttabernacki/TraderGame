import { clamp, lerp, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import type { SkillId } from './skills';

export type OfficerRole =
  | 'piloto' | 'mestre' | 'contramestre' | 'escrivao' | 'cirurgiao' | 'capelao' | 'lingua' | 'degredado';

export interface OfficerDef {
  role: OfficerRole;
  title: string;
  english: string;
  /** Which of the captain's skills this officer supplements. */
  supports: SkillId | null;
  blurb: string;
}

export const OFFICER_ROLES: OfficerDef[] = [
  { role: 'piloto', title: 'Piloto', english: 'Pilot', supports: 'navegacao', blurb: 'Keeps the reckoning, takes the sights, and is the only man aboard who can be relied on to say where you are.' },
  { role: 'mestre', title: 'Mestre', english: 'Sailing master', supports: 'marinharia', blurb: 'Runs the ship as a ship: the rigging, the trim, the working of her.' },
  { role: 'contramestre', title: 'Contramestre', english: 'Boatswain', supports: 'marinharia', blurb: 'Drives the hands. Sail comes in faster with a good one and not at all with a bad one.' },
  { role: 'escrivao', title: 'Escrivão', english: 'Clerk', supports: 'comercio', blurb: 'The Crown\'s man. Keeps the cargo books, and reports what he sees.' },
  { role: 'cirurgiao', title: 'Cirurgião', english: 'Surgeon', supports: null, blurb: 'Cannot cure the scurvy, because nobody can, but he can keep men alive who would otherwise die of other things.' },
  { role: 'capelao', title: 'Capelão', english: 'Chaplain', supports: 'lideranca', blurb: 'Says the mass, hears the confessions, and buries them. Worth a great deal to the men\'s hearts.' },
  { role: 'lingua', title: 'Língua', english: 'Interpreter', supports: 'diplomacia', blurb: 'Speaks a tongue of the coast. Without one you are shouting at strangers and hoping.' },
  { role: 'degredado', title: 'Degredado', english: 'Convict envoy', supports: null, blurb: 'A condemned man carried to be put ashore among strangers. If he survives a year he learns the language and earns his pardon; if not, nothing of value is lost, which is exactly how the Crown puts it.' },
];

export interface Officer {
  id: string;
  name: string;
  role: OfficerRole;
  /** 0-1. */
  ability: number;
  /** Languages known, matched against a people's language. */
  languages: string[];
  loyalty: number;
  alive: boolean;
  /** Days ashore, for a degredado left to learn a language. */
  ashoreAt?: string;
  ashoreSince?: number;
  wage: number;
  /** Character: see progression/officers. Moves numbers and gives him opinions. */
  trait?: string;
  /** Things the captain has done that this man remembers, newest first. */
  memory?: string[];
}

export interface Provisions {
  /** Days of drinking water aboard, per man. */
  water: number;
  biscuit: number;
  saltMeat: number;
  wine: number;
  /** Fresh food, which is the only thing that holds off the scurvy. */
  fresh: number;
}

export interface CrewState {
  count: number;
  /** Full complement for this hull. */
  complement: number;
  morale: number;
  /** 0 healthy, 1 dead. Aggregate scurvy burden across the crew. */
  scurvy: number;
  /** Other sickness: fevers on the Guinea coast, flux, injuries. */
  sickness: number;
  /** Days since the last fresh provisions came aboard. */
  daysWithoutFresh: number;
  /** Days since the crew last set foot on land. */
  daysSinceLandfall: number;
  fatigue: number;
  officers: Officer[];
  provisions: Provisions;
  /** Rising unrest. Above one, they rise. */
  unrest: number;
  deaths: number;
}

const FIRST_NAMES = [
  'João', 'Pedro', 'Diogo', 'Álvaro', 'Gonçalo', 'Nuno', 'Fernão', 'Rui', 'Estêvão',
  'Vasco', 'Bartolomeu', 'Duarte', 'Afonso', 'Martim', 'Lourenço', 'Gil', 'Tristão',
  'Simão', 'Cristóvão', 'Antão', 'Jorge', 'Manuel', 'Sancho', 'Braz', 'Aires',
];
const SURNAMES = [
  'da Silva', 'Gonçalves', 'Fernandes', 'Rodrigues', 'Dias', 'Peres', 'Cabral',
  'de Sousa', 'Coelho', 'Escobar', 'Álvares', 'Nunes', 'de Barros', 'Teixeira',
  'Correia', 'de Azevedo', 'Vaz', 'Lopes', 'Martins', 'Cão', 'Velho', 'Baldaia',
  'de Sintra', 'Gomes', 'de Mendonça', 'Pacheco', 'de Abreu', 'Homem',
];

export function randomName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`;
}

export function makeOfficer(role: OfficerRole, rng: Rng, ability?: number, languages: string[] = []): Officer {
  return {
    id: `of${Math.floor(rng.next() * 1e9).toString(36)}`,
    name: randomName(rng),
    role,
    ability: ability ?? clamp(rng.normal(0.45, 0.16), 0.08, 0.95),
    languages,
    loyalty: clamp(rng.normal(0.62, 0.14), 0.15, 1),
    alive: true,
    wage: Math.round(lerp(8, 40, ability ?? 0.45)),
  };
}

export function newCrew(complement: number, rng: Rng): CrewState {
  return {
    count: complement,
    complement,
    morale: 0.72,
    scurvy: 0,
    sickness: 0.02,
    daysWithoutFresh: 0,
    daysSinceLandfall: 0,
    fatigue: 0,
    officers: [
      makeOfficer('piloto', rng, 0.5),
      makeOfficer('mestre', rng, 0.5),
      makeOfficer('contramestre', rng, 0.42),
    ],
    provisions: { water: 90, biscuit: 120, saltMeat: 90, wine: 70, fresh: 20 },
    unrest: 0,
  deaths: 0,
  };
}

/** Officer bonus for a skill, as a fraction added to the captain's own. */
export function officerBonus(crew: CrewState, id: SkillId): number {
  let best = 0;
  for (const o of crew.officers) {
    if (!o.alive || o.ashoreAt) continue;
    const def = OFFICER_ROLES.find((r) => r.role === o.role);
    if (def?.supports === id) best = Math.max(best, o.ability * 0.45);
  }
  return best;
}

export function hasInterpreterFor(crew: CrewState, language: string): Officer | null {
  for (const o of crew.officers) {
    if (!o.alive || o.ashoreAt) continue;
    if (o.languages.includes(language)) return o;
  }
  return null;
}

/** How much of the ship's work the present crew can actually do. */
export function crewFactor(crew: CrewState, minimum: number): number {
  const able = ableHands(crew);
  return clamp(able / Math.max(minimum, 1), 0, 1.6) * (1 - crew.fatigue * 0.35);
}

export function ableHands(crew: CrewState): number {
  return Math.max(0, Math.floor(crew.count * (1 - crew.scurvy * 0.85 - crew.sickness * 0.7)));
}

export interface CrewEvent {
  kind: 'death' | 'scurvy' | 'sickness' | 'unrest' | 'mutiny' | 'recovery' | 'starvation' | 'thirst';
  message: string;
  severity: 'note' | 'warning' | 'grave';
}

export interface CrewUpdateContext {
  /** Simulated days elapsed this step. */
  days: number;
  ashore: boolean;
  /** Fraction of full ration being issued, 0.5 to 1.25. */
  ration: number;
  leadership: number;
  surgeonQuality: number;
  /** Rising when driving the ship hard in heavy weather. */
  exertion: number;
  /** True when the ship is in waters no Portuguese has sailed. */
  beyondTheKnown: boolean;
  gold: number;
  rng: Rng;
  /** Daily morale added by the character of the officers aft. */
  wardroomMorale?: number;
  /** Multiplies unrest accumulation. */
  wardroomUnrest?: number;
  /** Multiplies the dread of unsailed water. */
  wardroomFear?: number;
}

/**
 * Advance the crew's condition.
 *
 * Scurvy is the centrepiece and it is not softened. Nobody in this century knows
 * the cause; the only thing that prevents it is fresh food, and the only thing
 * that cures it is getting ashore where fresh food is. On the first voyage to
 * India, Vasco da Gama buried a hundred men out of a hundred and seventy, and
 * had so few left that he burned one of his three ships because he could not
 * man her.
 */
export function updateCrew(crew: CrewState, ctx: CrewUpdateContext): CrewEvent[] {
  const events: CrewEvent[] = [];
  const d = ctx.days;
  if (d <= 0) return events;

  const men = Math.max(crew.count, 1);
  const p = crew.provisions;

  // --- Consumption --------------------------------------------------------
  const rate = d * ctx.ration;
  p.water -= rate;
  p.biscuit -= rate;
  p.saltMeat -= rate * 0.8;
  p.wine -= rate * 0.6;
  p.fresh -= d * 1.4;

  if (p.fresh <= 0) {
    p.fresh = 0;
    crew.daysWithoutFresh += d;
  } else {
    crew.daysWithoutFresh = Math.max(0, crew.daysWithoutFresh - d * 2.5);
  }

  if (ctx.ashore) {
    crew.daysSinceLandfall = 0;
  } else {
    crew.daysSinceLandfall += d;
  }

  // --- Thirst and hunger --------------------------------------------------
  let mortality = 0;
  if (p.water <= 0) {
    p.water = 0;
    mortality += d * 0.09;
    events.push({
      kind: 'thirst', severity: 'grave',
      message: 'The water is gone. The men are drinking rain from the sails and their own urine.',
    });
  } else if (p.water < 8) {
    crew.morale -= d * 0.05;
  }

  if (p.biscuit <= 0) {
    p.biscuit = 0;
    mortality += d * 0.035;
    events.push({
      kind: 'starvation', severity: 'grave',
      message: 'The bread is finished. They are boiling leather and eating the rats, and paying for them.',
    });
  } else if (p.biscuit < 12) {
    crew.morale -= d * 0.03;
  }

  // --- Scurvy -------------------------------------------------------------
  // Symptoms appear somewhere around six weeks without fresh food and worsen
  // steeply from there.
  if (crew.daysWithoutFresh > 38) {
    const over = crew.daysWithoutFresh - 38;
    const rateScurvy = d * (0.0022 + over * 0.00028) * (1 - ctx.surgeonQuality * 0.18);
    const before = crew.scurvy;
    crew.scurvy = clamp(crew.scurvy + rateScurvy, 0, 1);
    if (before < 0.12 && crew.scurvy >= 0.12) {
      events.push({
        kind: 'scurvy', severity: 'warning',
        message: 'The surgeon reports the first cases: gums swollen over the teeth, and a heaviness in the legs that no man can shake off.',
      });
    } else if (before < 0.4 && crew.scurvy >= 0.4) {
      events.push({
        kind: 'scurvy', severity: 'grave',
        message: 'The sickness has the whole ship\'s company. Old wounds long healed are opening again of their own accord. Men who were strong last month cannot come on deck.',
      });
    }
    if (crew.scurvy > 0.25) mortality += d * (crew.scurvy - 0.25) * 0.055;
  } else if (crew.scurvy > 0) {
    // Fresh food is a genuine and rapid cure, which is why every ship that could
    // touch at an island did so, whatever the delay cost.
    const before = crew.scurvy;
    crew.scurvy = Math.max(0, crew.scurvy - d * 0.055);
    if (before > 0.15 && crew.scurvy < 0.03) {
      events.push({
        kind: 'recovery', severity: 'note',
        message: 'Oranges and greens aboard, and within a fortnight men who could not stand are back at the capstan. Nobody understands why. Everybody notices.',
      });
    }
  }

  // --- Other sickness -----------------------------------------------------
  const sickPressure = clamp(0.004 + (p.water < 20 ? 0.006 : 0) + ctx.exertion * 0.01, 0, 0.05);
  crew.sickness = clamp(
    crew.sickness + d * (sickPressure - ctx.surgeonQuality * 0.006) - d * 0.004,
    0, 1,
  );
  if (crew.sickness > 0.3) mortality += d * (crew.sickness - 0.3) * 0.02;

  // --- Deaths -------------------------------------------------------------
  if (mortality > 0) {
    const dead = Math.min(crew.count, Math.floor(mortality * men + (ctx.rng.next() < (mortality * men) % 1 ? 1 : 0)));
    if (dead > 0) {
      crew.count -= dead;
      crew.deaths += dead;
      crew.morale -= dead / men * 0.9;
      events.push({
        kind: 'death', severity: 'grave',
        message: dead === 1
          ? 'One man sewn into his hammock and put over the side after the Salve.'
          : `${dead} men dead since the last reckoning. The chaplain has stopped reading the whole service.`,
      });
      // Officers are not spared.
      for (const o of crew.officers) {
        if (o.alive && !o.ashoreAt && ctx.rng.chance(mortality * 0.5)) {
          o.alive = false;
          events.push({
            kind: 'death', severity: 'grave',
            message: `${o.name}, your ${OFFICER_ROLES.find((r) => r.role === o.role)?.title.toLowerCase()}, is dead.`,
          });
        }
      }
    }
  }

  // --- Fatigue ------------------------------------------------------------
  crew.fatigue = clamp(crew.fatigue + d * (ctx.exertion * 0.22 - 0.14), 0, 1);

  // --- Morale -------------------------------------------------------------
  let moraleDelta = 0;
  moraleDelta -= d * 0.007 * clamp(1 - ctx.leadership * 0.8, 0.2, 1);
  moraleDelta -= d * smoothstep(30, 110, crew.daysSinceLandfall) * 0.022;
  moraleDelta -= d * crew.scurvy * 0.05;
  moraleDelta -= d * crew.fatigue * 0.012;
  moraleDelta -= d * (ctx.ration < 1 ? (1 - ctx.ration) * 0.05 : 0);
  if (ctx.beyondTheKnown) {
    // The fear of unknown water was not a metaphor. Crews genuinely believed the
    // sea south of Cape Bojador boiled, and turned back twelve times before Gil
    // Eanes finally sailed past it in 1434.
    moraleDelta -= d * 0.014 * clamp(1 - ctx.leadership, 0.15, 1) * (ctx.wardroomFear ?? 1);
  }
  if (ctx.ashore) moraleDelta += d * 0.05;
  if (p.wine > 0) moraleDelta += d * 0.004;
  if (p.fresh > 0) moraleDelta += d * 0.006;
  moraleDelta += d * (ctx.wardroomMorale ?? 0);

  crew.morale = clamp(crew.morale + moraleDelta, 0, 1);

  // --- Unrest -------------------------------------------------------------
  if (crew.morale < 0.3) {
    crew.unrest = clamp(
      crew.unrest + d * (0.3 - crew.morale) * 0.42 * clamp(1.3 - ctx.leadership, 0.2, 1.3)
        * (ctx.wardroomUnrest ?? 1),
      0, 2,
    );
    if (crew.unrest > 0.45 && crew.unrest - d * 0.2 <= 0.45) {
      events.push({
        kind: 'unrest', severity: 'warning',
        message: 'There is muttering forward that stops when you come near it. The boatswain has heard the word "home" more than once.',
      });
    }
    if (crew.unrest >= 1) {
      events.push({
        kind: 'mutiny', severity: 'grave',
        message: 'They have come aft in a body and told you to put the helm up for Portugal.',
      });
    }
  } else {
    crew.unrest = clamp(crew.unrest - d * 0.09, 0, 2);
  }

  return events;
}

/** Days the current stores will last at the given ration. */
export function enduranceDays(crew: CrewState, ration = 1): number {
  const p = crew.provisions;
  return Math.max(0, Math.min(p.water, p.biscuit, p.saltMeat / 0.8) / Math.max(ration, 0.1));
}

export function moraleWord(m: number): string {
  if (m > 0.85) return 'in high spirits';
  if (m > 0.68) return 'willing';
  if (m > 0.5) return 'steady';
  if (m > 0.35) return 'sullen';
  if (m > 0.2) return 'near breaking';
  return 'mutinous';
}

export function healthWord(crew: CrewState): string {
  if (crew.scurvy > 0.55) return 'dying';
  if (crew.scurvy > 0.3) return 'gravely scorbutic';
  if (crew.scurvy > 0.1) return 'showing the scurvy';
  if (crew.sickness > 0.25) return 'sickly';
  return 'sound';
}

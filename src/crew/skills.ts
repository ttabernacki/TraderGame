export type SkillId =
  | 'navegacao' | 'marinharia' | 'cartografia' | 'comercio' | 'diplomacia' | 'lideranca';

export interface SkillDef {
  id: SkillId;
  name: string;
  english: string;
  blurb: string;
  /** What each level of mastery unlocks, in order. */
  milestones: { at: number; title: string; effect: string }[];
}

export const SKILLS: SkillDef[] = [
  {
    id: 'navegacao', name: 'Navegação', english: 'Navigation',
    blurb: 'Reckoning a position from course, distance, and the height of the heavens.',
    milestones: [
      { at: 15, title: 'Allowance for leeway', effect: 'You begin plotting the course she actually makes rather than the one she is steering.' },
      { at: 30, title: 'The rule of the Guards', effect: 'You can apply the Regimento\'s correction for the pole star\'s circle about the pole.' },
      { at: 50, title: 'Steady hand', effect: 'Sights taken in a seaway lose much less of their accuracy.' },
      { at: 70, title: 'Reading the compass', effect: 'You recognise magnetic variation for what it is and allow for most of it.' },
      { at: 90, title: 'Master pilot', effect: 'Your reckoning drifts at half the rate of an ordinary pilot\'s.' },
    ],
  },
  {
    id: 'marinharia', name: 'Marinharia', english: 'Seamanship',
    blurb: 'Handling the ship: setting, trimming, and knowing when to take it all in.',
    milestones: [
      { at: 15, title: 'Smart hands', effect: 'Sail is made and shortened noticeably faster.' },
      { at: 30, title: 'Working to windward', effect: 'The crew hold a better trim without being told, and she points a little higher.' },
      { at: 50, title: 'Weathering a gale', effect: 'Far less damage taken from being over-canvassed and from heavy seas.' },
      { at: 70, title: 'Wearing and tacking', effect: 'Coming about is quicker and she is much less likely to be caught in stays.' },
      { at: 90, title: 'Master mariner', effect: 'She sails as well as her hull will allow, in any weather.' },
    ],
  },
  {
    id: 'cartografia', name: 'Cartografia', english: 'Cartography',
    blurb: 'Turning what you saw into a sheet another man can sail by.',
    milestones: [
      { at: 15, title: 'A neat hand', effect: 'Coastlines are drawn with less relative error.' },
      { at: 35, title: 'Running survey', effect: 'You chart a coast accurately from further offshore.' },
      { at: 55, title: 'Padrão real', effect: 'Discoveries are worth substantially more to the Crown.' },
      { at: 75, title: 'Correcting the sheet', effect: 'Sailing a charted coast a second time corrects the earlier drawing.' },
      { at: 95, title: 'Cosmographer', effect: 'Your charts are the standard by which others are judged.' },
    ],
  },
  {
    id: 'comercio', name: 'Comércio', english: 'Trade',
    blurb: 'Knowing what a thing is worth here, and what it will be worth in Lisbon.',
    milestones: [
      { at: 15, title: 'Weights and measures', effect: 'You see the true quality of goods offered.' },
      { at: 35, title: 'Bargaining', effect: 'Noticeably better prices at every market.' },
      { at: 55, title: 'The factor\'s eye', effect: 'You learn what a distant port pays before you sail there.' },
      { at: 75, title: 'Credit', effect: 'You may buy against the value of your cargo.' },
      { at: 95, title: 'Merchant prince', effect: 'The best prices in the ocean, and everyone knows your name.' },
    ],
  },
  {
    id: 'diplomacia', name: 'Diplomacia', english: 'Diplomacy',
    blurb: 'Arriving on a strange beach and leaving it with a treaty instead of a spear in you.',
    milestones: [
      { at: 15, title: 'Courtesy', effect: 'First contact goes better; fewer misunderstandings turn violent.' },
      { at: 35, title: 'Reading a court', effect: 'You can tell what a ruler actually wants before you offer it.' },
      { at: 55, title: 'Gifts of state', effect: 'Well-chosen presents count for far more.' },
      { at: 75, title: 'Treaties', effect: 'You may negotiate exclusive trading rights and permission to build a factory.' },
      { at: 95, title: 'Ambassador', effect: 'Even hostile courts will hear you out.' },
    ],
  },
  {
    id: 'lideranca', name: 'Liderança', english: 'Leadership',
    blurb: 'Keeping men at their work three months out of sight of land.',
    milestones: [
      { at: 15, title: 'Known to the men', effect: 'Morale falls more slowly on a long passage.' },
      { at: 35, title: 'Discipline', effect: 'Mutinies are far less likely to take hold.' },
      { at: 55, title: 'The captain\'s word', effect: 'The crew will follow you into waters they believe are cursed.' },
      { at: 75, title: 'Hard driver', effect: 'The crew work through exhaustion without breaking.' },
      { at: 95, title: 'They would follow you anywhere', effect: 'Morale hardly falls at all, and no crew of yours will ever rise.' },
    ],
  },
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export type SkillSet = Record<SkillId, number>;

export function newSkills(): SkillSet {
  return {
    navegacao: 12, marinharia: 20, cartografia: 8,
    comercio: 10, diplomacia: 10, lideranca: 15,
  };
}

/** Normalised 0-1 value used throughout the simulation. */
export function skill(set: SkillSet, id: SkillId): number {
  return Math.max(0, Math.min(1, set[id] / 100));
}

/** Milestones reached at a given level. */
export function reachedMilestones(id: SkillId, level: number) {
  return SKILL_BY_ID.get(id)!.milestones.filter((m) => level >= m.at);
}

export function hasMilestone(set: SkillSet, id: SkillId, at: number): boolean {
  return set[id] >= at;
}

/** Award experience, with diminishing returns as the skill approaches mastery. */
export function train(set: SkillSet, id: SkillId, amount: number): number {
  const before = set[id];
  const resistance = 1 - Math.pow(before / 100, 1.6) * 0.88;
  set[id] = Math.min(100, before + amount * resistance);
  return set[id] - before;
}

export function rankOf(level: number): string {
  if (level >= 95) return 'Master';
  if (level >= 75) return 'Expert';
  if (level >= 55) return 'Accomplished';
  if (level >= 35) return 'Competent';
  if (level >= 15) return 'Practised';
  return 'Novice';
}

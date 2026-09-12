export type SkillId =
  | 'navegacao' | 'marinharia' | 'cartografia' | 'comercio' | 'diplomacia' | 'lideranca';

/**
 * A thing the captain can do that another captain cannot.
 *
 * This is the whole point of the tree. A node that adds eight per cent to a
 * number is a spreadsheet entry: nobody builds a character around it and nobody
 * remembers taking it. A node that lets you fix your longitude, or lie-to in a
 * gale and still make ground, or stop needing the Crown's commission at all,
 * changes which routes exist and which voyages are possible — and two captains
 * who took different ones are playing different games.
 */
export type PerkId =
  // Seamanship
  | 'press' | 'spare' | 'lieTo'
  // Navigation
  | 'celestial' | 'deadReckoning' | 'lunars'
  // Cartography
  | 'crownsMan' | 'sheetTrade' | 'cosmographer'
  // Leadership
  | 'loved' | 'feared' | 'followAnywhere'
  // Diplomacy
  | 'treaty' | 'force' | 'feitoria'
  // Trade
  | 'credit' | 'factorsEye' | 'ownAccount';

export interface SkillDef {
  id: SkillId;
  name: string;
  english: string;
  blurb: string;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'marinharia', name: 'Marinharia', english: 'Seamanship',
    blurb: 'Handling the ship: setting, trimming, and knowing when to take it all in.',
  },
  {
    id: 'navegacao', name: 'Navegação', english: 'Navigation',
    blurb: 'Reckoning a position from course, distance, and the height of the heavens.',
  },
  {
    id: 'cartografia', name: 'Cartografia', english: 'Cartography',
    blurb: 'Turning what you saw into a sheet another man can sail by.',
  },
  {
    id: 'lideranca', name: 'Liderança', english: 'Leadership',
    blurb: 'Keeping men at their work three months out of sight of land.',
  },
  {
    id: 'diplomacia', name: 'Diplomacia', english: 'Diplomacy',
    blurb: 'Arriving on a strange beach and leaving it with a treaty instead of a spear in you.',
  },
  {
    id: 'comercio', name: 'Comércio', english: 'Trade',
    blurb: 'Knowing what a thing is worth here, and what it will be worth in Lisbon.',
  },
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export interface SkillNode {
  id: string;
  tree: SkillId;
  /** 1 to 5. Tier 3 is the fork: two nodes, and you may only ever hold one. */
  tier: number;
  name: string;
  /** What it does, in the words the captain's book would use. */
  effect: string;
  /** Points to buy it. */
  cost: number;
  /** How much of this tree's hundred it is worth, for everything that scales. */
  level: number;
  /** The other half of a fork. Buying one bars the other for good. */
  excludes?: string;
  perk?: PerkId;
}

/**
 * The trees.
 *
 * Five nodes each, costing 1, 2, 2, 3 and 4 — twelve points for a whole tree,
 * against a career of about thirty. So a captain fills two trees, dabbles in a
 * third, and never sees the rest of the game: that is what makes the choice a
 * build rather than an order of operations.
 *
 * Tier three is always a fork, and the two sides are not a better and a worse.
 * Each carries a real cost — canvas that carries away, a crew that deserts, a
 * coast that never trades with you again — because a fork where both sides are
 * good is a menu, not a decision.
 */
export const NODES: SkillNode[] = [
  // --- Seamanship ---------------------------------------------------------
  {
    id: 'sea-hands', tree: 'marinharia', tier: 1, cost: 1, level: 15,
    name: 'Smart hands',
    effect: 'Sail is made and shortened a good deal faster.',
  },
  {
    id: 'sea-windward', tree: 'marinharia', tier: 2, cost: 2, level: 15,
    name: 'Working to windward',
    effect: 'She points higher and the watch hold a better trim without being told.',
  },
  {
    id: 'sea-press', tree: 'marinharia', tier: 3, cost: 2, level: 20,
    name: 'Press her',
    effect: 'You carry canvas long past the point another man would hand it — and the spars sometimes go.',
    excludes: 'sea-spare', perk: 'press',
  },
  {
    id: 'sea-spare', tree: 'marinharia', tier: 3, cost: 2, level: 20,
    name: 'Spare her',
    effect: 'Worked gently, she wears and leaks at half the rate. You will never be the fastest.',
    excludes: 'sea-press', perk: 'spare',
  },
  {
    id: 'sea-tacking', tree: 'marinharia', tier: 4, cost: 3, level: 20,
    name: 'Wearing and tacking',
    effect: 'She comes about quickly and is never caught in stays.',
  },
  {
    id: 'sea-lieto', tree: 'marinharia', tier: 5, cost: 4, level: 30,
    name: 'Master mariner',
    effect: 'You can lie-to in a gale and still make ground. Weather that stops other ships does not stop yours.',
    perk: 'lieTo',
  },

  // --- Navigation ---------------------------------------------------------
  {
    id: 'nav-leeway', tree: 'navegacao', tier: 1, cost: 1, level: 15,
    name: 'Allowance for leeway',
    effect: 'You plot the course she actually makes rather than the one she is steering.',
  },
  {
    id: 'nav-guards', tree: 'navegacao', tier: 2, cost: 2, level: 15,
    name: 'The rule of the Guards',
    effect: 'You apply the Regimento’s correction for the pole star’s circle about the pole.',
  },
  {
    id: 'nav-celestial', tree: 'navegacao', tier: 3, cost: 2, level: 20,
    name: 'The heavens',
    effect: 'Sights hold their accuracy in a seaway and in weather that defeats other pilots.',
    excludes: 'nav-dr', perk: 'celestial',
  },
  {
    id: 'nav-dr', tree: 'navegacao', tier: 3, cost: 2, level: 20,
    name: 'The board',
    effect: 'Your reckoning drifts at half the rate with no sight at all. You never need a clear sky.',
    excludes: 'nav-celestial', perk: 'deadReckoning',
  },
  {
    id: 'nav-variation', tree: 'navegacao', tier: 4, cost: 3, level: 20,
    name: 'Reading the compass',
    effect: 'You recognise magnetic variation for what it is and allow for most of it.',
  },
  {
    id: 'nav-lunars', tree: 'navegacao', tier: 5, cost: 4, level: 30,
    name: 'Longitude by lunars',
    effect: 'You can fix your longitude. No other man alive can, and the ocean stops being a guess.',
    perk: 'lunars',
  },

  // --- Cartography --------------------------------------------------------
  {
    id: 'cart-hand', tree: 'cartografia', tier: 1, cost: 1, level: 15,
    name: 'A neat hand',
    effect: 'Coastlines are drawn with much less relative error.',
  },
  {
    id: 'cart-survey', tree: 'cartografia', tier: 2, cost: 2, level: 15,
    name: 'Running survey',
    effect: 'You chart a coast accurately from far further offshore.',
  },
  {
    id: 'cart-crown', tree: 'cartografia', tier: 3, cost: 2, level: 20,
    name: 'The Crown’s man',
    effect: 'Discoveries and padrões are worth far more standing — and the Crown expects every sheet.',
    excludes: 'cart-sheets', perk: 'crownsMan',
  },
  {
    id: 'cart-sheets', tree: 'cartografia', tier: 3, cost: 2, level: 20,
    name: 'The trade in sheets',
    effect: 'Your charts sell. Every voyage pays you again — and the Crown knows you are selling them.',
    excludes: 'cart-crown', perk: 'sheetTrade',
  },
  {
    id: 'cart-correct', tree: 'cartografia', tier: 4, cost: 3, level: 20,
    name: 'Correcting the sheet',
    effect: 'Running a coast a second time corrects the first drawing instead of arguing with it.',
  },
  {
    id: 'cart-cosmo', tree: 'cartografia', tier: 5, cost: 4, level: 30,
    name: 'Cosmographer',
    effect: 'Your chart is the chart. Other men’s voyages begin from your survey — including your mistakes.',
    perk: 'cosmographer',
  },

  // --- Leadership ---------------------------------------------------------
  {
    id: 'lead-known', tree: 'lideranca', tier: 1, cost: 1, level: 15,
    name: 'Known to the men',
    effect: 'Morale falls more slowly on a long passage.',
  },
  {
    id: 'lead-discipline', tree: 'lideranca', tier: 2, cost: 2, level: 15,
    name: 'Discipline',
    effect: 'Mutinies are far less likely to take hold.',
  },
  {
    id: 'lead-loved', tree: 'lideranca', tier: 3, cost: 2, level: 20,
    name: 'Loved',
    effect: 'They volunteer for the hard work and their spirits hardly fall. They will not be driven.',
    excludes: 'lead-feared', perk: 'loved',
  },
  {
    id: 'lead-feared', tree: 'lideranca', tier: 3, cost: 2, level: 20,
    name: 'Feared',
    effect: 'They work through exhaustion and never break. They also run the moment you touch a quay.',
    excludes: 'lead-loved', perk: 'feared',
  },
  {
    id: 'lead-word', tree: 'lideranca', tier: 4, cost: 3, level: 20,
    name: 'The captain’s word',
    effect: 'The crew will sail water they believe is cursed because you told them to.',
  },
  {
    id: 'lead-follow', tree: 'lideranca', tier: 5, cost: 4, level: 30,
    name: 'They would follow you anywhere',
    effect: 'You may give the order that ends other expeditions — press on past the turning point, and they go.',
    perk: 'followAnywhere',
  },

  // --- Diplomacy ----------------------------------------------------------
  {
    id: 'dip-courtesy', tree: 'diplomacia', tier: 1, cost: 1, level: 15,
    name: 'Courtesy',
    effect: 'First contact goes better, and fewer misunderstandings turn violent.',
  },
  {
    id: 'dip-court', tree: 'diplomacia', tier: 2, cost: 2, level: 15,
    name: 'Reading a court',
    effect: 'You can tell what a ruler actually wants before you offer it.',
  },
  {
    id: 'dip-treaty', tree: 'diplomacia', tier: 3, cost: 2, level: 20,
    name: 'Treaty',
    effect: 'You may negotiate exclusive rights and leave with an agreement that holds.',
    excludes: 'dip-force', perk: 'treaty',
  },
  {
    id: 'dip-force', tree: 'diplomacia', tier: 3, cost: 2, level: 20,
    name: 'A show of force',
    effect: 'You may demand instead of ask. It is quicker, and that coast never forgets it.',
    excludes: 'dip-treaty', perk: 'force',
  },
  {
    id: 'dip-gifts', tree: 'diplomacia', tier: 4, cost: 3, level: 20,
    name: 'Gifts of state',
    effect: 'A well-chosen present counts for a very great deal.',
  },
  {
    id: 'dip-feitoria', tree: 'diplomacia', tier: 5, cost: 4, level: 30,
    name: 'Ambassador',
    effect: 'Leave a factor ashore and come back to a feitoria that has been trading without you.',
    perk: 'feitoria',
  },

  // --- Trade --------------------------------------------------------------
  {
    id: 'tra-weights', tree: 'comercio', tier: 1, cost: 1, level: 15,
    name: 'Weights and measures',
    effect: 'You see the true quality of what is put in front of you.',
  },
  {
    id: 'tra-bargain', tree: 'comercio', tier: 2, cost: 2, level: 15,
    name: 'Bargaining',
    effect: 'Noticeably better prices in every market on the coast.',
  },
  {
    id: 'tra-credit', tree: 'comercio', tier: 3, cost: 2, level: 20,
    name: 'Credit',
    effect: 'You may buy against the value of your cargo — and owe it whether the cargo comes home or not.',
    excludes: 'tra-eye', perk: 'credit',
  },
  {
    id: 'tra-eye', tree: 'comercio', tier: 3, cost: 2, level: 20,
    name: 'The factor’s eye',
    effect: 'You learn what a distant port pays before you sail for it.',
    excludes: 'tra-credit', perk: 'factorsEye',
  },
  {
    id: 'tra-house', tree: 'comercio', tier: 4, cost: 3, level: 20,
    name: 'A house of your own',
    effect: 'Your name is good in Lisbon, and the best prices in the ocean follow it.',
  },
  {
    id: 'tra-own', tree: 'comercio', tier: 5, cost: 4, level: 30,
    name: 'Merchant prince',
    effect: 'You fit out your own voyages. The Crown’s commission becomes a thing you may take or decline.',
    perk: 'ownAccount',
  },
];

export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

export function nodesOf(tree: SkillId): SkillNode[] {
  return NODES.filter((n) => n.tree === tree).sort((a, b) => a.tier - b.tier);
}

/** What the captain has bought, and what he has left to spend. */
export interface CaptainSkills {
  points: number;
  /** Node ids, in the order they were taken. */
  taken: string[];
}

export function newCaptainSkills(): CaptainSkills {
  // Three to begin with: enough to open a tree and feel the shape of the
  // choice, not enough to hedge.
  return { points: 3, taken: [] };
}

export type SkillSet = Record<SkillId, number>;

/**
 * The captain's own levels, derived from what he has bought.
 *
 * Everything in the simulation still reads a 0-100 level through `skill()`, so
 * the tree feeds the existing model rather than replacing it: the nodes are
 * where the interesting, discrete capability lives, and the level is what all
 * the continuous things — how fast sail comes in, how well a coast is drawn —
 * go on scaling with.
 */
export function levelsOf(c: CaptainSkills): SkillSet {
  const out: SkillSet = {
    navegacao: 0, marinharia: 0, cartografia: 0,
    comercio: 0, diplomacia: 0, lideranca: 0,
  };
  for (const id of c.taken) {
    const n = NODE_BY_ID.get(id);
    if (n) out[n.tree] += n.level;
  }
  return out;
}

export function perksOf(c: CaptainSkills): Set<PerkId> {
  const out = new Set<PerkId>();
  for (const id of c.taken) {
    const p = NODE_BY_ID.get(id)?.perk;
    if (p) out.add(p);
  }
  return out;
}

/** Why a node cannot be bought, or null when it can. */
export function blockedReason(c: CaptainSkills, node: SkillNode): string | null {
  if (c.taken.includes(node.id)) return 'Already yours.';
  if (node.excludes && c.taken.includes(node.excludes)) {
    return `You chose ${NODE_BY_ID.get(node.excludes)?.name}. That road is shut.`;
  }
  const tree = nodesOf(node.tree);
  // Every tier below this one must be paid for first — the fork counts as one.
  for (const lower of tree) {
    if (lower.tier >= node.tier) continue;
    const tierNodes = tree.filter((n) => n.tier === lower.tier);
    if (!tierNodes.some((n) => c.taken.includes(n.id))) {
      return `${tierNodes.map((n) => n.name).join(' or ')} comes first.`;
    }
  }
  if (c.points < node.cost) {
    return `${node.cost} points; you have ${c.points}.`;
  }
  return null;
}

export function buyNode(c: CaptainSkills, id: string): boolean {
  const node = NODE_BY_ID.get(id);
  if (!node || blockedReason(c, node)) return false;
  c.points -= node.cost;
  c.taken.push(node.id);
  return true;
}

/** Normalised 0-1 value used throughout the simulation. */
export function skill(set: SkillSet, id: SkillId): number {
  return Math.max(0, Math.min(1, set[id] / 100));
}

export function hasMilestone(set: SkillSet, id: SkillId, at: number): boolean {
  return set[id] >= at;
}

export function rankOf(level: number): string {
  if (level >= 95) return 'Master';
  if (level >= 75) return 'Expert';
  if (level >= 55) return 'Accomplished';
  if (level >= 35) return 'Competent';
  if (level >= 15) return 'Practised';
  return 'Novice';
}

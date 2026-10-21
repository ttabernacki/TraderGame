/**
 * Random, plausible EndingStates for the falsifier (scripts/dynasty.ts): every field drawn from its own distribution, with the
 * correlations a career has (a man who carried people has a Traffic that stands higher, a man ruined by a patron has no purse).
 * The marginals are INVENTED, chosen to look like the end of a played career rather than a uniform draw.
 */
import { Rng } from '../../src/core/rng';
import { COUNT_KEYS, emptyCounts, type EndingState, type KingOffer } from '../../src/progression/endings';

const geo = (rng: Rng, mean: number): number => {
  // A count with a long tail and a good chance of zero.
  const p = 1 / (1 + mean);
  let k = 0;
  while (rng.next() > p && k < 40) k++;
  return k;
};

export function randomState(rng: Rng): EndingState {
  const c = emptyCounts();
  const mean: Record<(typeof COUNT_KEYS)[number], number> = {
    kept: 3, broken: 0.8, carried: 1.2, refused: 0.8, redeemed: 0.6, hanged: 0.5, stopped: 1.2, succoured: 0.8, abandoned: 0.4,
    chartShared: 1, chartSold: 0.15, honest: 0.6, cooked: 0.15, repaid: 1, defaulted: 0.15, claims: 1, patents: 2, pressed: 0.4, mercy: 0.8, funded: 0.7,
  };
  for (const k of COUNT_KEYS) c[k] = geo(rng, mean[k]);
  const honour = Math.min(1.5, 0.1 * c.kept + 0.12 * c.redeemed + 0.1 * c.succoured + 0.08 * c.mercy + 0.08 * c.honest + 0.08 * c.refused);
  const shame = Math.min(1.5, 0.12 * c.carried + 0.12 * c.hanged + 0.1 * c.broken + 0.15 * c.abandoned + 0.08 * c.pressed + 0.1 * c.cooked + 0.1 * c.defaulted);
  const ruined = (['crown', 'church', 'ruanova'] as const).filter(() => rng.chance(0.08 + 0.1 * Math.min(1, shame)));
  const pulled = (['crown', 'church', 'ruanova'] as const).filter(() => rng.chance(0.05));
  const fav = (mu: number): number => Math.max(-1, Math.min(1, rng.normal(mu + 0.3 * (honour - shame), 0.4)));
  const favour = { crown: fav(0.25), church: fav(0.05), ruanova: fav(0.1) };
  for (const p of ruined) favour[p] = Math.min(favour[p], -0.3);
  const king: KingOffer | null = rng.pick<KingOffer | null>(['armada', 'lordship', 'rich', 'ship', null, null]);
  const stage = (lo: number, hi: number): number => Math.max(1, Math.min(4, Math.round(rng.range(lo, hi))));
  const houses = geo(rng, 1.2) > 4 ? 4 : geo(rng, 1.2);
  return {
    captain: 'Álvaro de Lima', ship: 'Santa Clara', generation: 1 + (rng.chance(0.3) ? 1 : 0),
    heir: { name: 'Duarte de Lima', relation: rng.pick(['son', 'son', 'son', 'nephew', 'natural son', 'ward']), age: 17 + Math.floor(rng.next() * 14) },
    gold: Math.round(Math.min(9000, -Math.log(1 - rng.next()) * 1600 * (ruined.length ? 0.3 : 1))),
    standing: Math.round(rng.range(20, 900)),
    patron: rng.pick(['crown', 'church', 'ruanova'] as const),
    favour, ruined, pulled,
    stages: { traffic: stage(1, 4 + (c.carried > 2 ? 0 : -1)), rule: stage(1, 4), court: stage(1, 4) },
    c,
    tone: Math.max(-1, Math.min(1, (honour - shame) * 0.45 + rng.normal(0.05, 0.15))),
    fame: { points: Math.round(rng.range(0, 14)), held: Math.floor(rng.range(0, 4)) },
    houses, lines: geo(rng, 0.6),
    king, lordship: king === 'lordship' ? 'Alvito' : null,
    worn: [], calling: rng.pick(['pilot', 'factor', 'builder', 'master', null] as const),
    dead: Math.floor(rng.range(0, 60)),
  };
}

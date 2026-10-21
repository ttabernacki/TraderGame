import { Rng } from '../core/rng';
import type { OriginId } from '../progression/origins';

/**
 * The captain's name (BUILD_PLAN D4): a short generator by origin, overridable on the title screen.
 * Plain Portuguese given names and surnames of the 1480s; no real captain's full name is produced on purpose
 * (the pools are mixed so a collision with a historical person is chance, not design).
 */

const GIVEN = ['Duarte', 'Gonçalo', 'Pêro', 'Rui', 'Vasco', 'Lopo', 'Nuno', 'Fernão', 'Diogo', 'Álvaro', 'Martim', 'Gaspar', 'Estêvão', 'Aires', 'Tomé', 'Brás', 'João', 'António', 'Mateus', 'Simão'];
const POOL: Record<OriginId, { given: string[]; family: string[] }> = {
  // A second son of a house with land: the house's name, and a de.
  segundo: { given: GIVEN, family: ['de Sá', 'de Castro', 'de Almeida', 'de Miranda', 'de Sequeira', 'de Brito', 'de Lima', 'de Melo'] },
  // A New Christian family with a baptised name and an old trade.
  converso: { given: ['Gaspar', 'Tomé', 'Simão', 'Brás', 'Duarte', 'Gonçalo', 'Mateus', 'Fernão'], family: ['Nunes', 'Henriques', 'Lopes', 'Mendes', 'Fernandes', 'Rodrigues', 'Pires', 'Dias'] },
  // A pilot out of the ports: a given name and the name of his father.
  piloto: { given: ['Pêro', 'Estêvão', 'Martim', 'Diogo', 'Rui', 'Gil', 'Afonso', 'Bartolomeu'], family: ['Esteves', 'Anes', 'Gomes', 'Vaz', 'Afonso', 'Eanes', 'Martins', 'Vicente'] },
  // A fidalgo: the long name.
  fidalgo: { given: ['Lopo', 'Álvaro', 'Nuno', 'Vasco', 'Rui', 'Fernão', 'Aires', 'Duarte'], family: ['de Albuquerque', 'de Ataíde', 'de Menezes', 'da Silveira', 'de Noronha', 'de Mascarenhas', 'de Távora', 'de Vilhena'] },
};

export function generateName(origin: OriginId, rng: Rng): string {
  const p = POOL[origin] ?? POOL.segundo;
  return `${p.given[Math.floor(rng.next() * p.given.length)]} ${p.family[Math.floor(rng.next() * p.family.length)]}`;
}

/** The same family, a different given name: an heir. */
export function heirName(old: string, origin: OriginId, rng: Rng): string {
  const family = old.split(' ').slice(1).join(' ');
  const p = POOL[origin] ?? POOL.segundo;
  const given = p.given.filter((x) => x !== old.split(' ')[0]);
  return `${given[Math.floor(rng.next() * given.length)]}${family ? ` ${family}` : ''}`;
}

export const cleanName = (s: string | undefined | null): string => (s ?? '').replace(/[<>]/g, '').trim().slice(0, 40);

export const familyOf = (name: string): string => name.split(' ').slice(1).join(' ');

/** A family name other than this one, from the origin's pool: the name an heir takes when he puts his father's off. */
export function otherFamily(not: string, origin: OriginId, rng: Rng): string {
  const p = POOL[origin] ?? POOL.segundo;
  const fams = p.family.filter((f) => f !== not);
  return fams[Math.floor(rng.next() * fams.length)] ?? p.family[0];
}

/** An heir's given name: not the father's, from the origin's pool. */
export function heirGiven(oldGiven: string, origin: OriginId, rng: Rng): string {
  const p = POOL[origin] ?? POOL.segundo;
  const given = p.given.filter((x) => x !== oldGiven);
  return given[Math.floor(rng.next() * given.length)];
}

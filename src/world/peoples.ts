export type Faith = 'catholic' | 'muslim' | 'hindu' | 'traditional' | 'buddhist';

export interface People {
  id: string;
  name: string;
  /** Language the player must acquire, or find an interpreter for. */
  language: string;
  faith: Faith;
  /**
   * 0 for peoples with no prior contact with the wider trading world, 1 for the
   * great commercial powers. High-sophistication courts are insulted by the
   * trinkets that delight a first contact — the mistake that humiliated Vasco da
   * Gama before the Zamorin of Calicut, who was shown cloth, hats, and honey by a
   * man asking to trade with the richest pepper port on earth.
   */
  sophistication: number;
  /** Starting disposition toward an unknown Portuguese ship, -1 to 1. */
  disposition: number;
  /** Whether they are already tied into the Indian Ocean Muslim trade network. */
  rivalNetwork: boolean;
  gifts: { loves: string[]; scorns: string[] };
  blurb: string;
}

export const PEOPLES: People[] = [
  {
    id: 'portuguese', name: 'Portuguese', language: 'Português', faith: 'catholic',
    sophistication: 0.8, disposition: 1, rivalNetwork: false,
    gifts: { loves: [], scorns: [] },
    blurb: 'Home.',
  },
  {
    id: 'castilian', name: 'Castilians', language: 'Castelhano', faith: 'catholic',
    sophistication: 0.8, disposition: -0.1, rivalNetwork: false,
    gifts: { loves: ['ouro', 'seda'], scorns: ['contas', 'manilhas'] },
    blurb: 'Rivals for every island and every papal bull. Cordial in port, ruthless at sea.',
  },
  {
    id: 'moor', name: 'Maghrebi Moors', language: 'Árabe', faith: 'muslim',
    sophistication: 0.75, disposition: -0.45, rivalNetwork: true,
    gifts: { loves: ['coral', 'la', 'ferramenta'], scorns: ['vinho', 'contas'] },
    blurb: 'The old enemy across the strait, and the masters of the caravan roads that carry Sudanese gold north.',
  },
  {
    id: 'guanche', name: 'Guanches', language: 'Guanche', faith: 'traditional',
    sophistication: 0.1, disposition: -0.2, rivalNetwork: false,
    gifts: { loves: ['ferramenta', 'panos'], scorns: [] },
    blurb: 'The island people of the Canaries, fighting a long losing war against Castile.',
  },
  {
    id: 'wolof', name: 'Wolof', language: 'Wolof', faith: 'muslim',
    sophistication: 0.35, disposition: 0.15, rivalNetwork: false,
    gifts: { loves: ['cavalos', 'ferramenta', 'la'], scorns: ['vinho'] },
    blurb: 'Horsemen of the Senegal, whose kings will pay a dozen captives for one Barbary stallion.',
  },
  {
    id: 'mandinka', name: 'Mandinka', language: 'Mandinga', faith: 'muslim',
    sophistication: 0.45, disposition: 0.1, rivalNetwork: false,
    gifts: { loves: ['sal', 'la', 'coral', 'ferramenta'], scorns: ['vinho'] },
    blurb: 'Inheritors of Mali. They know exactly what gold is worth, and where it comes from, and they will not tell you.',
  },
  {
    id: 'temne', name: 'Temne and Bullom', language: 'Temne', faith: 'traditional',
    sophistication: 0.15, disposition: 0.2, rivalNetwork: false,
    gifts: { loves: ['manilhas', 'bacias', 'contas'], scorns: [] },
    blurb: 'People of the great harbour under the Lion Mountains.',
  },
  {
    id: 'akan', name: 'Akan', language: 'Akan', faith: 'traditional',
    sophistication: 0.4, disposition: 0.05, rivalNetwork: false,
    gifts: { loves: ['manilhas', 'bacias', 'panos', 'contas'], scorns: [] },
    blurb: 'Gold-washers of the interior forest. The reason the coast is called the Mina.',
  },
  {
    id: 'edo', name: 'Edo of Benin', language: 'Edo', faith: 'traditional',
    sophistication: 0.55, disposition: 0.15, rivalNetwork: false,
    gifts: { loves: ['coral', 'manilhas', 'bacias'], scorns: ['contas'] },
    blurb: 'A walled city of bronze-casters under an Oba whose court protocol is stricter than Lisbon\'s.',
  },
  {
    id: 'kongo', name: 'BaKongo', language: 'Kikongo', faith: 'traditional',
    sophistication: 0.4, disposition: 0.35, rivalNetwork: false,
    gifts: { loves: ['panos', 'manilhas', 'espelhos', 'la'], scorns: [] },
    blurb: 'A large and orderly kingdom on the great river. Its court is curious about the world, and dangerously willing to believe in ours.',
  },
  {
    id: 'ndongo', name: 'Mbundu', language: 'Kimbundu', faith: 'traditional',
    sophistication: 0.3, disposition: 0.0, rivalNetwork: false,
    gifts: { loves: ['sal', 'panos', 'manilhas'], scorns: [] },
    blurb: 'South of the Kongo, and wary of it.',
  },
  {
    id: 'khoikhoi', name: 'Khoikhoi', language: 'Khoe', faith: 'traditional',
    sophistication: 0.05, disposition: -0.15, rivalNetwork: false,
    gifts: { loves: ['ferramenta', 'bacias', 'contas'], scorns: ['vinho', 'seda'] },
    blurb: 'Cattle herders at the end of Africa. They want iron and copper and nothing else, and they do not care who you are.',
  },
  {
    id: 'tupi', name: 'Tupi', language: 'Tupi', faith: 'traditional',
    sophistication: 0.05, disposition: 0.3, rivalNetwork: false,
    gifts: { loves: ['ferramenta', 'espelhos', 'contas', 'bacias'], scorns: [] },
    blurb: 'People of a shore to the west that appears on no chart and in no plan.',
  },
  {
    id: 'swahili', name: 'Swahili', language: 'Kiswahili', faith: 'muslim',
    sophistication: 0.85, disposition: -0.2, rivalNetwork: true,
    gifts: { loves: ['ouro', 'seda', 'porcelana', 'coral', 'pedras'], scorns: ['contas', 'manilhas', 'espelhos'] },
    blurb: 'Stone cities of coral rag, rich on the gold of Sofala and a thousand years of monsoon trade. They have seen better ships than yours.',
  },
  {
    id: 'arab', name: 'Arab merchants', language: 'Árabe', faith: 'muslim',
    sophistication: 0.9, disposition: -0.35, rivalNetwork: true,
    gifts: { loves: ['ouro', 'coral', 'seda', 'pedras'], scorns: ['contas', 'manilhas', 'vinho'] },
    blurb: 'The men who have carried pepper to Alexandria since before Portugal existed. Your arrival is the end of their world, and they know it before you do.',
  },
  {
    id: 'gujarati', name: 'Gujarati', language: 'Gujarati', faith: 'muslim',
    sophistication: 0.9, disposition: -0.1, rivalNetwork: true,
    gifts: { loves: ['ouro', 'coral', 'cavalos', 'pedras'], scorns: ['contas', 'manilhas'] },
    blurb: 'The finest merchants and the finest shipwrights in the western ocean. They will trade with anyone, and outbid everyone.',
  },
  {
    id: 'malabar', name: 'Malabar Nairs', language: 'Malaialam', faith: 'hindu',
    sophistication: 0.85, disposition: 0.0, rivalNetwork: false,
    gifts: { loves: ['ouro', 'coral', 'cavalos', 'seda', 'pedras'], scorns: ['contas', 'manilhas', 'la', 'espelhos'] },
    blurb: 'The Zamorin of Calicut rules the pepper coast and hosts every trading nation on earth. He is not impressed by cloth and hats.',
  },
  {
    id: 'sinhalese', name: 'Sinhalese', language: 'Cingalês', faith: 'buddhist',
    sophistication: 0.7, disposition: 0.1, rivalNetwork: false,
    gifts: { loves: ['ouro', 'coral', 'cavalos'], scorns: ['contas'] },
    blurb: 'Kings of the cinnamon island, quarrelling among themselves and open to a friend with guns.',
  },
  {
    id: 'tamil', name: 'Tamils', language: 'Tâmil', faith: 'hindu',
    sophistication: 0.75, disposition: 0.05, rivalNetwork: false,
    gifts: { loves: ['ouro', 'cavalos', 'coral'], scorns: ['contas'] },
    blurb: 'Pearl fishers and weavers of the Coromandel and the Fishery Coast.',
  },
  {
    id: 'malay', name: 'Malays', language: 'Malaio', faith: 'muslim',
    sophistication: 0.85, disposition: -0.05, rivalNetwork: true,
    gifts: { loves: ['ouro', 'pedras', 'la', 'ferramenta'], scorns: ['contas'] },
    blurb: 'Malacca sits astride the strait where the cloves come through. Whoever holds it holds the eastern half of the trade.',
  },
];

export const PEOPLE_BY_ID = new Map(PEOPLES.map((p) => [p.id, p]));

export function people(id: string): People {
  const p = PEOPLE_BY_ID.get(id);
  if (!p) throw new Error(`unknown people: ${id}`);
  return p;
}

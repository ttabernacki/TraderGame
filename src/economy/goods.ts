export type GoodCategory =
  | 'spice' | 'precious' | 'textile' | 'metal' | 'provision' | 'raw' | 'manufacture';

export interface Good {
  id: string;
  /** Period Portuguese name, as it would appear in the ship's books. */
  name: string;
  english: string;
  category: GoodCategory;
  /** Trading unit. */
  unit: string;
  /** Reference price in Lisbon, in cruzados per unit. */
  lisbon: number;
  /** Tons of hold space per unit. */
  bulk: number;
  /** Fraction lost per month at sea; damp holds ruined a great deal of cargo. */
  spoilage: number;
  note?: string;
}

export const GOODS: Good[] = [
  // The spices that paid for everything.
  { id: 'pimenta', name: 'Pimenta', english: 'Black pepper', category: 'spice', unit: 'quintal', lisbon: 30, bulk: 0.06, spoilage: 0.004, note: 'The whole purpose of the India route. Bought for two cruzados at Calicut.' },
  { id: 'gengibre', name: 'Gengibre', english: 'Ginger', category: 'spice', unit: 'quintal', lisbon: 22, bulk: 0.06, spoilage: 0.006 },
  { id: 'canela', name: 'Canela', english: 'Cinnamon', category: 'spice', unit: 'quintal', lisbon: 46, bulk: 0.05, spoilage: 0.004, note: 'Ceylon bark, the finest in the world.' },
  { id: 'cravo', name: 'Cravo', english: 'Cloves', category: 'spice', unit: 'quintal', lisbon: 72, bulk: 0.045, spoilage: 0.003, note: 'From islands no Portuguese has yet seen, carried west by Malay traders.' },
  { id: 'noz', name: 'Noz-moscada', english: 'Nutmeg', category: 'spice', unit: 'quintal', lisbon: 66, bulk: 0.045, spoilage: 0.003 },
  { id: 'maca', name: 'Maça', english: 'Mace', category: 'spice', unit: 'quintal', lisbon: 82, bulk: 0.04, spoilage: 0.003 },
  { id: 'malagueta', name: 'Malagueta', english: 'Grains of paradise', category: 'spice', unit: 'quintal', lisbon: 15, bulk: 0.06, spoilage: 0.005, note: 'The pepper of Guinea, sold when the true pepper could not be had.' },
  { id: 'cardamomo', name: 'Cardamomo', english: 'Cardamom', category: 'spice', unit: 'quintal', lisbon: 54, bulk: 0.05, spoilage: 0.004 },

  // Precious goods.
  { id: 'ouro', name: 'Ouro', english: 'Gold', category: 'precious', unit: 'marco', lisbon: 55, bulk: 0.001, spoilage: 0, note: 'The Mina gold that built the Torre de Belém.' },
  { id: 'pedras', name: 'Pedraria', english: 'Precious stones', category: 'precious', unit: 'lot', lisbon: 210, bulk: 0.002, spoilage: 0 },
  { id: 'perolas', name: 'Pérolas', english: 'Pearls', category: 'precious', unit: 'lot', lisbon: 95, bulk: 0.002, spoilage: 0 },
  { id: 'ambar', name: 'Âmbar-gris', english: 'Ambergris', category: 'precious', unit: 'arrátel', lisbon: 150, bulk: 0.001, spoilage: 0 },
  { id: 'coral', name: 'Coral', english: 'Coral', category: 'precious', unit: 'arrátel', lisbon: 36, bulk: 0.002, spoilage: 0 },

  // Raw goods.
  { id: 'marfim', name: 'Marfim', english: 'Ivory', category: 'raw', unit: 'quintal', lisbon: 42, bulk: 0.09, spoilage: 0 },
  { id: 'goma', name: 'Goma', english: 'Gum arabic', category: 'raw', unit: 'quintal', lisbon: 11, bulk: 0.07, spoilage: 0.002 },
  { id: 'couros', name: 'Couros', english: 'Hides', category: 'raw', unit: 'dozen', lisbon: 7, bulk: 0.11, spoilage: 0.01 },
  { id: 'cera', name: 'Cera', english: 'Beeswax', category: 'raw', unit: 'quintal', lisbon: 10, bulk: 0.07, spoilage: 0.002 },
  { id: 'incenso', name: 'Incenso', english: 'Frankincense', category: 'raw', unit: 'quintal', lisbon: 27, bulk: 0.06, spoilage: 0.002 },
  { id: 'anil', name: 'Anil', english: 'Indigo', category: 'raw', unit: 'quintal', lisbon: 32, bulk: 0.06, spoilage: 0.003 },
  { id: 'cola', name: 'Cola', english: 'Kola nuts', category: 'raw', unit: 'quintal', lisbon: 7, bulk: 0.08, spoilage: 0.03 },
  { id: 'canfora', name: 'Cânfora', english: 'Camphor', category: 'raw', unit: 'arrátel', lisbon: 62, bulk: 0.002, spoilage: 0.004 },

  // Textiles.
  { id: 'calico', name: 'Calicó', english: 'Calico cloth', category: 'textile', unit: 'piece', lisbon: 13, bulk: 0.05, spoilage: 0.004 },
  { id: 'seda', name: 'Seda', english: 'Silk', category: 'textile', unit: 'piece', lisbon: 92, bulk: 0.03, spoilage: 0.003 },
  { id: 'panos', name: 'Panos da terra', english: 'African cloth', category: 'textile', unit: 'piece', lisbon: 9, bulk: 0.05, spoilage: 0.005 },
  { id: 'la', name: 'Panos de lã', english: 'Woollen cloth', category: 'textile', unit: 'piece', lisbon: 11, bulk: 0.06, spoilage: 0.005 },
  { id: 'linho', name: 'Linho', english: 'Linen', category: 'textile', unit: 'piece', lisbon: 9, bulk: 0.05, spoilage: 0.004 },

  // Manufactures: cheap at home, coveted on an unvisited coast.
  { id: 'manilhas', name: 'Manilhas', english: 'Brass bracelets', category: 'metal', unit: 'dozen', lisbon: 5, bulk: 0.05, spoilage: 0, note: 'The standard currency of the Guinea trade.' },
  { id: 'bacias', name: 'Bacias de latão', english: 'Brass basins', category: 'metal', unit: 'dozen', lisbon: 7, bulk: 0.07, spoilage: 0 },
  { id: 'ferramenta', name: 'Ferramenta', english: 'Iron tools', category: 'metal', unit: 'dozen', lisbon: 8, bulk: 0.09, spoilage: 0.001 },
  { id: 'contas', name: 'Contas', english: 'Glass beads', category: 'manufacture', unit: 'dozen strings', lisbon: 3, bulk: 0.03, spoilage: 0 },
  { id: 'espelhos', name: 'Espelhos', english: 'Mirrors', category: 'manufacture', unit: 'dozen', lisbon: 9, bulk: 0.03, spoilage: 0.002 },
  { id: 'porcelana', name: 'Porcelana', english: 'Porcelain', category: 'manufacture', unit: 'chest', lisbon: 74, bulk: 0.08, spoilage: 0.002 },
  { id: 'cavalos', name: 'Cavalos', english: 'Horses', category: 'raw', unit: 'head', lisbon: 62, bulk: 1.2, spoilage: 0.07, note: 'Arabian horses fetch fortunes in India, if they survive the passage.' },

  // Provisions. Also the stores that keep a crew alive.
  { id: 'vinho', name: 'Vinho', english: 'Wine', category: 'provision', unit: 'pipe', lisbon: 7, bulk: 0.5, spoilage: 0.01 },
  { id: 'azeite', name: 'Azeite', english: 'Olive oil', category: 'provision', unit: 'pipe', lisbon: 9, bulk: 0.5, spoilage: 0.008 },
  { id: 'trigo', name: 'Trigo', english: 'Wheat', category: 'provision', unit: 'moio', lisbon: 5, bulk: 0.4, spoilage: 0.02 },
  { id: 'sal', name: 'Sal', english: 'Salt', category: 'provision', unit: 'moio', lisbon: 3, bulk: 0.4, spoilage: 0 },
  { id: 'acucar', name: 'Açúcar', english: 'Sugar', category: 'provision', unit: 'arroba', lisbon: 14, bulk: 0.08, spoilage: 0.01 },
  { id: 'arroz', name: 'Arroz', english: 'Rice', category: 'provision', unit: 'quintal', lisbon: 4, bulk: 0.07, spoilage: 0.012 },
  { id: 'tamaras', name: 'Tâmaras', english: 'Dates', category: 'provision', unit: 'quintal', lisbon: 5, bulk: 0.07, spoilage: 0.02 },
];

export const GOOD_BY_ID = new Map(GOODS.map((g) => [g.id, g]));

export function good(id: string): Good {
  const g = GOOD_BY_ID.get(id);
  if (!g) throw new Error(`unknown good: ${id}`);
  return g;
}

/** Goods a crew will accept as a gift or a bribe on first contact. */
export const GIFT_GOODS = [
  'panos', 'la', 'linho', 'manilhas', 'bacias', 'contas', 'espelhos',
  'ferramenta', 'coral', 'porcelana', 'seda', 'acucar', 'vinho',
];

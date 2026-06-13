import type { Good, GoodId } from "../game/types";

export const GOODS: Good[] = [
  { id: "grain",    name: "Grain",    glyph: "𓂃", basePrice: 4,   weight: 2, category: "bulk" },
  { id: "salt",     name: "Salt",     glyph: "❄",  basePrice: 8,   weight: 1, category: "bulk" },
  { id: "wool",     name: "Wool",     glyph: "🐑", basePrice: 12,  weight: 2, category: "bulk" },
  { id: "cloth",    name: "Cloth",    glyph: "✚",  basePrice: 36,  weight: 1, category: "manufactured" },
  { id: "wine",     name: "Wine",     glyph: "🍷", basePrice: 20,  weight: 2, category: "luxury" },
  { id: "beer",     name: "Beer",     glyph: "🍺", basePrice: 10,  weight: 2, category: "bulk" },
  { id: "iron",     name: "Iron",     glyph: "⚒",  basePrice: 16,  weight: 3, category: "bulk" },
  { id: "weapons",  name: "Weapons",  glyph: "⚔",  basePrice: 60,  weight: 2, category: "manufactured" },
  { id: "silver",   name: "Silver",   glyph: "☾",  basePrice: 140, weight: 1, category: "luxury" },
  { id: "spices",   name: "Spices",   glyph: "✦",  basePrice: 180, weight: 1, category: "luxury" },
];

export const GOOD_BY_ID: Record<GoodId, Good> = Object.fromEntries(
  GOODS.map((g) => [g.id, g])
) as Record<GoodId, Good>;

export const ALL_GOOD_IDS: GoodId[] = GOODS.map((g) => g.id);

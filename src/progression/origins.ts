/**
 * Why this captain is out here.
 *
 * The officers have stories and the rival has a story and the captain had none.
 * He began every career as the same man — a squire with a ship nobody better
 * connected would take — and ended it as whatever his standing said he was,
 * which is a scoreboard rather than a life.
 *
 * An origin is chosen once, before the first voyage, and it is not a difficulty
 * setting. It changes what you start with, what the Crown thinks of you, what
 * the Casa will and will not forgive, and which private thread runs under the
 * whole career and pays off at the end. Two captains with identical standings
 * and identical charts can have been doing entirely different things for twenty
 * years, and the epilogue should say so.
 */

export type OriginId = 'segundo' | 'converso' | 'piloto' | 'fidalgo';

export interface Origin {
  id: OriginId;
  name: string;
  english: string;
  /** The sentence on the title screen. */
  blurb: string;
  /** What it is actually like, in the book. */
  detail: string;
  /** Starting purse, against the ordinary 85. */
  gold: number;
  /** Starting renown before you have done anything. */
  standing: number;
  /** Skill points in hand at the first port, against the ordinary 3. */
  points: number;
  /**
   * How hard the court is to satisfy. Above one, every commission's renown is
   * worth more to you because you are starting from further back.
   */
  standingScale: number;
  /** What the Casa will do about a captain who sells his charts privately. */
  watched: boolean;
  /**
   * What the money on the Rua Nova makes of him, before he has done anything.
   *
   * Emphatically not the same question as what the King makes of him, and in
   * one case the exact opposite: a New Christian is watched at court and is on
   * first-name terms with the Florentine and Genoese houses who actually
   * financed this trade, while a fidalgo is received at court and is the worst
   * class of debtor in Lisbon, because nobody can distrain on a nobleman.
   */
  creditBias: number;
  /** The last word, at the end of the career. */
  epilogue: string;
}

export const ORIGINS: Origin[] = [
  {
    id: 'segundo',
    name: 'O Segundo Filho',
    english: 'The second son',
    blurb: 'Your brother has the house, the land and the name. You have a ship.',
    detail:
      'Everything your father owned went to your brother in one line of a will, which is the law '
      + 'and is not thought cruel by anybody but the people it happens to. What is left to a '
      + 'second son is the Church, the army, or the sea. You have no money and no expectations '
      + 'and nothing whatever to go back to, and the Casa da Mina is extremely willing to give '
      + 'ships to men in that position, because such men do not turn back.',
    gold: 60, standing: 0, points: 4, standingScale: 1, watched: false, creditBias: 0,
    epilogue:
      'Your brother died in the house you grew up in, having never gone further from it than '
      + 'Coimbra. There is a street named after you in a town neither of you was born in, and '
      + 'nobody in it has ever heard of him.',
  },
  {
    id: 'converso',
    name: 'O Cristão-Novo',
    english: 'The new Christian',
    blurb: 'Your family took the font rather than the road. Being useful is not optional.',
    detail:
      'Your grandparents were given a choice in 1497 that was not a choice, and the family has '
      + 'been Christian ever since in a way that is watched. There is a file. There is always a '
      + 'file. A man in your position can rise as far as his usefulness carries him and not one '
      + 'inch further, and the moment he stops being useful the file is opened. You are a very '
      + 'good pilot because you have never once been able to afford not to be.',
    gold: 140, standing: 0, points: 3, standingScale: 1.25, watched: true, creditBias: 22,
    epilogue:
      'The file was opened twice in your lifetime and closed both times, because on each occasion '
      + 'somebody at the Casa pointed out what you were worth and somebody else did the '
      + 'arithmetic. Your grandchildren will not be so useful, and the arithmetic will come out '
      + 'differently.',
  },
  {
    id: 'piloto',
    name: 'O Filho do Piloto',
    english: 'The pilot’s son',
    blurb: 'Your father died on this coast. You have his book and his grudge.',
    detail:
      'He was a pilot on the Guinea run and he did not come back from it, and the Casa paid your '
      + 'mother eleven months of his wages and considered the matter closed. You have his roteiro, '
      + 'which is worth more than the house you grew up in, and you have read it until you could '
      + 'recite the soundings. You know this coast better than any man of your age alive and you '
      + 'have never seen it.',
    gold: 85, standing: 10, points: 3, standingScale: 1, watched: false, creditBias: 6,
    epilogue:
      'You found the place. It is a bay with a bar across it that will take a caravel at the top '
      + 'of the tide and not otherwise, and it is on the chart now under his name because you put '
      + 'it there. He would have been about seventy. You have never worked out whether any of it '
      + 'was for him.',
  },
  {
    id: 'fidalgo',
    name: 'O Fidalgo',
    english: 'The King’s man',
    blurb: 'You are at court, you are trusted, and you asked for this yourself.',
    detail:
      'You did not have to be here. You have a household, an income, and a position at court that '
      + 'most of the men on the quay would consider the end of ambition rather than the beginning '
      + 'of it, and you went to the King and asked for a ship. Everyone who knows you thinks you '
      + 'have lost your mind. The King, who is the same sort of man, understood immediately and '
      + 'has been watching what you do with it ever since.',
    gold: 260, standing: 35, points: 2, standingScale: 0.85, watched: false, creditBias: -14,
    epilogue:
      'You could have stayed. That is the part nobody at court ever understood and the part every '
      + 'man who sailed with you understood within about a week. You gave up a great deal to be '
      + 'cold, wet and frightened for twenty years, and if anybody had offered to give it back you '
      + 'would not have taken it.',
  },
];

export const ORIGIN_BY_ID = new Map(ORIGINS.map((o) => [o.id, o]));

export function originDef(id: OriginId): Origin {
  return ORIGIN_BY_ID.get(id) ?? ORIGINS[0];
}

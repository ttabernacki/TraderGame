import type { People } from '../world/peoples';

/** Standing at one port. The state-level measures live in diplomacy/courts. */
export interface Relations {
  /** Regard for you personally, -1 to 1. */
  regard: number;
  /** Whether they have granted permission to trade. */
  mayTrade: boolean;
  exclusive: boolean;
  factory: boolean;
  padrao: boolean;
  /** Whether first contact has happened at all. */
  met: boolean;
  /** Times you have called here. */
  visits: number;
  /** Simulated time the factory here was last settled up. */
  factorySettled?: number;
}

export function newRelations(p: People): Relations {
  return {
    regard: p.disposition,
    mayTrade: false, exclusive: false, factory: false, padrao: false,
    met: false, visits: 0,
  };
}

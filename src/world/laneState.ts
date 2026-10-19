import type { WorldHost } from './tick';

export interface LaneState {
  v: 1;
  /** port:good to an average of the month's net arrivals: positive is a glut coming in, negative stock going out. */
  net: Record<string, number>;
  /** port:good to the months in a row the quay has shown under 30% of its usual stock. */
  low: Record<string, number>;
  /** Lane to the chart-grade multiplier last worked out, and the quarter it was worked out for. */
  risk: Record<string, { k: number; m: number }>;
  /** Lane to the value moved last month, in cruzados at the Lisbon price. */
  flow: Record<string, number>;
  /** Port to last month's traffic against what is usual for it. */
  traffic: Record<string, number>;
  /** port:good to the month index before which no new contract is posted. */
  cool: Record<string, number>;
}

export function newLaneState(): LaneState {
  return { v: 1, net: {}, low: {}, risk: {}, flow: {}, traffic: {}, cool: {} };
}

/** The state, made on first use (the `??=` of the load boundary). */
export function laneStateOf(h: Pick<WorldHost, 'lanes'>): LaneState {
  const s = (h.lanes ??= newLaneState());
  s.net ??= {}; s.low ??= {}; s.risk ??= {}; s.flow ??= {}; s.traffic ??= {}; s.cool ??= {};
  return s;
}


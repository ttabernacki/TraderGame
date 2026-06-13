import type { GameState, CityMarket, CityId } from "./types";
import { CITIES } from "../data/cities";
import { initMarket } from "./economy";
import { makeStartingCaravans } from "./caravan";
import { makeFoundingFamily } from "./dynasty";
import { MILESTONES } from "../data/milestones";
import { pushLog } from "./log";

export const START_YEAR = 1450;
export const HOUSE_SURNAME = "Tucher";
export const HOME_CITY = "augsburg";

export function makeInitialState(): GameState {
  const markets: Record<CityId, CityMarket> = {};
  for (const c of CITIES) markets[c.id] = initMarket(c);

  const state: GameState = {
    date: { year: START_YEAR, month: 1, day: 1 },
    tickAccumulator: 0,
    speed: 0,
    treasury: 5000,
    cities: CITIES.map((c) => ({
      ...c,
      produces: { ...c.produces },
      consumes: { ...c.consumes },
    })),
    markets,
    caravans: makeStartingCaravans(HOME_CITY),
    family: makeFoundingFamily(HOUSE_SURNAME, START_YEAR),
    log: [],
    milestones: MILESTONES.map((m) => ({ ...m, fired: false })),
    selection: { kind: "none" },
    hoveredCity: null,
    modal: null,
  };

  pushLog(state, `The House of ${HOUSE_SURNAME} opens its ledgers in ${state.cities.find(c => c.id === HOME_CITY)?.name}.`, "event");
  pushLog(state, "Treasury: 5,000 Gulden. Two caravans ready in the city.", "info");
  return state;
}

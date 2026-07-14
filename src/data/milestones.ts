import type { MilestoneEvent, GameState } from "../game/types";
import { pushLog } from "../game/log";

function adjustProduction(state: GameState, cityId: string, good: keyof GameState["markets"][string]["stock"], delta: number) {
  const c = state.cities.find((x) => x.id === cityId);
  if (!c) return;
  const cur = c.produces[good] ?? 0;
  c.produces[good] = Math.max(0, cur + delta);
}

export const MILESTONES: MilestoneEvent[] = [
  {
    id: "constantinople-1453",
    year: 1453,
    month: 5,
    title: "Constantinople Falls",
    flavor:
      "Mehmed II has taken the Queen of Cities. The Bosporus closes to Christian merchants and the old spice route is severed. Word reaches Venice within weeks; Antwerp's spice galleys will be the new lifeline.",
    fired: false,
    apply(state) {
      for (const city of state.cities) {
        if (city.consumes.spices) city.consumes.spices = (city.consumes.spices ?? 0) * 1.0;
      }
      // Spice prices spike: cut Antwerp's spice production for several years.
      adjustProduction(state, "antwerp", "spices", -0.8);
      pushLog(state, "Spice prices spike across the Empire.", "milestone");
    },
  },
  {
    id: "new-world-1492",
    year: 1492,
    month: 10,
    title: "A New World",
    flavor:
      "A Genoese captain in Castilian service claims to have reached the Indies by sailing west. If true, the Atlantic ports will see strange new goods within a generation — and silver flows that could drown the old houses.",
    fired: false,
    apply(state) {
      // New World silver will eventually reach Antwerp. Slow upward drift in silver supply.
      adjustProduction(state, "antwerp", "silver", 0.6);
      adjustProduction(state, "antwerp", "spices", 0.4);
    },
  },
  {
    id: "theses-1517",
    year: 1517,
    month: 10,
    title: "The Ninety-Five Theses",
    flavor:
      "An Augustinian friar in Wittenberg has nailed a list of grievances to a church door. The papal indulgence trade falters. Reformist preachers will divide cities and princes alike — and confessional politics will reshape every market.",
    fired: false,
    apply(state) {
      adjustProduction(state, "leipzig", "cloth", 0.3);
      adjustProduction(state, "nuremberg", "weapons", 0.4);
      pushLog(state, "The Reformation begins. Confessional tensions ripple through the Empire.", "milestone");
    },
  },
  {
    id: "imperial-election-1519",
    year: 1519,
    month: 6,
    title: "The Imperial Election",
    flavor:
      "Maximilian is dead. Charles of Habsburg and Francis of Valois bid against one another for the imperial crown.",
    fired: false,
    decisionId: "election-1519",
    apply() {
      // Consequences are decided by the player's choice in the decision modal.
    },
  },
  {
    id: "augsburg-peace-1555",
    year: 1555,
    month: 9,
    title: "Peace of Augsburg",
    flavor:
      "Cuius regio, eius religio. After decades of confessional war, the princes agree: each prince shall determine the faith of his lands. Trade routes stabilise; the great fairs at Frankfurt and Leipzig flourish anew.",
    fired: false,
    apply(state) {
      adjustProduction(state, "frankfurt", "cloth", 0.4);
      adjustProduction(state, "leipzig", "cloth", 0.4);
    },
  },
  {
    id: "defenestration-1618",
    year: 1618,
    month: 5,
    title: "Defenestration of Prague",
    flavor:
      "Bohemian Protestants have thrown the Emperor's regents from a Hradčany window. They survived a fall onto a dung heap, but Christendom may not survive what comes next. The Empire teeters toward general war.",
    fired: false,
    apply(state) {
      adjustProduction(state, "nuremberg", "weapons", 0.8);
      adjustProduction(state, "augsburg", "weapons", 0.6);
      // Prague silver mining disrupted
      adjustProduction(state, "prague", "silver", -0.8);
      pushLog(state, "Demand for weapons surges. Bohemian silver flows falter.", "milestone");
    },
  },
];

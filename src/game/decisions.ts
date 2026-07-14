import type { GameState, Decision, Rank } from "./types";
import { RANK_BY_ID } from "../data/factions";
import { applyPromotion, addFavor } from "./progression";
import { pushLog } from "./log";

// Decisions are built on demand so their options can read current state.
// state.modal references a decision by id; this resolves it.
export function getDecision(state: GameState, id: string): Decision | null {
  if (id.startsWith("promote:")) {
    return promotionDecision(id.slice("promote:".length) as Rank);
  }
  if (id === "election-1519") return electionDecision(state);
  return null;
}

function promotionDecision(rank: Rank): Decision {
  const def = RANK_BY_ID[rank];
  return {
    id: `promote:${rank}`,
    title: `Ennoblement: ${def.title}`,
    flavor: `The path to the rank of ${def.title} (${def.english}) is open to your house. ${def.unlocks}\n\nThe confirmation and its fees will cost ${def.fee.toLocaleString("de-DE")} Gulden.`,
    options: [
      {
        label: `Accept the title — ${def.fee.toLocaleString("de-DE")}ɡ`,
        detail: "Pay the fee and ascend.",
        disabled: (s) => s.treasury < def.fee,
        disabledReason: "Insufficient treasury for the fee.",
        apply: (s) => applyPromotion(s, rank),
      },
      {
        label: "Not yet",
        detail: "Decline for now. You may seek the title later from your ledger.",
        apply: () => {},
      },
    ],
  };
}

function electionDecision(state: GameState): Decision {
  void state;
  return {
    id: "election-1519",
    title: "The Imperial Election of 1519",
    flavor:
      "Maximilian is dead. Charles of Habsburg and Francis of France bid for the crown, and the seven Electors will sell their votes to the higher bidder. The Fugger have pledged their fortune to Charles. Their rivals, the Welser, are wavering — an opening for a house bold enough to buy its way into the Emperor's gratitude.",
    options: [
      {
        label: "Outbid all rivals — 12,000ɡ",
        detail: "Charles owes his crown to your gold. The court will not forget it. (+40 Habsburg favor)",
        disabled: (s) => s.treasury < 12000,
        disabledReason: "You cannot raise 12,000ɡ.",
        apply: (s) => {
          s.treasury -= 12000;
          addFavor(s, "habsburg", 40);
          s.electionParticipated = true;
          pushLog(s, "Charles V is elected Holy Roman Emperor — and your house financed the decisive votes. The Habsburgs are in your debt.", "milestone");
        },
      },
      {
        label: "Join the syndicate — 6,000ɡ",
        detail: "Share in financing the crown alongside the Fugger. (+20 Habsburg favor)",
        disabled: (s) => s.treasury < 6000,
        disabledReason: "You cannot raise 6,000ɡ.",
        apply: (s) => {
          s.treasury -= 6000;
          addFavor(s, "habsburg", 20);
          s.electionParticipated = true;
          pushLog(s, "You joined the syndicate that bought Charles his crown. A creditable showing at court.", "milestone");
        },
      },
      {
        label: "A token loan — 1,500ɡ",
        detail: "A modest contribution — enough to have your name on the ledger. (+8 Habsburg favor)",
        disabled: (s) => s.treasury < 1500,
        disabledReason: "You cannot raise 1,500ɡ.",
        apply: (s) => {
          s.treasury -= 1500;
          addFavor(s, "habsburg", 8);
          s.electionParticipated = true;
          pushLog(s, "Your token loan to the imperial cause is noted, if not celebrated.", "milestone");
        },
      },
      {
        label: "Keep your gold",
        detail: "Stay out of imperial politics. The court will remember who was absent. (−5 Habsburg favor; forfeits a prince's chief credential)",
        apply: (s) => {
          addFavor(s, "habsburg", -5);
          pushLog(s, "You stayed out of the election. The Welser and Fugger financed it without you — and the court took note of your absence.", "event");
        },
      },
    ],
  };
}

import type { GameState } from "../game/types";
import { formatDate } from "../game/time";
import { houseHead, houseHeir, age } from "../game/dynasty";
import { RANK_BY_ID, FACTIONS, FACTION_BY_ID } from "../data/factions";
import { rankProgress } from "../game/progression";

export function renderHUD(state: GameState, onSeekTitle: () => void) {
  const hud = document.getElementById("hud")!;
  const head = houseHead(state);
  const heir = houseHeir(state);
  const rankDef = RANK_BY_ID[state.rank];

  const factionBars = FACTIONS.map((f) => {
    const v = Math.round(state.standing[f.id] ?? 0);
    return `
      <div class="faction-bar">
        <div class="faction-name" style="color:${f.color}">${f.short}</div>
        <div class="faction-track"><div class="faction-fill" style="width:${v}%; background:${f.color}"></div></div>
        <div class="faction-val">${v}</div>
      </div>
    `;
  }).join("");

  hud.innerHTML = `
    <div class="hud-col hud-left">
      <div class="plate plate-row">
        <div>
          <div class="plate-title">${rankDef.title} · House</div>
          <div class="plate-value">${head ? `${head.givenName} ${head.surname}` : "(vacant)"}</div>
        </div>
        <div>
          <div class="plate-title">Age</div>
          <div class="plate-value">${head ? age(head, state.date.year) : "—"}</div>
        </div>
        <div>
          <div class="plate-title">Heir</div>
          <div class="plate-value">${heir ? heir.givenName : "—"}</div>
        </div>
      </div>
      <div class="plate rank-plate">
        ${renderRankProgress(state)}
      </div>
    </div>
    <div class="hud-col hud-right">
      <div class="plate plate-row">
        <div>
          <div class="plate-title">Treasury</div>
          <div class="plate-value">${state.treasury.toLocaleString("de-DE")} ɡ</div>
        </div>
        <div>
          <div class="plate-title">Date</div>
          <div class="plate-value">${formatDate(state.date)}</div>
        </div>
      </div>
      <div class="plate faction-plate">
        <div class="plate-title">Standing</div>
        ${factionBars}
      </div>
    </div>
  `;

  hud.querySelector<HTMLButtonElement>("#seek-title")?.addEventListener("click", onSeekTitle);
}

function renderRankProgress(state: GameState): string {
  const prog = rankProgress(state);
  if (!prog) {
    return `<div class="plate-title">Rank</div><div class="rank-summit">Reichsfürst — the summit of the Empire.</div>`;
  }
  const nextDef = RANK_BY_ID[prog.next];
  const check = (ok: boolean) => ok ? `<span class="req-ok">✓</span>` : `<span class="req-no">•</span>`;
  const goldLine = `<div class="req">${check(prog.goldOk)} ${nextDef.minTreasury.toLocaleString("de-DE")}ɡ capital</div>`;
  const favorLines = prog.favor.map((fv) => {
    const f = FACTION_BY_ID[fv.faction];
    return `<div class="req">${check(fv.ok)} ${f.short} favor ${Math.round(fv.have)}/${fv.need}</div>`;
  }).join("");
  const electionLine = prog.electionOk === null ? "" :
    `<div class="req">${check(prog.electionOk)} Financed an Imperial election</div>`;
  const feeLine = `<div class="rank-fee">Fee to ascend: ${nextDef.fee.toLocaleString("de-DE")}ɡ</div>`;
  const button = prog.ready
    ? `<button class="action seek-btn" id="seek-title">Seek the title of ${nextDef.title} ›</button>`
    : "";
  return `
    <div class="plate-title">Next: ${nextDef.title} <span class="rank-gloss">(${nextDef.english})</span></div>
    <div class="rank-reqs">${goldLine}${favorLines}${electionLine}</div>
    ${feeLine}
    ${button}
  `;
}

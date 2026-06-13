import type { GameState, GoodId } from "../game/types";
import { GOODS, GOOD_BY_ID } from "../data/goods";
import { CITY_BY_ID } from "../data/cities";
import { caravanCargoUnits } from "../game/caravan";
import { pushLog } from "../game/log";
import { computePrice } from "../game/economy";

export function renderModal(state: GameState, onClose: () => void) {
  const root = document.getElementById("modal-root")!;
  if (!state.modal) {
    root.innerHTML = "";
    return;
  }
  if (state.modal.kind === "milestone") {
    const modal = state.modal;
    const ms = state.milestones.find((m) => m.id === modal.eventId);
    if (!ms) { root.innerHTML = ""; return; }
    root.innerHTML = `
      <div class="modal-bg">
        <div class="modal">
          <div class="modal-title">${ms.title}</div>
          <div class="modal-flavor">${ms.flavor}</div>
          <div class="modal-actions">
            <button class="action" id="modal-dismiss">Continue</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>("#modal-dismiss")?.addEventListener("click", onClose);
    return;
  }
  if (state.modal.kind === "trade") {
    const { caravanId, cityId } = state.modal;
    const caravan = state.caravans.find((c) => c.id === caravanId);
    const city = CITY_BY_ID[cityId];
    if (!caravan || !city) { root.innerHTML = ""; return; }
    const market = state.markets[cityId];
    const cargo = caravanCargoUnits(caravan);
    const space = caravan.capacity - cargo;

    const rows = GOODS.map((g) => {
      const have = caravan.cargo[g.id] ?? 0;
      const stock = Math.round(market.stock[g.id]);
      const price = market.prices[g.id];
      return `
        <div class="trade-good-row">
          <div class="good-name"><span class="good-glyph">${g.glyph}</span>
            <div>
              <div>${g.name}</div>
              <div style="font-size:11px; color: var(--ink-faded);">price ${price}ɡ · stock ${stock} · carry ${have}</div>
            </div>
          </div>
          <button class="action" data-action="sell-all" data-good="${g.id}" ${have <= 0 ? "disabled" : ""}>Sell all</button>
          <div class="qty-controls">
            <button class="qty-btn" data-action="sell" data-good="${g.id}">−</button>
            <div class="qty-val">${have}</div>
            <button class="qty-btn" data-action="buy" data-good="${g.id}">+</button>
          </div>
          <button class="action" data-action="buy-max" data-good="${g.id}">Buy max</button>
        </div>
      `;
    }).join("");

    root.innerHTML = `
      <div class="modal-bg">
        <div class="modal" style="max-width: 640px;">
          <div class="modal-title">${city.name} — Market</div>
          <div style="display:flex; justify-content: space-between; font-size:12px; color: var(--ink-faded); margin-bottom: 10px;">
            <span>${caravan.name} · cargo ${cargo}/${caravan.capacity} (${space} free)</span>
            <span>Treasury: ${state.treasury.toLocaleString("de-DE")} ɡ</span>
          </div>
          ${rows}
          <div class="modal-actions">
            <button class="action" id="modal-dismiss">Close</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>("#modal-dismiss")?.addEventListener("click", onClose);
    root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const good = btn.dataset.good as GoodId;
        const action = btn.dataset.action!;
        if (action === "buy") buy(state, caravanId, cityId, good, 1);
        else if (action === "sell") buy(state, caravanId, cityId, good, -1);
        else if (action === "buy-max") {
          const c = state.caravans.find((c) => c.id === caravanId)!;
          const free = c.capacity - caravanCargoUnits(c);
          const aff = Math.floor(state.treasury / state.markets[cityId].prices[good]);
          buy(state, caravanId, cityId, good, Math.min(free, aff, Math.floor(state.markets[cityId].stock[good])));
        } else if (action === "sell-all") {
          const c = state.caravans.find((c) => c.id === caravanId)!;
          const have = c.cargo[good] ?? 0;
          buy(state, caravanId, cityId, good, -have);
        }
        renderModal(state, onClose);
      });
    });
  }
}

function buy(
  state: GameState,
  caravanId: string,
  cityId: string,
  good: GoodId,
  qty: number,
) {
  if (qty === 0) return;
  const caravan = state.caravans.find((c) => c.id === caravanId);
  const market = state.markets[cityId];
  if (!caravan || !market) return;
  const price = market.prices[good];
  if (qty > 0) {
    const free = caravan.capacity - caravanCargoUnits(caravan);
    qty = Math.min(qty, free, Math.floor(market.stock[good]));
    const cost = qty * price;
    if (cost > state.treasury) qty = Math.floor(state.treasury / price);
    if (qty <= 0) return;
    state.treasury -= qty * price;
    market.stock[good] -= qty;
    caravan.cargo[good] = (caravan.cargo[good] ?? 0) + qty;
    pushLog(state, `Bought ${qty} ${GOOD_BY_ID[good].name} in ${CITY_BY_ID[cityId].name} at ${price}ɡ (total ${qty * price}ɡ).`, "trade");
  } else {
    const sellQty = Math.min(-qty, caravan.cargo[good] ?? 0);
    if (sellQty <= 0) return;
    const revenue = sellQty * price;
    state.treasury += revenue;
    market.stock[good] += sellQty;
    caravan.cargo[good] = (caravan.cargo[good] ?? 0) - sellQty;
    pushLog(state, `Sold ${sellQty} ${GOOD_BY_ID[good].name} in ${CITY_BY_ID[cityId].name} at ${price}ɡ (total ${revenue}ɡ).`, "trade");
  }
  // Refresh prices to reflect new stock
  for (const g of Object.keys(market.prices) as GoodId[]) {
    market.prices[g] = computePrice(g, market.stock[g]);
  }
}

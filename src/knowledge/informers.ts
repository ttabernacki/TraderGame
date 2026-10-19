import { regionOf } from '../economy/trade';
import { portDef } from '../world/ports';
import type { Game } from '../game/state';
import type { Fact } from './information';
import { secondOpinion } from '../world/powers/rumours';
import { claimSecondOpinion } from './claims';

/**
 * The informers: clerks, brokers and pilots in any port who will buy a copy of
 * what you know, or tell you whether a second man would say the same.
 *
 * They deal in Facts, and a Fact is whatever the Book holds, so one pair of
 * functions serves the price sheet, the rumour and the page of the rutter.
 * What an informer says is never the truth: he agrees, or he will not stand
 * behind it, and the captain judges the rest. Selling is a Ledger entry.
 * Only the informers of the port where the ship lies can be asked, and only
 * about what their own coast would know.
 */

export interface Offer { ok: boolean; price: number; why: string }

const no = (why: string): Offer => ({ ok: false, price: 0, why });

/** Whether the informers here would know about this fact's coast. */
function knowsHere(g: Game, f: Fact): boolean {
  const here = g.dockedAt;
  if (!here) return false;
  if (!f.place) return true;
  try { return f.place === here || regionOf(f.place) === regionOf(here); } catch { return false; }
}

export function sellOffer(g: Game, f: Fact): Offer {
  if (!g.dockedAt) return no('The informers are ashore; you must lie in a port.');
  if (f.sold) return no('A copy of this has already gone.');
  if (f.ref.store === 'sheet') {
    const sh = g.trade.sheets[f.ref.port];
    if (!sh) return no('That sheet is gone.');
    const n = Object.keys(sh.quotes).length;
    return { ok: true, price: Math.max(1, Math.round(n * 1.2 * f.confidence * (sh.source === 'seen' ? 1 : 0.5))), why: 'A copy of the sheet, sold quietly.' };
  }
  if (f.ref.store === 'lead' || f.ref.store === 'rumour') {
    return { ok: true, price: Math.max(1, Math.round(4 + 8 * f.confidence)), why: 'What you were told, passed on.' };
  }
  if (f.ref.store === 'rutter') {
    if (g.dockedAt !== 'lisboa') return no('A page of the rutter is sold on the Rua Nova, at Lisbon.');
    const e = g.rutter.entries.find((x) => x.id === (f.ref as { entry: string }).entry);
    if (!e) return no('That page is gone.');
    return { ok: true, price: g.rutter.worth(e).merchants, why: 'The whole page goes, and the Casa will hear of it.' };
  }
  return no('A town’s place on your chart is not for sale.');
}

export function checkOffer(g: Game, f: Fact): Offer {
  if (!g.dockedAt) return no('The informers are ashore; you must lie in a port.');
  if (f.checked) return no('A second man has already been asked.');
  if (f.ref.store !== 'sheet' && f.ref.store !== 'lead' && f.ref.store !== 'rumour') return no('No informer can speak to this.');
  if (!knowsHere(g, f)) return no('Nobody here knows that coast.');
  if (f.ref.store === 'sheet') {
    const sh = g.trade.sheets[f.ref.port];
    return { ok: !!sh, price: 6 + Math.round(Object.keys(sh?.quotes ?? {}).length * 0.5), why: 'A clerk who has been to market this week.' };
  }
  return { ok: true, price: f.ref.store === 'rumour' ? 18 : 14, why: 'A pilot who has heard the same tale, or not.' };
}

function pay(g: Game, price: number): boolean {
  if (g.crown.gold < price) return false;
  g.crown.gold -= price;
  return true;
}

/** Sell a copy of a fact. Returns the line to show. */
export function sellFact(g: Game, f: Fact): string {
  const o = sellOffer(g, f);
  if (!o.ok) return o.why;
  const here = g.dockedAt ?? '';
  if (f.ref.store === 'rutter') {
    // The rutter has its own sale, and records the Ledger entry itself.
    return g.publish(f.ref.entry, 'merchants');
  }
  if (f.ref.store === 'sheet') {
    const sh = g.trade.sheets[f.ref.port];
    if (!sh) return 'That sheet is gone.';
    sh.soldAt = g.clock.t;
  } else if (f.ref.store === 'lead') {
    const l = g.leads.find((x) => x.id === (f.ref as { id: string }).id);
    if (!l) return 'That tale is gone.';
    l.soldAt = g.clock.t;
  } else if (f.ref.store === 'rumour') {
    const r = g.powers.rumours.find((x) => x.id === (f.ref as { id: number }).id);
    if (!r) return 'That tale is gone.';
    r.soldAt = g.clock.t;
  }
  g.crown.gold += o.price;
  g.noteDeed('fact.sold', {
    target: f.place ?? here, place: here, magnitude: 0.2,
    note: `Sold a copy of ${f.kind === 'price' ? 'my prices for' : 'what I was told of'} ${f.place ? portDef(f.place).name : f.source} for ${o.price} cruzados.`,
  });
  return `${o.price} cruzados. The copy is theirs; yours stays in the book.`;
}

/** Ask a second informer. He agrees, or he will not stand behind it. */
export function checkFact(g: Game, f: Fact): string {
  const o = checkOffer(g, f);
  if (!o.ok) return o.why;
  if (!pay(g, o.price)) return `He asks ${o.price} cruzados, and you have not got them.`;
  const here = g.dockedAt ?? '';
  const now = g.clock.t;
  let said: 'agrees' | 'disputed';
  if (f.ref.store === 'sheet') {
    const sh = g.trade.sheets[f.ref.port]!;
    // He knows the market as it is this week; the sheet is as it was.
    let off = 0;
    const today = new Map(g.marketHere(f.ref.port).map((l) => [l.goodId, l]));
    for (const [id, q] of Object.entries(sh.quotes)) {
      const l = today.get(id);
      if (!l) continue;
      if (Math.abs(l.bid - q.bid) > 0.35 * Math.max(q.bid, 1) || Math.abs(l.ask - q.ask) > 0.35 * Math.max(q.ask, 1)) off++;
    }
    said = sh.falseGood || off >= 2 ? 'disputed' : 'agrees';
    sh.checked = said;
    sh.checkedAt = now;
  } else if (f.ref.store === 'rumour') {
    const r = g.powers.rumours.find((x) => x.id === (f.ref as { id: number }).id);
    if (!r) return 'That tale is gone.';
    // He says what he has heard, not what is so; a stale tale is told again less often than a true one.
    said = secondOpinion(r, g.seed);
    r.checked = said;
    r.checkedAt = now;
  } else {
    const l = g.leads.find((x) => x.id === (f.ref as { id: string }).id);
    if (!l) return 'That tale is gone.';
    // A phantom is a tale nobody else tells. A real one is told again, and the
    // second telling is a little nearer.
    // A claim on the Casa's sheet is asked about by a roll fixed in the seed: right three times in four.
    said = l.claim ? claimSecondOpinion(g, l.claim) : l.phantom ? 'disputed' : 'agrees';
    l.checked = said;
    l.checkedAt = now;
    if (said === 'agrees' && !l.claim) {
      l.errorNm = Math.max(10, l.errorNm * 0.6);
      if (l.targetPort) {
        const def = portDef(l.targetPort);
        l.lat += (def.lat - l.lat) * 0.35;
        l.lon += (def.lon - l.lon) * 0.35;
      }
    }
  }
  g.noteDeed('fact.checked', {
    target: f.place ?? here, place: here, magnitude: 0.2,
    note: said === 'agrees'
      ? `Paid ${o.price} cruzados for a second opinion; he told it the same way.`
      : `Paid ${o.price} cruzados for a second opinion; he would not stand behind it.`,
  });
  return said === 'agrees' ? 'He tells it the same way.' : 'He will not stand behind it.';
}

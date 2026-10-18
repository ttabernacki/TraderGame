import { newGame, newTally, atQuay, answerScenes } from './lib/botlib';
const g = newGame(1); const t = newTally();
g.checkStory(); answerScenes(g, t);
const rows = g.marketHere();
console.log(rows.length, g.crown.gold, g.ship.holdFree);
const there = g.markets.listings('mina', g.clock.t, 0, 0, rows.map(r=>r.goodId));
for (const l of rows.slice(0,40)) { const o = there.find(x=>x.goodId===l.goodId); console.log(l.goodId, l.stock.toFixed(0), l.ask.toFixed(1), l.casa, g.hasLicence(l.goodId), o?.bid.toFixed(1), o ? ((o.bid-l.ask)/l.ask).toFixed(2):''); }

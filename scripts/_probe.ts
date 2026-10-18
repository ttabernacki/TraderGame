import { Game } from '../src/game/state';
const g = new Game(1);
g.mode = 'port';
console.log(g.dockedAt, g.crown.gold, g.mode);
console.log(g.weighAnchor());
g.setDestinationPort('funchal');
g.clock.scaleIndex = 8;
let n = 0; const t0 = Date.now();
while (!g.dockedAt && n < 4000 && g.mode !== 'gameover') {
  if (g.pendingEvent) { g.resolveEvent(0); }
  g.update(0.25); n++;
  if (n % 50 === 0) console.log(n, g.clock.formatDate(), JSON.stringify(g.ship.state.pos), g.mode);
  const d = g.destination; 
}
console.log('done', n, g.dockedAt, g.mode, Date.now() - t0);

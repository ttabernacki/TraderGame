import { Game } from '../src/game/state';
const g = new Game(1);
g.mode = 'sailing';
console.log(g.weighAnchor());
g.setDestinationPort('funchal');
g.clock.scaleIndex = 8;
let n = 0; const t0 = Date.now();
while (!g.dockedAt && n < 3000 && g.mode !== 'gameover') {
  if (g.pendingEvent) { console.log('EV', g.pendingEvent.id, g.pendingEvent.choices?.map(c=>c.label)); g.resolveEvent(1); g.clock.scaleIndex=8; }
  g.update(0.25); n++;
  if (g.approachablePorts().some(p=>p.def.id==='funchal')) { console.log(g.letGoAnchor()); break; }
  if (n % 50 === 0) console.log(n, g.clock.formatDate(), g.ship.state.pos.lat.toFixed(2), g.ship.state.pos.lon.toFixed(2), g.mode, g.route.length);
}
console.log('done', n, g.dockedAt, g.mode, Date.now() - t0);

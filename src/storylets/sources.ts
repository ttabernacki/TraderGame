import { DEEP_PORTS, peekDeepBeat, putDeepBeat } from '../places';
import type { ArcBeat } from '../places/types';
import { POWER_SCENES, peekPowerScene, putPowerScene } from '../progression/powerScenes';
import { TRAFFIC_SCENES, peekTrafficScene, putTrafficScene, type TrafficScene } from '../progression/trafficScenes';
import type { Game } from '../game/state';
import { leadOf, registerSource } from './engine';
import { ports } from './places';
import type { Candidate, Req, Source, SourceId, Storylet } from './types';

/**
 * The older scene machinery as sources of the one engine (BUILD_PLAN E1).
 *
 * The Traffic's twelve scenes and the courts' fourteen (`TrafficScene { ports, stages, after, needs, build }`) and the
 * Patron's arcs (`ArcBeat`) keep their own state (`powers.seen`) and their own tests; the engine asks each for the scene
 * it would offer here (`peek*`), ranks it with everything else, and lets one through per call. Their scenes are pure
 * (no dice at build), so a person's lines are read straight from the built scene.
 */

const sceneStorylet = (source: 'traffic' | 'power', prefix: string, sc: TrafficScene, all: TrafficScene[]): Storylet => {
  const requires: Req[] = [{ fn: (g) => sc.needs(g, g.powers), label: `${source}.${sc.id}.needs`, reads: ['front.traffic.stage'] }];
  if (sc.stages) requires.push({ q: 'front.traffic.stage', op: '>=', v: sc.stages[0] }, { q: 'front.traffic.stage', op: '<=', v: sc.stages[1] });
  return {
    id: `${prefix}:${sc.id}`, source, kind: 'front', priority: 50, place: ports(...sc.ports), requires,
    scene: (g) => sc.build(g, g.powers), writes: [],
    hooks: all.filter((o) => o.after?.includes(sc.id)).map((o) => `${prefix}:${o.id}`),
  };
};

function sceneSource(id: SourceId, prefix: string, scenes: TrafficScene[], peek: (g: Game, port: string | null) => TrafficScene | null, put: (g: Game, sc: TrafficScene) => ReturnType<typeof putTrafficScene>): Source {
  return {
    id,
    due: (g, port) => {
      const sc = peek(g, port);
      if (!sc) return [];
      const c: Candidate = {
        id: `${prefix}:${sc.id}`, source: id, kind: 'front', priority: 50, quarter: 'court', delivery: port ? 'person' : 'now',
        preview: (gg) => { const ev = sc.build(gg, gg.powers); return { who: ev.title, line: leadOf(ev.text) }; },
        take: (gg) => put(gg, sc),
      };
      return [c];
    },
    all: () => scenes.map((s) => sceneStorylet(id as 'traffic' | 'power', prefix, s, scenes)),
  };
}

const beatStorylet = (portId: string, b: ArcBeat): Storylet => ({
  id: `place:${b.id}`, source: 'deep', kind: 'arc', priority: 40, place: ports(portId),
  requires: [{ fn: (g) => { const d = DEEP_PORTS[portId]; return !!d && g.powers.seen[`place:${b.id}`] === undefined && (b.needs ? b.needs(g) : true); }, label: `deep.${b.id}.needs`, reads: ['patron'] }],
  scene: (g) => b.build(g), writes: [], hooks: [],
});

registerSource(sceneSource('traffic', 'traffic', TRAFFIC_SCENES, peekTrafficScene, putTrafficScene));
registerSource(sceneSource('power', 'power', POWER_SCENES, peekPowerScene, putPowerScene));
registerSource({
  id: 'deep',
  due: (g, port) => {
    const b = peekDeepBeat(g, port);
    if (!b) return [];
    return [{
      id: `place:${b.id}`, source: 'deep', kind: 'arc', priority: 40, quarter: 'waterfront', delivery: 'now',
      preview: (gg) => { const ev = b.build(gg); return { who: ev.title, line: leadOf(ev.text) }; },
      take: (gg) => putDeepBeat(gg, b),
    }];
  },
  all: () => Object.entries(DEEP_PORTS).flatMap(([id, d]) => d.arc.map((b) => beatStorylet(id, b))),
});

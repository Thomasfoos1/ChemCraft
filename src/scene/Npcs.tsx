import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../engine/runtime';
import { buildNpcModel, NpcModel } from '../engine/entities/npcModel';
import { NPCS } from '../content';
import { sampleLight } from '../engine/world/lighting';
import { useGame } from '../game/store';

/** Blocky lab-coat scientists with idle animations, head tracking, name tags and quest markers. */
export function Npcs() {
  const models = useMemo(() => {
    const m = new Map<string, NpcModel>();
    for (const id of Object.keys(NPCS)) m.set(id, buildNpcModel(NPCS[id]));
    return m;
  }, []);
  const group = useMemo(() => {
    const g = new THREE.Group();
    for (const m of models.values()) g.add(m.group);
    return g;
  }, [models]);

  useEffect(() => () => {
    for (const m of models.values()) m.materials.forEach((mat) => { mat.map?.dispose(); mat.dispose(); });
  }, [models]);

  useFrame(() => {
    const t = runtime.time;
    const reduced = useGame.getState().settings.reducedMotion;
    const inGame = useGame.getState().screen === 'game';
    for (const n of runtime.npcs) {
      const m = models.get(n.id);
      if (!m) continue;
      m.group.position.set(n.pos[0], n.pos[1], n.pos[2]);
      m.group.rotation.y = n.yaw;
      const phase = t * 1.6 + n.pos[2];
      m.head.rotation.y = n.headYaw;
      m.head.rotation.x = n.headPitch + (n.talkPulse > 0 && !reduced ? Math.sin(t * 14) * 0.08 : 0);
      m.armL.rotation.x = reduced ? 0 : Math.sin(phase) * 0.06 - (n.talkPulse > 0 ? 0.5 : 0);
      m.armR.rotation.x = reduced ? 0 : -Math.sin(phase) * 0.06;
      m.armL.rotation.z = 0.05;
      m.armR.rotation.z = -0.05;
      m.group.position.y += reduced ? 0 : Math.max(0, Math.sin(phase * 2)) * 0.012;
      // Tint by the light where the NPC stands.
      const [r, g, b] = sampleLight(runtime.world, n.pos[0], n.pos[1] + 1.4, n.pos[2]);
      const f = (v: number) => Math.pow(Math.max(v, 0.42), 2.2);
      const c = new THREE.Color(f(r), f(g), f(b));
      const boost = 1.25;
      c.multiplyScalar(boost);
      for (const mat of m.materials) mat.color.copy(c);
      const dx = runtime.player.x - n.pos[0], dz = runtime.player.z - n.pos[2];
      const d = Math.hypot(dx, dz);
      m.nameTag.visible = inGame && d < 9 && d > 2.4 && useGame.getState().overlay !== 'dialogue';
      const news = inGame && runtime.npcHasNews(n.id);
      m.marker.visible = news;
      if (news) m.marker.position.y = 2.7 + (reduced ? 0 : Math.sin(t * 3) * 0.08);
    }
  });

  return <primitive object={group} />;
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../engine/runtime';
import { getCrackTexture } from '../engine/textures';
import { iconCanvas } from '../ui/icons';
import { useGame } from '../game/store';
import { findPath } from '../engine/nav';
import { PLAYER } from '../engine/player/physics';
import { sampleLight } from '../engine/world/lighting';

/** Black outline around the targeted block, plus the cracking overlay while mining. */
function BlockHighlight() {
  const { outline, crack, crackTex } = useMemo(() => {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const outline = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    const crackTex = getCrackTexture().clone();
    crackTex.needsUpdate = true;
    crackTex.repeat.set(0.1, 1);
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    return { outline, crack, crackTex };
  }, []);
  useFrame(() => {
    const t = runtime.target;
    const show = useGame.getState().screen === 'game' && useGame.getState().overlay === null && t?.kind === 'block';
    outline.visible = !!show;
    if (show && t?.kind === 'block') outline.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    const m = runtime.mining;
    crack.visible = !!m && !!show;
    if (m) {
      crack.position.set(m.x + 0.5, m.y + 0.5, m.z + 0.5);
      crackTex.offset.x = Math.min(9, Math.floor(m.progress * 10)) / 10;
    }
  });
  return (
    <>
      <primitive object={outline} />
      <primitive object={crack} />
    </>
  );
}

/** Atoms fly from the broken deposit into the player. */
function Pickups() {
  const pool = useMemo(() => {
    const sprites: THREE.Sprite[] = [];
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.scale.set(0.4, 0.4, 1);
      s.visible = false;
      sprites.push(s);
    }
    return sprites;
  }, []);
  const textures = useRef(new Map<string, THREE.Texture>());
  const group = useMemo(() => {
    const g = new THREE.Group();
    pool.forEach((s) => g.add(s));
    return g;
  }, [pool]);
  useFrame(() => {
    pool.forEach((s) => (s.visible = false));
    runtime.pickups.slice(0, pool.length).forEach((p, i) => {
      const s = pool[i];
      let tex = textures.current.get(p.item);
      if (!tex) {
        tex = new THREE.CanvasTexture(iconCanvas(p.item));
        tex.magFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        textures.current.set(p.item, tex);
      }
      (s.material as THREE.SpriteMaterial).map = tex;
      const k = Math.min(1, p.t / 0.45);
      const e = k * k;
      const tx = runtime.player.x, ty = runtime.player.y + 1.1, tz = runtime.player.z;
      s.position.set(p.from[0] + (tx - p.from[0]) * e, p.from[1] + (ty - p.from[1]) * e + Math.sin(k * Math.PI) * 0.6, p.from[2] + (tz - p.from[2]) * e);
      s.scale.setScalar(0.45 * (1 - k * 0.6));
      s.visible = true;
    });
  });
  return <primitive object={group} />;
}

/** Floating diamond above the current objective + optional navigation trail. */
function ObjectiveMarker() {
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd34f, transparent: true, opacity: 0.9, depthTest: false }),
    );
    m.renderOrder = 50;
    return m;
  }, []);
  const trail = useRef({ t: 0, path: null as [number, number, number][] | null, at: 0 });
  useFrame((_, dt) => {
    const s = useGame.getState();
    const target = s.screen === 'game' && !s.introPlaying ? runtime.objectiveTarget() : null;
    mesh.visible = !!target;
    if (!target) return;
    const t = runtime.time;
    const reduced = s.settings.reducedMotion;
    mesh.position.set(target[0], target[1] + 0.9 + (reduced ? 0 : Math.sin(t * 2.5) * 0.12), target[2]);
    mesh.rotation.y = reduced ? 0 : t * 1.8;
    const d = Math.hypot(target[0] - runtime.player.x, target[2] - runtime.player.z);
    mesh.scale.setScalar(Math.max(1, d / 10));
    (mesh.material as THREE.MeshBasicMaterial).opacity = d < 3 ? 0.35 : 0.9;

    // Navigation trail (assist mode, or after an idle hint appeared).
    if (!(s.settings.navAssist || s.idleHint) || d < 3) return;
    const tr = trail.current;
    tr.at -= dt;
    if (tr.at <= 0) {
      tr.at = 1;
      tr.path = findPath(runtime.world, [runtime.player.x, runtime.player.y, runtime.player.z], target, 12000);
    }
    tr.t -= dt;
    if (tr.t <= 0 && tr.path) {
      tr.t = 0.12;
      const steps = Math.min(tr.path.length, 18);
      for (let i = 1; i < steps; i += 2) {
        const [x, y, z] = tr.path[i];
        if (Math.random() < 0.5) {
          runtime.particles.spawn({ pos: [x + 0.5, y + 0.15, z + 0.5], color: '#ffd34f', vel: [0, 0.3, 0], life: 0.6, size: 0.07, spread: 0.05 });
        }
      }
    }
  });
  return <primitive object={mesh} />;
}

/** First-person arm and held item, drawn on top of the world. */
function Hand() {
  const { group, arm, armMat, itemMesh, itemMat, handMat } = useMemo(() => {
    const armMat = new THREE.MeshBasicMaterial({ color: 0xeef0f2, depthTest: false });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), armMat);
    const handMat = new THREE.MeshBasicMaterial({ color: 0xc99872, depthTest: false });
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.092, 0.09), handMat);
    hand.position.z = -0.25;
    arm.add(hand);
    const itemMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.3, depthTest: false, side: THREE.DoubleSide });
    const itemMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), itemMat);
    const g = new THREE.Group();
    g.add(arm);
    g.add(itemMesh);
    arm.renderOrder = 100;
    hand.renderOrder = 100;
    itemMesh.renderOrder = 101;
    return { group: g, arm, armMat, itemMesh, itemMat, handMat };
  }, []);
  const texCache = useRef(new Map<string, THREE.Texture>());
  useFrame((state) => {
    const s = useGame.getState();
    const visible = s.screen === 'game' && !s.introPlaying;
    group.visible = visible;
    if (!visible) return;
    const cam = state.camera;
    group.position.copy(cam.position);
    group.quaternion.copy(cam.quaternion);
    const swing = runtime.armSwing;
    const sw = Math.sin(swing * Math.PI);
    const bob = s.settings.reducedMotion ? 0 : Math.sin(runtime.player.walked * 3.2) * 0.015;
    arm.position.set(0.3 - sw * 0.05, -0.27 + bob - sw * 0.04, -0.42 - sw * 0.05);
    arm.rotation.set(0.35 - sw * 0.6, -0.2, 0.08);
    const sel = s.save?.inventory[s.save.selected] ?? null;
    itemMesh.visible = !!sel;
    if (sel) {
      let tex = texCache.current.get(sel.id);
      if (!tex) {
        tex = new THREE.CanvasTexture(iconCanvas(sel.id));
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        texCache.current.set(sel.id, tex);
      }
      if (itemMat.map !== tex) {
        itemMat.map = tex;
        itemMat.needsUpdate = true;
      }
      itemMesh.position.set(0.27 - sw * 0.05, -0.2 + bob - sw * 0.06, -0.66 - sw * 0.05);
      itemMesh.rotation.set(-0.2 - sw * 0.5, -0.5, 0.1);
      itemMesh.scale.setScalar(0.55);
    }
    // Tint the hand by the light where the player stands.
    const [lr, lg, lb] = sampleLight(runtime.world, runtime.player.x, runtime.player.y + PLAYER.eye, runtime.player.z);
    const k = (v: number) => Math.min(1, Math.pow(Math.max(v, 0.35), 2.2) * 1.15);
    armMat.color.setRGB(k(lr) * 0.93, k(lg) * 0.94, k(lb) * 0.95);
    handMat.color.setRGB(k(lr) * 0.79, k(lg) * 0.6, k(lb) * 0.45);
    itemMat.color.setRGB(Math.max(0.55, k(lr)), Math.max(0.55, k(lg)), Math.max(0.55, k(lb)));
  });
  return <primitive object={group} />;
}

export function Effects() {
  return (
    <>
      <primitive object={runtime.particles.mesh} />
      <BlockHighlight />
      <Pickups />
      <ObjectiveMarker />
      <Hand />
    </>
  );
}

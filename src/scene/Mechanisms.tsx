import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, GateAnim } from '../engine/runtime';
import { getAtlasTexture, skyTexture, tileTexture } from '../engine/textures';
import { buildLooseBlocks } from '../engine/world/mesher';
import { periodicTableTexture } from '../engine/periodicTable';
import { sampleLight } from '../engine/world/lighting';

function lit(mat: THREE.MeshBasicMaterial, pos: [number, number, number], boost = 1.2) {
  const [r, g, b] = sampleLight(runtime.world, pos[0], pos[1], pos[2]);
  mat.color.setRGB(Math.pow(r, 2.2) * boost, Math.pow(g, 2.2) * boost, Math.pow(b, 2.2) * boost);
}

/** The Waterworks wheel: hub, spokes and paddles built from plank boxes. */
function WaterWheel() {
  const { group, mats } = useMemo(() => {
    const planks = new THREE.MeshBasicMaterial({ map: tileTexture('planks') });
    const log = new THREE.MeshBasicMaterial({ map: tileTexture('log_side') });
    const g = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.4), log);
    g.add(hub);
    const R = runtime.layout.wheel.radius;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, R, 0.22), planks);
      spoke.position.set(Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.5, 0);
      spoke.rotation.z = -a;
      g.add(spoke);
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.5), planks);
      paddle.position.set(Math.sin(a) * (R - 0.35), Math.cos(a) * (R - 0.35), 0);
      paddle.rotation.z = -a;
      g.add(paddle);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(2 * R * Math.sin(Math.PI / 8) + 0.1, 0.18, 0.25), planks);
      const a2 = a + Math.PI / 8;
      rim.position.set(Math.sin(a2) * R * Math.cos(Math.PI / 8), Math.cos(a2) * R * Math.cos(Math.PI / 8), 0.62);
      rim.rotation.z = -a2;
      g.add(rim);
      const rim2 = rim.clone();
      rim2.position.z = -0.62;
      g.add(rim2);
    }
    const c = runtime.layout.wheel.center;
    g.position.set(c[0], c[1], c[2]);
    return { group: g, mats: [planks, log] };
  }, []);
  useFrame(() => {
    group.rotation.z = runtime.wheelAngle;
    for (const m of mats) lit(m, [group.position.x, group.position.y + 1, group.position.z - 1.5], 1.3);
  });
  return <primitive object={group} />;
}

function Gears() {
  const { group, gears, mat } = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ map: tileTexture('iron_block') });
    const g = new THREE.Group();
    const gears: { mesh: THREE.Group; dir: number }[] = [];
    for (const gp of runtime.layout.gears) {
      const gear = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(gp.radius, gp.radius, 0.2, 10), mat);
      disc.rotation.x = Math.PI / 2;
      gear.add(disc);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.2), mat);
        tooth.position.set(Math.cos(a) * (gp.radius + 0.12), Math.sin(a) * (gp.radius + 0.12), 0);
        tooth.rotation.z = a;
        gear.add(tooth);
      }
      const axle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0x333333 }));
      gear.add(axle);
      gear.position.set(gp.pos[0], gp.pos[1], gp.pos[2] - 0.15);
      g.add(gear);
      gears.push({ mesh: gear, dir: gp.dir });
    }
    return { group: g, gears, mat };
  }, []);
  useFrame(() => {
    for (const gg of gears) gg.mesh.rotation.z = runtime.wheelAngle * 1.6 * gg.dir;
    lit(mat, [24, 10, 31], 1.2);
  });
  return <primitive object={group} />;
}

/** Gates slide up into the ceiling when opened. */
function GateAnimations() {
  const group = useMemo(() => new THREE.Group(), []);
  const live = useRef(new Map<GateAnim, THREE.Mesh>());
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: getAtlasTexture(), vertexColors: true, alphaTest: 0.5 }), []);
  useFrame(() => {
    const current = new Set(runtime.gateAnims);
    for (const [g, mesh] of live.current) {
      if (!current.has(g)) {
        group.remove(mesh);
        mesh.geometry.dispose();
        live.current.delete(g);
      }
    }
    for (const g of runtime.gateAnims) {
      let mesh = live.current.get(g);
      if (!mesh) {
        const origin = g.cells[0];
        const data = buildLooseBlocks(g.cells, g.blockId, origin);
        if (!data) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
        geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
        geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(origin[0], origin[1], origin[2]);
        mesh.userData.base = origin[1];
        group.add(mesh);
        live.current.set(g, mesh);
      }
      const k = Math.min(1, g.t / g.duration);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      mesh.position.y = mesh.userData.base + g.lift * e;
      mesh.position.x = g.cells[0][0] + (k < 0.9 ? Math.sin(runtime.time * 40) * 0.015 : 0);
    }
  });
  return <primitive object={group} />;
}

function ReactorFx() {
  const { group, cubes, mat } = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x5ff0ff, transparent: true, opacity: 0.85 });
    const g = new THREE.Group();
    const cubes: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
      g.add(m);
      cubes.push(m);
    }
    g.position.set(24, 11.2, 186);
    return { group: g, cubes, mat };
  }, []);
  useFrame(() => {
    const p = Math.max(runtime.reactorPower, runtime.reactorBoost * 0.4);
    group.visible = p > 0.01;
    const t = runtime.time;
    cubes.forEach((c, i) => {
      const a = t * (1 + p * 2) + (i / cubes.length) * Math.PI * 2;
      c.position.set(Math.cos(a) * 1.8 * p, Math.sin(t * 2 + i) * 0.3, Math.sin(a) * 1.8 * p);
      c.rotation.set(t * 2 + i, t * 3, 0);
      c.scale.setScalar(0.5 + p * 0.8);
    });
    mat.opacity = 0.4 + p * 0.5;
  });
  return <primitive object={group} />;
}

function PeriodicTableWall() {
  const mesh = useMemo(() => {
    const p = runtime.layout.periodicTable;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(p.width, p.height),
      new THREE.MeshBasicMaterial({ map: periodicTableTexture() }),
    );
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    m.rotation.y = Math.PI / 2;
    return m;
  }, []);
  useEffect(() => () => {
    (mesh.material as THREE.MeshBasicMaterial).map?.dispose();
  }, [mesh]);
  useFrame(() => lit(mesh.material as THREE.MeshBasicMaterial, [mesh.position.x + 1.5, mesh.position.y, mesh.position.z], 1.6));
  return <primitive object={mesh} />;
}

function SkyDome() {
  const mesh = useMemo(() => {
    const tex = skyTexture();
    tex.repeat.set(3, 1);
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(140, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    const c = runtime.layout.skyCenter;
    m.position.set(c[0], c[1] - 6, c[2]);
    m.renderOrder = -10;
    return m;
  }, []);
  useFrame(() => {
    mesh.visible = runtime.player.z > 196 || runtime.player.y > 16;
  });
  return <primitive object={mesh} />;
}

export function Mechanisms() {
  return (
    <>
      <WaterWheel />
      <Gears />
      <GateAnimations />
      <ReactorFx />
      <PeriodicTableWall />
      <SkyDome />
    </>
  );
}

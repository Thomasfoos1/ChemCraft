import { useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { runtime } from '../engine/runtime';
import { WorldMeshes } from './WorldMeshes';
import { Npcs } from './Npcs';
import { Mechanisms } from './Mechanisms';
import { Effects } from './Effects';
import { useGame } from '../game/store';
import { QUALITY } from '../game/settings';
import { ZONES } from '../content';
import { zoneAt } from '../engine/world/worldgen';

const fogColors = ZONES.map((z) => new THREE.Color(z.fog));
const skyFog = new THREE.Color('#9ec8f0');

/** Drives the runtime each frame and keeps fog/background in sync with the current zone. */
function FrameDriver() {
  const { camera, scene, gl } = useThree();
  useEffect(() => {
    runtime.attach(gl.domElement);
    scene.fog = new THREE.Fog(0x10141c, 20, 64);
    scene.background = new THREE.Color(0x0b0d12);
    return () => runtime.detach();
  }, [gl, scene]);
  useFrame((_, dt) => {
    runtime.update(dt, camera as THREE.PerspectiveCamera);
    const s = useGame.getState();
    const q = QUALITY[s.settings.graphics];
    const fog = scene.fog as THREE.Fog;
    const z = s.screen === 'game' ? runtime.player.z : camera.position.z;
    const outside = s.screen === 'game' && (runtime.player.z > 203 || runtime.player.y > 15);
    const target = outside ? skyFog : fogColors[zoneAt(runtime.layout, z) - 1];
    fog.color.lerp(target, Math.min(1, dt * 1.5));
    (scene.background as THREE.Color).copy(fog.color);
    const far = outside ? q.renderDistance * 1.6 : q.renderDistance;
    fog.far = far;
    fog.near = far * 0.35;
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.far !== far + 60) {
      cam.far = far + 60;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

export function GameCanvas() {
  const graphics = useGame((s) => s.settings.graphics);
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[graphics].pixelRatio);
  return (
    <Canvas
      className="game-canvas"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 75, near: 0.05, far: 160, position: [24, 9, 14] }}
      onPointerDown={() => {
        const s = useGame.getState();
        if (s.screen === 'game' && s.overlay === null && !s.introPlaying) runtime.resume();
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          const s = useGame.getState();
          if (s.settings.graphics === 'high') s.updateSettings({ graphics: 'medium' });
        }}
      />
      <FrameDriver />
      <WorldMeshes />
      <Npcs />
      <Mechanisms />
      <Effects />
    </Canvas>
  );
}

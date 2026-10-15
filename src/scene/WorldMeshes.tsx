import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../engine/runtime';
import { buildChunk, MeshData } from '../engine/world/mesher';
import { getAtlasTexture, getLavaTexture, getWaterTexture } from '../engine/textures';
import { CHUNK } from '../engine/world/world';
import { useGame } from '../game/store';
import { QUALITY } from '../game/settings';

type Layer = 'opaque' | 'translucent' | 'water' | 'lava';
const LAYERS: Layer[] = ['opaque', 'translucent', 'water', 'lava'];

function makeMaterials(): Record<Layer, THREE.Material> {
  const atlas = getAtlasTexture();
  return {
    opaque: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 }),
    translucent: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false }),
    water: new THREE.MeshBasicMaterial({
      map: getWaterTexture(), vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide,
    }),
    lava: new THREE.MeshBasicMaterial({ map: getLavaTexture(), vertexColors: true }),
  };
}

function toGeometry(d: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Chunked voxel world. Dirty chunks are re-meshed a few per frame, nearest first. */
export function WorldMeshes() {
  const group = useMemo(() => new THREE.Group(), []);
  const materials = useMemo(makeMaterials, []);
  const chunks = useRef(new Map<number, THREE.Mesh[]>());
  const version = useRef(-1);

  useEffect(() => () => {
    for (const meshes of chunks.current.values()) meshes.forEach((m) => m.geometry.dispose());
  }, []);

  useFrame((state) => {
    const w = runtime.world;
    let budget: number = QUALITY[useGame.getState().settings.graphics].maxChunksPerFrame;
    if (runtime.worldVersion !== version.current) {
      version.current = runtime.worldVersion;
      for (const meshes of chunks.current.values()) meshes.forEach((m) => { group.remove(m); m.geometry.dispose(); });
      chunks.current.clear();
      budget = Infinity;
    }
    if (w.dirty.size) {
      const cam = state.camera.position;
      const keys = [...w.dirty];
      if (budget !== Infinity && keys.length > budget) {
        keys.sort((a, b) => {
          const [ax, ay, az] = w.chunkCoords(a);
          const [bx, by, bz] = w.chunkCoords(b);
          const da = (ax * CHUNK + 8 - cam.x) ** 2 + (ay * CHUNK + 8 - cam.y) ** 2 + (az * CHUNK + 8 - cam.z) ** 2;
          const db = (bx * CHUNK + 8 - cam.x) ** 2 + (by * CHUNK + 8 - cam.y) ** 2 + (bz * CHUNK + 8 - cam.z) ** 2;
          return da - db;
        });
      }
      let done = 0;
      for (const key of keys) {
        if (done >= budget) break;
        w.dirty.delete(key);
        done++;
        const old = chunks.current.get(key);
        if (old) old.forEach((m) => { group.remove(m); m.geometry.dispose(); });
        const [cx, cy, cz] = w.chunkCoords(key);
        const data = buildChunk(w, cx, cy, cz);
        const meshes: THREE.Mesh[] = [];
        for (const layer of LAYERS) {
          const d = data[layer];
          if (!d) continue;
          const mesh = new THREE.Mesh(toGeometry(d), materials[layer]);
          mesh.matrixAutoUpdate = false;
          mesh.renderOrder = layer === 'opaque' || layer === 'lava' ? 0 : layer === 'water' ? 2 : 1;
          group.add(mesh);
          meshes.push(mesh);
        }
        chunks.current.set(key, meshes);
      }
    }
    // Animate liquids.
    const t = runtime.time;
    const water = getWaterTexture();
    water.offset.set((t * 0.05) % 1, (t * 0.35) % 1);
    const lava = getLavaTexture();
    lava.offset.set((t * 0.03) % 1, (t * 0.08) % 1);
  });

  return <primitive object={group} />;
}

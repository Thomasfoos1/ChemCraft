/**
 * Pooled cube particles rendered with one InstancedMesh (a single draw call), Minecraft style.
 */
import * as THREE from 'three';

export interface SpawnOpts {
  pos: [number, number, number];
  vel?: [number, number, number];
  spread?: number;
  speed?: number;
  color: string | THREE.Color;
  size?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  count?: number;
  /** Random colour variation 0..1 */
  jitter?: number;
  shrink?: boolean;
  /** Extra random spread in starting position. */
  area?: number;
}

export class Particles {
  readonly max: number;
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private life: Float32Array; private maxLife: Float32Array; private size: Float32Array;
  private grav: Float32Array; private drag: Float32Array; private shrink: Uint8Array;
  private col: Float32Array;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  /** 0..1 multiplier from graphics quality. */
  density = 1;

  constructor(max = 1600) {
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.size = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.shrink = new Uint8Array(max);
    this.col = new Float32Array(max * 3);
  }

  spawn(o: SpawnOpts) {
    const count = Math.max(1, Math.round((o.count ?? 1) * this.density));
    const base = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color);
    for (let k = 0; k < count; k++) {
      if (this.n >= this.max) return;
      const i = this.n++;
      const area = o.area ?? 0;
      this.px[i] = o.pos[0] + (Math.random() - 0.5) * area;
      this.py[i] = o.pos[1] + (Math.random() - 0.5) * area;
      this.pz[i] = o.pos[2] + (Math.random() - 0.5) * area;
      const sp = o.speed ?? 0;
      const spread = o.spread ?? 0;
      const v = o.vel ?? [0, 0, 0];
      this.vx[i] = v[0] + (Math.random() - 0.5) * 2 * spread + (Math.random() - 0.5) * sp;
      this.vy[i] = v[1] + (Math.random() - 0.5) * 2 * spread + Math.random() * sp * 0.5;
      this.vz[i] = v[2] + (Math.random() - 0.5) * 2 * spread + (Math.random() - 0.5) * sp;
      const life = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = (o.size ?? 0.1) * (0.7 + Math.random() * 0.6);
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
      this.shrink[i] = o.shrink === false ? 0 : 1;
      const j = o.jitter ?? 0.15;
      const f = 1 - j / 2 + Math.random() * j;
      this.col[i * 3] = base.r * f;
      this.col[i * 3 + 1] = base.g * f;
      this.col[i * 3 + 2] = base.b * f;
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const last = --this.n;
        if (i !== last) this.copy(last, i);
        continue;
      }
      this.vy[i] -= this.grav[i] * dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] *= d; this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      const s = this.shrink[i] ? this.size[i] * Math.min(1, t * 1.6) : this.size[i];
      this.m.makeScale(s, s, s);
      this.m.setPosition(this.px[i], this.py[i], this.pz[i]);
      this.mesh.setMatrixAt(i, this.m);
      this.c.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]);
      this.mesh.setColorAt(i, this.c);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }

  private copy(from: number, to: number) {
    this.px[to] = this.px[from]; this.py[to] = this.py[from]; this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.size[to] = this.size[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.shrink[to] = this.shrink[from];
    this.col[to * 3] = this.col[from * 3];
    this.col[to * 3 + 1] = this.col[from * 3 + 1];
    this.col[to * 3 + 2] = this.col[from * 3 + 2];
  }
}

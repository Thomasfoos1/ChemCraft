/**
 * The game runtime: owns the voxel world and simulation, and bridges the 3D scene with the
 * game store. React components read its state every frame; it calls store actions for
 * anything that changes saved progress.
 */
import * as THREE from 'three';
import { generateDungeon, zoneAt, FLOOR } from './world/worldgen';
import { Layout, MachinePlacement, Vec3 } from './world/layout';
import { applyWorldFlags } from './world/worldState';
import { B, BLOCKS, blockDef } from './world/blocks';
import { computeAllLight, relightAround, relightBox, AMBIENT } from './world/lighting';
import { raycastBlocks, rayAabb } from './world/raycast';
import { createPlayer, PlayerState, stepPlayer, PLAYER, Box, collides } from './player/physics';
import { Input } from './input';
import { Particles } from './effects/particles';
import { audio } from './audio';
import { game, useGame } from '../game/store';
import { events, GameEvent } from '../game/events';
import { NPCS, zoneDef } from '../content';
import { ELEMENTS } from '../chem/elements';
import { RECIPE_BY_ID } from '../chem/recipes';
import { prettyFormula } from '../chem/formula';
import { countItem, spaceFor } from '../game/inventory';
import { objectiveView } from '../game/quests';
import { QUALITY } from '../game/settings';
import { RESPAWN_SECONDS, REACH, SPAWN } from '../game/constants';

export type Target =
  | { kind: 'block'; x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number; distance: number }
  | { kind: 'npc'; id: string; distance: number };

export interface NpcRuntime {
  id: string;
  pos: Vec3;
  baseYaw: number;
  yaw: number;
  headYaw: number;
  headPitch: number;
  lookTimer: number;
  lookTarget: number;
  talkPulse: number;
}

export interface GateAnim {
  id: string;
  cells: Vec3[];
  blockId: number;
  lift: number;
  t: number;
  duration: number;
}

export interface PickupFx {
  id: number;
  item: string;
  from: Vec3;
  t: number;
}

interface Scheduled {
  at: number;
  fn: () => void;
}

const SHOWCASE_FLAGS = { water_flowing: true, bridge_built: true };

export class Runtime {
  layout: Layout;
  player: PlayerState;
  input = new Input();
  particles = new Particles(1800);
  npcs: NpcRuntime[] = [];
  target: Target | null = null;
  mining: { x: number; y: number; z: number; progress: number; soundT: number } | null = null;
  gateAnims: GateAnim[] = [];
  pickups: PickupFx[] = [];
  respawns: { pos: Vec3; id: number; at: number }[] = [];
  /** Bumped whenever the whole world is regenerated (renderers rebuild everything). */
  worldVersion = 0;
  time = 0;
  wheelSpeed = 0;
  wheelAngle = 0;
  reactorPower = 0;
  reactorBoost = 0;
  bubbleFlow = false;
  armSwing = 0;
  lastTablePos: Vec3 | null = null;
  intro: { t: number; duration: number } | null = null;
  menuT = 0;
  stepAccum = 0;
  fps = 60;
  private scheduled: Scheduled[] = [];
  private pickupId = 1;
  private poseTimer = 0;
  private persistTimer = 0;
  private questTimer = 0;
  private lastStepKey = '';
  private idleTime = 0;
  private expectingUnlock = false;
  private ambientTimer = 0;

  constructor() {
    this.layout = this.buildWorld(SHOWCASE_FLAGS);
    this.player = createPlayer(SPAWN.pos[0], SPAWN.pos[1], SPAWN.pos[2], SPAWN.yaw);
    events.on((e) => this.onEvent(e));
    audio.onCaption = (t) => game().caption(t);
    // Any interface that opens by itself (zone-complete dialogue, auto quiz, results) frees the mouse.
    useGame.subscribe((s, prev) => {
      if ((s.overlay !== null && prev.overlay === null) || s.screen !== 'game') this.releaseForUI();
    });
  }

  // ------------------------------------------------------------------ setup
  private buildWorld(flags: Record<string, boolean>): Layout {
    const L = generateDungeon();
    applyWorldFlags(L, flags);
    L.world.computeSkyHeights();
    computeAllLight(L.world);
    L.world.markAllDirty();
    this.npcs = L.npcs.map((n) => ({
      id: n.id, pos: n.pos, baseYaw: n.yaw, yaw: n.yaw, headYaw: 0, headPitch: 0, lookTimer: 2 + Math.random() * 3, lookTarget: 0, talkPulse: 0,
    }));
    this.gateAnims = [];
    this.respawns = [];
    this.scheduled = [];
    this.particles.clear();
    this.wheelSpeed = flags.water_flowing ? 1.1 : 0;
    this.bubbleFlow = !!flags.carbonator_on;
    this.reactorPower = flags.reactor_on ? 1 : 0;
    this.worldVersion++;
    return L;
  }

  attach(canvas: HTMLCanvasElement) {
    this.input.attach(canvas);
    this.input.onKey = (code, e) => this.onKey(code, e);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
  }

  detach() {
    this.input.detach();
  }

  get world() {
    return this.layout.world;
  }

  /** Request pointer lock (call from a user gesture). */
  resume() {
    audio.ensure();
    audio.startMusic();
    const s = game();
    if (s.screen !== 'game') return;
    if (s.introPlaying) return;
    this.input.lock();
  }

  /** Release the mouse to show an interface (no pause menu). */
  releaseForUI() {
    if (this.input.locked) {
      this.expectingUnlock = true;
      this.input.unlock();
    }
  }

  private onLockChange(locked: boolean) {
    const s = game();
    s.setPointerLocked(locked);
    if (locked) {
      this.expectingUnlock = false;
      return;
    }
    if (this.expectingUnlock) {
      this.expectingUnlock = false;
      return;
    }
    if (s.screen === 'game' && s.overlay === null && !s.introPlaying) s.openOverlay('pause');
    this.mining = null;
  }

  newGame() {
    this.layout = this.buildWorld(game().save?.flags ?? {});
    const p = SPAWN.pos;
    this.player = createPlayer(p[0], p[1], p[2], SPAWN.yaw);
    this.intro = { t: 0, duration: game().settings.reducedMotion ? 0.6 : 4.2 };
    this.idleTime = 0;
  }

  loadGame() {
    const s = game().save;
    if (!s) return;
    this.layout = this.buildWorld(s.flags);
    const [x, y, z] = s.player.pos;
    this.player = createPlayer(x, y, z, s.player.yaw);
    this.player.pitch = s.player.pitch;
    if (collides(this.world, x, y, z)) {
      const cp = this.layout.checkpoints[zoneAt(this.layout, z)] ?? SPAWN.pos;
      this.player = createPlayer(cp[0] + 0.5, cp[1], cp[2], s.player.yaw);
    }
    this.intro = null;
    game().setCurrentZone(zoneAt(this.layout, this.player.z));
  }

  // ------------------------------------------------------------------ events
  private onEvent(e: GameEvent) {
    switch (e.type) {
      case 'newGame':
        this.newGame();
        break;
      case 'loadGame':
        this.loadGame();
        break;
      case 'sfx':
        audio.play(e.name, { volume: e.volume });
        break;
      case 'achievement':
        audio.play('achievement');
        break;
      case 'craftSuccess': {
        audio.play('craft');
        const p = this.lastTablePos;
        if (p) {
          const r = RECIPE_BY_ID[e.recipe];
          this.particles.spawn({ pos: [p[0] + 0.5, p[1] + 1.2, p[2] + 0.5], color: r?.iconColor ?? '#ffffff', count: 26, speed: 3, gravity: 3, life: 1, size: 0.08, area: 0.6 });
          this.particles.spawn({ pos: [p[0] + 0.5, p[1] + 1.2, p[2] + 0.5], color: '#fff6b0', count: 14, speed: 2, gravity: -0.5, life: 1.2, size: 0.06, area: 0.8 });
        }
        break;
      }
      case 'craftFail':
        audio.play('craftFail');
        break;
      case 'openGate':
        this.openGate(e.gate, true);
        break;
      case 'socketPowered':
        this.powerSocket(e.socket);
        break;
      case 'reactorStart':
        this.startReactor();
        break;
      case 'objective': {
        const p = this.player;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          this.particles.spawn({ pos: [p.x + Math.cos(a) * 0.8, p.y + 0.2, p.z + Math.sin(a) * 0.8], color: '#ffd34f', vel: [0, 1.8, 0], spread: 0.1, life: 0.9, size: 0.06 });
        }
        break;
      }
      case 'zoneComplete': {
        const npc = this.npcs.find((n) => n.id === zoneDef(e.zone).npc);
        if (npc) this.particles.spawn({ pos: [npc.pos[0], npc.pos[1] + 2.2, npc.pos[2]], color: '#ffd34f', count: 40, speed: 4, gravity: 4, life: 1.4, size: 0.09, area: 0.6 });
        break;
      }
      default:
        break;
    }
  }

  private onKey(code: string, e: KeyboardEvent) {
    const s = game();
    if (s.screen !== 'game') return;
    if (s.introPlaying) {
      if (code === 'Space' || code === 'Enter' || code === 'Escape') this.skipIntro();
      return;
    }
    const ov = s.overlay;
    if (ov === 'dialogue') {
      if (code === 'Space' || code === 'Enter' || code === 'KeyE') {
        e.preventDefault();
        // Typewriter text is revealed by the dialogue component; it calls dialogueNext.
        window.dispatchEvent(new CustomEvent('chemcraft:dialogue-advance'));
      }
      return;
    }
    if (code === 'KeyE' || code === 'KeyI') {
      if (ov === 'inventory' || ov === 'crafting' || ov === 'book') {
        s.closeOverlay();
        this.resume();
      } else if (ov === null) {
        this.releaseForUI();
        s.openOverlay('inventory');
      }
      return;
    }
    if (code === 'KeyB' && ov === null) {
      this.releaseForUI();
      s.openOverlay('book');
      return;
    }
    if ((code === 'KeyH' || code === 'F1') && ov === null) {
      e.preventDefault();
      this.releaseForUI();
      s.openOverlay('help');
      return;
    }
    if (code === 'Escape' && ov !== null && ov !== 'pause' && ov !== 'quiz') {
      s.closeOverlay();
      return;
    }
    if (ov === null && /^Digit[1-9]$/.test(code)) s.selectSlot(parseInt(code.slice(5), 10) - 1);
  }

  skipIntro() {
    if (!this.intro) return;
    this.intro.t = this.intro.duration;
  }

  // ------------------------------------------------------------------ frame update
  update(dt: number, camera: THREE.PerspectiveCamera) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    const s = game();
    const quality = QUALITY[s.settings.graphics];
    this.particles.density = quality.particles;
    // Ambient floor: unlit areas stay clearly visible (brightness slider tunes it).
    const amb = 0.38 + s.settings.brightness * 0.24;
    const blend = 0.25 + s.settings.brightness * 0.75;
    if (amb !== AMBIENT.value || blend !== AMBIENT.brightness) {
      AMBIENT.value = amb;
      AMBIENT.brightness = blend;
      this.world.markAllDirty();
    }

    this.runScheduled();
    this.updateGateAnims(dt);
    this.updateNpcs(dt);
    this.updateAmbient(dt);
    this.wheelAngle += this.wheelSpeed * dt;
    this.reactorBoost = Math.max(0, this.reactorBoost - dt * 0.3);

    if (s.screen === 'menu' || s.screen === 'results') {
      this.updateMenuCamera(dt, camera);
      this.particles.update(dt);
      return;
    }

    if (this.intro) {
      this.updateIntro(dt, camera);
      this.particles.update(dt);
      return;
    }

    const playing = s.overlay === null && this.input.locked;
    const { dx, dy, rightPressed, wheel } = this.input.consume();
    if (playing) {
      const sens = 0.0022 * s.settings.mouseSensitivity;
      this.player.yaw -= dx * sens;
      this.player.pitch -= dy * sens * (s.settings.invertY ? -1 : 1);
      this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch));
      if (wheel !== 0 && s.save) s.selectSlot((s.save.selected + wheel + 9) % 9);
    }

    // Physics (fixed sub-steps).
    const inputState = playing
      ? {
          forward: (this.input.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.input.down('KeyS', 'ArrowDown') ? 1 : 0),
          strafe: (this.input.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.input.down('KeyA', 'ArrowLeft') ? 1 : 0),
          jump: this.input.down('Space'),
          sprint: this.input.down('ShiftLeft', 'ShiftRight', 'ControlLeft'),
        }
      : { forward: 0, strafe: 0, jump: false, sprint: false };
    const extra: Box[] = this.npcs.map((n) => ({ minX: n.pos[0] - 0.3, minY: n.pos[1], minZ: n.pos[2] - 0.3, maxX: n.pos[0] + 0.3, maxY: n.pos[1] + 1.9, maxZ: n.pos[2] + 0.3 }));
    this.stepAccum += dt;
    const STEP = 1 / 120;
    let walkedBefore = this.player.walked;
    let landed = false;
    let fall = 0;
    while (this.stepAccum >= STEP) {
      const r = stepPlayer(this.world, this.player, inputState, STEP, { autoJump: s.settings.autoJump, extra });
      if (r.landed) { landed = true; fall = Math.max(fall, r.fallSpeed); }
      this.stepAccum -= STEP;
    }
    if (landed && fall > 7) audio.play('land', { volume: 0.6 });
    // footsteps
    if (Math.floor(this.player.walked / 1.9) !== Math.floor(walkedBefore / 1.9)) {
      const zone = zoneAt(this.layout, this.player.z);
      audio.play(zone === 2 ? 'step:snow' : 'step', { volume: 0.55, pitch: zone === 5 ? 1.3 : 1 });
    }
    walkedBefore = this.player.walked;
    if (s.tutorial === 'move' && this.player.walked > 4) s.setTutorial(null);

    // Hazards.
    if (this.player.inLava || this.player.y < 1) this.respawnPlayer();

    // Camera.
    this.applyCamera(camera, dt, inputState.sprint && inputState.forward > 0);
    audio.listener = { pos: [this.player.x, this.player.y + PLAYER.eye, this.player.z], yaw: this.player.yaw };

    // Targeting & interaction.
    this.updateTarget(camera);
    if (playing) {
      this.updateMining(dt);
      if (rightPressed) this.interact();
    } else {
      this.mining = null;
    }
    this.armSwing = Math.max(0, this.armSwing - dt * 3);
    this.updatePrompt(playing);

    // Respawning deposits.
    this.updateRespawns();

    // Periodic bookkeeping.
    this.poseTimer += dt;
    if (this.poseTimer > 1) {
      this.poseTimer = 0;
      s.setPlayerPose([this.player.x, this.player.y, this.player.z], this.player.yaw, this.player.pitch);
    }
    if (s.overlay !== 'pause') s.addPlayTime(dt);
    this.persistTimer += dt;
    if (this.persistTimer > 10) {
      this.persistTimer = 0;
      s.persist();
    }
    this.questTimer += dt;
    if (this.questTimer > 0.5) {
      this.questTimer = 0;
      s.refreshQuests(this.player.z);
      s.setCurrentZone(zoneAt(this.layout, this.player.z));
      this.updateIdleHint(0.5);
    }

    // Ambient loops.
    const nearWater = this.world.get(Math.floor(this.player.x), FLOOR - 1, Math.floor(this.player.z)) === B.WATER || this.distTo([22, 6, 27]) < 10;
    audio.setLoop('water', game().save?.flags.water_flowing && zoneAt(this.layout, this.player.z) === 1 ? (nearWater ? 0.12 : 0.05) : 0);
    audio.setLoop('lava', Math.max(0, 0.12 - this.distTo([30, 5, 96]) * 0.008) + (zoneAt(this.layout, this.player.z) === 4 ? 0.04 : 0));

    this.particles.update(dt);
    this.pickups = this.pickups.filter((p) => (p.t += dt) < 0.45);
  }

  private distTo(p: Vec3) {
    return Math.hypot(this.player.x - p[0], this.player.y - p[1], this.player.z - p[2]);
  }

  private applyCamera(camera: THREE.PerspectiveCamera, dt: number, sprinting: boolean) {
    const s = game().settings;
    const bob = s.reducedMotion ? 0 : Math.min(1, Math.hypot(this.player.vx, this.player.vz) / 4) * (this.player.onGround ? 1 : 0);
    const phase = this.player.walked * 3.2;
    camera.position.set(
      this.player.x + Math.cos(this.player.yaw) * Math.sin(phase) * 0.03 * bob,
      this.player.y + PLAYER.eye + Math.abs(Math.cos(phase)) * 0.05 * bob,
      this.player.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.player.pitch, this.player.yaw + Math.PI, 0);
    const targetFov = s.fov + (sprinting && !s.reducedMotion ? 8 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
      camera.updateProjectionMatrix();
    }
  }

  private updateIntro(dt: number, camera: THREE.PerspectiveCamera) {
    const it = this.intro!;
    it.t += dt;
    const k = Math.min(1, it.t / it.duration);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const from = new THREE.Vector3(23.5, 10.2, 0.8);
    const to = new THREE.Vector3(this.player.x, this.player.y + PLAYER.eye, this.player.z);
    camera.position.lerpVectors(from, to, e);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-0.35 * (1 - e) + this.player.pitch * e, Math.PI + 0.25 * Math.sin(k * Math.PI) + this.player.yaw * e, 0);
    if (camera.fov !== game().settings.fov) {
      camera.fov = game().settings.fov;
      camera.updateProjectionMatrix();
    }
    if (k >= 1) {
      this.intro = null;
      const s = game();
      s.setIntro(false);
      s.showBanner({ title: zoneDef(1).name, subtitle: `Zone 1 — ${zoneDef(1).chemistry}`, kind: 'zone' });
    }
  }

  private menuViews = [
    { c: [24, 8.5, 20] as Vec3, r: 7, h: 9.5 },
    { c: [24, 9, 53] as Vec3, r: 8, h: 11 },
    { c: [24, 9, 130] as Vec3, r: 9, h: 13 },
    { c: [24, 8, 180] as Vec3, r: 10, h: 12 },
  ];

  private updateMenuCamera(dt: number, camera: THREE.PerspectiveCamera) {
    this.menuT += dt;
    const per = 16;
    const idx = Math.floor(this.menuT / per) % this.menuViews.length;
    const v = this.menuViews[idx];
    const t = (this.menuT % per) / per;
    const a = t * 1.2 + idx;
    camera.position.set(v.c[0] + Math.sin(a) * v.r, v.h, v.c[2] + Math.cos(a) * v.r);
    camera.lookAt(v.c[0], v.c[1], v.c[2]);
    if (camera.fov !== 70) {
      camera.fov = 70;
      camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ targeting
  private updateTarget(camera: THREE.PerspectiveCamera) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const ox = this.player.x, oy = this.player.y + PLAYER.eye, oz = this.player.z;
    const hit = raycastBlocks(this.world, ox, oy, oz, dir.x, dir.y, dir.z, REACH);
    let best: Target | null = hit ? { kind: 'block', ...hit } : null;
    for (const n of this.npcs) {
      const d = rayAabb(ox, oy, oz, dir.x, dir.y, dir.z, n.pos[0] - 0.35, n.pos[1], n.pos[2] - 0.35, n.pos[0] + 0.35, n.pos[1] + 2.0, n.pos[2] + 0.35);
      if (d !== null && d <= REACH + 0.5 && (!best || d < best.distance)) best = { kind: 'npc', id: n.id, distance: d };
    }
    this.target = best;
  }

  private machineAt(x: number, y: number, z: number): MachinePlacement | undefined {
    return this.layout.machines.find((m) => m.cells.some((c) => c[0] === x && c[1] === y && c[2] === z));
  }

  private updatePrompt(playing: boolean) {
    const s = game();
    if (!playing || !this.target) return s.setPrompt(null);
    const t = this.target;
    if (t.kind === 'npc') return s.setPrompt(`Right Click — Talk to ${NPCS[t.id]?.name ?? 'Scientist'}`);
    const def = blockDef(t.id);
    if (def.element) {
      const el = ELEMENTS[def.element];
      return s.setPrompt(`Hold Left Click — Mine ${def.name} (${el.symbol})`);
    }
    if (t.id === B.CRAFTING) return s.setPrompt('Right Click — Open Crafting Table');
    if (t.id === B.CHEST) return s.setPrompt('Right Click — Open Chest');
    if (t.id === B.CRACKED || t.id === B.CRACKED_DEEP || t.id === B.CRACKED_LIME) return s.setPrompt(`Hold Left Click — Break ${def.name}`);
    const m = this.machineAt(t.x, t.y, t.z);
    if (m) return s.setPrompt(this.machinePrompt(m));
    s.setPrompt(null);
  }

  private machinePrompt(m: MachinePlacement): string {
    const f = game().save?.flags ?? {};
    switch (m.kind) {
      case 'generator': return f.water_flowing ? 'Water Generator — running' : 'Right Click — Use Water Generator';
      case 'frozen_gate': return f.ice_melted ? 'Iron Gate' : 'Right Click — Use Frozen Gate';
      case 'carbonator': return f.carbonator_on ? 'Carbonation Machine — running' : 'Right Click — Use Carbonation Machine';
      case 'fabricator': return f.bridge_built ? 'Stone Fabricator — bridge complete' : 'Right Click — Use Stone Fabricator';
      case 'console': return 'Right Click — Open Formula Console';
      case 'sorter': return 'Right Click — Open Sorting Station';
      case 'balancer': return 'Right Click — Open Balancing Station';
      case 'socket': return `Right Click — Reactor Socket ${m.id.slice(-1)}`;
      case 'reactor': return 'Right Click — Check Reactor';
      case 'vault': return f.vault_open ? 'Vault Door' : 'Vault Door — sealed';
      default: return '';
    }
  }

  // ------------------------------------------------------------------ mining
  private updateMining(dt: number) {
    const t = this.target;
    if (!this.input.left || !t || t.kind !== 'block') {
      this.mining = null;
      if (this.input.left) this.armSwing = Math.max(this.armSwing, 0.6);
      return;
    }
    const def = blockDef(t.id);
    this.armSwing = 1;
    if (def.breakTime === undefined) {
      this.mining = null;
      return;
    }
    if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z) {
      this.mining = { x: t.x, y: t.y, z: t.z, progress: 0, soundT: 0 };
    }
    const m = this.mining;
    m.progress += dt / def.breakTime;
    m.soundT -= dt;
    if (m.soundT <= 0) {
      m.soundT = 0.22;
      audio.play('mine', { pos: [t.x + 0.5, t.y + 0.5, t.z + 0.5], pitch: def.element ? 1.4 : 1 });
      this.particles.spawn({ pos: [t.x + 0.5 + t.nx * 0.52, t.y + 0.5 + t.ny * 0.52, t.z + 0.5 + t.nz * 0.52], color: def.particle, count: 3, speed: 1.5, gravity: 9, life: 0.5, size: 0.07, area: 0.5 });
    }
    if (m.progress >= 1) {
      this.breakBlock(t.x, t.y, t.z, t.id);
      this.mining = null;
    }
  }

  private breakBlock(x: number, y: number, z: number, id: number) {
    const def = blockDef(id);
    const s = game();
    if (def.element) {
      const dep = this.layout.deposits.find((d) => d.pos[0] === x && d.pos[1] === y && d.pos[2] === z);
      const amount = dep && dep.zone >= 4 ? 2 : 1;
      if (!s.save || spaceFor(s.save.inventory, def.element) < 1) {
        s.toast({ title: 'Inventory full!', text: 'Open your inventory (E) and drop items in the trash slot.', kind: 'warn' });
        return;
      }
      s.giveItem(def.element, amount);
      this.respawns.push({ pos: [x, y, z], id, at: this.time + RESPAWN_SECONDS });
      this.pickups.push({ id: this.pickupId++, item: def.element, from: [x + 0.5, y + 0.5, z + 0.5], t: 0 });
      audio.play('pickup', { pitch: 1 + Math.random() * 0.2 });
    }
    this.world.set(x, y, z, B.AIR);
    relightAround(this.world, x, y, z);
    audio.play('break', { pos: [x + 0.5, y + 0.5, z + 0.5] });
    this.particles.spawn({ pos: [x + 0.5, y + 0.5, z + 0.5], color: def.particle, count: 22, speed: 3, gravity: 12, life: 0.8, size: 0.1, area: 0.8 });
    if (!def.element) {
      const secret = this.layout.secrets.find((sc) => sc.cracked.some((c) => c[0] === x && c[1] === y && c[2] === z));
      if (secret) s.discoverSecret(secret.id);
    }
  }

  private updateRespawns() {
    if (!this.respawns.length) return;
    const pb = { minX: this.player.x - 0.3, maxX: this.player.x + 0.3, minY: this.player.y, maxY: this.player.y + 1.8, minZ: this.player.z - 0.3, maxZ: this.player.z + 0.3 };
    this.respawns = this.respawns.filter((r) => {
      if (this.time < r.at) return true;
      const [x, y, z] = r.pos;
      const inside = pb.maxX > x && pb.minX < x + 1 && pb.maxY > y && pb.minY < y + 1 && pb.maxZ > z && pb.minZ < z + 1;
      if (inside || this.world.get(x, y, z) !== B.AIR) {
        r.at = this.time + 2;
        return true;
      }
      this.world.set(x, y, z, r.id);
      relightAround(this.world, x, y, z);
      this.particles.spawn({ pos: [x + 0.5, y + 0.5, z + 0.5], color: blockDef(r.id).particle, count: 10, speed: 1, gravity: -1, life: 0.8, size: 0.06, area: 1 });
      return false;
    });
  }

  // ------------------------------------------------------------------ interaction
  private interact() {
    const t = this.target;
    const s = game();
    if (!t) return;
    this.armSwing = 1;
    if (t.kind === 'npc') {
      const n = this.npcs.find((x) => x.id === t.id);
      if (n) n.talkPulse = 1.5;
      this.releaseForUI();
      s.talk(t.id);
      return;
    }
    if (t.id === B.CRAFTING) {
      this.lastTablePos = [t.x, t.y, t.z];
      this.releaseForUI();
      s.openOverlay('crafting');
      return;
    }
    if (t.id === B.CHEST) {
      const chest = this.layout.chests.find((c) => c.pos[0] === t.x && c.pos[1] === t.y && c.pos[2] === t.z);
      if (chest && s.openChest(chest.id, chest.contents)) {
        this.particles.spawn({ pos: [t.x + 0.5, t.y + 1.1, t.z + 0.5], color: '#ffd34f', count: 24, speed: 2.5, gravity: 2, life: 1, size: 0.07, area: 0.6 });
      }
      return;
    }
    const m = this.machineAt(t.x, t.y, t.z);
    if (m) this.useMachine(m);
  }

  /** Item the player uses on a machine: the held one if it matches, otherwise any in the inventory. */
  private useItem(item: string): boolean {
    const s = game();
    if (!s.save || countItem(s.save.inventory, item) < 1) return false;
    s.takeItem(item, 1);
    return true;
  }

  private needItemToast(item: string, machineName: string) {
    const r = RECIPE_BY_ID[item];
    game().toast({
      title: `The ${machineName} needs ${r ? r.name : item}`,
      text: r ? `Craft ${prettyFormula(r.formula)} at a crafting table first.` : undefined,
      kind: 'info',
    });
    audio.play('craftFail');
  }

  private useMachine(m: MachinePlacement) {
    const s = game();
    const f = s.save?.flags ?? {};
    switch (m.kind) {
      case 'generator':
        if (f.water_flowing) return s.toast({ title: 'The generator is running!', kind: 'info' });
        if (!this.useItem('water')) return this.needItemToast('water', 'generator');
        s.setFlag('water_flowing');
        return this.animateWater(m);
      case 'frozen_gate':
        if (f.ice_melted) return s.toast({ title: f.gate2_open ? 'The gate is open.' : 'The ice is gone! Talk to Dr. Salty.', kind: 'info' });
        if (!this.useItem('sodium_chloride')) return this.needItemToast('sodium_chloride', 'frozen gate');
        s.setFlag('ice_melted');
        return this.animateMelt();
      case 'carbonator':
        if (f.carbonator_on) return s.toast({ title: 'The carbonation machine is bubbling away!', kind: 'info' });
        if (!this.useItem('carbon_dioxide')) return this.needItemToast('carbon_dioxide', 'carbonation machine');
        s.setFlag('carbonator_on');
        return this.animateCarbonation(m);
      case 'fabricator':
        if (f.bridge_built) return s.toast({ title: 'The bridge is already rebuilt.', kind: 'info' });
        if (!this.useItem('calcium_carbonate')) return this.needItemToast('calcium_carbonate', 'stone fabricator');
        s.setFlag('bridge_built');
        return this.animateBridge();
      case 'console':
        this.releaseForUI();
        return s.openStation('console');
      case 'sorter':
        this.releaseForUI();
        return s.openStation('sorter');
      case 'balancer':
        this.releaseForUI();
        return s.openStation('balancer');
      case 'socket':
        this.releaseForUI();
        return s.openStation('reactor', m.id.slice(-1));
      case 'reactor':
        this.releaseForUI();
        return s.openStation('reactor');
      case 'vault':
        if (!f.vault_open) s.toast({ title: 'The vault is sealed.', text: 'Complete the Grand Laboratory challenges to start the reactor.', kind: 'info' });
        return;
      default:
        return;
    }
  }

  // ------------------------------------------------------------------ puzzle animations
  private schedule(delay: number, fn: () => void) {
    this.scheduled.push({ at: this.time + delay, fn });
  }

  private runScheduled() {
    if (!this.scheduled.length) return;
    const due = this.scheduled.filter((x) => x.at <= this.time);
    if (!due.length) return;
    this.scheduled = this.scheduled.filter((x) => x.at > this.time);
    for (const d of due) d.fn();
  }

  private animateWater(m: MachinePlacement) {
    audio.play('machine', { pos: m.center });
    this.particles.spawn({ pos: m.center, color: '#7ab0ff', count: 30, speed: 3, gravity: 6, life: 1, size: 0.08, area: 0.6 });
    const path = this.layout.waterPath;
    const per = 0.055;
    this.schedule(0.6, () => audio.play('water', { pos: path[0] }));
    path.forEach(([x, y, z], i) => {
      this.schedule(0.6 + i * per, () => {
        this.world.set(x, y, z, B.WATER);
        if (i % 3 === 0) this.particles.spawn({ pos: [x + 0.5, y + 1, z + 0.5], color: '#9cc8ff', count: 3, speed: 1.5, gravity: 8, life: 0.6, size: 0.06 });
        if (i === Math.floor(path.length * 0.55)) audio.play('water', { pos: [x, y, z] });
      });
    });
    const done = 0.6 + path.length * per;
    this.schedule(done - 1.2, () => {
      this.wheelSpeed = 0.2;
    });
    for (let k = 1; k <= 8; k++) this.schedule(done - 1.2 + k * 0.2, () => (this.wheelSpeed = Math.min(1.1, this.wheelSpeed + 0.12)));
    this.schedule(done + 0.8, () => {
      audio.play('machine', { pos: [24, 10, 31] });
      game().markUsed('generator');
    });
  }

  private animateMelt() {
    const cells = this.layout.iceCells;
    audio.play('melt', { pos: [24, 8, 69] });
    for (let i = 0; i < 24; i++) {
      this.schedule(i * 0.04, () =>
        this.particles.spawn({ pos: [22 + Math.random() * 4, 10.2, 68.6], color: '#ffffff', count: 2, vel: [0, -2, 0], spread: 0.3, gravity: 6, life: 0.9, size: 0.05 }),
      );
    }
    const order = [...cells].sort((a, b) => b[1] - a[1]);
    order.forEach(([x, y, z], i) => {
      this.schedule(0.8 + i * 0.12, () => {
        this.world.set(x, y, z, B.WATER);
        this.particles.spawn({ pos: [x + 0.5, y + 0.5, z + 0.5], color: '#e8f4ff', count: 6, speed: 1.2, gravity: -1.5, life: 1.2, size: 0.09, area: 0.8 });
      });
      this.schedule(1.4 + i * 0.12, () => {
        this.world.set(x, y, z, B.AIR);
        this.particles.spawn({ pos: [x + 0.5, y + 0.3, z + 0.5], color: '#9cc8ff', count: 4, speed: 1, gravity: 8, life: 0.6, size: 0.06 });
      });
    });
    this.schedule(1.6 + order.length * 0.12, () => game().markUsed('frozen_gate'));
  }

  private animateCarbonation(m: MachinePlacement) {
    audio.play('machine', { pos: m.center });
    this.schedule(0.6, () => {
      this.bubbleFlow = true;
      audio.play('bubbles', { pos: m.center });
    });
    this.schedule(1.6, () => audio.play('bubbles', { pos: [21, 11, 104] }));
    this.schedule(2.6, () => audio.play('bubbles', { pos: [21, 11, 106] }));
    this.schedule(3.4, () => game().markUsed('carbonator'));
  }

  private animateBridge() {
    audio.play('machine', { pos: [17.5, 7, 128] });
    const wire = this.layout.wires.bridge ?? [];
    wire.forEach(([x, y, z], i) => this.schedule(0.3 + i * 0.15, () => {
      this.world.set(x, y, z, B.WIRE_ON);
      relightAround(this.world, x, y, z, 13);
    }));
    const start = 0.4 + wire.length * 0.15;
    this.layout.bridgeCells.forEach((c, i) => {
      this.schedule(start + i * 0.11, () => {
        const [x, y, z] = c.pos;
        this.world.set(x, y, z, c.id);
        audio.play('build', { pos: [x, y, z] });
        this.particles.spawn({ pos: [x + 0.5, y + 0.5, z + 0.5], color: '#f4f0e6', count: 8, speed: 2, gravity: 5, life: 0.6, size: 0.08, area: 1 });
      });
    });
    const end = start + this.layout.bridgeCells.length * 0.11;
    this.schedule(end + 0.1, () => relightBox(this.world, { x0: 20, y0: 4, z0: 132, x1: 26, y1: 8, z1: 140 }));
    this.schedule(end + 0.6, () => game().markUsed('fabricator'));
  }

  openGate(id: string, animate: boolean) {
    const g = this.layout.gates[id];
    if (!g) return;
    if (g.cells.every(([x, y, z]) => this.world.get(x, y, z) === B.AIR)) return;
    for (const [x, y, z] of g.cells) this.world.set(x, y, z, B.AIR);
    if (BLOCKS[g.blockId].opaque) {
      const xs = g.cells.map((c) => c[0]), ys = g.cells.map((c) => c[1]), zs = g.cells.map((c) => c[2]);
      relightBox(this.world, { x0: Math.min(...xs), y0: Math.min(...ys), z0: Math.min(...zs), x1: Math.max(...xs), y1: Math.max(...ys), z1: Math.max(...zs) });
    }
    if (!animate) return;
    this.gateAnims.push({ id, cells: g.cells, blockId: g.blockId, lift: g.lift, t: 0, duration: id === 'vault' ? 4.5 : 3 });
    const c = g.cells[Math.floor(g.cells.length / 2)];
    audio.play('gate', { pos: c });
    for (let i = 0; i < 10; i++)
      this.schedule(i * 0.25, () =>
        this.particles.spawn({ pos: [c[0] + 0.5, g.cells[0][1] + 0.1, c[2] + 0.5], color: '#9a9a9a', count: 5, speed: 2, gravity: 2, life: 1, size: 0.12, area: 4 }),
      );
  }

  private updateGateAnims(dt: number) {
    for (const g of this.gateAnims) g.t += dt;
    this.gateAnims = this.gateAnims.filter((g) => g.t < g.duration + 0.2);
  }

  private powerSocket(socket: string) {
    const m = this.layout.machines.find((mm) => mm.id === `socket${socket}`);
    if (!m) return;
    audio.play('socket', { pos: m.center });
    for (const [x, y, z] of m.cells) {
      this.world.set(x, y, z, B.SOCKET_ON);
      relightAround(this.world, x, y, z, 14);
    }
    this.particles.spawn({ pos: m.center, color: '#5ff0ff', count: 30, speed: 3, gravity: 1, life: 1, size: 0.08, area: 0.6 });
    const wire = this.layout.wires[`socket${socket}`] ?? [];
    wire.forEach(([x, y, z], i) => this.schedule(0.2 + i * 0.1, () => {
      this.world.set(x, y, z, B.WIRE_ON);
      this.particles.spawn({ pos: [x + 0.5, y + 1.05, z + 0.5], color: '#ff5a3a', count: 3, speed: 1, gravity: -1, life: 0.6, size: 0.05 });
    }));
    this.schedule(0.3 + wire.length * 0.1, () => {
      const xs = wire.map((c) => c[0]), zs = wire.map((c) => c[2]);
      if (wire.length) relightBox(this.world, { x0: Math.min(...xs), y0: FLOOR - 1, z0: Math.min(...zs), x1: Math.max(...xs), y1: FLOOR - 1, z1: Math.max(...zs) }, 13);
    });
    this.reactorBoost = Math.min(1, this.reactorBoost + 0.35);
  }

  private startReactor() {
    const core = this.layout.reactorCore;
    const c: Vec3 = [24, FLOOR + 1.5, 186];
    audio.play('reactor', { pos: c });
    for (let i = 0; i < 14; i++) {
      this.schedule(i * 0.25, () => {
        this.reactorPower = Math.min(1, (i + 1) / 14);
        this.particles.spawn({ pos: c, color: i % 2 ? '#5ff0ff' : '#ffffff', count: 12, speed: 5, gravity: 0, drag: 1.5, life: 1, size: 0.09, area: 2 });
      });
    }
    this.schedule(3.6, () => {
      for (const [x, y, z] of core) this.world.set(x, y, z, B.REACTOR_ON);
      relightBox(this.world, { x0: 23, y0: FLOOR, z0: 185, x1: 24, y1: FLOOR + 2, z1: 186 });
      this.particles.spawn({ pos: c, color: '#c8ffff', count: 80, speed: 8, gravity: 0, drag: 2, life: 1.5, size: 0.12, area: 1 });
      audio.play('zoneComplete');
    });
    this.schedule(4.6, () => game().reactorFinished());
  }

  // ------------------------------------------------------------------ npcs & ambience
  private updateNpcs(dt: number) {
    for (const n of this.npcs) {
      const dx = this.player.x - n.pos[0], dz = this.player.z - n.pos[2];
      const d = Math.hypot(dx, dz);
      n.talkPulse = Math.max(0, n.talkPulse - dt);
      if (d < 7) {
        // Turn head (and slowly the body) toward the player.
        const want = Math.atan2(dx, dz);
        let rel = want - n.yaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        if (Math.abs(rel) > 0.9) n.yaw += Math.sign(rel) * Math.min(Math.abs(rel) - 0.9, dt * 1.5);
        rel = Math.atan2(Math.sin(want - n.yaw), Math.cos(want - n.yaw));
        n.headYaw += (Math.max(-0.9, Math.min(0.9, rel)) - n.headYaw) * Math.min(1, dt * 5);
        const dy = this.player.y + PLAYER.eye - (n.pos[1] + 1.6);
        n.headPitch += (Math.max(-0.5, Math.min(0.5, -Math.atan2(dy, d))) - n.headPitch) * Math.min(1, dt * 5);
      } else {
        n.lookTimer -= dt;
        if (n.lookTimer <= 0) {
          n.lookTimer = 2 + Math.random() * 4;
          n.lookTarget = (Math.random() - 0.5) * 1.4;
        }
        n.headYaw += (n.lookTarget - n.headYaw) * Math.min(1, dt * 2);
        n.headPitch += (0 - n.headPitch) * Math.min(1, dt * 2);
        let rel = n.baseYaw - n.yaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        n.yaw += rel * Math.min(1, dt * 0.8);
      }
    }
  }

  private updateAmbient(dt: number) {
    this.ambientTimer += dt;
    if (this.ambientTimer < 0.05) return;
    const step = this.ambientTimer;
    this.ambientTimer = 0;
    const px = this.player.x, pz = this.player.z;
    const near = (p: Vec3, r: number) => Math.abs(p[0] - px) < r && Math.abs(p[2] - pz) < r;
    const menu = game().screen !== 'game';
    const R = menu ? 200 : 30;
    for (const t of this.layout.torches) {
      if (!near(t, R) || Math.random() > step * 4) continue;
      this.particles.spawn({ pos: [t[0] + (Math.random() - 0.5) * 0.1, t[1], t[2] + (Math.random() - 0.5) * 0.1], color: Math.random() < 0.7 ? '#ffb02a' : '#6a6a6a', vel: [0, 0.6, 0], spread: 0.05, life: 0.6, size: 0.05 });
    }
    for (const sp of this.layout.sparkles) {
      if (!near(sp.pos, R) || Math.random() > step * 3) continue;
      this.particles.spawn({ pos: sp.pos, area: 1.4, color: sp.color, vel: [0, 0.25, 0], spread: 0.1, life: 1.5, size: 0.04 });
    }
    for (const v of this.layout.steamVents) {
      if (!near(v, R) || Math.random() > step * 10) continue;
      this.particles.spawn({ pos: v, area: 0.5, color: '#e8e8e8', vel: [0, 2.2, 0], spread: 0.25, drag: 0.6, life: 1.6, size: 0.18, jitter: 0.1 });
    }
    if (this.bubbleFlow) {
      const path = this.layout.bubblePath;
      if (path.length && Math.random() < step * 14) {
        const i = Math.floor(Math.random() * path.length);
        const [x, y, z] = path[i];
        const nxt = path[Math.min(path.length - 1, i + 1)];
        this.particles.spawn({ pos: [x + 0.5, y + 0.5, z + 0.5], color: '#ffffff', vel: [(nxt[0] - x) * 2, (nxt[1] - y) * 2, (nxt[2] - z) * 2], spread: 0.1, life: 0.5, size: 0.08, area: 0.5 });
      }
    }
    if (game().save?.flags.water_flowing || menu) {
      const wp = this.layout.waterPath;
      if (wp.length && Math.random() < step * 6) {
        const [x, y, z] = wp[wp.length - 1 - Math.floor(Math.random() * 30)];
        this.particles.spawn({ pos: [x + 0.5, y + 0.9, z + 0.5], color: '#cfe4ff', vel: [1, 0.4, 0], spread: 0.3, gravity: 4, life: 0.5, size: 0.05 });
      }
    }
    if (this.reactorPower > 0 && Math.random() < step * 8) {
      this.particles.spawn({ pos: [24, FLOOR + 1.5, 186], area: 2.5, color: '#5ff0ff', vel: [0, 1.2, 0], spread: 0.3, life: 1.2, size: 0.06 });
    }
  }

  /** Teleport to the current zone's safe spot (pause menu "Unstick Me"). */
  unstick() {
    const zone = zoneAt(this.layout, this.player.z);
    const cp = this.layout.checkpoints[zone] ?? SPAWN.pos;
    this.player = Object.assign(createPlayer(cp[0] + 0.5, cp[1], cp[2] + 0.5, this.player.yaw), { walked: this.player.walked });
  }

  private respawnPlayer() {
    const zone = zoneAt(this.layout, this.player.z);
    const cp = this.layout.checkpoints[zone] ?? SPAWN.pos;
    this.player = Object.assign(createPlayer(cp[0] + 0.5, cp[1], cp[2] + 0.5, this.player.yaw), { pitch: this.player.pitch, walked: this.player.walked });
    audio.play('lava');
    game().toast({ title: 'Ouch! Too hot!', text: 'You were sent back to safety. Nothing was lost.', kind: 'warn' });
  }

  private updateIdleHint(dt: number) {
    const s = game();
    if (!s.save || !s.plan) return;
    const view = objectiveView(s.save, s.plan);
    const key = `${view.zoneId}:${view.stepIndex}`;
    if (key !== this.lastStepKey) {
      this.lastStepKey = key;
      this.idleTime = 0;
      if (s.idleHint) s.setIdleHint(null);
      return;
    }
    if (s.overlay !== null) return;
    this.idleTime += dt;
    const limit = s.plan.idleHintSeconds;
    if (limit > 0 && this.idleTime > limit && !s.idleHint && view.step?.hint) s.setIdleHint(view.step.hint);
  }

  /** Objective marker position for the current step (nearest target). */
  objectiveTarget(): Vec3 | null {
    const s = game();
    if (!s.save || !s.plan) return null;
    const view = objectiveView(s.save, s.plan);
    const st = view.step;
    if (!st?.target) return null;
    const keys = Array.isArray(st.target) ? st.target : [st.target];
    let candidates = keys.map((k) => this.layout.markers[k]).filter(Boolean);
    if (st.type === 'collect' && st.items && s.save) {
      // point at the element still missing
      const missing = Object.entries(st.items).filter(([el, n]) => countItem(s.save!.inventory, el) < n).map(([el]) => el);
      const filtered = keys.filter((k) => missing.some((el) => k.startsWith(`deposit:${el}:`))).map((k) => this.layout.markers[k]);
      if (filtered.length) candidates = filtered;
    }
    if (st.type === 'use' && st.item && countItem(s.save.inventory, st.item) === 0) {
      const table = this.layout.markers[`table:${view.zoneId}`];
      if (table) candidates = [table];
    }
    let best: Vec3 | null = null;
    let bd = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c[0] - this.player.x, c[2] - this.player.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Is the current objective's NPC waiting to talk? (for the "!" marker) */
  npcHasNews(id: string): boolean {
    const s = game();
    if (!s.save || !s.plan) return false;
    const view = objectiveView(s.save, s.plan);
    const st = view.step;
    return !!st && (st.type === 'talk' || st.type === 'quiz') && NPCS[id]?.zone === view.zoneId;
  }
}

export const runtime = new Runtime();

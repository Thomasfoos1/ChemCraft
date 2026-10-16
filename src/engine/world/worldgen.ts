/**
 * Builds the Elemental Dungeon: five connected zones plus an exit courtyard, laid out
 * along +Z. Everything is deterministic so saves only need to store puzzle flags.
 *
 * Coordinates: y = 6 is the first air layer above every main floor (FLOOR).
 */
import { B, DEPOSIT_FOR } from './blocks';
import { Layout, Vec3 } from './layout';
import { VoxelWorld } from './world';
import { hash3, mulberry32, valueNoise3 } from '../rng';

export const WORLD_W = 48;
export const WORLD_H = 32;
export const WORLD_D = 224;
export const FLOOR = 6;

/** Facing meta for machine fronts: 0:-Z 1:+X 2:+Z 3:-X */
const FACE = { NORTH_NEG_Z: 0, EAST: 1, SOUTH_POS_Z: 2, WEST: 3 } as const;

export function generateDungeon(): Layout {
  const w = new VoxelWorld(WORLD_W, WORLD_H, WORLD_D);
  w.bulk = true;
  const rng = mulberry32(1337);

  const L: Layout = {
    world: w,
    spawn: { pos: [24.5, FLOOR, 8.5], yaw: 0 },
    npcs: [],
    tables: [],
    machines: [],
    chests: [],
    secrets: [],
    gates: {},
    zoneBounds: [
      { zone: 1, zMin: 0, zMax: 37 },
      { zone: 2, zMin: 38, zMax: 74 },
      { zone: 3, zMin: 75, zMax: 111 },
      { zone: 4, zMin: 112, zMax: 156 },
      { zone: 5, zMin: 157, zMax: WORLD_D },
    ],
    checkpoints: {},
    markers: {},
    waterPath: [],
    iceCells: [],
    bridgeCells: [],
    bubblePath: [],
    wires: {},
    reactorCore: [],
    wheel: { center: [30, 8, 28], radius: 3 },
    gears: [],
    steamVents: [],
    torches: [],
    sparkles: [],
    periodicTable: { pos: [8.02, 12, 186.5], width: 15, height: 8.4 },
    exitZ: 216,
    skyCenter: [24, 18, 219],
    deposits: [],
  };

  // ---------- helpers ----------
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, meta = 0) =>
    w.fill(x0, y0, z0, x1, y1, z1, id, meta);
  const set = (x: number, y: number, z: number, id: number, meta = 0) => w.set(x, y, z, id, meta);
  const carve = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    fill(x0, y0, z0, x1, y1, z1, B.AIR);

  /** Hollow room with themed shell. Interior is inclusive x0..x1, FLOOR..yTop, z0..z1. */
  const room = (
    x0: number, z0: number, x1: number, z1: number, yTop: number,
    wall: (x: number, y: number, z: number) => number,
    floor: (x: number, z: number) => number,
    ceiling: (x: number, z: number) => number,
  ) => {
    for (let y = FLOOR - 1; y <= yTop + 1; y++)
      for (let z = z0 - 1; z <= z1 + 1; z++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          const edge = x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1;
          if (y === FLOOR - 1) set(x, y, z, edge ? wall(x, y, z) : floor(x, z));
          else if (y === yTop + 1) set(x, y, z, edge ? wall(x, y, z) : ceiling(x, z));
          else if (edge) set(x, y, z, wall(x, y, z));
          else set(x, y, z, B.AIR);
        }
  };

  const deposit = (x: number, y: number, z: number, el: string, zone: number) => {
    set(x, y, z, DEPOSIT_FOR[el]);
    L.deposits.push({ pos: [x, y, z], element: el, zone });
  };

  const torchPost = (x: number, z: number, post = B.LOG) => {
    set(x, FLOOR, z, post);
    set(x, FLOOR + 1, z, B.TORCH);
    L.torches.push([x + 0.5, FLOOR + 1.6, z + 0.5]);
  };

  const table = (x: number, z: number, zone: number, facing: number = FACE.NORTH_NEG_Z) => {
    set(x, FLOOR, z, B.CRAFTING, facing);
    L.tables.push({ pos: [x, FLOOR, z], zone });
  };

  const chest = (id: string, x: number, z: number, zone: number, facing: number, contents: Record<string, number>) => {
    set(x, FLOOR, z, B.CHEST, facing);
    L.chests.push({ id, pos: [x, FLOOR, z], zone, contents });
  };

  // ---------- bedrock & solid rock ----------
  fill(0, 0, 0, WORLD_W - 1, WORLD_H - 1, WORLD_D - 1, B.STONE);
  fill(0, 0, 0, WORLD_W - 1, 0, WORLD_D - 1, B.BEDROCK);
  // Sprinkle deepslate & gravel veins through the rock so mined holes look natural.
  for (let i = 0; i < w.blocks.length; i++) {
    if (w.blocks[i] !== B.STONE) continue;
    const x = i % WORLD_W;
    const rest = (i - x) / WORLD_W;
    const z = rest % WORLD_D;
    const y = (rest - z) / WORLD_D;
    const n = valueNoise3(x / 5, y / 5, z / 5, 7);
    if (n > 0.78) w.blocks[i] = B.GRAVEL;
    else if (n < 0.2) w.blocks[i] = B.DEEPSLATE;
  }

  // =====================================================================
  // ZONE 1 — THE WATERWORKS  (interior x 12..35, z 4..31, y 6..12)
  // =====================================================================
  {
    const wall = (x: number, y: number, z: number) => (hash3(x, y, z, 1) < 0.22 ? B.MOSSY : B.BRICKS);
    const floor = (x: number, z: number) => (x >= 18 && x <= 29 && z >= 12 && z <= 22 ? B.LAB_TILE : hash3(x, 0, z, 2) < 0.15 ? B.COBBLE : B.BRICKS);
    room(12, 4, 35, 31, 12, wall, floor, () => B.BRICKS);

    // Entrance hall behind the spawn (where the intro camera flies in from).
    carve(21, FLOOR, 0, 26, FLOOR + 4, 3);
    fill(20, FLOOR - 1, 0, 27, FLOOR - 1, 3, B.BRICKS);
    fill(20, FLOOR, 0, 20, FLOOR + 4, 3, B.BRICKS);
    fill(27, FLOOR, 0, 27, FLOOR + 4, 3, B.BRICKS);
    fill(21, FLOOR + 5, 0, 26, FLOOR + 5, 3, B.BRICKS);
    fill(21, FLOOR, 0, 26, FLOOR + 4, 0, B.COBBLE);
    set(21, FLOOR + 2, 1, B.LAMP);
    set(26, FLOOR + 2, 1, B.LAMP);

    // Wooden frame: log pillars and ceiling beams.
    for (const z of [8, 16, 24]) {
      for (const x of [12, 35]) fill(x, FLOOR, z, x, 12, z, B.LOG);
      fill(12, 12, z, 35, 12, z, B.LOG);
    }
    // Ceiling lamps.
    for (const x of [16, 24, 31]) for (const z of [6, 12, 20, 28]) set(x, 13, z, B.LAMP);

    // Bookshelves & lab benches along the south wall.
    fill(13, FLOOR, 4, 18, FLOOR + 1, 4, B.BOOKSHELF);
    fill(29, FLOOR, 4, 34, FLOOR + 1, 4, B.BOOKSHELF);
    fill(27, FLOOR, 13, 29, FLOOR, 13, B.DARK_PLANKS);
    set(28, FLOOR + 1, 13, B.BOOKSHELF);
    fill(19, FLOOR, 13, 20, FLOOR, 13, B.DARK_PLANKS);

    // Crafting table in the middle of the lab tiles.
    table(24, 17, 1);
    L.markers['table:1'] = [24.5, FLOOR + 1, 17.5];

    // Torch posts.
    torchPost(16, 10); torchPost(31, 10); torchPost(18, 26); torchPost(33, 22);

    // Hydrogen crystal vein in the east wall (with blue crystals around it).
    for (const [x, y, z] of [[35, 6, 10], [35, 7, 11], [35, 6, 12], [35, 8, 12], [35, 7, 13], [35, 6, 14], [35, 8, 10]] as Vec3[]) {
      deposit(x + 1, y, z, 'H', 1);
    }
    set(36, 9, 11, B.CRYSTAL_BLUE); set(36, 9, 13, B.CRYSTAL_BLUE); set(36, 6, 15, B.CRYSTAL_BLUE);
    set(34, FLOOR, 12, B.CRYSTAL_BLUE);
    L.markers['deposit:H:1'] = [35.5, FLOOR + 1, 12.5];
    L.sparkles.push({ pos: [35.5, 7.5, 12], color: '#8fd8ff' });

    // Oxygen ore vein in the west wall.
    for (const [y, z] of [[6, 9], [7, 10], [6, 11], [8, 11], [7, 12], [6, 13], [8, 9]] as [number, number][]) {
      deposit(11, y, z, 'O', 1);
    }
    set(11, 9, 10, B.LAMP);
    L.markers['deposit:O:1'] = [12.5, FLOOR + 1, 11.5];
    L.sparkles.push({ pos: [12.2, 7.5, 11], color: '#ff9a8f' });

    // Water generator against the west wall (front faces +X).
    const genCells: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 2; y++)
      for (let z = 21; z <= 23; z++)
        for (let x = 12; x <= 13; x++) {
          const front = x === 13 && y === FLOOR + 1 && z === 22;
          set(x, y, z, front ? B.GENERATOR : B.MACHINE, FACE.EAST);
          genCells.push([x, y, z]);
        }
    fill(12, FLOOR + 3, 22, 13, 12, 22, B.PIPE);
    L.machines.push({ id: 'generator', kind: 'generator', zone: 1, cells: genCells, center: [14, FLOOR + 1.5, 22.5] });
    L.markers['machine:generator'] = [14.2, FLOOR + 1.5, 22.5];

    // Dry channel: north from the generator, then east along the north wall.
    const path: Vec3[] = [];
    for (let z = 21; z <= 28; z++) for (const x of [14, 15]) path.push([x, FLOOR - 1, z]);
    for (let x = 16; x <= 35; x++) for (const z of [27, 28]) path.push([x, FLOOR - 1, z]);
    for (const [x, y, z] of path) {
      set(x, y, z, B.AIR);
      set(x, y - 1, z, B.COBBLE);
    }
    L.waterPath = path;

    // Water wheel (visual model) sits in the channel; barrier blocks give it collision.
    L.wheel = { center: [30, 8.2, 28], radius: 3.1 };
    fill(27, FLOOR, 27, 32, FLOOR + 4, 28, B.BARRIER);
    fill(30, FLOOR + 2, 29, 30, FLOOR + 2, 31, B.LOG); // axle support to the wall
    // Gears above the gate, driven by the wheel.
    L.gears.push({ pos: [18.6, 10.6, 31.95], radius: 1.3, dir: 1 }, { pos: [29.4, 10.6, 31.95], radius: 1.3, dir: -1 });

    // Gate to the Crystal Caverns: corridor x 22..25, gate at z = 33.
    carve(22, FLOOR, 32, 25, FLOOR + 3, 37);
    fill(22, FLOOR - 1, 32, 25, FLOOR - 1, 37, B.BRICKS);
    fill(21, FLOOR, 31, 21, FLOOR + 4, 31, B.IRON);
    fill(26, FLOOR, 31, 26, FLOOR + 4, 31, B.IRON);
    fill(21, FLOOR + 4, 31, 26, FLOOR + 4, 31, B.IRON);
    const g1: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 3; y++) for (let x = 22; x <= 25; x++) { set(x, y, 33, B.GATE); g1.push([x, y, 33]); }
    L.gates.gate1 = { id: 'gate1', cells: g1, blockId: B.GATE, lift: 4.2 };
    L.markers['gate:1'] = [24, FLOOR + 1, 32.5];
    set(22, FLOOR + 3, 35, B.LAMP);

    // Secret: cracked bricks in the east wall lead to a hidden storeroom.
    const cracked: Vec3[] = [[36, FLOOR, 25], [36, FLOOR + 1, 25]];
    for (const c of cracked) set(c[0], c[1], c[2], B.CRACKED);
    carve(37, FLOOR, 25, 38, FLOOR + 1, 25);
    room(39, 22, 43, 28, FLOOR + 3, (x, y, z) => (hash3(x, y, z, 3) < 0.4 ? B.MOSSY : B.COBBLE), () => B.COBBLE, () => B.COBBLE);
    carve(38, FLOOR, 25, 38, FLOOR + 1, 25);
    chest('chest1', 43, 25, 1, FACE.WEST, { N: 2, Fe: 2, O: 2 });
    deposit(44, FLOOR, 23, 'N', 1); deposit(44, FLOOR + 1, 23, 'N', 1); deposit(44, FLOOR, 27, 'N', 1);
    set(41, FLOOR + 4, 25, B.LAMP);
    set(39, FLOOR, 22, B.MUSHROOM); set(42, FLOOR, 28, B.MUSHROOM);
    L.secrets.push({ id: 'secret1', zone: 1, cracked, room: [41, FLOOR, 25] });
    L.checkpoints[1] = [24.5, FLOOR, 10.5];

    L.npcs.push({ id: 'blockwell', pos: [18.5, FLOOR, 18.5], yaw: Math.PI * 0.85 });
    L.markers['npc:blockwell'] = [18.5, FLOOR + 2.4, 18.5];
  }

  // =====================================================================
  // ZONE 2 — THE CRYSTAL CAVERNS  (cave x 8..39, z 38..66)
  // =====================================================================
  {
    const cx = 23.5, cz = 52.5;
    const carved = new Set<string>();
    for (let z = 38; z <= 66; z++)
      for (let x = 8; x <= 39; x++) {
        const dx = (x - cx) / 15.5, dz = (z - cz) / 15;
        const r = Math.sqrt(dx * dx + dz * dz) + (valueNoise3(x / 4, 0, z / 4, 21) - 0.5) * 0.35;
        if (r >= 1) continue;
        const top = FLOOR + 3 + Math.floor((1 - r) * 7 + valueNoise3(x / 3, 5, z / 3, 22) * 3);
        for (let y = FLOOR; y <= Math.min(top, 19); y++) {
          set(x, y, z, B.AIR);
          carved.add(`${x},${y},${z}`);
        }
      }
    // Guaranteed passages to both corridors.
    carve(22, FLOOR, 38, 25, FLOOR + 3, 46);
    carve(22, FLOOR, 58, 25, FLOOR + 3, 68);
    for (let z = 38; z <= 68; z++) for (let x = 22; x <= 25; x++) for (let y = FLOOR; y <= FLOOR + 3; y++) carved.add(`${x},${y},${z}`);

    // Decorate cave surfaces.
    for (let z = 36; z <= 70; z++)
      for (let x = 6; x <= 41; x++)
        for (let y = FLOOR - 1; y <= 21; y++) {
          if (carved.has(`${x},${y},${z}`)) continue;
          const id = w.get(x, y, z);
          if (id === B.AIR) continue;
          const exposed = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) =>
            carved.has(`${x + a},${y + b},${z + c}`),
          );
          if (!exposed) continue;
          if (z < 38 || z > 68) continue;
          const h = hash3(x, y, z, 23);
          if (y === FLOOR - 1) set(x, y, z, h < 0.4 ? B.SNOW : h < 0.6 ? B.PACKED_ICE : B.STONE);
          else if (h < 0.13) set(x, y, z, B.PACKED_ICE);
          else if (h < 0.155) set(x, y, z, B.CRYSTAL_WHITE);
          else if (h < 0.18) set(x, y, z, B.CRYSTAL_PINK);
          else if (h < 0.205) set(x, y, z, B.CRYSTAL_BLUE);
          else if (h < 0.25) set(x, y, z, B.HALITE);
          else set(x, y, z, B.STONE);
        }
    // Frozen waterfall + icy pool.
    for (let y = FLOOR; y <= 17; y++) {
      if (w.get(13, y, 49) !== B.AIR && y > FLOOR + 6) break;
      set(13, y, 49, B.PACKED_ICE); set(13, y, 50, B.ICE); set(14, y, 49, B.ICE);
    }
    fill(12, FLOOR - 1, 47, 16, FLOOR - 1, 52, B.ICE);
    fill(13, FLOOR - 2, 48, 15, FLOOR - 2, 51, B.WATER);
    // Ice spikes & crystal clusters.
    for (const [x, z, hgt] of [[30, 44, 3], [17, 62, 2], [33, 61, 4], [11, 56, 2], [36, 50, 2]] as Vec3[]) {
      for (let y = 0; y < hgt; y++) set(x, FLOOR + y, z, B.PACKED_ICE);
    }
    for (const [x, z, id] of [[19, 41, B.CRYSTAL_PINK], [29, 64, B.CRYSTAL_BLUE], [15, 44, B.CRYSTAL_WHITE], [35, 57, B.CRYSTAL_PINK], [27, 42, B.CRYSTAL_BLUE]] as Vec3[]) {
      set(x, FLOOR, z, id);
      L.sparkles.push({ pos: [x + 0.5, FLOOR + 1.2, z + 0.5], color: '#e8d8ff' });
    }
    // Lamps hidden in the ceiling so the cave is readable.
    for (const [x, z] of [[20, 48], [28, 48], [24, 56], [18, 58], [30, 60], [24, 42]]) {
      let y = FLOOR + 3;
      while (y < 20 && w.get(x, y, z) === B.AIR) y++;
      set(x, y, z, B.LAMP);
    }

    // Sodium crystals (west) and chlorine crystals (east) as floor clusters.
    for (const [x, y, z] of [[14, 6, 56], [14, 7, 56], [15, 6, 57], [13, 6, 57], [15, 6, 55], [16, 6, 58]] as Vec3[]) deposit(x, y, z, 'Na', 2);
    for (const [x, y, z] of [[33, 6, 55], [33, 7, 55], [34, 6, 54], [32, 6, 56], [34, 6, 56], [31, 6, 54]] as Vec3[]) deposit(x, y, z, 'Cl', 2);
    L.markers['deposit:Na:2'] = [14.5, FLOOR + 1.5, 56.5];
    L.markers['deposit:Cl:2'] = [33.5, FLOOR + 1.5, 55.5];

    table(26, 49, 2);
    fill(25, FLOOR, 49, 25, FLOOR, 49, B.PACKED_ICE);
    torchPost(23, 47, B.PACKED_ICE);
    L.markers['table:2'] = [26.5, FLOOR + 1, 49.5];

    // Frozen gate: ice layer at z=69 in front of an iron gate at z=70.
    carve(22, FLOOR, 69, 25, FLOOR + 3, 74);
    fill(22, FLOOR - 1, 69, 25, FLOOR - 1, 74, B.PACKED_ICE);
    fill(21, FLOOR, 68, 21, FLOOR + 4, 69, B.PACKED_ICE);
    fill(26, FLOOR, 68, 26, FLOOR + 4, 69, B.PACKED_ICE);
    fill(21, FLOOR + 4, 68, 26, FLOOR + 4, 69, B.PACKED_ICE);
    const ice: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 3; y++) for (let x = 22; x <= 25; x++) { set(x, y, 69, B.ICE); ice.push([x, y, 69]); }
    // icicles on the frame
    for (const x of [21, 23, 26]) set(x, FLOOR + 3, 67, B.ICE);
    L.iceCells = ice;
    const g2: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 3; y++) for (let x = 22; x <= 25; x++) { set(x, y, 70, B.GATE); g2.push([x, y, 70]); }
    L.gates.gate2 = { id: 'gate2', cells: g2, blockId: B.GATE, lift: 4.2 };
    const fgCells = [...ice, ...g2];
    L.machines.push({ id: 'frozen_gate', kind: 'frozen_gate', zone: 2, cells: fgCells, center: [24, FLOOR + 2, 68.6] });
    L.markers['machine:frozen_gate'] = [24, FLOOR + 1.5, 68];
    set(23, FLOOR + 4, 72, B.CRYSTAL_BLUE);

    L.npcs.push({ id: 'salty', pos: [19.5, FLOOR, 46.5], yaw: Math.PI * 0.9 });
    L.markers['npc:salty'] = [19.5, FLOOR + 2.4, 46.5];
    L.checkpoints[2] = [24, FLOOR, 42];
  }

  // =====================================================================
  // ZONE 3 — THE CARBON CAVERNS  (interior x 10..37, z 75..106, y 6..13)
  // =====================================================================
  {
    const wall = (x: number, y: number, z: number) => {
      const h = hash3(x, y, z, 31);
      return h < 0.5 ? B.DEEP_BRICKS : h < 0.8 ? B.DEEPSLATE : h < 0.9 ? B.COAL_BLOCK : B.STONE;
    };
    const floor = (x: number, z: number) => {
      const h = hash3(x, 0, z, 32);
      return h < 0.5 ? B.DEEPSLATE : h < 0.75 ? B.GRAVEL : h < 0.9 ? B.DEEP_BRICKS : B.COAL_BLOCK;
    };
    room(10, 75, 37, 106, 13, wall, floor, (x, z) => (hash3(x, 1, z, 33) < 0.6 ? B.DEEPSLATE : B.DEEP_BRICKS));
    carve(22, FLOOR, 74, 25, FLOOR + 3, 74); // reopen the corridor from the Crystal Caverns
    // Glowing gas pipes along the ceiling.
    for (let z = 76; z <= 105; z++) { set(13, 13, z, B.COPPER_GLOW); set(34, 13, z, B.COPPER_GLOW); }
    for (let x = 14; x <= 33; x++) { set(x, 13, 90, B.PIPE); }
    for (const z of [80, 96]) for (let x = 14; x <= 33; x++) set(x, 13, z, B.COPPER_GLOW);
    // Coal-like rock formations.
    for (const [x, z, hgt] of [[15, 79, 2], [32, 80, 3], [12, 95, 2], [29, 86, 1], [17, 102, 3], [35, 99, 2]] as Vec3[])
      for (let y = 0; y < hgt; y++) set(x, FLOOR + y, z, y === hgt - 1 ? B.COAL_BLOCK : B.DEEPSLATE);
    // Steam vents.
    for (const [x, z] of [[20, 85], [27, 92], [16, 90], [31, 102], [22, 98]]) {
      set(x, FLOOR - 1, z, B.VENT);
      L.steamVents.push([x + 0.5, FLOOR, z + 0.5]);
    }
    // Lava pool with a glass guard.
    fill(27, FLOOR - 1, 94, 33, FLOOR - 1, 98, B.LAVA);
    fill(27, FLOOR - 2, 94, 33, FLOOR - 2, 98, B.LAVA);
    for (let x = 26; x <= 34; x++) for (const z of [93, 99]) fill(x, FLOOR, z, x, FLOOR + 1, z, B.GLASS);
    for (let z = 93; z <= 99; z++) for (const x of [26, 34]) fill(x, FLOOR, z, x, FLOOR + 1, z, B.GLASS);
    torchPost(14, 84, B.DEEP_BRICKS); torchPost(33, 84, B.DEEP_BRICKS); torchPost(24, 104, B.DEEP_BRICKS); torchPost(20, 77, B.DEEP_BRICKS);
    torchPost(18, 95, B.DEEP_BRICKS); torchPost(30, 90, B.DEEP_BRICKS); torchPost(19, 99, B.DEEP_BRICKS); torchPost(28, 79, B.DEEP_BRICKS);
    // Wall lamps (skipping deposit veins and the secret wall).
    for (const z of [78, 94, 103]) set(9, FLOOR + 2, z, B.LAMP);
    for (const z of [78, 93, 100]) set(38, FLOOR + 2, z, B.LAMP);
    for (const x of [16, 31]) { set(x, FLOOR + 2, 74, B.LAMP); set(x, FLOOR + 2, 107, B.LAMP); }

    // Carbon deposits in the west wall, oxygen in the east wall.
    for (const [y, z] of [[6, 84], [7, 85], [6, 86], [8, 86], [7, 87], [6, 88], [7, 89], [6, 90]] as [number, number][]) deposit(9, y, z, 'C', 3);
    for (const [y, z] of [[6, 84], [7, 85], [6, 86], [8, 86], [7, 87], [6, 88]] as [number, number][]) deposit(38, y, z, 'O', 3);
    // A few loose carbon lumps on the floor too.
    for (const [x, z] of [[12, 92], [13, 93]]) deposit(x, FLOOR, z, 'C', 3);
    L.markers['deposit:C:3'] = [10.5, FLOOR + 1, 87];
    L.markers['deposit:O:3'] = [37.5, FLOOR + 1, 86];

    table(24, 88, 3);
    L.markers['table:3'] = [24.5, FLOOR + 1, 88.5];

    // Carbonation machine (front faces +X) with a glass pipe to the door.
    const carbCells: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 2; y++)
      for (let z = 100; z <= 102; z++)
        for (let x = 14; x <= 15; x++) {
          const front = x === 15 && y === FLOOR + 1 && z === 101;
          set(x, y, z, front ? B.CARBONATOR : B.MACHINE, FACE.EAST);
          carbCells.push([x, y, z]);
        }
    L.machines.push({ id: 'carbonator', kind: 'carbonator', zone: 3, cells: carbCells, center: [16.2, FLOOR + 1.5, 101.5] });
    L.markers['machine:carbonator'] = [16.4, FLOOR + 1.5, 101.5];
    const pipe: Vec3[] = [];
    for (let y = FLOOR + 3; y <= 11; y++) pipe.push([15, y, 101]);
    for (let x = 16; x <= 21; x++) pipe.push([x, 11, 101]);
    for (let z = 102; z <= 106; z++) pipe.push([21, 11, z]);
    for (const [x, y, z] of pipe) set(x, y, z, B.GLASS);
    L.bubblePath = pipe;

    // Pressure door (solid iron panels) at z=108.
    carve(22, FLOOR, 107, 25, FLOOR + 3, 111);
    fill(22, FLOOR - 1, 107, 25, FLOOR - 1, 111, B.DEEP_BRICKS);
    fill(21, FLOOR, 106, 21, FLOOR + 4, 106, B.IRON);
    fill(26, FLOOR, 106, 26, FLOOR + 4, 106, B.IRON);
    fill(21, FLOOR + 4, 106, 26, FLOOR + 4, 106, B.IRON);
    set(21, FLOOR + 4, 106, B.GLASS);
    const g3: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 3; y++) for (let x = 22; x <= 25; x++) { set(x, y, 108, B.TRAPDOOR); g3.push([x, y, 108]); }
    L.gates.door3 = { id: 'door3', cells: g3, blockId: B.TRAPDOOR, lift: 4.2 };
    set(24, FLOOR + 3, 110, B.LAMP);

    // Secret: cracked deepslate in the west wall.
    const cracked: Vec3[] = [[9, FLOOR, 98], [9, FLOOR + 1, 98]];
    for (const c of cracked) set(c[0], c[1], c[2], B.CRACKED_DEEP);
    carve(7, FLOOR, 98, 8, FLOOR + 1, 98);
    room(2, 95, 6, 101, FLOOR + 3, () => B.DEEPSLATE, () => B.DEEPSLATE, () => B.DEEPSLATE);
    carve(7, FLOOR, 98, 7, FLOOR + 1, 98);
    chest('chest3', 2, 98, 3, FACE.EAST, { Fe: 3, H: 4, C: 2 });
    deposit(1, FLOOR, 96, 'Fe', 3); deposit(1, FLOOR + 1, 97, 'Fe', 3); deposit(1, FLOOR, 100, 'Fe', 3);
    set(4, FLOOR + 4, 98, B.LAMP);
    L.secrets.push({ id: 'secret3', zone: 3, cracked, room: [4, FLOOR, 98] });

    L.npcs.push({ id: 'carbon', pos: [19.5, FLOOR, 81.5], yaw: Math.PI * 0.8 });
    L.markers['npc:carbon'] = [19.5, FLOOR + 2.4, 81.5];
    L.checkpoints[3] = [22.5, FLOOR, 82.5];
  }

  // =====================================================================
  // ZONE 4 — THE LIMESTONE RUINS  (interior x 10..37, z 112..151, y 6..17)
  // =====================================================================
  {
    const wall = (x: number, y: number, z: number) => {
      const h = hash3(x, y, z, 41);
      return h < 0.08 ? B.FOSSIL : h < 0.55 ? B.LIME_BRICKS : h < 0.75 ? B.LIMESTONE : B.LIME_CHISELED;
    };
    const floor = (x: number, z: number) => ((x + z) % 7 === 0 ? B.LIME_CHISELED : hash3(x, 0, z, 42) < 0.3 ? B.LIMESTONE : B.LIME_BRICKS);
    room(10, 112, 37, 151, 17, wall, floor, () => B.LIMESTONE);
    carve(22, FLOOR, 111, 25, FLOOR + 3, 111); // reopen the corridor from the Carbon Caverns
    // Pillars with embedded lamps.
    for (const x of [14, 33])
      for (const z of [116, 122, 128, 144, 150]) {
        fill(x, FLOOR, z, x, 17, z, B.PILLAR);
        set(x, 11, z, B.LAMP);
      }
    for (const [x, z] of [[18, 116], [29, 116], [18, 146], [29, 146]]) set(x, 18, z, B.LAMP);
    // Rubble & fossils on the floor.
    for (const [x, z, id] of [[16, 118, B.FOSSIL], [31, 125, B.LIMESTONE], [12, 130, B.LIME_BRICKS], [35, 142, B.FOSSIL], [27, 148, B.LIMESTONE]] as Vec3[])
      set(x, FLOOR, z, id);

    // The chasm (z 133..139) with lava far below.
    carve(10, 1, 133, 37, FLOOR - 1, 139);
    fill(10, 1, 133, 37, 1, 139, B.LAVA);
    // Bridge stubs (broken ends).
    fill(22, FLOOR - 1, 133, 24, FLOOR - 1, 133, B.LIME_BRICKS);
    fill(22, FLOOR - 1, 139, 24, FLOOR - 1, 139, B.LIME_BRICKS);
    set(21, FLOOR, 133, B.LIME_BRICKS); set(25, FLOOR, 133, B.LIME_BRICKS);
    set(21, FLOOR, 139, B.LIME_BRICKS); set(25, FLOOR, 139, B.LIME_BRICKS);
    for (let z = 134; z <= 138; z++) {
      L.bridgeCells.push({ pos: [21, FLOOR, z], id: B.LIME_BRICKS });
      for (let x = 22; x <= 24; x++) L.bridgeCells.push({ pos: [x, FLOOR - 1, z], id: z === 136 ? B.LIME_CHISELED : B.LIME_BRICKS });
      L.bridgeCells.push({ pos: [25, FLOOR, z], id: B.LIME_BRICKS });
    }
    L.bridgeCells.sort((a, b) => a.pos[2] - b.pos[2] || a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0]);
    L.markers['bridge'] = [23.5, FLOOR, 136];

    // Stone fabrication machine (front faces -Z toward the player).
    const fabCells: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 2; y++)
      for (let z = 128; z <= 129; z++)
        for (let x = 16; x <= 18; x++) {
          const front = x === 17 && y === FLOOR + 1 && z === 128;
          set(x, y, z, front ? B.FABRICATOR : B.MACHINE, FACE.NORTH_NEG_Z);
          fabCells.push([x, y, z]);
        }
    L.machines.push({ id: 'fabricator', kind: 'fabricator', zone: 4, cells: fabCells, center: [17.5, FLOOR + 1.5, 127.6] });
    L.markers['machine:fabricator'] = [17.5, FLOOR + 1.5, 127.4];
    for (let x = 19; x <= 21; x++) set(x, FLOOR - 1, 129, B.WIRE_OFF);
    L.wires.bridge = [[19, FLOOR - 1, 129], [20, FLOOR - 1, 129], [21, FLOOR - 1, 129]];

    table(24, 123, 4);
    L.markers['table:4'] = [24.5, FLOOR + 1, 123.5];

    // West cavern: calcium.
    carve(9, FLOOR, 118, 9, FLOOR + 2, 120);
    for (let z = 114; z <= 126; z++)
      for (let x = 2; x <= 8; x++) {
        const r = Math.hypot((x - 5) / 3.6, (z - 120) / 6.6);
        if (r < 1) carve(x, FLOOR, z, x, FLOOR + 2 + Math.floor((1 - r) * 3), z);
      }
    for (const [x, y, z] of [[1, 6, 117], [1, 7, 118], [3, 6, 123], [1, 6, 121], [4, 6, 115], [5, 6, 125], [1, 7, 120]] as Vec3[]) deposit(x, y, z, 'Ca', 4);
    set(3, FLOOR + 3, 120, B.LAMP);
    L.markers['deposit:Ca:4'] = [4, FLOOR + 1, 120];
    // East cavern: carbon + calcium.
    carve(38, FLOOR, 118, 38, FLOOR + 2, 120);
    for (let z = 114; z <= 126; z++)
      for (let x = 39; x <= 45; x++) {
        const r = Math.hypot((x - 42) / 3.6, (z - 120) / 6.6);
        if (r < 1) carve(x, FLOOR, z, x, FLOOR + 2 + Math.floor((1 - r) * 3), z);
      }
    for (const [x, y, z] of [[46, 6, 117], [46, 7, 119], [44, 6, 123], [46, 6, 121], [43, 6, 115]] as Vec3[]) deposit(x, y, z, 'C', 4);
    for (const [x, y, z] of [[42, 6, 125], [41, 6, 125]] as Vec3[]) deposit(x, y, z, 'Ca', 4);
    set(44, FLOOR + 3, 120, B.LAMP);
    L.markers['deposit:C:4'] = [43, FLOOR + 1, 120];
    // Oxygen in the hall's west wall.
    for (const [y, z] of [[6, 126], [7, 127], [6, 128], [8, 128], [7, 129], [6, 130]] as [number, number][]) deposit(9, y, z, 'O', 4);
    L.markers['deposit:O:4'] = [10.5, FLOOR + 1, 128];

    // Secret fossil vault behind cracked limestone in the east cavern.
    const cracked: Vec3[] = [[42, FLOOR, 113], [42, FLOOR + 1, 113]];
    room(40, 107, 44, 112, FLOOR + 3, (x, y, z) => (hash3(x, y, z, 44) < 0.3 ? B.FOSSIL : B.LIMESTONE), () => B.LIMESTONE, () => B.LIMESTONE);
    for (const c of cracked) set(c[0], c[1], c[2], B.CRACKED_LIME);
    chest('chest4', 42, 108, 4, FACE.SOUTH_POS_Z, { Ca: 3, Fe: 2, Na: 2 });
    set(40, FLOOR, 110, B.FOSSIL); set(44, FLOOR, 109, B.FOSSIL); set(42, FLOOR + 4, 110, B.LAMP);
    L.secrets.push({ id: 'secret4', zone: 4, cracked, room: [42, FLOOR, 110] });

    // Archway north to the Grand Laboratory.
    carve(21, FLOOR, 152, 26, FLOOR + 5, 156);
    fill(21, FLOOR - 1, 152, 26, FLOOR - 1, 156, B.LIME_CHISELED);
    set(21, FLOOR + 5, 154, B.LAMP); set(26, FLOOR + 5, 154, B.LAMP);

    L.npcs.push({ id: 'calcite', pos: [28.5, FLOOR, 118.5], yaw: Math.PI * 1.1 });
    L.markers['npc:calcite'] = [28.5, FLOOR + 2.4, 118.5];
    L.checkpoints[4] = [23.5, FLOOR, 126.5];
  }

  // =====================================================================
  // ZONE 5 — THE GRAND LABORATORY  (interior x 8..39, z 157..196, y 6..16)
  // =====================================================================
  {
    const wall = (x: number, y: number, z: number) => (y === FLOOR + 4 || y === FLOOR - 1 ? B.IRON : hash3(x, y, z, 51) < 0.15 ? B.TRAPDOOR : B.QUARTZ);
    const floor = (x: number, z: number) => (((x >> 1) + (z >> 1)) % 2 === 0 ? B.LAB_TILE : B.LAB_TILE_DARK);
    room(8, 157, 39, 196, 16, wall, floor, () => B.QUARTZ);
    carve(21, FLOOR, 156, 26, FLOOR + 5, 156);
    for (let x = 11; x <= 37; x += 6) for (let z = 160; z <= 194; z += 6) set(x, 17, z, B.LAMP);

    // Element storage walls (west: all eight elements; east: the main six).
    const west = ['H', 'O', 'C', 'Na', 'Cl', 'Ca', 'N', 'Fe'];
    west.forEach((el, k) => {
      const z = 159 + k * 2;
      deposit(7, FLOOR, z, el, 5);
      deposit(7, FLOOR + 1, z, el, 5);
      set(7, FLOOR + 2, z, B.IRON);
      L.markers[`deposit:${el}:5`] = [8.5, FLOOR + 1, z + 0.5];
    });
    const east = ['H', 'O', 'C', 'Na', 'Cl', 'Ca', 'O', 'O'];
    east.forEach((el, k) => {
      const z = 159 + k * 2;
      deposit(40, FLOOR, z, el, 5);
      deposit(40, FLOOR + 1, z, el, 5);
      set(40, FLOOR + 2, z, B.IRON);
    });

    // Formula station: console flanked by advanced crafting tables.
    table(13, 163, 5, FACE.EAST);
    table(13, 171, 5, FACE.EAST);
    set(12, FLOOR, 167, B.CONSOLE, FACE.EAST);
    set(12, FLOOR + 1, 167, B.MACHINE);
    L.machines.push({ id: 'console', kind: 'console', zone: 5, cells: [[12, FLOOR, 167], [12, FLOOR + 1, 167]], center: [13.2, FLOOR + 1, 167.5] });
    L.markers['table:5'] = [14, FLOOR + 1, 163.5];
    L.markers['machine:console'] = [13.4, FLOOR + 1.3, 167.5];

    // Sorting and balancing stations on the east side.
    set(36, FLOOR, 176, B.SORTER, FACE.WEST); set(36, FLOOR + 1, 176, B.MACHINE);
    L.machines.push({ id: 'sorter', kind: 'sorter', zone: 5, cells: [[36, FLOOR, 176], [36, FLOOR + 1, 176]], center: [35.6, FLOOR + 1, 176.5] });
    L.markers['machine:sorter'] = [35.4, FLOOR + 1.3, 176.5];
    set(36, FLOOR, 182, B.BALANCER, FACE.WEST); set(36, FLOOR + 1, 182, B.MACHINE);
    L.machines.push({ id: 'balancer', kind: 'balancer', zone: 5, cells: [[36, FLOOR, 182], [36, FLOOR + 1, 182]], center: [35.6, FLOOR + 1, 182.5] });
    L.markers['machine:balancer'] = [35.4, FLOOR + 1.3, 182.5];

    // Central reactor with four sockets and energy conduits.
    const core: Vec3[] = [];
    for (let y = FLOOR; y <= FLOOR + 2; y++) for (let z = 185; z <= 186; z++) for (let x = 23; x <= 24; x++) { set(x, y, z, B.REACTOR); core.push([x, y, z]); }
    set(23, FLOOR + 3, 185, B.IRON); set(24, FLOOR + 3, 186, B.IRON); set(23, FLOOR + 3, 186, B.IRON); set(24, FLOOR + 3, 185, B.IRON);
    L.reactorCore = core;
    L.machines.push({ id: 'reactor', kind: 'reactor', zone: 5, cells: core, center: [24, FLOOR + 1.5, 185.9] });
    L.markers['machine:reactor'] = [24, FLOOR + 3.8, 185.9];
    const sockets: Record<string, Vec3> = { A: [19, FLOOR, 182], B: [28, FLOOR, 182], C: [19, FLOOR, 189], D: [28, FLOOR, 189] };
    for (const [key, [sx, sy, sz]] of Object.entries(sockets)) {
      set(sx, sy, sz, B.SOCKET);
      L.machines.push({ id: `socket${key}`, kind: 'socket', zone: 5, cells: [[sx, sy, sz]], center: [sx + 0.5, sy + 1.1, sz + 0.5] });
      L.markers[`machine:socket${key}`] = [sx + 0.5, sy + 1.4, sz + 0.5];
      // conduit: from socket toward the core along x then z
      const wire: Vec3[] = [];
      const tx = sx < 23 ? 22 : 25;
      const tz = sz < 185 ? 185 : 186;
      for (let x = Math.min(sx, tx); x <= Math.max(sx, tx); x++) wire.push([x, FLOOR - 1, sz]);
      for (let z = Math.min(sz, tz); z <= Math.max(sz, tz); z++) wire.push([tx, FLOOR - 1, z]);
      for (const [x, y, z] of wire) set(x, y, z, B.WIRE_OFF);
      L.wires[`socket${key}`] = wire;
    }

    // Glowing tanks.
    const tank = (x0: number, z0: number, fluid: number) => {
      for (let y = FLOOR; y <= FLOOR + 3; y++)
        for (let z = z0; z <= z0 + 2; z++)
          for (let x = x0; x <= x0 + 2; x++) {
            const center = x === x0 + 1 && z === z0 + 1;
            set(x, y, z, y === FLOOR + 3 ? B.IRON : center ? fluid : B.GLASS);
          }
      L.sparkles.push({ pos: [x0 + 1.5, FLOOR + 2, z0 + 1.5], color: '#c8ffd0' });
    };
    tank(15, 191, B.TANK_GREEN);
    tank(30, 191, B.TANK_PURPLE);
    tank(31, 159, B.TANK_BLUE);
    tank(18, 176, B.TANK_GREEN);

    // Bookshelves & benches.
    fill(9, FLOOR, 196, 14, FLOOR + 2, 196, B.BOOKSHELF);
    fill(33, FLOOR, 196, 38, FLOOR + 2, 196, B.BOOKSHELF);

    // The vault door (8 × 8) in the north wall.
    const vault: Vec3[] = [];
    carve(20, FLOOR, 197, 27, FLOOR + 7, 199);
    for (let y = FLOOR; y <= FLOOR + 7; y++) for (let x = 20; x <= 27; x++) { set(x, y, 197, B.VAULT); vault.push([x, y, 197]); }
    L.gates.vault = { id: 'vault', cells: vault, blockId: B.VAULT, lift: 8.3 };
    L.machines.push({ id: 'vault', kind: 'vault', zone: 5, cells: vault, center: [24, FLOOR + 3, 196.6] });
    L.markers['machine:vault'] = [24, FLOOR + 2, 196];
    fill(19, FLOOR, 196, 19, FLOOR + 8, 196, B.IRON);
    fill(28, FLOOR, 196, 28, FLOOR + 8, 196, B.IRON);
    fill(19, FLOOR + 8, 196, 28, FLOOR + 8, 196, B.IRON);

    L.npcs.push({ id: 'matter', pos: [23.5, FLOOR, 165.5], yaw: Math.PI });
    L.markers['npc:matter'] = [23.5, FLOOR + 2.4, 165.5];
    L.checkpoints[5] = [23.5, FLOOR, 160.5];
  }

  // =====================================================================
  // EXIT — tunnel, staircase and a sunlit courtyard
  // =====================================================================
  {
    carve(21, FLOOR, 198, 26, FLOOR + 5, 203);
    fill(21, FLOOR - 1, 198, 26, FLOOR - 1, 203, B.BRICKS);
    for (let k = 0; k < 12; k++) {
      const z = 204 + k;
      fill(21, FLOOR - 1, z, 26, FLOOR + k, z, B.BRICKS);
      carve(21, FLOOR + k + 1, z, 26, FLOOR + k + 6, z);
      if (k % 4 === 1) { set(20, FLOOR + k + 3, z, B.LAMP); set(27, FLOOR + k + 3, z, B.LAMP); }
    }
    // Surface terrain around the exit: a cliff over the tunnel, hills around a sunny meadow.
    for (let z = 196; z < WORLD_D; z++)
      for (let x = 0; x < WORLD_W; x++) {
        const meadow = x >= 14 && x <= 33 && z >= 216 && z <= 221;
        let top: number;
        if (meadow) top = 17;
        else if (z < 216) top = 26 + Math.floor(valueNoise3(x / 4, 0, z / 4, 63) * 3);
        else {
          const dx = x < 14 ? 14 - x : x > 33 ? x - 33 : 0;
          const dz = z > 221 ? z - 221 : 0;
          top = Math.min(29, 18 + Math.floor((dx + dz) * 0.7 + valueNoise3(x / 3, 1, z / 3, 64) * 3));
        }
        if (z < 216 && top <= 17) top = 18;
        for (let y = Math.max(14, top - 3); y < top; y++) set(x, y, z, B.DIRT);
        set(x, top, z, B.GRASS);
        carve(x, top + 1, z, x, WORLD_H - 1, z);
      }
    // Re-open the staircase exit through the cliff face.
    for (let k = 0; k < 12; k++) carve(21, FLOOR + k + 1, 204 + k, 26, FLOOR + k + 6, 204 + k);
    for (let x = 21; x <= 26; x++) set(x, 17, 215, B.GRASS);
    fill(21, 18, 215, 26, 23, 216, B.AIR);
    // A tree and some flowers.
    for (let y = 18; y <= 21; y++) set(29, y, 219, B.LOG);
    for (let y = 21; y <= 23; y++)
      for (let z = 217; z <= 221; z++)
        for (let x = 27; x <= 31; x++) {
          if (Math.abs(x - 29) + Math.abs(z - 219) + (y - 21) > 3) continue;
          if (w.get(x, y, z) === B.AIR) set(x, y, z, B.LEAVES);
        }
    for (const [x, z, id] of [[16, 218, B.FLOWER_RED], [18, 220, B.FLOWER_YELLOW], [31, 217, B.FLOWER_RED], [20, 217, B.FLOWER_YELLOW], [25, 220, B.FLOWER_RED], [33, 220, B.FLOWER_YELLOW]] as Vec3[])
      set(x, 18, z, id);
    L.markers['exit'] = [23.5, 19, 218];
  }

  // =====================================================================
  // EXTRA LIGHTING — wall lamps and torch posts for corners and side caves
  // that the main lights don't reach.
  // =====================================================================
  {
    const plainWall = new Set<number>([
      B.STONE, B.COBBLE, B.BRICKS, B.MOSSY, B.DEEPSLATE, B.DEEP_BRICKS, B.COAL_BLOCK, B.GRAVEL,
      B.LIMESTONE, B.LIME_BRICKS, B.LIME_CHISELED, B.FOSSIL,
    ]);
    const wallLamp = (x: number, y: number, z: number) => {
      if (plainWall.has(w.get(x, y, z))) set(x, y, z, B.LAMP);
    };
    const post = (x: number, z: number, block: number) => {
      if (w.get(x, FLOOR, z) === B.AIR && w.get(x, FLOOR + 1, z) === B.AIR && w.isSolid(x, FLOOR - 1, z)) torchPost(x, z, block);
    };
    const y = FLOOR + 3;
    // Waterworks: all four walls.
    for (const z of [6, 17, 28]) wallLamp(11, y, z);
    for (const z of [6, 19, 29]) wallLamp(36, y, z);
    for (const x of [14, 33]) { wallLamp(x, y, 3); wallLamp(x, y, 32); }
    // Carbon Caverns: the four corners.
    for (const [x, z] of [[11, 76], [36, 76], [11, 105], [36, 105]]) post(x, z, B.DEEP_BRICKS);
    // Limestone Ruins: hall walls and both side caverns.
    for (const z of [114, 145, 150]) { wallLamp(9, y, z); wallLamp(38, y, z); }
    for (const x of [13, 34]) { wallLamp(x, y, 111); wallLamp(x, y, 152); }
    for (const [x, z] of [[6, 117], [6, 123], [41, 117], [41, 122]]) post(x, z, B.LIME_BRICKS);
    // Corridors between zones.
    for (const [x, yy, z] of [[21, 8, 34], [26, 8, 36], [21, 8, 72], [26, 8, 72], [21, 8, 110], [26, 8, 109]] as Vec3[]) {
      if (plainWall.has(w.get(x, yy, z)) || w.get(x, yy, z) === B.PACKED_ICE) set(x, yy, z, B.LAMP);
    }
    // Glowing floor tiles on a grid, so the middle of each room is lit too.
    const plainFloor = new Set<number>([...plainWall, B.LAB_TILE]);
    const floorLamps = (x0: number, x1: number, z0: number, z1: number, step: number, skip: (z: number) => boolean = () => false) => {
      for (let z = z0; z <= z1; z += step)
        for (let x = x0; x <= x1; x += step) {
          if (skip(z)) continue;
          if (plainFloor.has(w.get(x, FLOOR - 1, z)) && w.get(x, FLOOR, z) === B.AIR) set(x, FLOOR - 1, z, B.LAMP);
        }
    };
    floorLamps(15, 33, 7, 25, 6); // Waterworks (stays clear of the channel at z 27-28)
    floorLamps(13, 34, 79, 104, 5); // Carbon Caverns: still the darkest zone, but readable
    floorLamps(12, 36, 114, 150, 6, (z) => z >= 131 && z <= 141); // Limestone hall, not over the chasm
    // Grand Laboratory: lab-tile floor lamps plus wall lamps (not behind the periodic table,
    // which covers the west wall from z 179, and clear of the vault door and the entrance).
    const labFloor = new Set<number>([B.LAB_TILE, B.LAB_TILE_DARK]);
    for (let z = 160; z <= 195; z += 5)
      for (let x = 10; x <= 37; x += 5)
        if (labFloor.has(w.get(x, FLOOR - 1, z)) && w.get(x, FLOOR, z) === B.AIR) set(x, FLOOR - 1, z, B.LAMP);
    const labWall = new Set<number>([B.QUARTZ, B.TRAPDOOR]);
    const labLamp = (x: number, z: number) => {
      if (labWall.has(w.get(x, y, z))) set(x, y, z, B.LAMP);
    };
    for (const z of [178, 186, 194]) labLamp(40, z);
    for (const x of [12, 16, 31, 35]) { labLamp(x, 156); labLamp(x, 197); }
  }

  // Sprinkle a few glowing mushrooms for atmosphere in dark corners.
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * WORLD_W), z = Math.floor(rng() * 200);
    if (w.get(x, FLOOR, z) === B.AIR && w.get(x, FLOOR - 1, z) !== B.AIR && w.get(x, FLOOR - 1, z) !== B.LAVA && w.get(x, FLOOR - 1, z) !== B.WIRE_OFF && hash3(x, 1, z, 77) < 0.5) {
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => w.isOpaque(x + a, FLOOR, z + b));
      const inPath = L.waterPath.some(([px, , pz]) => px === x && pz === z);
      if (near && !inPath && z > 40) set(x, FLOOR, z, B.MUSHROOM);
    }
  }

  w.bulk = false;
  w.computeSkyHeights();
  return L;
}

export function zoneAt(layout: Layout, z: number): number {
  for (const b of layout.zoneBounds) if (z >= b.zMin && z <= b.zMax) return b.zone;
  return 5;
}

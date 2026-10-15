# ChemCraft: The Elemental Dungeon

A first-person, voxel-based chemistry adventure for 7th and 8th grade students (ages about 12–14), designed for one or two class periods (30–90 minutes).

Players are apprentice scientists trapped in an underground laboratory. They mine element deposits, build substances on a 3×3 crafting table (a *molecule modeler*), and use what they make to change the world: fill a water channel, melt a frozen gate, pressurise a carbonation machine, rebuild a stone bridge, and restart a reactor. Five themed zones review elements, chemical symbols, formulas and subscripts, compounds versus mixtures, physical versus chemical changes, states of matter, and conservation of mass (with optional equation balancing).

Everything runs in the browser. There is no backend, no account, no network calls, and no student data leaves the computer. Every texture, model, sound and music track is generated in code at runtime. No Minecraft assets are used. This is an original game and is not affiliated with Mojang or Microsoft.

---

## Quick start

Requirements: [Node.js](https://nodejs.org) 18 or newer (developed on Node 22).

```bash
npm install
npm run dev        # http://localhost:5173 with hot reload
npm test           # run the automated test suite (Vitest)
npm run build      # type-check, then build the static site into dist/
npm run preview    # serve the production build at http://localhost:4173
```

Use a recent Chrome or Edge on a laptop or desktop with a mouse. The game needs WebGL and pointer lock.

## Deploying to a static host

`npm run build` produces a fully static site in `dist/`. Asset paths are relative (`base: './'`), so the folder works from any URL path, including a sub-folder.

- **GitHub Pages:** push `dist/` to a `gh-pages` branch, or publish it with the Pages GitHub Action.
- **Netlify / Vercel / Cloudflare Pages:** set the build command to `npm run build` and the publish directory to `dist`.
- **School web server or LMS:** copy the contents of `dist/` to any folder that is served over HTTP(S).
- **No internet in the classroom:** run `npm run preview` on the teacher machine, or open `dist/` from any local web server (for example `npx serve dist`). Browsers will not run the game from a `file://` path because of module security rules.

Fonts (VT323 and Press Start 2P, SIL Open Font License) are bundled through `@fontsource`, so the build needs no external requests.

---

## How to play

| Control | Action |
|---|---|
| W A S D / arrow keys | Move |
| Mouse | Look around (click the game to capture the mouse) |
| Space | Jump (and swim up) |
| Shift | Sprint |
| Hold left click | Mine element deposits and cracked walls |
| Right click | Talk to scientists, open crafting tables and chests, use machines |
| E | Inventory |
| 1–9 / mouse wheel | Select a hotbar slot |
| B | Discoveries book |
| H | Help |
| Esc | Pause and release the mouse |
| Shift + click (inventory) | Move a whole stack |
| Right click (inventory) | Pick up half a stack, or place one item |
| 1–9 while hovering an inventory slot | Swap that slot with the hotbar |

### The core loop
1. Talk to the zone's scientist (right click).
2. Mine glowing deposits for atoms. Every deposit shows its element name and symbol when you look at it, so colour is never the only cue. Deposits respawn after 15 seconds, so nobody runs out.
3. At a crafting table, put atoms into the 3×3 grid. Only the **number and kind** of atoms matter, not where they go. Slots can hold stacks, so large molecules like glucose (24 atoms) still fit.
4. Click the output slot. A success panel explains the formula, its atom count, and whether it is a molecule or an ionic formula unit.
5. Use the substance on the zone's machine. The world animates: water flows, ice melts, bubbles run through glass pipes, a bridge builds block by block, gates slide open.
6. Answer the scientist's learning check. A wrong answer gets a hint, then a stronger hint, then a guided explanation, so no one can get stuck.

### Zones
| Zone | Chemistry | Puzzle |
|---|---|---|
| 1. The Waterworks | Elements, atoms, formulas | Craft H₂O, restart the water generator, turn the water wheel |
| 2. The Crystal Caverns | Elements vs. compounds, mixtures | Craft NaCl, melt the frozen gate (freezing-point lowering) |
| 3. The Carbon Caverns | Subscripts, molecules | Craft CO₂, power the carbonation machine |
| 4. The Limestone Ruins | Compounds, formula units, physical vs. chemical change | Craft CaCO₃ so the fabricator rebuilds the bridge |
| 5. The Grand Laboratory | Review + conservation of matter | Formula Master (craft from memory), Sorting Station (element / compound / mixture), Balancing Station (2H₂ + O₂ → 2H₂O), reactor sockets solved from clues, vault door, exit |

Extras: three hidden chambers behind cracked walls (one each in Zones 1, 3 and 4) with chests and bonus elements (N and Fe), 15 craftable substances (8 core recipes plus bonus ones such as O₃, H₂O₂, CO, CH₄ and NH₃), 13 achievements, an XP bar with levels, and a Discoveries book.

### Science framing
The crafting table is presented as a **molecule modeler**: it shows *what a substance contains*. It is not a simulation of chemical synthesis. The game says this the first time the table opens and in the How to Play page. An optional "How is real chemistry different?" panel explains reactions in more depth. Ionic compounds (NaCl, CaCO₃, Fe₂O₃, NaHCO₃) are described as formula units and ion ratios, not molecules. O₂, O₃, N₂ and H₂ are classified as molecules of elements. Machine effects are clearly fictional game mechanisms. No hazardous real-world procedures are presented.

---

## Teacher mode

From the main menu, open **Teacher Settings**. Settings are stored in the browser (`localStorage`) and apply to new adventures started on that computer.

- **Session length** cuts content rather than adding a timer:
  - *Quick Review (~30–40 min):* 1 question per zone. The Zone 4 bridge starts already built, so the zone is a walk-through. Formula Master asks for 1 compound and the reactor has 3 sockets.
  - *Standard (~45–60 min):* 3 questions per zone, 2 Formula Master compounds, 4 sockets.
  - *Full Dungeon (~70–90 min):* 5 questions per zone, 3 compounds, extra sorting items, and a final review quiz.
- **Grade level:** 7th grade turns balancing equations off by default. 8th grade turns it on. Changing any topic switches to *Custom*.
- **Topics:** elements and atoms, symbols, molecules and compounds, formulas, mixtures, physical and chemical changes, states of matter, conservation of mass, and balancing equations. Questions from disabled topics are never asked. If balancing is off, the Balancing Station becomes an optional bonus. If mixtures are off, the Sorting Station uses only two bins.
- **Difficulty:**
  - *Easy:* story recipes are visible in the recipe book, and the answer is explained after 2 tries.
  - *Normal:* the current goal recipe is shown, and the answer is explained after 3 tries.
  - *Challenge:* recipes appear only after discovery, hints come later, and each zone gets one extra harder question.
- **Bonus recipes**, **advanced explanations**, and the **inactivity hint delay** can each be set separately.
- **Export JSON / Import JSON** shares one configuration across a lab of computers. See [`docs/teacher-config.example.json`](docs/teacher-config.example.json). Invalid or missing fields in an imported file fall back to safe defaults.

### Student results
After the vault opens and the student walks into the sunlight, a results screen shows:
- zones completed and substances discovered
- questions answered, percent correct, and hints used
- play time, achievements, and topics recommended for review (based on wrong attempts and hints)

Students can **download an HTML report** or **print a certificate**. A nickname is optional, stays on the device, and only appears on the certificate.

---

## Settings and accessibility

From **Audio / Graphics** on the main menu, or **Settings** in the pause menu:
- **Audio:** master, music and effects volume, plus mute.
- **Graphics:** quality (Low is tuned for older school laptops), brightness, field of view, and an FPS counter.
- **Controls:** mouse sensitivity, invert Y, and auto-jump.
- **Accessibility:**
  - interface scale (75–160%) and high-contrast panels
  - a readable sans-serif font instead of the pixel font
  - reduced motion (no view bobbing, sprint zoom or bouncing)
  - instant or typewriter dialogue
  - captions for important sounds
  - navigation assistance (a glowing path to the objective)

Other built-in support:
- Dialogue is always shown as text.
- Menus work with the keyboard (Tab, Enter, Space).
- Nothing in the game is timed.
- If a student makes no progress for a while, a hint and guide trail appear.

The pause menu also has **Unstick Me**, which returns the player to a safe spot in the current zone.

---

## Architecture

The project uses TypeScript, React 18, Three.js through React Three Fiber (with Drei's `PerformanceMonitor`), Zustand and Vite.

```
src/
  content/            Educational content as JSON (edit these to change the game)
    elements.json       8 elements: name, atomic number, colour, fact
    recipes.json        15 substances: formula, kind (molecule / ionic / element-molecule), facts
    zones.json          5 zones: quest steps, NPC dialogue, hints, completion text
    npcs.json           scientist looks and voice pitch
    questions.json      question bank (multiple choice / numeric, topic, hints, explanation)
    achievements.json   achievements
    finalLab.json       Formula Master pool, reactor socket clues, sorting items, balancing equation
    index.ts            typed loaders
  chem/               Pure chemistry logic
    formula.ts          parse formulas (incl. parentheses), count atoms, subscripts, multiples
    recipes.ts          composition-model recipe matching and graded crafting hints
  game/               Pure game logic + state
    inventory.ts        stacks, Minecraft-style cursor clicks, shift-click, drag & drop
    quests.ts           step list per session plan, completion checks, objective tracker
    questions.ts        question selection, answer checking, hint / reveal escalation
    config.ts           teacher config validation -> SessionPlan
    save.ts             versioned save format, validation, safe localStorage
    scoring.ts          XP / levels, accuracy, review recommendations
    achievements.ts     achievement conditions
    store.ts            Zustand store: UI overlays, dialogue, quizzes, crafting, stations
    events.ts           event bus from the store to the 3D runtime (gates, sounds, effects)
  engine/             Simulation (no React)
    world/              voxel world, block registry, dungeon generator, coloured light
                        flood fill, chunk mesher (face culling + smooth lighting + AO),
                        DDA raycasting, persistent puzzle state
    player/physics.ts   gravity, jumping, sprinting, swimming, auto-jump, AABB collision
    runtime.ts          frame loop: input, targeting, mining, interactions, puzzle
                        animations, respawning deposits, NPC behaviour, intro/menu cameras
    textures.ts         procedural 16x16 pixel-art texture atlas, liquids, crack stages, sky
    entities/npcModel.ts blocky lab-coat scientists and dialogue portraits
    effects/particles.ts instanced cube particles (one draw call)
    audio.ts            synthesised sound effects + generative ambient music (Web Audio)
    periodicTable.ts    the periodic table wall texture
    nav.ts              path finding for the navigation-assist trail
  scene/              React Three Fiber components (world chunks, NPCs, mechanisms, effects, hand)
  ui/                 React UI: HUD, inventory, crafting, book, dialogue, quiz, stations, menus, results
  styles/mc.css       interface styles
tests/                Vitest suites
```

### Design notes
- **Rendering.** The 48×32×224 world is split into 16³ chunks. Each chunk is meshed into at most four buffers (opaque/cutout, translucent, water, lava) with hidden-face culling. All chunks share one atlas texture and use `MeshBasicMaterial` with baked vertex colours, so draw calls stay low and no real-time lights are needed. Lighting is a coloured block-light flood fill (torches, lamps, crystals, lava, sunlight) with per-vertex smooth lighting and ambient occlusion. When blocks change, only a local region is relit and re-meshed, a few chunks per frame, nearest first.
- **Determinism.** The dungeon is generated from a fixed seed, so a save stores only progress flags. Gates, ice, water, the bridge, sockets and secrets are re-applied from those flags on load.
- **Separation.** Chemistry, inventory, quest, question, scoring and save logic are pure TypeScript with no DOM or Three.js, and are unit-tested directly. The store calls into them. The runtime owns the voxel simulation and talks to the store through actions and a small event bus.
- **No LLM / no network.** All answer checking is deterministic.
- **Performance.** The Low / Medium / High presets change render distance, pixel ratio, particle density and re-mesh budget. If the frame rate drops, `PerformanceMonitor` steps down from High.

### Extending the content
- **New substance:** add an entry to `recipes.json` with a formula string (for example `"NH3"`). Atom counts are parsed automatically. Use only elements listed in `elements.json`, and give it a unique composition.
- **New element:** add it to `elements.json`, then add a deposit block and texture (`engine/world/blocks.ts`, `engine/world/tiles.ts`, `engine/textures.ts`) and place deposits in `worldgen.ts`.
- **New question:** add to `questions.json` with `zone`, `topic`, `type` (`mc` or `numeric`), `hints` (two, mild to strong) and `explanation`. Mark `core: true` to ask it first.
- **Dialogue and quest text:** edit `zones.json`. Each step's `type` decides how it completes: `talk`, `collect`, `craft`, `use`, `quiz`, `station` or `reach`.

---

## Testing

```bash
npm test
```

There are 90 tests across 8 suites:
- **`formula`**: parsing, atom and element counts, subscripts, multiples, conservation of atoms.
- **`recipes`**: chemically accurate recipe data, arrangement-independent matching, stacked slots, look-alike substances (H₂O vs H₂O₂, CO vs CO₂), and hint quality.
- **`inventory`**: adding, removing and overflow, cursor clicks, splitting, drag and drop, shift-click, returning the crafting grid.
- **`progression`**: teacher config validation, session plans, quest steps and prerequisites, question selection, hint escalation, scoring and achievements.
- **`save`**: round-tripping progress, rejecting corrupt or foreign data, sanitising bad values.
- **`store`**: plays the whole Waterworks quest through the same actions the UI uses (talk → mine → craft → generator → quiz with a wrong answer → gate opens). Also covers chests, secrets, Quick-mode bridge, reactor sockets, Formula Master, sorting/balancing, and persistence.
- **`world`**: a walkability search proves each closed gate (and the chasm) blocks the next zone, every objective in each zone is reachable, and opening each gate unlocks exactly the next zone. Also covers lighting, meshing and raycasting.
- **`physics`**: gravity, jump height, wall and gate collision, staircase auto-jump, lava detection.

For automation or debugging, open the game with `?debug` in the URL. This exposes `window.chemcraft = { runtime, useGame }`.

---

## Privacy

- No accounts, no analytics, and no network requests.
- Progress, settings and teacher configuration are kept in the browser's `localStorage` under keys that start with `chemcraft.`.
- Reports are generated in the browser and saved only when the student clicks **Download Report**.

## Credits and licences
- Code, pixel art, models, sound effects and music: generated procedurally for this project.
- Fonts: VT323 and Press Start 2P (SIL Open Font License), bundled through `@fontsource`.
- Libraries: React, Three.js, React Three Fiber, Drei, Zustand (MIT).

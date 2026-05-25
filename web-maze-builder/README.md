# Maze Builder

Maze Builder is the core Ball Maze PCG tool. It reads `rail_config.csv`, generates a connected 3D rail maze from a deterministic seed/configuration, previews the result in a Vite + Three.js web viewer, and exports Maze Builder-compatible JSON for Unreal Engine tooling.

The current authoritative implementation is the TypeScript/Vite tool in `src/`. The older Python generator remains in this directory for historical comparison only.

## Features

- Difficulty-driven maze growth.
- Configurable target difficulty, checkpoint count, max self-spin count, and bounds.
- Deterministic seed format that encodes generation configuration.
- 3D browser preview with rail selection and rail detail panels.
- CSV drag-and-drop to regenerate from a rail config.
- JSON drag-and-drop to inspect an existing layout.
- JSON download for UE import.

## Run

```bash
cd web-maze-builder
npm install
npm run dev
```

The dev server uses port `43187`.

## Verify

```bash
cd web-maze-builder
npm test
npm run build
```

## Key Files

- `src/main.ts`: Web app shell, controls, seed encode/decode, import/export UI.
- `src/maze/generator.ts`: Maze generation, footprint, transform, placement, export logic.
- `src/maze/csv.ts`: CSV parsing.
- `src/maze/random.ts`: deterministic `SeededRandom`.
- `src/maze/types.ts`: shared data structures.
- `src/viewer/MazeViewer.ts`: Three.js viewer.
- `src/test/maze.test.ts`: generator and transform tests.
- `rail_config.csv`: default rail asset config.
- `maze_layout.json`: sample/generated layout loaded by the web app.
- `template_maze_layout.json`: JSON structure reference.
- `maze_generator.py`: legacy Python generator.
- `test_maze.py`: legacy Python output check.

## Seed Format

Current generated seeds use:

```text
bm02-random-difficulty-rails-checkpoints-spins-bounds
```

All fields are lowercase base36:

- `bm02`: format version.
- `random`: 6 chars, initializes `SeededRandom`.
- `difficulty`: 2 chars, target total difficulty.
- `rails`: 2 chars, target rail count used to guide difficulty per step.
- `checkpoints`: 2 chars, target checkpoint count.
- `spins`: 2 chars, max non-zero self-spins.
- `bounds`: 6 chars, packed `xx yy zz` bounds.

Example:

```text
bm02-0d2wnk-0o-10-03-00-0d0d0d
```

This means:

```text
random = parseInt("0d2wnk", 36)
difficulty = parseInt("0o", 36)
target rails = parseInt("10", 36)
checkpoints = parseInt("03", 36)
spins = parseInt("00", 36)
bounds = 13 / 13 / 13
```

`random` is not the maze layout itself. It initializes `SeededRandom`:

```ts
state = seed >>> 0
state = (1664525 * state + 1013904223) >>> 0
value = state / 0x100000000
```

To reproduce a maze exactly, seed, `rail_config.csv`, generator code, options, and random call order must all match.

## Runtime Inputs

The generated maze is best understood as:

```text
maze = generate(seed, rail_config_csv, target_difficulty, target_rails, checkpoints, max_spins, bounds, generator_code)
```

Seed controls random choices such as start rail, start position, open connector selection, candidate rail order, and retry order. CSV and code still define rail sizes, exits, difficulty, collision, bounds, and rotations.

`Target rails` produces an average target difficulty per rail. While growing a maze, the generator prefers candidates that pull accumulated difficulty back toward that expected curve. This changes attempt order only; fitting fallback candidates remain available.

For `N` checkpoints, the maze has `N + 1` difficulty segments. The checkpoint threshold is therefore `target difficulty / (N + 1)`. Once a segment crosses that threshold, generation backs up and keeps retrying a fork-plus-checkpoint placement earlier in the segment rather than placing ordinary rails past the threshold.

## Rail Config CSV

The default `rail_config.csv` uses the normalized rail config format:

- `---`: row name / rail ID.
- `OccupiedCells`: local occupied grid cells, for example `((X=0,Y=0,Z=0),(X=1,Y=0,Z=0))`.
- `Exits`: local exit definitions with `Location`, `Rotation`, and `SpinConfig`.
- `Diff_Base`: base difficulty for the rail.
- `RailClassRef`: Unreal Blueprint class reference used by importer tooling.

`OccupiedCells` and new-format `Exits` are authoritative. A single `((X=0,Y=0,Z=0))` value on a larger named rail is treated as placeholder occupation data and falls back to name-pattern footprint inference. Legacy configs with `RowName`, `Size`, `Exit_Array`, and `SpinDiff` are still accepted.

## Output

Exported JSON records the generated result: rail IDs, positions, rotations, occupied cells, exits, connections, and `MapMeta` stats such as total difficulty, target rail count, average target difficulty, checkpoint segment difficulties, and spin usage.

Rotation values shown in Rail Detail and exported in `Rot_Abs` / `Exit_Rot_Abs` use Unreal transform order:

```text
x = Roll, y = Pitch, z = Yaw
```

The generator's logical yaw already follows UE yaw direction; do not negate it because the viewer flips displayed Y positions. The UE-facing conversion is:

```text
UE Roll = -internal Roll
UE Pitch = internal Pitch
UE Yaw = internal Yaw
```

When UE rotation reaches gimbal lock at `Pitch = +/-90`, Maze Builder uses UE's canonical Euler display form as well. For example, the equivalent value `Roll / Pitch / Yaw = -90 / 90 / 0` is shown and exported as `0 / 90 / 90`, matching the value shown after import in Unreal.

Maze Builder's internal generator still computes rotations as `p/y/r` (`Pitch/Yaw/Roll`), but imported/exported JSON and Rail Detail use the same UE-facing `x/y/z` values. Dragging in an older unmarked export or a prior inverted-yaw export is migrated on import, so downloading it again rewrites rotations into the current UE-equivalent convention.

# Maze Builder Agent Notes

These are the authoritative implementation rules for `web-maze-builder`.

## Verification

Always run after Maze Builder changes:

```bash
cd web-maze-builder
npm test
npm run build
```

## Current Authority

- The TypeScript/Vite implementation under `src/` is authoritative.
- `maze_generator.py` and `test_maze.py` are legacy references.
- Do not patch only viewer arrows unless exported JSON is already correct.

## Core Invariant

For every placed rail, `Pos_Rev + Rot_Abs` is the single authoritative pose.

Do not mix separate transform systems for footprint, exit position, and exit direction.

Correct pipeline:

```text
CSV local data -> local footprint/exits -> transform by Rail Rot_Abs -> add Pos_Rev
```

## Rail Coordinate Rules

- CSV/config data is local-space data.
- `Size_Rev` describes local bounds.
- `OccupiedCells` is the preferred source for local footprint cells.
- Direction names such as `L90`, `R90`, `U90`, `D90` describe local footprint expansion only when explicit `OccupiedCells` data is unavailable.
- `Exits` contains local exit position and local exit rotation. Legacy `Exit_Array` is still supported.
- World logical occupied cells are computed by rotating local occupied cells by `Rot_Abs`, then adding `Pos_Rev`.

## Footprint Rules

Generate footprint in local coordinates first. If the CSV row has `OccupiedCells`, those cells are authoritative. A single `((X=0,Y=0,Z=0))` value on a larger named rail is treated as placeholder data and falls back to name-based footprint generation.

- Forward rail: expands along local `+X`.
- `L90` / `R90`: expands in local `Y`.
- `U90` / `D90`: expands in local `Z`.
- `T` / `CR`: can expand to both left and right.

For a common `U90 X3 Y1 Z3` asset, local occupied cells are a 3 by 3 shape on the `x-z` plane:

```text
000, 100, 200
001, 101, 201
002, 102, 202
```

Each three-digit token means `(x, y, z)`, e.g. `102` means `(1, 0, 2)`.

## Exit Rules

Exit calculations must follow:

```text
Exit_Pos_Rev = Pos_Rev + RotateByRotAbs(Exit_Local_Pos, Rail_Rot_Abs)
Exit_Rot_Abs = Rail_Rot_Abs + Exit_Local_Rot
Exit_Dir_Abs = forward direction derived from Exit_Rot_Abs
```

Never derive `Exit_Dir_Abs` from `Exit_Pos_Rev - Pos_Rev`.

Curve exit position and exit direction are different concepts. With Pitch/Roll/Yaw, a R90/L90 curve can have a position offset on another axis while still facing a horizontal direction.

## Rotation Export Rules

The generator and viewer use internal `RotAbs` objects as:

```text
p = Pitch, y = Yaw, r = Roll
```

Exported JSON for UE must use Transform rotation order:

```text
x = Roll, y = Pitch, z = Yaw
```

Because the viewer mirrors logical Y for display, export/display must also convert handedness:

```text
UE Roll = -internal Roll
UE Pitch = internal Pitch
UE Yaw = -internal Yaw
```

For example, internal `{ p: 0, y: 90, r: 0 }` must export as `{ x: 0, y: 0, z: -90 }`, and internal `{ p: 0, y: 0, r: 90 }` must export as `{ x: -90, y: 0, z: 0 }`.

User-facing Rail Detail, downloaded JSON, and UE import must agree exactly on those UE values. Any conversion from old unmarked exports must happen only while importing/migrating that old JSON.

At `Pitch = +/-90`, export/display must use the same canonical gimbal-lock representation UE shows: set Roll to `0` and fold its equivalent turn into Yaw. For example, `Roll/Pitch/Yaw = -90/90/0` must be emitted as `0/90/90`.

## Placement Rules

When placing a child rail:

- Use parent exit position as child `Pos_Rev`.
- Use parent exit rotation as the base child `Rot_Abs`.
- Apply self-spin only if allowed by `maxSpins`.
- Collision and bounds must use the child footprint transformed by full child `Rot_Abs`.

## Self-Spin Rules

- Default `maxSpins` is 0.
- Non-zero `spinRot` is forbidden unless `usedSpinCount < maxSpins`.
- Rollback/backtracking must decrement spin count for removed non-zero-spin rails.

## Checkpoint Rules

- Checkpoint count minimum is 0.
- For target difficulty `a` and checkpoint count `n`, when `n > 0`, checkpoint threshold is `a / n`.
- When threshold is exceeded:
  - backtrack one rail,
  - place a fork rail with at least two exits,
  - place checkpoint on one exit,
  - leave another exit for continuing generation.
- Track segment difficulties in `MapMeta.SegmentDiffs`.

## Seed Rules

Current generated seed format:

```text
bm01-random-difficulty-checkpoints-spins-bounds
```

Field widths:

- `bm01`: version, 4 chars.
- `random`: 6 chars.
- `difficulty`: 2 chars.
- `checkpoints`: 2 chars.
- `spins`: 2 chars.
- `bounds`: 6 chars, `xx yy zz` packed together.

`random` initializes `SeededRandom`; it is not the layout itself.

To reproduce a maze, seed, config, generator code, and random call order must match.

## Known Asset Overrides

Current asset-specific footprint/exit overrides exist for:

- `BP_Curve_L90_X4_Y4_Z1_Rail`
- `BP_Curve_L90_Borderless_O_X2_Y2_Z1_Rail`

Treat these as temporary compatibility patches. Prefer explicit CSV/config footprint metadata in the long term.
They must not be applied to rows that already provide explicit `OccupiedCells` or new-format `Exits`.

## Debugging Direction Bugs

Inspect in this order:

1. CSV local exit data.
2. Local footprint generation.
3. Rail `Rot_Abs`.
4. Occupied cells after full `Rot_Abs`.
5. `Exit_Pos_Rev`.
6. `Exit_Rot_Abs`.
7. `Exit_Dir_Abs`.
8. Viewer mapping from `Exit_Dir_Abs` to Three.js vector.

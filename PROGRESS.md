# Repository Progress

Last updated: 2026-05-11

## Scope

This repository is organized as a small suite of independent tools. Directory prefixes now identify the primary runtime: `web-*`, `ue-*`, and `blender-*`. Current active engineering work is concentrated in `web-maze-builder`.

## Tool Status

| Tool | Status | Notes |
|---|---|---|
| `web-maze-builder` | Active | TypeScript/Vite generator and viewer are the current authoritative Maze Builder path. See `web-maze-builder/PROGRESS.md`. |
| `web-hermite-spline-generator` | Usable | Vite web tool for Hermite curve parameter editing and CSV export. |
| `ue-json-rail-exporter` | Usable | Exports rail and environment helper actors from the current UE level to Maze Builder-compatible JSON. |
| `ue-json-rail-importer` | Usable | Imports Maze Builder JSON into UE and can fall back from Blueprint references to Static Mesh references. |
| `ue-asset-pivot-editor` | Usable | Bakes Static Mesh Pivot changes and can compensate selected level actors. |
| `ue-material-instance-creator` | New / Usable | Creates Material Instances in the active Content Browser path from selected Materials using a fixed parent Material reference. |
| `ue-texture-assigner` | Usable | Scans UE assets by naming convention and assigns Texture -> MI -> Static Mesh. |
| `blender-voxel-ball-shatter` | New / Usable | Blender script that converts selected mesh objects into voxel cube collections. |

## Repository Roadmap

- Keep root docs limited to cross-tool orientation.
- Keep tool-specific usage, progress, and implementation rules inside the matching tool directory.
- Preserve runtime prefixes in new tool directories so usage context remains obvious.
- Prefer explicit config metadata over name-pattern inference where a tool currently depends on asset naming.
- Keep Unreal scripts runnable inside Unreal Editor Python without requiring normal system Python execution.
- Keep Blender scripts runnable inside Blender Python without requiring normal system Python execution.

## Verification

For active Maze Builder work:

```bash
cd web-maze-builder
npm test
npm run build
```

# Voxel Ball Shatter

Blender Python script for converting selected mesh objects into voxel cube collections. It is useful for turning a voxel-like ball or mesh into separate cube pieces that can be edited, assigned materials, or exported as individual objects.

## What It Does

- Runs on selected Blender Mesh objects.
- Uses a fixed `VOXEL_SIZE` and snaps cube centers to a stable voxel grid.
- Creates a new `<object>_shattered` collection for each source object.
- Reconstructs voxel occupancy from axis-aligned source faces.
- Can fill the volume with scanlines, then keep only the outer layer.
- Can merge unit voxels into larger non-overlapping cuboid blocks.
- Can randomize merged block sizes within a configured size range.
- Can split the original mesh into separate objects without filling hollow assets.
- Can use the evaluated mesh after modifiers.
- Preserves material slots, UV layers, and mesh Color Attributes / vertex colors used by material nodes.
- Creates the shattered collection under the source object's collection.
- Guards against accidental huge output with `MAX_OUTPUT_CUBES_PER_OBJECT`.

## Run

1. Open Blender.
2. Select one or more Mesh objects.
3. Open `voxel-ball-shatter.py` in Blender's Text Editor.
4. Adjust the config block if needed.
5. Click `Run Script`.

You can also run it from Blender Python:

```python
exec(open(r"/Users/ddonlien/Documents/GitHub/ball-maze-tools/blender-voxel-ball-shatter/voxel-ball-shatter.py", encoding="utf-8").read())
```

This script cannot run in normal system Python because it imports `bpy` and Blender math/geometry APIs.

## Key Config

- `SHATTER_MODE`: processing mode. `0 = merge`, `1 = random`, `2 = separate`.
- `VOXEL_SIZE`: size of one voxel cube. The current default is `0.1`.
- `GRID_SNAP_STEP`: boundary snap precision. For `0.1` voxels, `0.05` is usually correct; use `0.0125` if the source asset has that offset.
- `FILL_VOLUME_BY_SCANLINE`: fills the voxel volume before extracting the outer layer.
- `SCANLINE_AXIS`: scan direction for filling, where `0 = X`, `1 = Y`, `2 = Z`.
- `OUTER_DIRECTIONS_MODE`: `SIX` checks all six neighbors; `FIVE_NO_BOTTOM` ignores bottom exposure.
- `USE_EVALUATED_MESH`: uses modifier-evaluated geometry when `True`.
- `REPLACE_EXISTING_COLLECTION`: replaces an existing `<object>_shattered` collection when rerunning.
- `LINK_TO_ALL_SOURCE_COLLECTIONS`: links the output collection under every source collection when `True`.
- `MAX_OUTPUT_CUBES_PER_OBJECT`: safety limit for generated cube count.
- `MERGE_LEVEL`: target merge side length. `1` keeps unit voxels, `2` targets `2x2x2` / volume `8`, `3` targets `3x3x3` / volume `27`, and so on.
- `RANDOM_MERGE_LEVEL_MIN`: lower bound of random target side length.
- `RANDOM_MERGE_LEVEL_MAX`: upper bound of random target side length.
- `RANDOM_SEED`: makes randomized merging repeatable.
- `SEPARATE_TARGET_BLOCKS`: target number of pieces for `separate` mode. The script decomposes this into a near-cubic 3D grid.
- `SEPARATE_RANDOM_SEED`: controls which adjacent pair is merged when `SEPARATE_TARGET_BLOCKS` is odd.
- `AXIS_NORMAL_THRESHOLD`: ignores faces that are not close to axis-aligned.

## Notes

The script assumes voxel-style geometry with mostly axis-aligned faces. If a material reads Color Attributes such as `Color`, `Metallic`, `Roughness`, `Emission`, or similar, the generated block meshes create matching CORNER-domain Color Attributes and sample values from the source faces.

Merged blocks are single Blender objects, and may be cubes, cuboids, or connected arbitrary voxel shapes such as L-shapes. Their exterior faces remain subdivided on the source voxel grid so material slots, UVs, and Color Attributes can still be sampled per small face.

Merge priority is:

1. full occupancy cube at target volume,
2. surface-only arbitrary connected shape within target size,
3. full occupancy arbitrary connected shape within target size,
4. downgrade target side length until `1x1x1`.

Separate mode does not voxelize or fill the asset. It assigns each original polygon to one axis-aligned bounding-box grid partition by polygon center, then creates one mesh object per partition using the original polygon vertices, material indices, UVs, and Color Attributes. Hollow assets stay hollow, and any existing internal faces or internal textures are copied from the source mesh instead of being reconstructed.

Separate partitioning uses this layout:

1. Find integer factors `A x B x C = target`.
2. Prefer the factor triplet whose resulting cell sizes are closest to cube-like for the source object's bounding box.
3. Assign larger factors to longer object axes, so elongated objects still get less stretched cells.
4. Examples for near-cubic assets: `2 -> 2x1x1`, `4 -> 2x2x1`, `6 -> 3x2x1`, `8 -> 2x2x2`, `9 -> 3x3x1`, `64 -> 4x4x4`.
5. Odd targets build the next even layout, then merge one random adjacent pair.
6. If curved assets leave empty bounding-box cells, the largest populated surface partitions are split again until the target object count is reached when possible.

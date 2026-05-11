# Material Instance Creator

Unreal Editor Python script for creating Material Instance assets from the currently selected `Material` assets.

## What It Does

1. Reads the active Content Browser address as the output folder.
2. Reads the currently selected `Material` assets.
3. Creates one `MaterialInstanceConstant` for each selected Material.
4. Names each instance `MI_<SelectedMaterialName>`.
5. Sets every new instance parent to:

```text
/Script/Engine.Material'/Game/Item/Mesh/Voxel/M_VoxelBasic.M_VoxelBasic'
```

Existing same-name assets are skipped instead of overwritten.

## Run

1. In Unreal Editor, open the Content Browser folder where the new Material Instances should be created.
2. Select the source `Material` assets.
3. Run inside Unreal Editor Python:

```python
exec(open(r"C:\Users\ddonl\Documents\GitHub\ball-maze-tools\ue-material-instance-creator\create_material_instances_from_selection.py", encoding="utf-8").read())
```

This script cannot run in normal system Python because it imports `unreal`.

## Key Config

Edit the top of `create_material_instances_from_selection.py` when needed:

- `PARENT_MATERIAL_REFERENCE`: parent Material reference assigned to every new Material Instance.
- `INSTANCE_PREFIX`: prefix added to selected Material names.
- `SAVE_CREATED_ASSETS`: saves created Material Instance assets immediately when `True`.

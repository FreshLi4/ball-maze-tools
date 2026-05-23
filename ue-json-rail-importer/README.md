# JSON Rail Importer

Imports a Maze Builder JSON layout into the current Unreal Engine level.

## What It Does

- Prompts for a JSON file in Unreal Editor.
- If the file picker is unavailable or cancelled, import stops unless `LAYOUT_JSON_PATH` or a function argument is set.
- Reads rail references from `/Game/DataAssets/DT/PCG/DT_RailConfig` first.
- Falls back to `ue-json-rail-importer/DT_RailConfig.csv` when the DataTable is unavailable.
- Places generated actors into the `04_Level/Rail` Outliner folder.
- Can clear previously generated actors in that folder.
- Places Blueprint/Class actors only.
- If the CSV only contains Proxy StaticMesh references, the importer derives a sibling BP path from those references and fails loudly if it cannot load the BP.

## Run

Run inside Unreal Editor Python:

```python
exec(open(r"/Users/ddonlien/Documents/GitHub/ball-maze-tools/ue-json-rail-importer/import_json_rails_to_level.py", encoding="utf-8").read())
```

This script cannot run in normal system Python because it imports `unreal`.

## Key Config

Edit the top of `import_json_rails_to_level.py` when needed:

- `DEFAULT_LAYOUT_JSON`: only used as the file picker's initial directory reference.
- `LAYOUT_JSON_PATH`: optional absolute or repo-relative JSON path used when not choosing from the file picker.
- `PROMPT_FOR_JSON_ON_RUN`: whether to show the JSON file picker first.
- `RAIL_CONFIG_DATA_TABLE_REF`: primary Unreal DataTable reference.
- `DEFAULT_RAIL_CONFIG_CSV`: fallback rail reference CSV.
- `FOLDER_PATH`: folder used for generated actors.
- `CLEAR_EXISTING_IN_FOLDER`: whether to delete old generated actors first.
- `SELECT_SPAWNED_ACTORS`: whether to select imported actors after placement.
- `GRID_TO_WORLD`, `LOCATION_SCALE`, `LOCATION_OFFSET`, `ROTATION_OFFSET`: placement transform settings.
- `BP_MAZE_CLASS_PATH`, `BP_MAZE_BOUNDARY_CLASS_PATH`, `BP_MAZE_BOTTOM_CLASS_PATHS`: project-side Blueprint classes for maze helpers.

## Notes

Maze Builder JSON is the data contract. If a rail fails to import, first check whether the DataTable row name matches the JSON `Rail_ID` and whether `RailClassRef` points to a valid BlueprintGeneratedClass.

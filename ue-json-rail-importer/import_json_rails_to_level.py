"""
Import a web-maze-builder JSON layout into the current Unreal level.

Run inside Unreal Editor Python. The script prompts for a JSON file when
possible, reads rail Blueprint/Class references from the CSV, places BP_Maze at
world origin when configured, and places rail Blueprints from the JSON.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import unreal
except ImportError as exc:
    raise RuntimeError("This script must be run inside Unreal Editor Python.") from exc


# ============================================================
# Config
# ============================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_LAYOUT_JSON = REPO_ROOT / "web-maze-builder" / "maze_layout.json"
DEFAULT_RAIL_CONFIG_CSV = SCRIPT_DIR / "DT_RailConfig.csv"
RAIL_CONFIG_DATA_TABLE_REF = "/Script/Engine.DataTable'/Game/DataAssets/DT/PCG/DT_RailConfig.DT_RailConfig'"

# Leave empty to require the file picker. If the picker is unavailable, set this
# to an absolute path or a path relative to the repo root.
LAYOUT_JSON_PATH = ""
PROMPT_FOR_JSON_ON_RUN = True

FOLDER_PATH = "04_Level/Rail"
CLEAR_EXISTING_IN_FOLDER = True
SELECT_SPAWNED_ACTORS = True

GRID_TO_WORLD = 16.0
LOCATION_SCALE = 1.0
LOCATION_OFFSET = unreal.Vector(0.0, 0.0, 0.0)
ROTATION_OFFSET = unreal.Rotator(0.0, 0.0, 0.0)

# web-maze-builder exports UE-ready Roll/Pitch/Yaw values. Leave this disabled for
# current exports; enable only when importing legacy files that still stored viewer
# internal rotations without the Y-mirror handedness conversion.
MIRROR_VIEWER_Y_AXIS = False

# Fill these once the project-side Blueprint references are settled.
BP_MAZE_CLASS_PATH = ""
BP_MAZE_BOUNDARY_CLASS_PATH = ""
BP_MAZE_BOTTOM_CLASS_PATHS = {
    "1x1": "",
    "2x2": "",
    "3x3": "",
    "4x4": "",
}

# CSV columns that may contain a real BP_Rail Blueprint/Class reference.
RAIL_CLASS_COLUMNS = ("RailClassRef", "BP_Rail", "RailActor", "RailBP", "RailRef", "Reference", "Actor", "Blueprint", "Class")
RAIL_PART_COLUMNS = ("Side", "BR", "BL", "B", "L", "R")


@dataclass
class RailRef:
    column_name: str
    raw_ref: str
    object_path: str
    package_path: str
    is_actor_class: bool


@dataclass
class RailConfigRow:
    row_name: str
    actor_refs: List[RailRef]
    derived_actor_refs: List[RailRef]


def _log(message: str) -> None:
    unreal.log(f"[JsonRailImporter] {message}")


def _warn(message: str) -> None:
    unreal.log_warning(f"[JsonRailImporter] {message}")


def _error(message: str) -> None:
    unreal.log_error(f"[JsonRailImporter] {message}")


def _read_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Layout JSON not found: {path}")
    with path.open("r", encoding="utf-8-sig") as file:
        return json.load(file)


def _looks_like_unreal_ref(value: str) -> bool:
    value = value.strip()
    if not value or value.lower() == "none":
        return False
    return bool(value) and ("/Game/" in value or value.startswith("/Script/"))


def _normalize_asset_ref(raw_ref: str) -> Optional[Tuple[str, str]]:
    value = raw_ref.strip()
    if not _looks_like_unreal_ref(value):
        return None

    quoted = re.search(r"'([^']+)'", value)
    object_path = quoted.group(1) if quoted else value
    object_path = object_path.strip()
    if not object_path.startswith("/Game/"):
        return None

    return object_path, object_path.split(".", 1)[0]


def _read_rail_config(csv_path: Path) -> Dict[str, RailConfigRow]:
    data_table_config = _read_rail_config_from_data_table()
    if data_table_config:
        if _config_has_any_actor_ref(data_table_config):
            _log(f"Loaded {len(data_table_config)} rail config rows from DataTable {RAIL_CONFIG_DATA_TABLE_REF}.")
            return data_table_config
        _warn(
            f"DataTable {RAIL_CONFIG_DATA_TABLE_REF} loaded {len(data_table_config)} rows, "
            "but no usable RailClassRef values were readable from Python."
        )

    _warn(f"Falling back to CSV rail config: {csv_path}")
    return _read_rail_config_from_csv(csv_path)


def _config_has_any_actor_ref(config: Dict[str, RailConfigRow]) -> bool:
    return any(_actor_ref_candidates(row) for row in config.values())


def _read_rail_config_from_csv(csv_path: Path) -> Dict[str, RailConfigRow]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Rail config CSV not found: {csv_path}")

    config: Dict[str, RailConfigRow] = {}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames:
            raise RuntimeError(f"CSV has no header row: {csv_path}")

        for row_number, row in enumerate(reader, start=2):
            _add_config_row_from_csv_dict(config, row, row_number, str(csv_path))

    return config


def _add_config_row_from_csv_dict(config: Dict[str, RailConfigRow], row: dict, row_number: int, source_name: str) -> None:
    row_name = (row.get("RowName") or row.get("Name") or row.get("---") or "").strip()
    if not row_name:
        if _is_blank_csv_row(row):
            return
        _warn(f"{source_name} row {row_number} skipped: missing RowName/Name.")
        return

    actor_refs: List[RailRef] = []
    mesh_refs: List[RailRef] = []

    for column_name in RAIL_CLASS_COLUMNS:
        raw_ref = (row.get(column_name) or "").strip()
        normalized = _normalize_asset_ref(raw_ref)
        if normalized:
            object_path, package_path = normalized
            actor_refs.append(RailRef(column_name, raw_ref, object_path, package_path, True))

    for column_name in RAIL_PART_COLUMNS:
        raw_ref = (row.get(column_name) or "").strip()
        normalized = _normalize_asset_ref(raw_ref)
        if normalized:
            object_path, package_path = normalized
            mesh_refs.append(RailRef(column_name, raw_ref, object_path, package_path, False))

    derived_actor_refs = _derive_actor_refs_from_mesh_refs(row_name, mesh_refs)

    existing = config.get(row_name) or RailConfigRow(row_name, [], [])
    _append_unique_refs(existing.actor_refs, actor_refs)
    _append_unique_refs(existing.derived_actor_refs, derived_actor_refs)
    for alias in _config_aliases(row_name, existing):
        config[alias] = existing


def _is_blank_csv_row(row: dict) -> bool:
    for value in row.values():
        if value is None:
            continue
        text = str(value).strip()
        if text and text.lower() != "none":
            return False
    return True


def _config_aliases(row_name: str, config_row: RailConfigRow) -> List[str]:
    aliases = [row_name]
    leaf = row_name.rstrip("/").rsplit("/", 1)[-1]
    if leaf:
        aliases.append(leaf)
        if not leaf.startswith("BP_"):
            aliases.append(f"BP_{leaf}_Rail")

    for ref in _actor_ref_candidates(config_row):
        class_name = _class_name_from_ref_path(ref.object_path)
        if class_name:
            aliases.append(class_name)

    return _unique_strings([alias for alias in aliases if alias])


def _class_name_from_ref_path(object_path: str) -> str:
    leaf = str(object_path).rsplit("/", 1)[-1].split(".", 1)[-1]
    if leaf.endswith("_C"):
        leaf = leaf[:-2]
    return leaf


def _read_rail_config_from_data_table() -> Dict[str, RailConfigRow]:
    data_table = _load_data_table()
    if not data_table:
        return {}

    csv_text = _data_table_to_csv_text(data_table)
    if csv_text:
        return _read_rail_config_from_csv_text(csv_text, "DataTable export")

    json_text = _data_table_to_json_text(data_table)
    if json_text:
        return _read_rail_config_from_json_text(json_text, "DataTable JSON export")

    config: Dict[str, RailConfigRow] = {}
    row_names = _get_data_table_row_names(data_table)
    row_map = _get_data_table_row_map(data_table)

    for row_name_value in row_names:
        row_name = str(row_name_value)
        row = _get_data_table_row(data_table, row_name_value, row_map)
        rail_class_ref = _get_row_ref_text(row, ("RailClassRef", "Rail_Class_Ref", "RailClass", "RailRef", "BP_Rail"))
        actor_refs = _rail_refs_from_text("RailClassRef", rail_class_ref)
        config[row_name] = RailConfigRow(row_name, actor_refs, [])

    return config


def _data_table_to_csv_text(data_table) -> str:
    candidates = (
        ("DataTableFunctionLibrary.export_data_table_to_csv_string", lambda: unreal.DataTableFunctionLibrary.export_data_table_to_csv_string(data_table)),
        ("DataTableFunctionLibrary.get_data_table_as_csv_string", lambda: unreal.DataTableFunctionLibrary.get_data_table_as_csv_string(data_table)),
        ("data_table.get_table_as_csv", lambda: data_table.get_table_as_csv()),
        ("data_table.get_table_as_csv_string", lambda: data_table.get_table_as_csv_string()),
    )

    for label, getter in candidates:
        try:
            result = getter()
            if isinstance(result, tuple):
                result = next((item for item in result if isinstance(item, str) and item.strip()), "")
            if isinstance(result, str) and result.strip():
                _log(f"Read rail config DataTable via {label}.")
                return result
        except Exception:
            pass

    return ""


def _data_table_to_json_text(data_table) -> str:
    candidates = (
        ("DataTableFunctionLibrary.export_data_table_to_json_string", lambda: unreal.DataTableFunctionLibrary.export_data_table_to_json_string(data_table)),
        ("DataTableFunctionLibrary.get_data_table_as_json_string", lambda: unreal.DataTableFunctionLibrary.get_data_table_as_json_string(data_table)),
        ("data_table.get_table_as_json", lambda: data_table.get_table_as_json()),
        ("data_table.get_table_as_json_string", lambda: data_table.get_table_as_json_string()),
    )

    for label, getter in candidates:
        try:
            result = getter()
            if isinstance(result, tuple):
                result = next((item for item in result if isinstance(item, str) and item.strip()), "")
            if isinstance(result, str) and result.strip():
                _log(f"Read rail config DataTable via {label}.")
                return result
        except Exception:
            pass

    return ""


def _read_rail_config_from_csv_text(csv_text: str, source_name: str) -> Dict[str, RailConfigRow]:
    config: Dict[str, RailConfigRow] = {}
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise RuntimeError(f"CSV has no header row: {source_name}")

    for row_number, row in enumerate(reader, start=2):
        _add_config_row_from_csv_dict(config, row, row_number, source_name)

    return config


def _read_rail_config_from_json_text(json_text: str, source_name: str) -> Dict[str, RailConfigRow]:
    config: Dict[str, RailConfigRow] = {}
    parsed = json.loads(json_text)

    rows: List[Tuple[str, dict]] = []
    if isinstance(parsed, list):
        for index, row in enumerate(parsed, start=1):
            if isinstance(row, dict):
                row_name = str(row.get("Name") or row.get("RowName") or row.get("---") or "")
                rows.append((row_name, row))
    elif isinstance(parsed, dict):
        row_source = parsed.get("Rows") if isinstance(parsed.get("Rows"), dict) else parsed
        if isinstance(row_source, dict):
            for row_name, row in row_source.items():
                if isinstance(row, dict):
                    row_copy = dict(row)
                    row_copy.setdefault("RowName", str(row_name))
                    rows.append((str(row_name), row_copy))

    for index, (row_name, row) in enumerate(rows, start=1):
        row_copy = dict(row)
        if row_name:
            row_copy.setdefault("RowName", row_name)
        _add_config_row_from_csv_dict(config, row_copy, index, source_name)

    return config


def _load_data_table():
    normalized = _normalize_asset_ref(RAIL_CONFIG_DATA_TABLE_REF)
    if not normalized:
        _warn(f"Invalid DataTable ref: {RAIL_CONFIG_DATA_TABLE_REF}")
        return None

    object_path, package_path = normalized
    for path in (package_path, object_path):
        try:
            asset = unreal.EditorAssetLibrary.load_asset(path)
        except Exception:
            asset = None
        if asset:
            return asset

    _warn(f"Rail config DataTable not found: {RAIL_CONFIG_DATA_TABLE_REF}")
    return None


def _get_data_table_row_names(data_table) -> List:
    try:
        return list(unreal.DataTableFunctionLibrary.get_data_table_row_names(data_table))
    except Exception:
        pass

    for method_name in ("get_row_names", "get_table_row_names"):
        method = getattr(data_table, method_name, None)
        if method:
            try:
                return list(method())
            except Exception:
                pass

    row_map = _get_data_table_row_map(data_table)
    if row_map:
        return list(row_map.keys())

    return []


def _get_data_table_row_map(data_table):
    method = getattr(data_table, "get_row_map", None)
    if method:
        try:
            return method()
        except Exception:
            pass
    return {}


def _get_data_table_row(data_table, row_name, row_map):
    if row_map:
        for key in (row_name, str(row_name)):
            try:
                if key in row_map:
                    return row_map[key]
            except Exception:
                pass
        for key, value in row_map.items():
            if str(key) == str(row_name):
                return value

    try:
        result = unreal.DataTableFunctionLibrary.get_data_table_row_from_name(data_table, row_name)
        if isinstance(result, tuple):
            if len(result) >= 2 and result[0]:
                return result[1]
            if len(result) == 1:
                return result[0]
        elif result:
            return result
    except Exception:
        pass

    method = getattr(data_table, "get_row", None)
    if method:
        try:
            return method(row_name)
        except Exception:
            pass

    return None


def _get_row_ref_text(row, property_names: Sequence[str]) -> str:
    if row is None:
        return ""

    target_names = {_normalize_property_name(property_name) for property_name in property_names}

    if isinstance(row, dict):
        for key, value in row.items():
            if _normalize_property_name(str(key)) in target_names:
                text = _ref_value_to_text(value)
                if text:
                    return text

    for property_name in property_names:
        try:
            value = row.get_editor_property(property_name)
            text = _ref_value_to_text(value)
            if text:
                return text
        except Exception:
            pass

    for property_name in property_names:
        for attr_name in (property_name, _camel_to_snake(property_name), property_name.lower()):
            if hasattr(row, attr_name):
                text = _ref_value_to_text(getattr(row, attr_name))
                if text:
                    return text

    for attr_name in dir(row):
        if not attr_name or attr_name.startswith("_"):
            continue
        normalized_attr_name = _normalize_property_name(attr_name)
        if not any(target in normalized_attr_name for target in target_names):
            continue
        try:
            text = _ref_value_to_text(getattr(row, attr_name))
            if text:
                return text
        except Exception:
            pass

    return ""


def _camel_to_snake(value: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", value).lower()


def _normalize_property_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _ref_value_to_text(value) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return "" if value.strip().lower() == "none" else value.strip()

    for method_name in ("get_asset_path_string", "to_string", "get_path_name"):
        method = getattr(value, method_name, None)
        if method:
            try:
                text = str(method()).strip()
                if text and text.lower() != "none":
                    return text
            except Exception:
                pass

    text = str(value).strip()
    return "" if text.lower() == "none" else text


def _rail_refs_from_text(column_name: str, raw_ref: str) -> List[RailRef]:
    normalized = _normalize_asset_ref(raw_ref)
    if not normalized:
        return []
    object_path, package_path = normalized
    return [RailRef(column_name, raw_ref, object_path, package_path, True)]


def _derive_actor_refs_from_mesh_refs(row_name: str, mesh_refs: Sequence[RailRef]) -> List[RailRef]:
    refs: List[RailRef] = []
    for mesh_ref in mesh_refs:
        package_path = mesh_ref.package_path
        if "/Proxy/" in package_path:
            rail_folder = package_path.split("/Proxy/", 1)[0]
        else:
            rail_folder = package_path.rsplit("/", 1)[0]

        for bp_name in _derived_bp_names(row_name, mesh_ref.package_path):
            object_path = f"{rail_folder}/{bp_name}.{bp_name}"
            refs.append(RailRef("DerivedBP", object_path, object_path, object_path.split(".", 1)[0], True))

    return refs


def _derived_bp_names(row_name: str, mesh_package_path: str) -> List[str]:
    names = [row_name]

    folder_name = mesh_package_path.rsplit("/Proxy/", 1)[0].rsplit("/", 1)[-1]
    if folder_name:
        names.append(f"BP_{folder_name}_Rail")

    mesh_name = mesh_package_path.rsplit("/", 1)[-1]
    match = re.match(r"SM_(.+?)_Proxy(?:_[A-Za-z0-9]+)?$", mesh_name)
    if match:
        names.append(f"BP_{match.group(1)}_Rail")

    return _unique_strings(names)


def _append_unique_refs(target: List[RailRef], incoming: Iterable[RailRef]) -> None:
    known = {item.object_path for item in target}
    for item in incoming:
        if item.object_path not in known:
            target.append(item)
            known.add(item.object_path)


def _layout_rails(layout: dict) -> List[dict]:
    rails = layout.get("Rail")
    if not isinstance(rails, list):
        raise RuntimeError("Layout JSON must contain a Rail array.")
    return rails


def _rail_id(rail: dict) -> str:
    value = rail.get("Rail_ID") or rail.get("Name")
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"Rail entry is missing Rail_ID/Name: {rail}")
    return value.strip()


def _log_reference_report(report: dict) -> None:
    missing_rows = report.get("missing_rows", [])
    empty_refs = report.get("empty_refs", [])
    class_failures = report.get("class_failures", [])

    if missing_rows:
        _warn("These Rail_ID values did not match any config row name or alias:")
        for rail_id in sorted(set(missing_rows)):
            _warn(f"  - {rail_id}")

    if empty_refs:
        _warn("These Rail_ID values matched a config row, but RailClassRef was empty or unreadable:")
        for rail_id in sorted(set(empty_refs)):
            _warn(f"  - {rail_id}")

    if class_failures:
        _warn("These Rail_ID values had RailClassRef candidates, but class loading failed:")
        for rail_id, message in class_failures:
            _warn(f"  - {rail_id}: {message}")


def _actor_ref_candidates(config_row: RailConfigRow) -> List[RailRef]:
    return config_row.actor_refs or config_row.derived_actor_refs


def _load_actor_class(path: str):
    if not path:
        return None

    for candidate in _class_path_candidates(path):
        try:
            obj = unreal.load_object(None, candidate)
            actor_class = _coerce_actor_class(obj)
            if actor_class:
                return actor_class
        except Exception:
            pass

    try:
        loaded = unreal.EditorAssetLibrary.load_blueprint_class(path)
        actor_class = _coerce_actor_class(loaded)
        if actor_class:
            return actor_class
    except Exception:
        pass

    asset = unreal.EditorAssetLibrary.load_asset(path)
    actor_class = _coerce_actor_class(asset)
    if actor_class:
        return actor_class

    raise RuntimeError(f"Failed to load actor class: {path}")


def _class_path_candidates(path: str) -> List[str]:
    candidates = []
    clean = str(path).strip()
    if not clean:
        return candidates

    candidates.append(clean)
    if clean.endswith("_C"):
        return _unique_strings(candidates)

    if "." in clean:
        candidates.append(f"{clean}_C")
    else:
        asset_name = clean.rsplit("/", 1)[-1]
        candidates.append(f"{clean}.{asset_name}_C")
        candidates.append(f"{clean}_C")

    return _unique_strings(candidates)


def _unique_strings(values: Sequence[str]) -> List[str]:
    result = []
    seen = set()
    for value in values:
        if value not in seen:
            result.append(value)
            seen.add(value)
    return result


def _coerce_actor_class(obj):
    if not obj:
        return None

    if _is_loaded_class(obj):
        return obj

    generated = None
    try:
        generated = obj.generated_class()
    except Exception:
        pass

    if not generated:
        try:
            generated = obj.get_editor_property("generated_class")
        except Exception:
            pass

    if generated and _is_loaded_class(generated):
        return generated

    return None


def _load_first_actor_class(refs: Sequence[RailRef]):
    failures = []
    for ref in refs:
        for path in (ref.object_path, ref.package_path):
            try:
                actor_class = _load_actor_class(path)
                return actor_class, ref
            except Exception as exc:
                failures.append(f"{path}: {exc}")
    raise RuntimeError("Failed to load any BP/Class candidate:\n" + "\n".join(failures[:8]))


def _resolve_rail_classes(rails: Sequence[dict], config: Dict[str, RailConfigRow]) -> Tuple[Dict[str, object], Dict[str, str], dict]:
    class_cache = {}
    rail_cache_keys = {}
    report = {"missing_rows": [], "empty_refs": [], "class_failures": []}

    for rail in rails:
        rail_id = _rail_id(rail)
        row = config.get(rail_id)
        if not row:
            report["missing_rows"].append(rail_id)
            continue

        refs = _actor_ref_candidates(row)
        if not refs:
            report["empty_refs"].append(rail_id)
            continue

        cache_key = "|".join(ref.object_path for ref in refs)
        rail_cache_keys[rail_id] = cache_key
        if cache_key in class_cache:
            continue

        try:
            actor_class, resolved_ref = _load_first_actor_class(refs)
            class_cache[cache_key] = actor_class
            _log(f"Resolved {rail_id} to class {_object_name(actor_class)} via {resolved_ref.object_path}")
        except Exception as exc:
            report["class_failures"].append((rail_id, str(exc).splitlines()[0]))

    return class_cache, rail_cache_keys, report


def _is_loaded_class(obj) -> bool:
    try:
        class_name = obj.get_class().get_name()
    except Exception:
        return False

    if class_name not in ("Class", "BlueprintGeneratedClass"):
        return False

    try:
        if hasattr(obj, "is_child_of"):
            return bool(obj.is_child_of(unreal.Actor))
    except Exception:
        pass

    try:
        default_object = obj.get_default_object()
        return unreal.Actor.cast(default_object) is not None
    except Exception:
        return True


def _number_from_json(value: dict, keys: Sequence[str], default: float = 0.0) -> float:
    if not isinstance(value, dict):
        return default
    for key in keys:
        raw_value = value.get(key)
        if raw_value is None or raw_value == "":
            continue
        try:
            return float(raw_value)
        except (TypeError, ValueError):
            continue
    return default


def _vec_from_json(value: dict) -> unreal.Vector:
    return unreal.Vector(
        _number_from_json(value, ("x", "X")) * LOCATION_SCALE + LOCATION_OFFSET.x,
        _number_from_json(value, ("y", "Y")) * LOCATION_SCALE + LOCATION_OFFSET.y,
        _number_from_json(value, ("z", "Z")) * LOCATION_SCALE + LOCATION_OFFSET.z,
    )


def _vec_from_grid_json(value: dict) -> unreal.Vector:
    return unreal.Vector(
        _number_from_json(value, ("x", "X")) * GRID_TO_WORLD * LOCATION_SCALE + LOCATION_OFFSET.x,
        _number_from_json(value, ("y", "Y")) * GRID_TO_WORLD * LOCATION_SCALE + LOCATION_OFFSET.y,
        _number_from_json(value, ("z", "Z")) * GRID_TO_WORLD * LOCATION_SCALE + LOCATION_OFFSET.z,
    )


def _rot_from_json(value: dict) -> unreal.Rotator:
    # IMPORTANT: Use keyword args for unreal.Rotator. Different UE Python bindings may
    # interpret positional args as (Roll, Pitch, Yaw) instead of (Pitch, Yaw, Roll),
    # which would swap axes (e.g. roll=90 becomes yaw=90).
    if isinstance(value, dict) and any(key in value for key in ("x", "X", "z", "Z")):
        pitch = _number_from_json(value, ("y", "Y", "pitch", "Pitch", "p", "P"))
        yaw = _number_from_json(value, ("z", "Z", "yaw", "Yaw"))
        roll = _number_from_json(value, ("x", "X", "roll", "Roll", "r", "R"))
    else:
        pitch = _number_from_json(value, ("p", "P", "pitch", "Pitch"))
        yaw = _number_from_json(value, ("y", "Y", "yaw", "Yaw"))
        roll = _number_from_json(value, ("r", "R", "roll", "Roll"))

    if MIRROR_VIEWER_Y_AXIS:
        yaw = -yaw
        roll = -roll

    return unreal.Rotator(
        pitch=pitch + ROTATION_OFFSET.pitch,
        yaw=yaw + ROTATION_OFFSET.yaw,
        roll=roll + ROTATION_OFFSET.roll,
    )


def _rail_location(rail: dict) -> unreal.Vector:
    for key in ("Pos_Abs", "Location", "Position"):
        value = rail.get(key)
        if isinstance(value, dict):
            return _vec_from_json(value)
    value = rail.get("Pos_Rev")
    if isinstance(value, dict):
        return _vec_from_grid_json(value)
    return _vec_from_json({})


def _rail_rotation(rail: dict) -> unreal.Rotator:
    for key in ("Rot_Abs", "Rotation", "Rotator"):
        value = rail.get(key)
        if isinstance(value, dict):
            return _rot_from_json(value)
    return _rot_from_json({})


def _set_actor_transform(actor, location: unreal.Vector, rotation: unreal.Rotator) -> None:
    try:
        actor.set_actor_location(location, False, False)
    except TypeError:
        actor.set_actor_location(location, False)
    try:
        actor.set_actor_rotation(rotation, False)
    except TypeError:
        actor.set_actor_rotation(rotation)


def _position_key(location: unreal.Vector) -> Tuple[float, float, float]:
    return (round(float(location.x), 3), round(float(location.y), 3), round(float(location.z), 3))


def _log_position_summary(rails: Sequence[dict]) -> None:
    if not rails:
        return

    positions = [_position_key(_rail_location(rail)) for rail in rails]
    unique_positions = len(set(positions))
    first_position = positions[0]
    if unique_positions == 1 and len(positions) > 1:
        _warn(
            "All importable rails parsed to the same location "
            f"{first_position}; check JSON Pos_Abs/Location fields if they should differ."
        )
        return

    _log(f"Parsed rail locations: {unique_positions} unique / {len(positions)} rails; first {first_position}.")


def _spawn_actor(actor_class, location: unreal.Vector, rotation: unreal.Rotator, label: str):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, location, rotation)
    if not actor:
        raise RuntimeError(f"Failed to spawn actor: {label}")
    actor.set_actor_label(label, mark_dirty=True)
    try:
        actor.set_folder_path(FOLDER_PATH)
    except Exception:
        pass
    _set_actor_transform(actor, location, rotation)
    return actor


def _all_level_actors() -> Iterable:
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "get_all_level_actors"):
            return subsystem.get_all_level_actors()
    return unreal.EditorLevelLibrary.get_all_level_actors()


def _destroy_actor(actor) -> bool:
    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "destroy_actor"):
            return bool(subsystem.destroy_actor(actor))
    return bool(unreal.EditorLevelLibrary.destroy_actor(actor))


def _clear_existing_folder() -> int:
    if not CLEAR_EXISTING_IN_FOLDER:
        return 0

    destroyed = 0
    for actor in list(_all_level_actors()):
        try:
            folder = str(actor.get_folder_path())
        except Exception:
            folder = ""
        if (folder == FOLDER_PATH or folder.startswith(f"{FOLDER_PATH}/")) and _destroy_actor(actor):
            destroyed += 1
    return destroyed


def _set_selected_actors(actors: Sequence) -> None:
    if not SELECT_SPAWNED_ACTORS:
        return

    if hasattr(unreal, "EditorActorSubsystem"):
        subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        if subsystem and hasattr(subsystem, "set_selected_level_actors"):
            subsystem.set_selected_level_actors(list(actors))
            return

    unreal.EditorLevelLibrary.set_selected_level_actors(list(actors))


def _safe_label(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]+", "_", text)


def _object_name(obj) -> str:
    try:
        return obj.get_name()
    except Exception:
        return str(obj)


def _grid_extent_from_layout(rails: Sequence[dict]) -> int:
    max_abs = 0
    for rail in rails:
        cells = rail.get("Occupied_Cells_Rev") or [rail.get("Pos_Rev") or {}]
        for cell in cells:
            max_abs = max(max_abs, abs(int(cell.get("x", 0))), abs(int(cell.get("y", 0))))
    return max(1, max_abs * 2 + 1)


def _bottom_spec_from_maze_grid(grid_size: int) -> Tuple[str, float]:
    maze_abs = grid_size * GRID_TO_WORLD
    diagonal_grid = int(math.sqrt(maze_abs * maze_abs * 2.0) / GRID_TO_WORLD) + 1
    boundary_half = diagonal_grid * GRID_TO_WORLD * 0.5
    bottom_z = -boundary_half - GRID_TO_WORLD

    if grid_size <= 4:
        bottom_type = "1x1"
    elif grid_size <= 7:
        bottom_type = "2x2"
    elif grid_size <= 11:
        bottom_type = "3x3"
    else:
        bottom_type = "4x4"
    return bottom_type, bottom_z


def _place_maze_helper_actors(rails: Sequence[dict]) -> List:
    spawned = []

    if BP_MAZE_CLASS_PATH:
        spawned.append(_spawn_actor(_load_actor_class(BP_MAZE_CLASS_PATH), unreal.Vector(0.0, 0.0, 0.0), unreal.Rotator(0.0, 0.0, 0.0), "BP_Maze"))
    else:
        _warn("BP_MAZE_CLASS_PATH is empty; BP_Maze was not placed.")

    grid_size = _grid_extent_from_layout(rails)
    boundary_half_cm = ((grid_size - 1) * 0.5 * GRID_TO_WORLD) + 8.0

    if BP_MAZE_BOUNDARY_CLASS_PATH:
        actor = _spawn_actor(_load_actor_class(BP_MAZE_BOUNDARY_CLASS_PATH), unreal.Vector(0.0, 0.0, 0.0), unreal.Rotator(0.0, 0.0, 0.0), "BP_MazeBoundary")
        _try_set_editor_property(actor, ("BoundaryHalfSize", "HalfSize", "MazeHalfSize", "Size"), boundary_half_cm)
        spawned.append(actor)
    else:
        _warn("BP_MAZE_BOUNDARY_CLASS_PATH is empty; BP_MazeBoundary was not placed.")

    bottom_type, bottom_z = _bottom_spec_from_maze_grid(grid_size)
    bottom_path = BP_MAZE_BOTTOM_CLASS_PATHS.get(bottom_type, "")
    if bottom_path:
        spawned.append(_spawn_actor(_load_actor_class(bottom_path), unreal.Vector(0.0, 0.0, bottom_z), unreal.Rotator(0.0, 0.0, 0.0), f"BP_MazeBottom_{bottom_type}"))
    else:
        _warn(f"BP_MAZE_BOTTOM_CLASS_PATHS['{bottom_type}'] is empty; BP_MazeBottom was not placed.")

    return spawned


def _try_set_editor_property(actor, names: Sequence[str], value) -> None:
    for name in names:
        try:
            actor.set_editor_property(name, value)
            return
        except Exception:
            pass


def _pick_layout_json() -> Optional[Path]:
    if not PROMPT_FOR_JSON_ON_RUN:
        return None

    default_dir = str(Path(LAYOUT_JSON_PATH).parent if LAYOUT_JSON_PATH else DEFAULT_LAYOUT_JSON.parent)

    try:
        if hasattr(unreal, "DesktopPlatformLibrary"):
            result = unreal.DesktopPlatformLibrary.open_file_dialog(
                None,
                "Select Maze Layout JSON",
                default_dir,
                "",
                "JSON files (*.json)|*.json",
                0,
            )
            paths = result[0] if isinstance(result, tuple) else result
            if paths:
                return Path(str(paths[0]))
    except Exception as exc:
        _warn(f"Unreal DesktopPlatform file picker unavailable: {exc}")

    picked = _pick_layout_json_windows(default_dir)
    if picked:
        return picked

    return None


def _pick_layout_json_windows(default_dir: str) -> Optional[Path]:
    try:
        import ctypes
        from ctypes import wintypes
    except Exception as exc:
        _warn(f"Windows file picker unavailable: {exc}")
        return None

    class OPENFILENAMEW(ctypes.Structure):
        _fields_ = [
            ("lStructSize", wintypes.DWORD),
            ("hwndOwner", wintypes.HWND),
            ("hInstance", wintypes.HINSTANCE),
            ("lpstrFilter", wintypes.LPCWSTR),
            ("lpstrCustomFilter", wintypes.LPWSTR),
            ("nMaxCustFilter", wintypes.DWORD),
            ("nFilterIndex", wintypes.DWORD),
            ("lpstrFile", wintypes.LPWSTR),
            ("nMaxFile", wintypes.DWORD),
            ("lpstrFileTitle", wintypes.LPWSTR),
            ("nMaxFileTitle", wintypes.DWORD),
            ("lpstrInitialDir", wintypes.LPCWSTR),
            ("lpstrTitle", wintypes.LPCWSTR),
            ("Flags", wintypes.DWORD),
            ("nFileOffset", wintypes.WORD),
            ("nFileExtension", wintypes.WORD),
            ("lpstrDefExt", wintypes.LPCWSTR),
            ("lCustData", wintypes.LPARAM),
            ("lpfnHook", wintypes.LPVOID),
            ("lpTemplateName", wintypes.LPCWSTR),
            ("pvReserved", wintypes.LPVOID),
            ("dwReserved", wintypes.DWORD),
            ("FlagsEx", wintypes.DWORD),
        ]

    buffer = ctypes.create_unicode_buffer(32768)
    ofn = OPENFILENAMEW()
    ofn.lStructSize = ctypes.sizeof(OPENFILENAMEW)
    try:
        ofn.hwndOwner = ctypes.windll.user32.GetActiveWindow()
    except Exception:
        ofn.hwndOwner = None
    ofn.lpstrFilter = "JSON files (*.json)\0*.json\0All files (*.*)\0*.*\0\0"
    ofn.nFilterIndex = 1
    ofn.lpstrFile = ctypes.cast(buffer, wintypes.LPWSTR)
    ofn.nMaxFile = len(buffer)
    ofn.lpstrInitialDir = default_dir
    ofn.lpstrTitle = "Select Maze Layout JSON"
    ofn.lpstrDefExt = "json"
    ofn.Flags = 0x00000008 | 0x00000800 | 0x00001000

    try:
        if ctypes.windll.comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
            return Path(buffer.value)
        error_code = ctypes.windll.comdlg32.CommDlgExtendedError()
        if error_code:
            _warn(f"Windows file picker failed with CommDlgExtendedError={error_code}.")
    except Exception as exc:
        _warn(f"Windows file picker failed: {exc}")

    return None


def _resolve_layout_json(layout_json: Optional[Path]) -> Path:
    if layout_json:
        return _resolve_path(Path(layout_json))

    if PROMPT_FOR_JSON_ON_RUN:
        picked = _pick_layout_json()
        if picked:
            return picked

    if LAYOUT_JSON_PATH:
        return _resolve_path(Path(LAYOUT_JSON_PATH))

    raise RuntimeError(
        "No layout JSON selected. Pick a JSON file in the file dialog, set "
        "LAYOUT_JSON_PATH at the top of this script, or call import_json_rails(r'path/to/layout.json')."
    )


def _resolve_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    return REPO_ROOT / path


def import_json_rails(layout_json: Optional[Path] = None, rail_config_csv: Path = DEFAULT_RAIL_CONFIG_CSV) -> List:
    layout_json = _resolve_layout_json(layout_json)
    layout = _read_json(layout_json)
    rails = _layout_rails(layout)
    config = _read_rail_config(rail_config_csv)

    class_cache, rail_cache_keys, reference_report = _resolve_rail_classes(rails, config)
    _log_reference_report(reference_report)
    importable_rails = [_rail for _rail in rails if rail_cache_keys.get(_rail_id(_rail)) in class_cache]
    skipped_count = len(rails) - len(importable_rails)
    if not importable_rails:
        raise RuntimeError("No rails could be resolved to a loadable class; nothing was imported.")
    if skipped_count:
        _warn(f"Skipping {skipped_count} unresolved rails; importing {len(importable_rails)} resolved rails.")

    destroyed = _clear_existing_folder()
    if destroyed:
        _log(f"Cleared {destroyed} existing actors from folder '{FOLDER_PATH}'.")

    spawned = _place_maze_helper_actors(rails)
    total_refs = len(importable_rails)

    map_meta = layout.get("MapMeta", {})
    level_name = map_meta.get("LevelName", layout_json.stem)
    _log(f"Placing {len(importable_rails)} rails / {total_refs} actor refs from '{level_name}'.")
    _log_position_summary(importable_rails)

    with unreal.ScopedSlowTask(max(1, total_refs), "Importing JSON rails...") as task:
        task.make_dialog(True)

        for rail in importable_rails:
            if task.should_cancel():
                break

            rail_id = _rail_id(rail)
            rail_index = rail.get("Rail_Index", "?")
            location = _rail_location(rail)
            rotation = _rail_rotation(rail)

            task.enter_progress_frame(1, f"{rail_index}: {rail_id}")
            cache_key = rail_cache_keys[rail_id]

            label = f"MazeRail_{rail_index}_{_safe_label(rail_id)}"
            actor = _spawn_actor(class_cache[cache_key], location, rotation, label)
            _try_set_editor_property(actor, ("Rail_ID", "RailID", "RailId", "RowName", "RailRowName", "ConfigRowName"), rail_id)
            spawned.append(actor)

    _set_selected_actors(spawned)
    _log(f"Done. Spawned {len(spawned)} actors into folder '{FOLDER_PATH}'.")
    return spawned


if __name__ == "__main__":
    import_json_rails()

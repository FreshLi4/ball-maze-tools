"""Report Unreal asset references that cross a selected folder boundary."""

from __future__ import annotations

import csv
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

try:
    import unreal
except ImportError as exc:
    raise RuntimeError("This script must be run inside Unreal Editor Python.") from exc


# Leave empty to open a save dialog. A configured path is used directly only
# when it ends in .csv and its parent directory already exists.
DEFAULT_OUTPUT_CSV = ""

MODE_REFERENCED_BY = "referenced_by"
MODE_REFERENCING = "referencing"
MODE_BOTH = "both"

_PREFIX = "[FolderReferenceChecker]"


@dataclass(frozen=True)
class ExternalReference:
    name: str
    package_name: str


@dataclass(frozen=True)
class AssetReport:
    name: str
    package_name: str
    relative_path: str
    referenced_by: Tuple[ExternalReference, ...]
    referencing: Tuple[ExternalReference, ...]


def _log(message: str) -> None:
    unreal.log(f"{_PREFIX} {message}")


def _warn(message: str) -> None:
    unreal.log_warning(f"{_PREFIX} {message}")


def _show_message(title: str, message: str) -> None:
    _log(message)
    try:
        unreal.EditorDialog.show_message(title, message, unreal.AppMsgType.OK)
    except Exception as exc:
        _warn(f"Unable to show Unreal message dialog: {exc}")


def _normalize_package_name(value: object) -> str:
    return str(value).split(".", 1)[0].rstrip("/")


def _asset_name(package_name: str) -> str:
    return package_name.rsplit("/", 1)[-1]


def _is_inside(package_name: str, root_path: str) -> bool:
    return package_name == root_path or package_name.startswith(f"{root_path}/")


def _relative_path(package_name: str, root_path: str) -> str:
    if package_name == root_path:
        return _asset_name(package_name)
    if _is_inside(package_name, root_path):
        return package_name[len(root_path) + 1 :]
    return package_name


def _dependency_options() -> object:
    options = unreal.AssetRegistryDependencyOptions()
    values = {
        "include_hard_package_references": True,
        "include_soft_package_references": True,
        "include_searchable_names": False,
        "include_soft_management_references": True,
        "include_hard_management_references": True,
    }
    for name, value in values.items():
        try:
            setattr(options, name, value)
        except Exception:
            options.set_editor_property(name, value)
    return options


def _selected_root_path() -> str:
    if hasattr(unreal.EditorUtilityLibrary, "get_current_content_browser_path"):
        current_path = unreal.EditorUtilityLibrary.get_current_content_browser_path()
        if current_path:
            return _normalize_package_name(current_path)

    selected_folders = unreal.EditorUtilityLibrary.get_selected_folder_paths()
    if selected_folders:
        if len(selected_folders) > 1:
            _warn(f"Multiple folders selected; using the first one: {selected_folders[0]}")
        return _normalize_package_name(selected_folders[0])

    selected_assets = unreal.EditorUtilityLibrary.get_selected_asset_data()
    if selected_assets:
        return _normalize_package_name(selected_assets[0].package_path)

    raise RuntimeError("Open or select one Content Browser folder before running the script.")


def _query_packages(asset_registry: object, method_name: str, package_name: str, options: object) -> List[str]:
    method = getattr(asset_registry, method_name)
    try:
        values = method(package_name, options)
    except TypeError:
        values = method(package_name)
    return sorted({_normalize_package_name(value) for value in values if str(value)})


def _query_confirmed_referencers(package_name: str) -> List[str]:
    finder = getattr(unreal.EditorAssetLibrary, "find_package_referencers_for_asset", None)
    if finder is None:
        subsystem_class = getattr(unreal, "EditorAssetSubsystem", None)
        get_subsystem = getattr(unreal, "get_editor_subsystem", None)
        if subsystem_class is not None and get_subsystem is not None:
            subsystem = get_subsystem(subsystem_class)
            finder = getattr(subsystem, "find_package_referencers_for_asset", None)
    if finder is None:
        raise RuntimeError("Unable to access Unreal package referencer confirmation API.")
    try:
        values = finder(package_name, True)
    except Exception as exc:
        _warn(f"Unable to confirm package referencers for {package_name}: {exc}")
        return []
    return sorted({_normalize_package_name(value) for value in values if str(value)})


def _external_references(package_names: Iterable[str], root_path: str) -> Tuple[ExternalReference, ...]:
    return tuple(
        ExternalReference(_asset_name(package_name), package_name)
        for package_name in package_names
        if not _is_inside(package_name, root_path)
    )


def _scan(mode: str) -> Tuple[str, List[AssetReport]]:
    root_path = _selected_root_path()
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    options = _dependency_options()
    asset_data = registry.get_assets_by_path(root_path, recursive=True)
    packages = sorted({_normalize_package_name(data.package_name) for data in asset_data})

    _log(f"Scanning {len(packages)} assets under {root_path}.")
    reports: List[AssetReport] = []
    with unreal.ScopedSlowTask(len(packages), "Checking external asset references...") as task:
        task.make_dialog(True)
        for package_name in packages:
            if task.should_cancel():
                _warn("Scan cancelled by user. Exporting the partial report.")
                break
            task.enter_progress_frame(1, package_name)
            referenced_by: Tuple[ExternalReference, ...] = ()
            referencing: Tuple[ExternalReference, ...] = ()
            if mode in (MODE_REFERENCED_BY, MODE_BOTH):
                referenced_by = _external_references(
                    _query_confirmed_referencers(package_name),
                    root_path,
                )
            if mode in (MODE_REFERENCING, MODE_BOTH):
                referencing = _external_references(
                    _query_packages(registry, "get_dependencies", package_name, options),
                    root_path,
                )
            if referenced_by or referencing:
                reports.append(
                    AssetReport(
                        name=_asset_name(package_name),
                        package_name=package_name,
                        relative_path=_relative_path(package_name, root_path),
                        referenced_by=referenced_by,
                        referencing=referencing,
                    )
                )
    return root_path, reports


def _format_relationship(label: str, references: Sequence[ExternalReference]) -> str:
    values = "; ".join(f"{item.name} - [{item.package_name}]" for item in references)
    return f"{label}: {values or '(none)'}"


def _format_message(root_path: str, reports: Sequence[AssetReport], mode: str) -> str:
    lines = [f"Folder: {root_path}", f"Assets with external references: {len(reports)}", ""]
    if not reports:
        lines.append("No references crossing the selected folder boundary were found.")
        return "\n".join(lines)
    for report in reports:
        parts = [f"{report.name} - {report.relative_path}"]
        if mode in (MODE_REFERENCED_BY, MODE_BOTH):
            parts.append(_format_relationship("Referenced By", report.referenced_by))
        if mode in (MODE_REFERENCING, MODE_BOTH):
            parts.append(_format_relationship("Referencing", report.referencing))
        lines.append("; ".join(parts))
    return "\n".join(lines)


def _configured_output_path() -> Optional[Path]:
    if not DEFAULT_OUTPUT_CSV.strip():
        return None
    path = Path(DEFAULT_OUTPUT_CSV).expanduser()
    if path.suffix.lower() == ".csv" and path.parent.is_dir():
        return path
    _warn(f"Configured CSV path is invalid; opening a save dialog: {path}")
    return None


def _safe_filename_part(value: str) -> str:
    invalid_characters = '<>:"/\\|?*'
    cleaned = "".join("_" if character in invalid_characters else character for character in value.strip())
    return cleaned.strip(" .") or "Content"


def _mode_filename_prefix(mode: str) -> str:
    values = {
        MODE_REFERENCED_BY: "referenced_by_external",
        MODE_REFERENCING: "referencing_external",
        MODE_BOTH: "external_references_both",
    }
    return values[mode]


def _default_csv_filename(mode: str, root_path: str) -> str:
    folder_name = _safe_filename_part(root_path.rsplit("/", 1)[-1])
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{_mode_filename_prefix(mode)}-{folder_name}-{timestamp}.csv"


def _prompt_windows_output_path(mode: str, root_path: str) -> Optional[Path]:
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class OpenFileNameW(ctypes.Structure):
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

        buffer = ctypes.create_unicode_buffer(_default_csv_filename(mode, root_path), 32768)
        dialog = OpenFileNameW()
        dialog.lStructSize = ctypes.sizeof(OpenFileNameW)
        dialog.lpstrFilter = "CSV files (*.csv)\0*.csv\0All files (*.*)\0*.*\0"
        dialog.lpstrFile = buffer
        dialog.nMaxFile = len(buffer)
        dialog.lpstrTitle = "Save Folder Reference Report"
        dialog.lpstrDefExt = "csv"
        dialog.Flags = 0x00000002 | 0x00000800
        if ctypes.windll.comdlg32.GetSaveFileNameW(ctypes.byref(dialog)):
            return Path(buffer.value)
        return None
    except Exception as exc:
        _warn(f"Native Windows save dialog unavailable: {exc}")
        return None


def _prompt_output_path(mode: str, root_path: str) -> Optional[Path]:
    windows_path = _prompt_windows_output_path(mode, root_path)
    if windows_path:
        return windows_path
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        _warn("tkinter is unavailable. Set DEFAULT_OUTPUT_CSV to export without a dialog.")
        return None

    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
        value = filedialog.asksaveasfilename(
            title="Save Folder Reference Report",
            defaultextension=".csv",
            filetypes=(("CSV files", "*.csv"), ("All files", "*.*")),
            initialfile=_default_csv_filename(mode, root_path),
        )
    finally:
        root.destroy()
    return Path(value) if value else None


def _column_count(reports: Sequence[AssetReport], attribute: str) -> int:
    return max((len(getattr(report, attribute)) for report in reports), default=0)


def _append_reference_headers(row: List[str], label: str, count: int) -> None:
    for index in range(1, count + 1):
        row.extend((f"{label} {index} Name", f"{label} {index} Path"))


def _append_reference_cells(row: List[str], references: Sequence[ExternalReference], count: int) -> None:
    for index in range(count):
        if index < len(references):
            row.extend((references[index].name, references[index].package_name))
        else:
            row.extend(("", ""))


def _write_csv(path: Path, reports: Sequence[AssetReport], mode: str) -> None:
    referenced_by_count = _column_count(reports, "referenced_by")
    referencing_count = _column_count(reports, "referencing")
    header = ["Asset Name", "Asset Relative Path", "Asset Package Path"]
    if mode in (MODE_REFERENCED_BY, MODE_BOTH):
        _append_reference_headers(header, "Referenced By", referenced_by_count)
    if mode in (MODE_REFERENCING, MODE_BOTH):
        _append_reference_headers(header, "Referencing", referencing_count)

    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(header)
        for report in reports:
            row = [report.name, report.relative_path, report.package_name]
            if mode in (MODE_REFERENCED_BY, MODE_BOTH):
                _append_reference_cells(row, report.referenced_by, referenced_by_count)
            if mode in (MODE_REFERENCING, MODE_BOTH):
                _append_reference_cells(row, report.referencing, referencing_count)
            writer.writerow(row)
    _log(f"Saved CSV report: {path}")


def run(mode: str) -> None:
    if mode not in (MODE_REFERENCED_BY, MODE_REFERENCING, MODE_BOTH):
        raise ValueError(f"Unsupported mode: {mode}")
    try:
        root_path, reports = _scan(mode)
        message = _format_message(root_path, reports, mode)
        _show_message("Folder Reference Checker", message)
        output_path = _configured_output_path() or _prompt_output_path(mode, root_path)
        if output_path:
            _write_csv(output_path, reports, mode)
        else:
            _warn("CSV export cancelled or unavailable.")
    except Exception as exc:
        _show_message("Folder Reference Checker Error", str(exc))
        raise

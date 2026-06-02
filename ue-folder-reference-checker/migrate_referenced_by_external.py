"""Move externally referenced assets beside their first external referencer."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys
from typing import List, Sequence

import unreal

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from folder_reference_checker import MODE_REFERENCED_BY, AssetReport, _log, _scan, _show_message, _warn


MIGRATED_FOLDER_NAME = "ReferenceMigrated"


@dataclass(frozen=True)
class MigrationResult:
    source_path: str
    destination_path: str
    referencer_path: str
    status: str


def _parent_folder(package_name: str) -> str:
    return package_name.rsplit("/", 1)[0]


def _destination_path(report: AssetReport) -> str:
    first_referencer = report.referenced_by[0]
    return f"{_parent_folder(first_referencer.package_name)}/{MIGRATED_FOLDER_NAME}/{report.name}"


def _migrate_report(report: AssetReport) -> MigrationResult:
    first_referencer = report.referenced_by[0]
    destination_path = _destination_path(report)
    destination_folder = _parent_folder(destination_path)

    if unreal.EditorAssetLibrary.does_asset_exist(destination_path):
        return MigrationResult(
            source_path=report.package_name,
            destination_path=destination_path,
            referencer_path=first_referencer.package_name,
            status="skipped: destination asset already exists",
        )

    if not unreal.EditorAssetLibrary.does_directory_exist(destination_folder):
        unreal.EditorAssetLibrary.make_directory(destination_folder)

    if unreal.EditorAssetLibrary.rename_asset(report.package_name, destination_path):
        return MigrationResult(
            source_path=report.package_name,
            destination_path=destination_path,
            referencer_path=first_referencer.package_name,
            status="moved",
        )

    return MigrationResult(
        source_path=report.package_name,
        destination_path=destination_path,
        referencer_path=first_referencer.package_name,
        status="failed: Unreal could not move the asset",
    )


def _format_results(root_path: str, results: Sequence[MigrationResult]) -> str:
    moved = sum(result.status == "moved" for result in results)
    skipped = sum(result.status.startswith("skipped:") for result in results)
    failed = len(results) - moved - skipped
    lines = [
        f"Folder: {root_path}",
        f"Detected externally referenced assets: {len(results)}",
        f"Moved: {moved}; Skipped: {skipped}; Failed: {failed}",
        "",
    ]
    if not results:
        lines.append("No externally referenced assets were found.")
        return "\n".join(lines)
    for result in results:
        lines.append(
            f"{result.status}: {result.source_path} -> {result.destination_path}; "
            f"first referencer: {result.referencer_path}"
        )
    return "\n".join(lines)


def run() -> None:
    try:
        root_path, reports = _scan(MODE_REFERENCED_BY)
        results: List[MigrationResult] = []
        with unreal.ScopedSlowTask(len(reports), "Moving externally referenced assets...") as task:
            task.make_dialog(True)
            for report in reports:
                if task.should_cancel():
                    _warn("Migration cancelled by user. Reporting completed moves.")
                    break
                task.enter_progress_frame(1, report.package_name)
                try:
                    result = _migrate_report(report)
                except Exception as exc:
                    first_referencer = report.referenced_by[0]
                    result = MigrationResult(
                        source_path=report.package_name,
                        destination_path=_destination_path(report),
                        referencer_path=first_referencer.package_name,
                        status=f"failed: {exc}",
                    )
                results.append(result)
                _log(
                    f"{result.status}: {result.source_path} -> {result.destination_path}; "
                    f"first referencer: {result.referencer_path}"
                )
        _show_message("Folder Reference Migration", _format_results(root_path, results))
    except Exception as exc:
        _show_message("Folder Reference Migration Error", str(exc))
        raise


run()

# Folder Reference Checker Agent Notes

## Scope

This directory contains Unreal Editor Python scripts for reporting asset
references that cross the boundary of a selected Content Browser folder.

## Rules

- Read the root `AGENTS.md` before editing this tool.
- Keep Asset Registry queries package-based and avoid loading assets.
- Do not call Unreal Editor APIs from worker threads.
- Keep the three reporting entry scripts thin; shared reporting behavior
  belongs in `folder_reference_checker.py`.
- Keep migration behavior in its separate migration entry script so reporting
  scripts remain read-only.
- Run `python3 -m py_compile ue-folder-reference-checker/*.py` after edits.

## Docs

- Usage: `README.md`
- Requirements: `REQUIREMENTS.md`
- Visual guidance: `DESIGN.md`
- Execution logs: `agent-log/`

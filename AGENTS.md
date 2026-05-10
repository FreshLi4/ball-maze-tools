# Agent Notes

This file records repository-level rules for agents working in `ball-maze-tools`.

## General Rules

- Prefer reading existing code before editing.
- Keep changes scoped to the requested tool or module.
- Do not revert unrelated user changes.
- Use `rg` for searching.
- Use `apply_patch` for manual edits.

## Git Workflow

- Before starting each task, run `git pull`.
- If `git pull` fails or reports a conflict, stop and tell the user before continuing.
- After finishing a task successfully, commit and push the agent's changes.
- If commit or push fails, stop and tell the user before continuing.
- Do not include unrelated user changes in the commit unless the user explicitly asks for that.

## Documentation Layout

- Root `README.md`: user-facing overview of the whole tool suite.
- Root `PROGRESS.md`: cross-repository roadmap and status.
- Root `AGENTS.md`: general rules that apply to every tool.
- Tool `README.md`: user-facing usage and configuration for one tool.
- Tool `AGENTS.md`: tool-specific implementation rules, only when needed.
- Tool `PROGRESS.md`: tool-specific progress and known risks, only when needed.

## Tool-Specific Rules

Read a tool's local docs before editing it:

- `web-maze-builder/AGENTS.md` contains the authoritative Maze Builder generation, coordinate, footprint, exit, seed, checkpoint, and self-spin rules.
- `web-maze-builder/PROGRESS.md` contains the current Maze Builder implementation status and known risks.

For `web-maze-builder`, always run:

```bash
cd /Users/ddonlien/Documents/GitHub/ball-maze-tools/web-maze-builder
npm test
npm run build
```

If instructions elsewhere still mention `/Users/taobe/Documents/...` or the old `maze-builder` directory, treat that as an old path and use the current repository path above.

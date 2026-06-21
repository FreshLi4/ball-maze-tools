# P4 Command Line Source Control (UE5 Plugin)

A Perforce source control provider for Unreal Engine 5.3.2 that uses the `p4` CLI tool instead of the native `libclient` library to avoid macOS ABI crashes (`EXC_BAD_ACCESS` in `__cxxabiv1::__isOurExceptionClass()`).

## Structure

This plugin follows the skeleton of the built-in `GitSourceControl` plugin (renamed-pattern reference), adapted for Perforce CLI operations.

```
Source/P4CommandLineSourceControl/
  Public/
    P4CommandLineSourceControlModule.h       — Module bootstrap
    P4CommandLineSourceControlProvider.h     — ISourceControlProvider implementation
    P4CommandLineSourceControlState.h        — ISourceControlState implementation (fstat parsing)
    P4CommandLineSourceControlRevision.h     — ISourceControlRevision implementation (filelog)
    P4CommandLineSourceControlOperations.h   — Operation type declarations (CheckOut, Revert, Add, etc.)
    P4CommandLineSourceControlCommand.h      — p4 process wrapper
    P4CommandLineSourceControlUtils.h        — Parser helpers for fstat/filelog/annotate
    P4CommandLineSourceControlSettings.h     — UObject settings (P4PORT, P4USER, P4CLIENT, P4PASSWD)
  Private/
    P4CommandLineSourceControlModule.cpp
    P4CommandLineSourceControlProvider.cpp   — Command dispatch: p4 edit/add/delete/move/revert/submit/filelog/annotate
    P4CommandLineSourceControlState.cpp      — State predicates (IsCheckedOut, IsAdded, etc.)
    P4CommandLineSourceControlRevision.cpp
    P4CommandLineSourceControlOperations.cpp
    P4CommandLineSourceControlCommand.cpp     — FPlatformProcess::CreatePipe + ExecProcess
    P4CommandLineSourceControlUtils.cpp      — ParseStatusResult, ParseFileLogResult, ParseAnnotateResult
    P4CommandLineSourceControlSettings.cpp   — Config read/write + env var fallback
```

## Requirements

See [`REQUIREMENTS.md`](REQUIREMENTS.md) for the full specification.

## Installation

1. Copy `ue/ue-p4-command-line-source-control` into your project's `Plugins/` directory (or Engine `Plugins/Developer/`).
2. Regenerate project files.
3. Enable **P4 Command Line Source Control** in Editor → Plugins → Source Control.
4. Set `P4PORT`, `P4USER`, `P4CLIENT`, `P4PASSWD` via:
   - Editor Project Settings → Perforce CLI, or
   - Environment variables (`P4PORT`, `P4USER`, `P4CLIENT`, `P4PASSWD`), or
   - `.p4config` file in the project root (the `p4` CLI will pick it up automatically).

## Usage

Once enabled, the editor's standard Source Control menu (Check Out, Submit, Revert, Diff, History, etc.) routes through the `p4` CLI.

Key behaviors:
- **Check Out** → `p4 edit <file>`
- **Revert** → `p4 revert -k <file>` (preserves local files)
- **Add** → `p4 add <file>`
- **Delete** → `p4 delete <file>`
- **Submit** → `p4 submit -d "<description>" <files>`
- **Update Status** → `p4 fstat -T "depotFile,clientFile,headRev,haveRev,action,otherOpen,otherOpen0,user"`
- **History** → `p4 filelog -l <file>`
- **Annotate** → `p4 annotate <file>`

## macOS ABI Crash Workaround

The native UE5 `PerforceSourceControl` plugin on macOS links against `libclient`, which can crash with `EXC_BAD_ACCESS` in `__cxxabiv1::__isOurExceptionClass()`. This plugin avoids that entirely by spawning the `p4` CLI process and parsing its text output.

## License

Copyright © Taobe. All rights reserved.

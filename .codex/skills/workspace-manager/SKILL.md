---
name: workspace-manager
description: Manage Setta in-app workspace panes through the `setta workspace` CLI. Use when an agent needs to inspect the active workspace, list or read pane descriptors and capabilities, focus, move, open, close, rename, resize, reorder panes, apply low-risk layout resize transactions, or verify workspace pane layout changes.
---

# Workspace Manager

## Overview

Use `setta workspace` as the authority for Setta's in-app workspace pane layout. The backend owns workspace identity, pane IDs, operation validation, persistence, revisions, audit context, and renderer synchronization.

Do not edit persisted UI state files, synthesize raw layout JSON as the mutation path, drive workspace panes through DOM events, or infer targets from pane titles.

## Workflow

1. Resolve the active workspace:

   ```bash
   setta workspace current
   ```

2. Read the current workspace UI schema before building JSON operation files:

   ```bash
   setta workspace schema
   ```

3. List panes and inspect capabilities:

   ```bash
   setta workspace panes list
   ```

   Select panes by stable `paneId`. Check `surfaceKind`, `focused`, `location`, `canFocus`, `canMove`, `canClosePane`, `surfaceCloseModes`, `readModes`, `writeModes`, and `contentRefs` before choosing an operation.

   Current per-pane capability fields explicitly cover focus, move, close-pane, surface close modes, and surface read/write modes. For layout commands without a dedicated capability field yet, such as rename, resize, reorder, open, and layout apply, use the schema plus the command contract and preserve the structured backend response for confirmation.

4. Read the target pane immediately before mutating:

   ```bash
   setta workspace panes read <pane-id>
   ```

5. Apply the smallest typed operation that satisfies the request.

6. Re-read the pane or pane list after mutation. Confirm the returned `workspaceId`, `revision`, `changed`, `operationResult`, `beforeAfterDimensions`, `warnings`, and resulting pane location/state instead of assuming success from command exit alone.

Pass `--app-data-dir DIR` to every command when targeting a non-default Setta runtime or temporary app data directory.

## Layout Commands

Use these commands for low-risk pane layout changes:

```bash
setta workspace panes focus <pane-id>
setta workspace panes move <pane-id> --direction left|right|up|down
setta workspace panes rename <pane-id> --title "Title"
setta workspace panes close <pane-id> --surface-close none
setta workspace panes open --input open-pane.json
setta workspace panes resize <pane-id> --width-px <n>
setta workspace panes resize <pane-id> --width-scale <n>
setta workspace panes resize <pane-id> --height-px <n>
setta workspace panes resize <pane-id> --height-scale <n>
setta workspace panes resize <pane-id> --reset-height
setta workspace panes reorder --input reorder.json
setta workspace layout apply --input layout-operations.json
```

`setta workspace layout apply` is for atomic multi-pane resize transactions. Its input is an object with an `operations` array currently limited to `resize_pane` operations. Use it when several pane dimensions must change together; otherwise prefer the single-pane `resize` command.

For JSON input files, follow the Go-owned contract in `internal/workspaceui/types.go` and the values returned by `setta workspace schema`. Do not copy generated TypeScript or old examples as the source of truth. Open operations must not include caller-supplied pane IDs; the backend assigns pane identity.

## Surface Boundaries

Treat workspace pane management as distinct from surface content control.

- Use workspace commands for pane metadata and layout only.
- Use `contentRefs` only as stable references into the owning surface domain.
- Do not send terminal input, chat messages, chat steering, workflow commands, browser input, or native-view input through workspace layout commands.
- Do not call a surface-domain command unless the pane's `surfaceKind`, `contentRefs`, and advertised modes support that surface and the user request explicitly needs content interaction.
- Stop and report unsupported capability when a required content reference or pane-targeted surface command is missing.

Current workspace CLI write support is layout-focused. Pane-targeted terminal, chat, workflow, and browser surface IO commands are future work unless a current domain-specific command is explicitly available and the target reference is unambiguous.

## Failure Policy

Fail loudly and preserve structured error output when:

- the `setta` CLI is unavailable
- no Setta runtime or active workspace is available
- runtime authorization fails
- `panes list` reports `layoutPresent: false`
- the target pane ID is absent
- more than one pane could satisfy a human description
- the requested operation is not supported by the pane capabilities or command contract
- `safe` or `force` surface close is requested but not supported
- an input JSON file contains mixed operation payloads or caller-owned pane identity
- a command returns a structured backend error, warning, or unchanged result that does not satisfy the request

Report the exact command attempted and the relevant JSON error, warning, or validation fields. Do not retry with guessed selectors, old endpoints, raw layout writes, polling, or silent fallback behavior.

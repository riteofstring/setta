# Xterm.js Scoped Package Migration (v6)

## Goals
- Migrate from deprecated `xterm` + `xterm-addon-*` packages to the maintained `@xterm/*` packages.
- Upgrade xterm.js to the latest stable major (`@xterm/xterm@6.0.0`) and compatible addons.
- Preserve our React Flow zoom workaround (`frontend/fix_xterm.py`) so mouse hit-testing/selection still works when the canvas is zoomed.
- Keep terminal behavior/tests stable (especially code-section attach/detach + resize).

## Background / Constraints
- The project patches the xterm bundle postinstall to divide mouse coords by `globalThis.reactFlowZoom` (see `frontend/fix_xterm.py`) so selection/clicks work under React Flow zoom transforms.
- xterm.js v6 is a major release and includes breaking changes in options and viewport/scrollbar behavior; we want the minimal surface-area upgrade first.

## Plan
1. Inventory current usage
   - Confirm all imports of `xterm` / `xterm-addon-*` (expected: only terminal hooks).
   - Confirm the exact patch applied by `frontend/fix_xterm.py` and how `window.reactFlowZoom` is set.
2. Swap dependencies
   - Update `frontend/package.json`:
     - Replace `xterm` -> `@xterm/xterm@6.0.0`
     - Replace `xterm-addon-fit` -> `@xterm/addon-fit` (pick a version compatible with xterm v6)
   - Run `pnpm -C frontend install` to update `frontend/pnpm-lock.yaml`.
3. Update imports and CSS
   - Update TS imports:
     - `Terminal` from `@xterm/xterm`
     - `FitAddon` from `@xterm/addon-fit`
   - Update CSS import:
     - `@xterm/xterm/css/xterm.css`
4. Update the React Flow zoom patch
   - Update `frontend/fix_xterm.py` to patch `node_modules/@xterm/xterm/lib/xterm.js`.
   - Make the patch script validate that the replacement actually happened and print a clear error if not (so we don’t silently lose the zoom fix).
5. Verification
   - Run the existing Playwright regression covering terminal attach + resize/reflow.
   - Run a fast frontend check (TypeScript build or a targeted Vitest run) if available.
   - Manual smoke: open a project, attach/detach terminal to a code section, zoom in/out (React Flow), verify clicks/selection work and resizing doesn’t throw.

## Rollback
- Revert the dependency swap commit(s) and restore `frontend/fix_xterm.py` path/patch.
- `pnpm -C frontend install` to restore lockfile/node_modules to the previous state.

## Notes / Follow-ups (Not Required For Migration)
- Our “reflow on widen” behavior may still depend on shell output semantics (hard newlines vs wrapped buffer lines). If the issue persists after the upgrade, we should focus on backend ordering/output and/or explicit reflow strategies rather than more xterm internals.
- If `@xterm/addon-fit` throws due to xterm v6 scrollbar/viewport changes, prefer upgrading the addon version. As a safety net, we can compute fit dimensions using xterm internals and DOM measurements (instead of letting an exception take down the app).

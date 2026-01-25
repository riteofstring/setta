# Findings (merged 1-6)

## 1) Critical / blocker: generated backend modules removed but still imported
- Example: `backend/setta/types/helpers_lvl2.py` and `backend/setta/project_state/project_code.py` still import `setta.types.generated.*`, but `backend/setta/types/generated/` has been deleted (except `__init__.py`).
- Why it matters: backend imports crash at runtime; generators can also fail when they import generated modules.
- Proposed fix: re-run `source activate.sh && cd frontend && pnpm generate` and commit the generated Python modules, **or** add a build/install step that regenerates them before any backend imports run and ensure the wheel includes the outputs. If generated files are meant to stay out of git, document the required pre-steps and enforce them in CI.
- Test idea: add a `tests/start/test_generated_imports.py` unittest that imports `setta.project_state.project_code` and asserts `setta.types.generated` contains at least one module file besides `__init__.py` (via `importlib.resources`).
- UX/DX before: `ModuleNotFoundError` on startup/tests; undocumented manual regeneration required.
- UX/DX after: backend imports resolve; dev/test/build flows are deterministic and documented.

## 2) Cleanup: Playwright/Vitest artifact committed
- Example: `frontend/test-results/.last-run.json` is a local test artifact.
- Proposed fix: remove the file from version control and add `frontend/test-results/` (or the specific file) to `.gitignore`.
- Test idea: none (handled via `.gitignore`; no test needed).
- UX/DX before: noisy diffs and merge churn after local test runs.
- UX/DX after: clean working tree; reviews focus on real code changes.

## 3) Cleanup: personal VS Code theme settings committed
- Example: `.vscode/settings.json` includes `workbench.colorCustomizations`.
- Proposed fix: revert these theme customizations or move them to user-local settings (and ignore if needed).
- Test idea: none (handled via `.gitignore`; no test needed).
- UX/DX before: unexpected UI changes for other contributors.
- UX/DX after: shared settings stay project-focused.

## 4) Performance risk: DOM scanning on every param list mutation
- Example: `frontend/src/components/Params/GroupContainer.tsx` uses a `MutationObserver` with subtree scanning and repeatedly runs `querySelectorAll` to compute min row height.
- Proposed fix: observe a single representative row (e.g., first visible) with a `ResizeObserver`, or throttle updates; optionally recompute only when row count/size changes.
- Test idea: Playwright regression that loads a large param list, inserts a tall row, and asserts the row container/min height updates within a short window; validates the ResizeObserver/throttle behavior in real layout.
- UX/DX before: potential UI jank on large param lists or frequent edits.
- UX/DX after: smoother scrolling/editing with less layout overhead.

## 5) Dev override can crash WebSocket URL resolution
- Example: `frontend/src/utils/c_addresses.ts` calls `new URL(origin)`; if `VITE_BACKEND_ORIGIN` is set to `127.0.0.1:8000` (no protocol), this throws and the app fails to boot.
- Proposed fix: normalize overrides by adding a protocol when missing (e.g., prepend `http://`) or fall back to a safe default before calling `new URL`.
- Test idea: Vitest unit test for a helper that normalizes `VITE_BACKEND_ORIGIN` so `127.0.0.1:8000` yields a valid `http://`/`ws://` URL; optionally add a Playwright smoke test that boots the app with the env var set.
- UX/DX before: app fails to start with a common host:port override.
- UX/DX after: app boots with both full URLs and host:port overrides.

# Latest Main CI Test Failures and Fixability

Latest `main` CI run is **#429** (run ID `22126949380`, started **2026-02-18 04:46 UTC**):  
https://github.com/riteofstring/setta/actions/runs/22126949380

## Failed Jobs and Root Causes

1. `frontend-unit` (`63958994567`)
- Cause: timezone-sensitive assertion in `frontend/src/utils/textParamDateTime.test.ts:81`.  
  It expects `"2026-02-17"` but runner (UTC) evaluates `"2026-02-18"`.
- Fixable: yes, deterministic test fix (pin TZ in test or avoid offset-dependent expectation).

2. `frontend-e2e (file-browser)` (`63959002699`)
- Cause: `frontend/tests/e2e/file-browser/file-browser-binary-content.spec.ts:77` writes an existing file with `expectedMtimeNs: null`; backend treats null as create-only and returns `409 File already exists` per `backend/setta/routers/artifact.py:704`.
- Fixable: yes (pass real `expectedMtimeNs` from prior read, or don’t pre-create file).

3. `frontend-e2e (chat)` (`63959002704`)
- Cause: unexpected API guard in `frontend/tests/e2e/helpers.ts:849` sees `POST /api/getLLMChat -> 404` during `frontend/tests/e2e/chat/chat-composer-controls.spec.ts:120` (cleanup path hits this at `:243`).
- Fixable: yes (either stop generating this 404 in flow, or explicitly allow expected 404 in this test path).

4. `frontend-e2e (editor)` (`63959002705`)
- Cause: drag-detach flow did not persist detach in time (`frontend/tests/e2e/editor/code-section-terminal-attachment.spec.ts:823`, failing poll at `:926`).
- Fixable: yes (stabilize drag/drop interaction logic; likely flaky CI interaction issue).

5. `frontend-e2e (sections)` (`63959002719`)
- Cause: UI DnD helper exhausted retries and threw `Failed to drag section into parent via UI` at `frontend/tests/e2e/sections/section-children-dnd-ui.spec.ts:269`.
- Fixable: yes (same class of CI DnD flake; tighten drag anchors/retry strategy).

6. `frontend-e2e (overview)` (`63959002728`)
- Cause: plugin fixture frontend entrypoint missing (`frontend/dist/index.js`) when linking `frontend-api-fetch` plugin.  
  CI log shows plugin fixture build was skipped. This ties to target-path detection in `scripts/run-playwright-e2e.sh:147` and `scripts/plugin-fixtures/cache.sh:471`/`:574` not recognizing `tests/e2e/...` as frontend paths.
- Fixable: yes (path-resolution fix in fixture-build decision logic, or pass `frontend/tests/e2e/...` targets in CI).

## Local Log Correlation (`tests-frontend.log`)

Your local log matches one recurring issue:
- `tests-frontend.log:546` shows the same `POST /api/getLLMChat -> 404` failure.
- Local Vitest is clean (`211` files, `981` tests passed), so this is not a local unit-test failure.

## Recurrence Confirmation

Previous `main` run **#428** (2026-02-18 04:12 UTC) already had the same two recurring failures (`chat` 404 and `overview` plugin fixture missing), so those are not one-off flakes:  
https://github.com/riteofstring/setta/actions/runs/22126201880

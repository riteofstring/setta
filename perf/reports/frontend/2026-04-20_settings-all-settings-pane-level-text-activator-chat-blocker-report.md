# All Settings pane-level text activator chat blocker report

Date: 2026-04-20
Worktree: `go-rewrite-pixijs`
Canonical blocker target: `settings-section__chatSectionDefault`
Comparison control: `settings-section__shortcuts`

## Goal

Verify whether the new pane-level retained-surface text activator path is enough to open inline editing on the live `chat` `permissionMode` row from a real section-surface click.

## What was tried

- Started from the uncommitted pane-native activator attempt:
  - `frontend/src/forks/xyflow/core/container/Pane.tsx`
  - `frontend/src/forks/xyflow/core/container/Pane.test.tsx`
  - `frontend/src/forks/xyflow/core/container/canvasOwnedTextPaneActivator.ts`
  - `frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts`
- Recovered the worktree runtime once with:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
- Re-ran the focused live proofs against the recovered runtime with fresh one-shot bootstrap tokens and no `SETTA_AUTH_COOKIE_NAME` override.
- Tried two bounded hardening follow-ups locally:
  - removed the synthetic hidden-activator pre-focus before forwarding `mousedown`
  - deferred the forwarded `mousedown` into a microtask so it no longer fired re-entrantly inside the original pane capture handler
- Tried one bounded same-path comparison update on `shortcuts`, but reverted it after the row had no trustworthy section-surface hit point under normalized fit-view.

## Result

- The auth-cookie miss from `./scripts/run-playwright-against-runtime.sh` was harness noise again:
  - the helper checked a workspace-scoped cookie prefix
  - the recovered runtime minted a session-scoped `setta_auth_<sessionId>` cookie
  - rerunning with a fresh token and no `SETTA_AUTH_COOKIE_NAME` override reached real product behavior
- The live chat blocker persisted on the recovered runtime:
  - real section-surface click on `chat.permissionMode` still did **not** mount inline CodeMirror
  - the page still surfaced `POST /api/setActiveIds -> 404`
- The `404` is not enough to explain the blocker by itself:
  - the stable `shortcuts.advancedSearchShortcut` hidden-input baseline also surfaced `POST /api/setActiveIds -> 404`
  - that baseline still mounted inline CodeMirror and passed
- The temporary same-path `shortcuts` comparison was not trustworthy:
  - after fit-view normalization, the target row had no section-surface hit point inside its DOM row bounds
  - that probe was reverted instead of being left as a failing oracle
- The two bounded hardening attempts made no observable difference on the chat lane and were reverted before finishing this slice.

## Interpretation

- Close this exact pane-level activator attempt as insufficient for the `chat` blocker.
- Do not spend the next automated pass on more local `Pane.tsx` event-ordering tweaks, more synthetic focus/mousedown variants, or another `shortcuts` same-path retry at the same normalized fit-view boundary.
- The next frontier is a deeper scene-level / renderer-authoritative text activator primitive, with `settings-section__chatSectionDefault` kept as the blocker reproduction target.

## Focused verification

- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/Pane.tsx src/forks/xyflow/core/container/Pane.test.tsx tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts`
  - result: passed after reverting the speculative pane-level source
- `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3071 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8071 SETTA_BOOTSTRAP_TOKEN=<fresh-token> setta_run_pnpm "$PWD" -C frontend exec playwright test frontend/tests/e2e/settings/settings-all-settings-chat-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-shortcuts-resting-text.spec.ts --reporter=line --workers=1`
  - result: `2 passed (42.6s)` on the restored baseline
- `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/Pane.test.tsx`
  - result: still blocked by the pre-existing repo jsdom / `html-encoding-sniffer` ESM failure before collection

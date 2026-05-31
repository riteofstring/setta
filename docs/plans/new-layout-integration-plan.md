# New Layout Integration Plan

This plan describes how to bring the `new-layout` branch's frontend shell and
layout work into `setta-3` while keeping `setta-3` as the source of truth for
chat lifecycle, provider protocol handling, run state, queueing, steering,
approvals, corruption handling, generated contracts, and backend behavior.

The merge is possible, but it should be treated as an integration project rather
than a normal conflict-resolution merge. `new-layout` contains a large renderer
rewrite, but it also changes Electron main/preload IPC, shared TypeScript
contracts, generated backend contracts, and Go chat/httpapi code. Those overlap
with the newer backend and chat-behavior work on `setta-3`.

## Current Branch Shape

Last inspected from `setta-3`:

- `setta-3` has 27 commits not in `new-layout`.
- `new-layout` has 84 commits not in `setta-3`.
- `git diff --stat HEAD...new-layout` shows 59 changed files, mostly desktop
  renderer, shell, IPC/shared types, and a small Go/httpapi surface.
- `git diff --stat new-layout...HEAD` shows 123 changed files, including the
  newer `setta-3` chat/runtime/provider work.
- A dry merge reports conflicts in the renderer, chat store, shared IPC/types,
  generated contracts, preload, Electron main, and Go chat/httpapi files.

Primary dry-merge conflict files:

- `desktop/src/generated/backend.ts`
- `desktop/src/main/index.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/preload/index.test.ts`
- `desktop/src/renderer/src/App.tsx`
- `desktop/src/renderer/src/App.test.tsx`
- `desktop/src/renderer/src/components/chat-panel.tsx`
- `desktop/src/renderer/src/components/chat-transcript.tsx`
- `desktop/src/renderer/src/stores/chat-store.ts`
- `desktop/src/renderer/src/stores/chat-store.test.ts`
- `desktop/src/renderer/src/stores/workspace-store.test.ts`
- `desktop/src/shared/ipc.ts`
- `desktop/src/shared/types.ts`
- `internal/chat/events.go`
- `internal/chat/service.go`
- `internal/httpapi/chat_test.go`
- `internal/httpapi/endpoints.go`
- `internal/httpapi/health.go`

## Integration Rules

- Visual fidelity to `new-layout` is the top priority for renderer UI.
- `new-layout` takes precedence for visible UI structure, layout, styling,
  interaction chrome, menus, and workspace/sidebar/chat presentation.
- Keep `setta-3` backend behavior authoritative.
- `setta-3` takes precedence for Go backend behavior, durable state semantics,
  chat lifecycle, provider protocol handling, run state, queueing, steering,
  approvals, corruption handling, and generated contract ownership.
- Keep Go-owned contracts in Go/httpapi owner code. Regenerate TypeScript
  outputs instead of manually editing generated files.
- Do not manually edit `desktop/src/generated/backend.ts`.
- Preserve `new-layout` affordances such as chat delete, pinned chats, Codex
  history listing, editor picker actions, sidebar terminal entries, and sidebar
  canvas entries even when the matching backend behavior is not ready yet.
- If a preserved UI affordance does not have a matching `setta-3` backend
  function, keep the UI visible and visibly enabled, and wire it to an explicit
  temporary no-op. Do not fake success, mutate durable state, show success
  feedback, or import older backend behavior just to make the control appear
  functional.
- Do not accept `new-layout` Go chat/runtime changes unless they are reviewed as
  new backend work and intentionally adapted to the current `setta-3` lifecycle
  model.
- Treat Electron main/preload/shared IPC as a boundary layer, not pure frontend.
  Add only the APIs the imported layout actually needs.
- Prefer adapting the new renderer to the current chat store and generated
  contracts over weakening the current backend model to match older UI
  assumptions.
- Preserve deterministic app workflow coverage through the real
  Electron/main/preload/renderer/HTTP/store boundary.

## Recommended Strategy

Use a selective integration branch rather than a blind merge.

When a conflict appears, resolve it with this precedence:

- For renderer markup, layout, CSS, visual components, menus, and presentation
  state, prefer `new-layout`.
- For Go backend code, generated-contract owners, provider protocol logic,
  durable chat/run behavior, and persistence semantics, prefer `setta-3`.
- For `desktop/src/renderer/src/stores/*`, `desktop/src/shared/*`,
  `desktop/src/preload/*`, and `desktop/src/main/*`, do a manual integration:
  keep the `new-layout` surface area visible, but bind it to `setta-3`
  semantics where those semantics exist.
- For tests, prefer `new-layout` expectations when the test is asserting visible
  UI. Prefer `setta-3` expectations when the test is asserting backend behavior,
  lifecycle rules, provider protocol handling, queueing, steering, approvals, or
  persistence.

1. Create an integration branch from `setta-3`.

   ```sh
   git switch setta-3
   git switch -c integrate-new-layout
   ```

2. Record the baseline conflict inventory.

   ```sh
   git merge-tree --write-tree HEAD new-layout
   ```

   Keep the output in the plan/work notes. It is a reference for expected
   conflict areas, not an operation that mutates the worktree.

3. Import layout-only files first.

   Bring over assets and new renderer components that do not define durable
   chat/runtime behavior:

   - `desktop/img/logo/*`
   - `desktop/img/prototypes/*`, if still useful
   - new presentational components under
     `desktop/src/renderer/src/components/`
   - `desktop/src/renderer/src/styles.css`
   - UI primitives such as `button`, `badge`, `input`, and `textarea`
   - shell/layout components such as workspace panes, sidebar accordions,
     floating menus, editor picker, settings panel, and resize handles

   Avoid importing generated contracts, Go chat code, or store behavior in this
   step.

4. Reconcile the renderer app shell.

   Use the `new-layout` visual shell as the target for:

   - `desktop/src/renderer/src/App.tsx`
   - `desktop/src/renderer/src/components/workspace-sidebar.tsx`
   - `desktop/src/renderer/src/components/workspace-pane.tsx`
   - related sidebar, pane, menu, and chrome components

   Keep `setta-3` data flow for workspace selection, chat creation, active runs,
   queue state, steering, cancellation, and approval state.

5. Reconcile chat presentation separately from chat behavior.

   Import the `new-layout` presentation for:

   - composer placement and motion
   - transcript styling
   - tool-call visual treatment
   - model and permission menus
   - slash-command palette shell
   - sidebar chat rows, pins, timestamps, and empty states

   Keep the current `setta-3` behavior for:

   - message ordering and transcript projection
   - run activity
   - queueing while a run is active
   - steering active runs
   - stop/cancel/failure states
   - approvals
   - provider account and protocol metadata
   - corruption handling and restart/reload behavior

6. Reconcile stores and IPC as boundary work.

   Handle these files manually and deliberately:

   - `desktop/src/renderer/src/stores/chat-store.ts`
   - `desktop/src/renderer/src/stores/chat-store.test.ts`
   - `desktop/src/shared/ipc.ts`
   - `desktop/src/shared/types.ts`
   - `desktop/src/preload/index.ts`
   - `desktop/src/preload/index.test.ts`
   - `desktop/src/main/index.ts`

   The expected shape is: `new-layout` UI affordances call current `setta-3`
   store actions and generated backend client methods when those functions
   exist. If the layout needs a missing backend or shell capability, keep the UI
   visible and visibly enabled, then choose one of two explicit outcomes:

   - add the smallest typed IPC/main/preload/backend API when the backend
     behavior is clear and belongs in this integration
   - wire a temporary no-op when the backend behavior should be implemented
     after the merge

   Temporary no-ops should be easy to find and remove. Keep them explicit in
   named functions or a small local mapping instead of burying empty handlers in
   JSX. They should do nothing user-visible on click: no success toast, no
   optimistic local state change, and no fake persistence.

7. Reconcile backend contract needs.

   If a UI feature from `new-layout` needs backend data that does not exist on
   `setta-3`, use this decision policy:

   - If it is presentation-only or can be derived from current contracts, adapt
     the renderer.
   - If it is required for the UI to compile but the behavior is not part of the
     integration, preserve the UI as visibly enabled and wire it to an explicit
     temporary no-op.
   - If it is a real product capability that must work immediately, add it to
     the Go owner domain and the `internal/httpapi` endpoint registry.
   - Regenerate contracts with:

     ```sh
     ./scripts/go.sh run ./cmd/generate-contracts
     ```

   Do not maintain a separate TypeScript mirror or edit generated output by hand.

8. Remove accidental backend imports from `new-layout`.

   After the UI compiles, inspect the diff for unintended backend changes from
   `new-layout`, especially in:

   - `internal/chat`
   - `internal/httpapi`
   - `internal/runtime`
   - `cmd/generate-contracts`
   - `desktop/src/generated`

   Keep only backend changes that were intentionally added during the
   reconciliation phase.

## Suggested Implementation Order

1. **Branch and inventory**

   Create `integrate-new-layout`, capture dry-merge conflicts, and list the
   `new-layout` files by category.

2. **Pure UI import**

   Bring over assets, new components, styles, and presentational primitives.
   Commit this as a narrow checkpoint if it builds independently.

3. **Shell composition**

   Port the workspace/sidebar/pane shell into `App.tsx`, wired to the current
   workspace store and current backend contracts.

4. **Chat surface adaptation**

   Port chat transcript/composer/menu visuals onto the current chat store,
   preserving current lifecycle behavior.

5. **IPC and contracts**

   Add or reconcile only the IPC and backend endpoints required by the new UI.
   Regenerate contracts after Go/httpapi changes.

6. **Tests and workflow coverage**

   Update unit tests where they assert old markup, then add or update app
   workflow tests for the affected paths.

7. **Quality pass**

   Run formatting and the required quality/test suite. Fix real regressions,
   not just snapshots.

## Verification Checklist

Run formatting before the final quality pass:

```sh
./scripts/format.sh
```

Run the full quality suite:

```sh
./check_quality.sh --all
```

Because this touches chat behavior, preload contracts, renderer chat state, and
transcript UI, the integration is incomplete until deterministic app workflow
tests cover the affected user path through the real app boundary. At minimum,
cover:

- opening a workspace
- creating a chat
- sending a message
- receiving streamed assistant output
- queueing while a run is active
- steering an active run
- completing, cancelling, and failing a run
- preserving or promoting queued work according to product rules
- submitting approvals if approval UI or behavior is touched
- restart/reload behavior if persistence or restore state is touched

If `.env` contains `OPENAI_API_KEY`, also run the live Codex E2E tests required
for chat and provider integration. If credentials are absent, record that the
live-provider tests skipped and do not treat the skip as proof of provider
integration.

Run supply-chain checks only if the integration changes dependency manifests,
lockfiles, package manager configuration, Go module configuration, or
supply-chain tooling:

```sh
./scripts/check_supply_chain.sh
```

## Risk Areas

- **Chat store assumptions:** `new-layout` may assume older or thinner chat
  state. Adapt the UI to the current state machine rather than simplifying the
  backend.
- **Generated contract drift:** both branches touch `desktop/src/generated`.
  Regenerate from Go-owned sources after resolving owner contract changes.
- **IPC ambiguity:** shell features from `new-layout` may require preload/main
  APIs. Add explicit typed APIs rather than broad renderer escape hatches.
- **Temporary no-op drift:** preserved UI controls without backend behavior must
  stay visibly enabled, explicit, and searchable so they can be replaced after
  the merge. They must not silently fake state changes or success.
- **Tests masking product behavior:** update stale renderer assertions, but keep
  app workflow tests focused on real user paths through production wiring.
- **Accidental backend rollback:** do a final diff audit so newer `setta-3`
  lifecycle/provider/corruption fixes are not overwritten by older
  `new-layout` backend code.

## Acceptance Criteria

- The visible app shell, sidebar, workspace pane layout, chat composer placement,
  transcript styling, menus, and layout interactions match the intended
  `new-layout` experience.
- The backend and chat lifecycle behavior remain aligned with `setta-3`.
- UI affordances from `new-layout` are preserved and visibly enabled. Missing
  backend-backed actions are explicit temporary no-ops, not removed controls,
  disabled controls, fake durable behavior, or fake success feedback.
- Generated TypeScript contracts are regenerated from Go/httpapi owners.
- No generated outputs are manually edited.
- App workflow tests exercise the integrated UI through the real app boundary.
- `./scripts/format.sh` and `./check_quality.sh --all` pass.
- Live-provider E2E tests run when credentials are present, or the credentials
  skip is explicitly recorded.

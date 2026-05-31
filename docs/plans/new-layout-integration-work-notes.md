# New Layout Integration Work Notes

## Dry-merge inventory

Captured on branch `integrate-new-layout` from `setta-3` with:

```sh
git merge-tree --write-tree HEAD new-layout
```

Conflicted files reported by the dry merge:

- `desktop/src/generated/backend.ts`
- `desktop/src/main/index.ts`
- `desktop/src/preload/index.test.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/renderer/src/App.test.tsx`
- `desktop/src/renderer/src/App.tsx`
- `desktop/src/renderer/src/components/chat-panel.tsx`
- `desktop/src/renderer/src/components/chat-transcript.tsx`
- `desktop/src/renderer/src/stores/chat-store.test.ts`
- `desktop/src/renderer/src/stores/chat-store.ts`
- `desktop/src/renderer/src/stores/workspace-store.test.ts`
- `desktop/src/shared/ipc.ts`
- `desktop/src/shared/types.ts`
- `internal/chat/events.go`
- `internal/chat/service.go`
- `internal/httpapi/chat_test.go`
- `internal/httpapi/endpoints.go`
- `internal/httpapi/health.go`

The inventory matches the risk areas in `docs/plans/new-layout-integration-plan.md`.

## File categories

Direct layout import:

- `desktop/img/logo/*`
- `desktop/img/prototypes/*`
- New renderer presentation components under `desktop/src/renderer/src/components/`
- Renderer UI primitives `badge`, `button`, `input`, and `textarea`
- `desktop/src/renderer/src/components/markdown-text.tsx`
- `desktop/src/renderer/src/hooks/use-workspace-git-info.ts`
- `desktop/src/renderer/src/styles.css`

Manual reconciliation required:

- `desktop/src/renderer/src/App.tsx`
- `desktop/src/renderer/src/components/chat-panel.tsx`
- `desktop/src/renderer/src/components/chat-transcript.tsx`
- `desktop/src/renderer/src/components/workspace-sidebar.tsx`
- `desktop/src/renderer/src/stores/chat-store.ts`
- `desktop/src/shared/ipc.ts`
- `desktop/src/shared/types.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/main/index.ts`
- Go/httpapi owner files and generated backend contracts

## Temporary no-ops

- `desktop/src/renderer/src/stores/chat-store.ts` keeps `deleteConversation` visible from the
  `new-layout` sidebar but wires it to `temporaryNoop("deleteConversation")`.
- `desktop/src/renderer/src/stores/chat-store.ts` keeps user-message edit affordance wiring visible
  to the renderer but wires it to `temporaryNoop("updateUserMessage")`.
- `desktop/src/renderer/src/components/workspace-sidebar.tsx` keeps project overflow actions
  visible but wires backend-missing actions to `temporaryProjectMenuNoop(...)`.
- `desktop/src/renderer/src/components/sidebar-secondary-sections.tsx` keeps memory integration
  choices visible but wires them to `temporaryMemoryIntegrationNoop(...)`.

These no-ops do not mutate durable state and do not report success.

## Verification

- `pnpm -C desktop typecheck`
- `pnpm -C desktop test`
- `pnpm -C desktop build`
- `pnpm -C desktop test:electron:built`
- `./scripts/go.sh run ./cmd/generate-contracts` (no generated diff)
- `./scripts/format.sh`
- `./check_quality.sh --all`
- `./scripts/check_supply_chain.sh`

`./check_quality.sh --all` covered deterministic Electron chat workflows, live Codex Electron
chat workflow, and live Codex backend chat workflow.

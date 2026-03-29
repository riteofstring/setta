# Settings Live Pixi Project-Chat Pointer Cache Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Re-measure the live Pixi generic value-row handoff after moving the
  project-chat boot cursor tracking off the reactive `useMisc` store and into a
  dedicated ephemeral cache.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click the visible generic value-row handoff on `defaultZoomLevel`.
  3. Capture a short DevTools performance trace around the click/open
     interaction.

## Change Under Test

- `frontend/src/components/Pages/Project/UiPage.tsx`
  - record pointer down/up locations through the dedicated project-chat pointer
    tracker instead of writing them into `useMisc`
- `frontend/src/state/actions/projectChatWindowing.ts`
  - read project-chat boot cursor candidates from the pointer tracker instead of
    the reactive misc store
- `frontend/src/state/actions/projectChatWindowingPointerTracking.ts`
  - add a dedicated ephemeral pointer cache for project-chat boot positioning
- `frontend/src/state/utils.ts`
  - clear the pointer cache during project-store resets

## Probe

- Fresh-context Chrome DevTools MCP visual/perf checks on the live worktree
  runtime before and after the change.
- In both checks, the page stayed authenticated and `All Settings` loaded
  successfully.
- The `defaultZoomLevel` handoff still opened the DOM editor overlay while the
  Pixi canary stayed mounted and visually sane.

## Observations

- Baseline before the change:
  - `INP`: `57 ms`
  - input delay: `4 ms`
  - processing: `1 ms`
  - presentation delay: `51 ms`
  - extra DevTools insights called out large generic DOM/reflow costs rather
    than a new code-specific hotspot
- Follow-up after the change:
  - `INP`: `48 ms`
  - input delay: `10.8 ms`
  - processing: `6.6 ms`
  - presentation delay: `30.6 ms`
- Relative to the fresh pre-change baseline from this iteration:
  - `INP` improved from `57 ms` to `48 ms`
  - presentation delay improved from `51 ms` to `30.6 ms`
  - processing stayed low overall, and no new named hotspot displaced the
    existing shared click/scene path

## Verdict

- Keep the pointer-tracking cache split.
- The old `useMisc` writes were not the entire shared-floor cost, but removing
  them from the global pointer path still produced a better follow-up trace on
  the live Pixi canary while preserving the chat-window boot behavior.
- The next retained-scene hotspot slice should continue from the remaining
  shared task/layout/presentation floor rather than restoring the old reactive
  pointer path.

## Verification Notes

- Vitest:
  - `pnpm -C frontend exec vitest run src/state/actions/projectChatWindowingPointerTracking.test.ts src/state/actions/projectChatWindowing.test.ts`
  - result: passed (`47 passed`)
- Playwright:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts --grep "project chat move-to-canvas anchors new canvas chats to the visible source window instead of the last cursor point|project chat move-to-canvas keeps the project-ai surface and the source window size"`
  - result: passed (`2 passed`)
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "value-row DOM editor overlay"`
  - result: passed (`1 passed`)
- Chrome DevTools MCP visual/perf checks:
  - baseline result: passed
  - post-change result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`

# Chat Area Branch Surfaces

- Date: `2026-03-15`
- Surface: `frontend/src/components/Section/Layouts/ChatArea.tsx`
- Scenario:
  - `http://127.0.0.1:3002/racing_busy`
  - viewport `1400x900`
  - injected scratch preview with one managed `ChatArea` and one scriptable
    `ChatArea` rendered side by side from the local source modules

## Before

- `ChatArea.tsx` was about `1972` lines and mixed both the managed and
  scriptable section-chat branches, managed history/polling helpers, and
  realtime send/stop event telemetry in one first-hop file.
- The pre-refactor scratch mount showed:
  - `2` textareas
  - buttons `Dismiss`, `History`, `New Chat`
  - a managed zero-scope banner plus a disabled managed composer
  - a scriptable composer seeded with `draft scriptable prompt`
  - `nodeCount: 59`

## After

- `ChatArea.tsx` is now `42` lines.
- Ownership moved to:
  - `chatAreaManagedSurface.tsx` for managed section-chat selector scope,
    zero-scope banner lifecycle, history/config gating, and managed
    composer/message rendering
  - `chatAreaManagedHistory.tsx` for managed history polling rules, run refresh
    keys, sorted history entries, and the managed history panel
  - `chatAreaScriptableSurface.tsx` for scriptable section-chat selector scope,
    branch reconciliation, draft buffering, slash-command handling, and
    scriptable composer/message rendering
  - `chatAreaRealtimeEvents.ts` for shared send/stop realtime dependency
    telemetry
- The same CDP scratch mount after the extraction showed:
  - `2` textareas
  - buttons `Dismiss`, `History`, `New Chat`
  - the same managed zero-scope banner text and scriptable draft text
  - `nodeCount: 58`

## Performance Note

- This refactor preserved the visible surface while narrowing the root
  subscription boundary: `ChatArea.tsx` now subscribes only to `managed` and
  routes into branch-local owners.
- The automated guardrail is
  `frontend/src/components/Section/Layouts/ChatArea.renderBoundary.test.tsx`,
  which proves scriptable-only or managed-only field changes no longer rerender
  the root `ChatArea` surface.
- The one-node drop in the scratch preview did not change the visible controls
  or compose states in CDP; the meaningful perf improvement here is reduced
  root rerender ownership rather than a large DOM reduction.

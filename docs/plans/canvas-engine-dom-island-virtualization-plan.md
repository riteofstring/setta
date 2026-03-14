# Canvas Engine DOM-Island Virtualization Plan

## Goal

Add large-canvas guardrails around the experimental canvas engine host so we can verify that DOM-island mounting stays bounded as section count grows.

## Why This Slice Now

- The current host already has DOM-island mount and retention logic.
- The recent interaction parity work increases the risk that future changes accidentally remount too much DOM.
- Before pushing deeper into nested/general project coverage, we need a repeatable check that the engine path still behaves like a retained scene plus sparse DOM islands under load.

## Scope

- Port the focused large-canvas Playwright guardrail from `frontend-performance-5`
- Add a host-level Vitest that covers retention expiry across an offscreen transition
- Keep production behavior unchanged unless the new tests expose a real retention/runtime bug

## Approach

1. Add a dedicated Playwright spec for DOM-island virtualization stress.
   - Build a deterministic large grid of top-level sections
   - Assert that mounted/visible DOM islands stay far below total section count
   - Assert retention is bounded and drains after the configured retention window

2. Add a narrower host integration test for retention expiry.
   - Start with visible mounted sections
   - Move one section offscreen through project-state updates
   - Assert it becomes retained, then unmounts after the retention timer elapses

3. Only touch host runtime code if the new coverage exposes a real bug.

## Exit Criteria

- A dedicated large-canvas Playwright spec passes on the experimental canvas-engine path
- `CanvasEngineHost.test.tsx` covers offscreen retention expiry
- Guardrail results show mounted DOM islands remain bounded relative to total section count

# Settings Graph Substrate Canary Pan-Only React Flow Publish Removal

Date: 2026-04-08
Canonical lane: `rotaryParamCodeObjDefault`
Surface: `settings` -> `All Settings`

## Change

- Added a canary viewport override path in `useViewportHelper.ts` so
  viewport reads can use the authoritative canary viewport without depending on
  `useReactFlow.transform` during local pan-only motion.
- Narrowed `settingsGraphSubstrateCanaryViewportRuntime.ts` so the React Flow
  store only receives:
  - metadata syncs (`domNode`, width/height, persistence flag)
  - the initial canary transform publish
  - later zoom-driven transform publishes
- Updated the canonical main-reference Playwright probe expectations so the
  canary no longer requires `reactFlowViewportPublish` or transform-subscription
  callbacks inside the measured motion window.

## Measured output

Source: `settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary`

- Reference `main`
  - average frame duration: `17.046ms`
  - max frame duration: `51.9ms`
  - sample count: `44`
  - root DOM nodes: `7628`
  - target section DOM nodes: `132`
  - editable controls: `99`
  - visible sections: `46`
- Worktree canary
  - average frame duration: `17.759ms`
  - max frame duration: `50.1ms`
  - sample count: `44`
  - root DOM nodes: `135`
  - target section DOM nodes: `132`
  - editable controls: `2`
  - visible sections: `1`
  - motion attribution during the measured burst:
    - `reactFlowViewportPublish`: `0`
    - `reactFlowTransformSubscriptionCallback`: `0`
    - `reactFlowTransformFollowerCallback`: `0`
    - `interactionMiscStateSync`: `1`
    - `interactionReactFlowStateSync`: `1`
    - `viewportPersistenceDispatch`: `0`

## Verification notes

- Unit coverage passed for the viewport runtime and viewport helper seams.
- Chrome DevTools MCP visual check confirmed both worktree and `main` `/settings`
  surfaces rendered instead of sticking on a blank/spinner shell.
- The canonical Playwright probe produced the metrics above on the first run
  after the product change, then failed only because the spec still asserted the
  old pre-change attribution shape.
- After updating the spec expectation, repeated reruns still started the probe
  but hung after the test banner even with freshly minted one-time bootstrap
  tokens for both the worktree and `main`. Treat that hang as verifier/runtime
  debt until the probe teardown path is trustworthy again.

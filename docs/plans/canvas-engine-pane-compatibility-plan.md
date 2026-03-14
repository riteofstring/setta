# Canvas Engine Pane Compatibility Plan

## Goal

Expose pane- and viewport-equivalent DOM surfaces on the experimental canvas engine path so shared workspace behaviors that still query React Flow selectors can work against the engine host.

## Problem

- The canvas engine host currently removes `.react-flow__pane` entirely.
- Some shared runtime code and helpers still query `.react-flow__pane` and `.react-flow__viewport`.
- That creates compatibility gaps for engine-path behaviors like pane-relative utilities and nested child detach flows.

## Approach

1. Add a pane-equivalent surface to the engine host.
   - Use the host root as the pane-compatible element.
   - Keep existing host pointer handling intact.

2. Add a viewport-equivalent proxy.
   - Publish the current camera transform through a `.react-flow__viewport` proxy element.
   - Use it for shared selector-based helpers and viewport math.

3. Add focused coverage.
   - Vitest: engine host renders pane/viewport compatibility surfaces and keeps the viewport proxy in sync with camera state
   - Playwright: nested group-child UI drag/drop on the engine path, including detach back to pane space

## Exit Criteria

- Engine host exposes `.react-flow__pane` and `.react-flow__viewport` compatibility surfaces
- Existing engine-host tests remain green after the selector compatibility change
- Nested child reorder and detach pass on the experimental engine path

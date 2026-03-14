# Canvas Engine Edge Interaction Parity Plan

## Goal

Bring the experimental canvas engine host closer to React Flow parity for edge-centric interactions so pan/zoom is no longer the only credible path on the custom renderer.

## Scope

- Edge hover and click selection parity
- Data-edge create and reconnect gestures
- Agentic-edge create and selection parity
- Shift-drag marquee selection on the canvas surface
- Host state, renderer inputs, and test hooks needed to observe those flows

## Sequence

1. Reintroduce the missing scene inputs and host-local interaction state.
   - Subscribe to edge handle registry data and section edge-port catalogs.
   - Track connection preview, hovered edge, and selection-rect state on the host.
   - Feed those states back into the renderer and expose host datasets for tests.

2. Port edge and marquee hit-testing flows into pointer handling.
   - Hover hit testing when idle
   - Edge click selection
   - Shift-drag marquee selection
   - Agentic connect
   - Data connect
   - Data reconnect

3. Preserve current drag/resize/pan behavior while layering the new flows in.
   - Keep DOM island interaction guards narrow.
   - Avoid regressing the already-landed pan, drag, resize, and viewport sync paths.

4. Add focused verification.
   - Vitest coverage for host datasets and backend-triggering callbacks where practical
   - Playwright coverage for marquee selection, data connect/reconnect, and edge hover/select
   - CDP visual verification on the live experimental host

## Risks

- Handle-position availability is incomplete unless the edge handle registry is wired correctly.
- Marquee and edge hit testing can conflict with pane drag or section drag if pointer ordering is wrong.
- Backend edge mutation helpers must match current generated endpoint/store behavior on `frontend-performance-10`, not the older branch assumptions.

## Exit Criteria

- The experimental host can create/select/reconnect visible edges without React Flow DOM nodes.
- Shift-drag marquee selection works on the canvas surface.
- Existing viewport, pan, drag, and resize tests still pass.

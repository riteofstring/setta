# Normal workspace metrics warmup reset — 2026-07-19

## Scope

This report records a deterministic performance-instrumentation correction found while running the Phase 3 offline-hardening quality gate. It does not represent a hosted Sprites measurement.

## Before

`FrameScheduler` called its benchmark warmup measurement reset after 2 seconds in every runtime mode. Normal workspace mode has no performance report writer, so the reset could not produce a report and could erase interaction metrics collected before the boundary.

The pane drag-and-drop production Electron workflow exposed the race twice: the preview update occurred before the reset and the clear occurred after it, yielding `paneDragPreviewUpdates: 0` and `paneDragPreviewClears: 1` even though the drop completed.

## After

The warmup reset now requires a performance report writer, which is only configured for benchmark mode. Normal workspace metrics remain continuous unless an explicit caller resets them; benchmark measurement behavior is unchanged.

Verification consists of a focused scheduler regression test, the production pane drag-and-drop Electron workflow, and the full repository quality gate.

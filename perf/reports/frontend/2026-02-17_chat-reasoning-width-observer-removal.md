# Chat Reasoning Width (Observer Removal)

Date: 2026-02-17  
Area: frontend  
Code path touched:
- `frontend/src/components/Chat/ChatMessages.tsx`

## Scope
- Replace per-message `ResizeObserver` width synchronization for assistant reasoning cards with layout-based width alignment.
- Keep reasoning-card and assistant-bubble widths visually aligned.

## Scenario
- Page: `http://127.0.0.1:3059/whale_neat`
- Chat section state seeded with **30 assistant messages**, each containing:
  - one `thinking` block
  - one text block
- Interaction during trace: repeated viewport resizes (`1200x900 -> 900x900 -> 1300x900 -> 860x900`).

## Before (baseline)
- Implementation: pre-change `ChatMessages.tsx` (from `HEAD` before this patch).
- Runtime instrumentation (via CDP `initScript`):
  - `ResizeObserver` constructions: **60**
  - `ResizeObserver.observe(...)` calls: **60**
- Trace artifact:
  - `perf/artifacts/2026-02-17_reasoning-width-baseline.trace.json`
- Trace summary (selected):
  - Long tasks (>=50ms): `9`
  - `Layout`: `20` events, `6.34ms`
  - `UpdateLayoutTree`: `35` events, `31.70ms`
  - `FunctionCall`: `142` events, `467.59ms`

## After
- Implementation: current branch version (observer-free reasoning width sync).
- Runtime instrumentation (same scenario):
  - `ResizeObserver` constructions: **0**
  - `ResizeObserver.observe(...)` calls: **0**
- Trace artifact:
  - `perf/artifacts/2026-02-17_reasoning-width-after.trace.json`
- Trace summary (selected):
  - Long tasks (>=50ms): `9`
  - `Layout`: `16` events, `4.77ms`
  - `UpdateLayoutTree`: `49` events, `31.59ms`
  - `FunctionCall`: `181` events, `515.92ms`

## Notes
- Trace-level totals are noisy in this full-app scenario, but the targeted observer metric is definitive: reasoning-card rendering no longer creates per-message `ResizeObserver` instances.
- Visual parity was checked in CDP: reasoning-card width matches assistant-bubble width (`delta = 0px`) on both project chat and section chat examples.

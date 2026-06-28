# Chat And Niri Performance Tests - 2026-06-28

## Added Guardrails

- `chat-long-transcript-performance`: seeds a persisted long chat with 565 messages, 241 runs, and every chat run-item type repeated across 240 turns. The Electron workflow pages older transcript content through the UI, then samples wheel scrolling down and up.
- `niri-navigation-performance`: samples benchmark-scene focus switching, overview enter/exit, and overview wheel panning.
- Shared Electron frame-budget assertions now record the observed display budget. On 120 Hz presentation they gate against 8.33 ms frames; on 60 Hz presentation they gate against the displayed frame budget while still recording 120 Hz misses.

## Local Results

- `chat-long-transcript-performance`: passed on a 60 Hz run. Scroll height reached 102,124 px after older-page loading settled; scroll-down p95 was 17.90 ms and scroll-up p95 was 18.00 ms.
- `chat-stream-performance`: passed with p95 18.50 ms, p99 31.60 ms, max 34.40 ms, and 0 long tasks.

## Current Niri Findings

- `niri-navigation-performance`: currently fails on focus switching. After warmup, one run recorded p95 33.30 ms, p99 34.20 ms, one 50.10 ms frame, and no long tasks.
- `pane-drag-drop-benchmark-performance`: currently fails before frame assertions because the normal-row drag highlights `workspace_pane_31` instead of the intended target. This matches the observed drag/drop target inconsistency and should be fixed before treating drag performance as clean.
- `overview-zoom-performance`: currently fails before frame assertions because the browser-pane setup path times out with visible browser pane count stuck at 0.

# Floating Window Drag Batching

Date: 2026-03-07
Area: frontend
Branch/Commit: chat-windowing @ 8d79719d2
Related PR: n/a

## Goal

Reduce floating-window drag preview work in the chat windowing surface so moving a floating window does less main-thread work while the pointer is in motion.

Code paths touched:
- `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
- `frontend/src/state/actions/projectChatWindowing.ts`

## Scenario

- Entry point (URL/route/screen): `http://127.0.0.1:52111/talking_dark`
- Steps to reproduce (keep deterministic):
  - Create a fresh project.
  - Pop the default `Generated Python Code` section into a floating window.
  - Undock `Chat Window 1` into a floating window.
  - Drag the `Chat Window 1` title bar through a 10-step synthetic pointer path in DevTools.
- Data set / project used: fresh empty project created in a temp `setta_files_dev`
- Browser + OS: Chrome DevTools MCP on macOS
- Notes (extensions, throttling, dev/prod build, etc):
  - Dev build, no CPU throttling, no network throttling.
  - The baseline was reconstructed after the refactor by temporarily overriding `requestAnimationFrame` to execute synchronously. That reproduces the old per-pointermove preview-commit behavior directionally, but it is not a byte-for-byte replay of the pre-change bundle.
  - CDP pointer-capture synthesis for these floating-window drags is somewhat noisy, so use the numbers below as directional evidence, not as a hard benchmark budget.

## Before (baseline)

- Measurement method (DevTools panels used, settings):
  - Chrome DevTools MCP `Performance` trace.
  - Same synthetic drag path as the after run.
  - `requestAnimationFrame` overridden to synchronous execution before tracing.
- Key metrics:
  - Trace artifact: `perf/artifacts/2026-03-07_window-drag_baseline.trace.json`
  - Observed CLS: `0.04`
  - No stable INP reading was produced for this synthetic interaction window.
- Observations:
  - The reconstructed pre-batching path showed a slightly larger layout-shift score during the drag.
  - Synthetic pointer capture still moved the window successfully, but DevTools did not surface a clean user-input metric for this interaction.

## After

- Key metrics:
  - Trace artifact: `perf/artifacts/2026-03-07_window-drag_after.trace.json`
  - Observed CLS: `0.03`
  - DevTools surfaced a `ForcedReflow` insight in the drag window.
- Observations:
  - The batched path reduced the observed layout-shift score from `0.04` to `0.03` in the matched synthetic drag.
  - The remaining hot spot is no longer just preview churn; DevTools now highlights geometry-driven forced reflow during the drag path.
  - I also ran direct DevTools-side pointer-drag experiments while toggling synchronous vs native `requestAnimationFrame`. Those runs confirmed the move path still functions after the batching change, but the update-count delta was not stable enough under CDP pointer-capture synthesis to treat as a trustworthy headline metric.

## Conclusion

- What improved:
  - The matched synthetic drag produced a modest drop in layout shift (`0.04` -> `0.03`) after moving preview commits onto the animation-frame boundary.
  - The code change removes immediate per-move preview state commits from the hot pointer path in `ProjectChatBottomDock`.
- What regressed (if any) + why it is acceptable:
  - No clear regression was observed from the traces.
  - DevTools still reports forced reflow during drag, so the interaction is not fully optimized yet.
- Follow-ups:
  - Inspect drag-time geometry reads in the floating window path and cache viewport/container bounds per drag session instead of re-reading layout on every move.
  - Consider a transform-based preview layer for floating-window motion so drag feedback avoids layout-affecting position writes until pointer-up.
  - Re-run this scenario with a less synthetic input driver if we want a stricter timing budget.

## Raw Artifacts (local-only)

- `perf/artifacts/2026-03-07_window-drag_baseline.trace.json`
- `perf/artifacts/2026-03-07_window-drag_after.trace.json`

## Automated Perf Tests

- Playwright spec(s): `frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts`
- Vitest test(s) / bench(es): none specific to timing; drag/windowing behavior is covered in `src/state/actions/projectChatWindowing.test.ts`
- Budgets/assertions added:
  - none; this change currently relies on structural behavior tests plus the manual DevTools trace above

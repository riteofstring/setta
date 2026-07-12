# Remote Terminal Latency Phase 5 Renderer Tail

**Date:** 2026-07-11

**Phase status:** Complete. Phase 6 has not started.

## Scope

Phase 5 changes only renderer-side terminal output scheduling. The Phase 4
duplex transport, backend protocol 14, PTY behavior, and input ordering are
unchanged.

The production terminal workflow is the measurement workload. It exercises
fast typing, paste, control keys, sustained 200-line output, multiple workspace
panes, terminal maximize/restore, renderer reload, session reattach, and a real
temporary PTY. This provides both the large-output burst and the production
multi-pane workspace DOM for the before/after comparison.

## Baseline and result

Both recordings are local production Electron runs of the identical workflow:

- Before: `.recordings/terminal-workflow/20260711T062220765Z`
- After: `.recordings/terminal-workflow/20260711T155227972Z`

| Output stage | Before p50 | After p50 | Before p95 | After p95 |
| --- | ---: | ---: | ---: | ---: |
| Main to xterm write | 58 ms | 56 ms | 73 ms | 63 ms |
| Renderer receipt to xterm write | 18 ms | 15 ms | 55 ms | 49 ms |
| Xterm write to next paint | 27 ms | 20 ms | 35 ms | 23 ms |
| Backend emission to paint | 97 ms | 83 ms | 101 ms | 87 ms |

The emission-to-paint p95 improved by 14 ms (13.9%), p99 improved from 106 ms
to 87 ms (17.9%), and the observed maximum improved from 107 ms to 88 ms.
The analyzer correlated 798 output events before and 742 after; terminal event
chunk counts vary with PTY scheduling, while the commanded workload is fixed.

The standalone 4K overview workflow was also attempted before the refactor but
timed out waiting for its pre-existing overview-state assertion, so it was not
used as quantitative evidence. The successful production terminal workflow is
the controlled before/after source.

## Implementation

### Scroll following

Each write snapshots whether `viewportY >= baseY` before calling xterm. The
write callback scrolls only if that snapshot was at the bottom. Output arriving
while the user reads scrollback no longer moves the viewport.

### Bounded output scheduling

The first four output chunks in a frame are written immediately. That keeps
normal command echo, control sequences, and small interactive bursts off the
frame scheduler. Additional output in the same frame is joined into one xterm
write on the next animation frame. Attach replay is treated as bulk output and
uses the same one-frame bound.

The synthetic scheduler guardrail sends 20 chunks: the first four produce four
immediate writes and the remaining 16 produce one frame-coalesced write, a 75%
reduction in xterm write calls for that burst.

### Presentation coalescing

Output-driven terminal statistics and host dataset synchronization accumulate
the maximum dirty-row count and run once on the next animation frame. Repeated
chunks cannot trigger repeated stats calculation or dataset writes in the same
frame. Pending scheduled output and presentation are cancelled on terminal
teardown.

## Verification

- Scheduler tests prove immediate interactive writes, one-frame bulk
  coalescing, replay coalescing, teardown cancellation, and one presentation
  update per frame.
- Terminal surface tests prove user scrollback is preserved and bottom-follow
  still works when the viewport was already at the bottom.
- The focused terminal renderer suite, TypeScript typecheck, and lint pass.
- The production Electron terminal workflow passes after the change, including
  sustained output, reload, reattach, close, and recording safety checks.
- The before/after measurements above were produced by
  `desktop/scripts/analyze-terminal-latency-recording.mjs` from the two
  production recording directories.

Phase 5 stops here. Phase 6 owns the remaining deterministic delay-profile,
disconnect, multi-pane, and final live Tailscale verification matrix.

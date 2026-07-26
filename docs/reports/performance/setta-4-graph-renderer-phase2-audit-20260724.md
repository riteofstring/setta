# Setta 4 Graph Renderer — Phase 2 Audit Measurement

Date: 2026-07-24

## Scope

This is the append-only audit measurement for Phase 2 of
[`setta-4-director-command-center-plan.md`](../../plans/setta-4-director-command-center-plan.md).
It uses the same standalone production Electron renderer, deterministic fixtures,
scenario matrix, budgets, and profiling method documented in
[`setta-4-graph-renderer-scenarios-20260724.md`](setta-4-graph-renderer-scenarios-20260724.md).

The audit reviewed the completed phase as one change, including earlier Phase 1
contract work that the implementation loop had returned to. It did not start
Phase 3 or connect the standalone renderer to live Director state.

## Correction to the earlier evidence

The earlier artifact at
`.recordings/director-graph-renderer-performance/20260725T014701874Z/`
contained this level-2 WebGL console entry:

`WebGL: INVALID_OPERATION: texImage2D: ArrayBufferView not big enough for request`

The workflow rejected only level-3 console entries at that point. Therefore the
earlier report's statement that `renderer-console.jsonl` was clean was
incorrect, even though its numeric budgets and pixel checks passed.

The audit fixed both sides of that false result:

- an empty graph no longer attempts a zero-texel state upload after shader
  prewarming
- the performance workflow rejects renderer console entries at level 2 or above

The post-fix artifact's `renderer-console.jsonl` is empty.

## Audit result

Command:

`node desktop/tests/electron/director-graph-renderer-performance.test.mjs --skip-build`

All 19 scenario runs passed.

| Result | Observed | Budget or requirement |
| --- | ---: | --- |
| Maximum CPU frame-time p95 | 0.8 ms | ≤ 2 ms |
| Maximum GPU frame-time p95 | 1.768 ms | ≤ 4 ms |
| Maximum frame delta | 9.6 ms | no ≥ 50 ms dropped-frame event |
| Long tasks | 0 | 0 |
| Frames over 50 ms | 0 | 0 |
| Canvas-pixel checks | 19/19 | all pass |
| Sustained run | 60.032 s, 1,200 frames | 60 s routine scenario |
| Sustained heap | 9.5 → 9.5 → 9.5 MB | no growth |
| Sustained render scale | 0.85–1 | within the configured 0.4–1 range |

The matrix covered the real laptop viewport plus harness-standard, emulated 4K,
emulated 6K, phone DPR 3, and phone DPR 1 tiers. Representative laptop, phone,
and 6K screenshots were inspected after the run; their graph, labels, and
letterboxed framing remained intact.

The separate untimed 4K trace contains 361,222 events and 1,069
`ProxyMain::BeginMainFrame` events. GPU timer queries returned fresh results for
the accepted runs, and the trace/profile pass remained excluded from acceptance
timings.

## Other phase-audit invariants

The audited implementation also closes these renderer-boundary assumptions:

- zero-node snapshots preserve valid prewarmed texture state
- GPU timer results are returned once and query state is reset between scenarios
- hiding and showing the document preserves a pending scheduler wake
- only the sustained scenario may end at its declared duration ceiling
- reduced-motion mode removes autonomous graph, edge, label, particle, hover,
  camera, and fold animation
- the canvas has a named semantic region, its bitmap is hidden from assistive
  technology, interactive pills expose expansion state, and touch targets are
  at least 44 px
- packed snapshots reject invalid vocabulary, ordering, lifecycle, reference,
  cursor, and terminal-edge state at the runtime boundary
- the edge shader does not perform arithmetic on the sentinel used for an
  absent terminal time

Focused tests cover each invariant. The full matrix proves that their combined
normal-motion production renderer still meets the phase budgets.

Final accessibility inspection after the matrix made the 44 px inline minimum
explicit and stopped a stationary reduced-motion hover from keeping the frame
loop awake. The matrix's labels were already wider than 44 px and its
normal-motion scheduling path is unchanged, so these corrections do not alter
its pixels or timings. The focused renderer suite (118 tests) and the production
desktop build both passed after those final corrections.

## Artifacts

`.recordings/director-graph-renderer-performance/20260725T024106781Z/`
(git-ignored, local to the audited worktree):

- `graph-performance.json`
- `graph-performance-summary.json`
- `profile-desktop-4k.json`
- `trace-desktop-4k.json`
- `tier-*.png`
- `tier-*-environment.json`
- `renderer-console.jsonl`

Real 4K, 6K, and phone hardware, the optional 10-minute soak, and the
pre-cutover interactive baseline remain previously recorded release gates.
They were unavailable external verification and were not retried during this
audit.

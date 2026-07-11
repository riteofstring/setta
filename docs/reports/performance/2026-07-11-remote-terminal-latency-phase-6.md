# Remote Terminal Latency Phase 6 Verification

**Date:** 2026-07-11

**Phase status:** In progress. The interim remote Tailscale spot-check is
complete and is recorded below. The scheduler-decision segmentation, the
deterministic network-delay matrix, the remaining Go/TypeScript/renderer/
workflow coverage, and the final live validation have not started.

## Interim remote spot-check

### Instrumentation added for this measurement

Phases 2-4 removed the per-input HTTP path that the Phase 1 analyzer used for
input latency and remote clock calibration, so the duplex stream had no
measurable input path. Commit `b2ec9ab79` adds, as protocol 15:

- `handlerReceivedAt` and `ptyWriteCompletedAt` on the stream input
  acknowledgement, populated only for newly accepted PTY writes and left empty
  for duplicate-suppression acknowledgements.
- Content-free `terminal_input_stream_dispatched` and
  `terminal_input_stream_ack_received` recorder events in Electron main. The
  renderer input trace rides on the pending stream frame itself, so recorded
  events carry the renderer-domain sequence for analyzer joins and the
  transport-domain sequence separately; acknowledgements with no exact pending
  frame record nothing rather than guessing.
- Analyzer stream input stages (`mainToDispatch`, `dispatchToHandler`,
  `handlerToPTYWrite`, `dispatchToAck`, `rendererToPTYWrite`, `rendererToAck`)
  and remote clock calibration from the minimum dispatch-to-ack round trip,
  replacing the dead HTTP stages and the dead `ipc.jsonl` preload-time join.
- Removal of the vestigial `httpDispatchedAt`/`mainReceivedAt` trace fields
  from the HTTP era.

### Build and reproduction

| Field | Value |
| --- | --- |
| Source | `b2ec9ab79` (terminal: instrument duplex stream input latency) |
| Backend | `phase6-protocol15-b2ec9ab79`, protocol 15, deployed to the devbox `setta-serve.service` |
| Desktop | Production build of the same commit |
| Artifact | `.recordings/remote-terminal-latency/phase-6-tailscale` |
| Run ID | `terminal-latency-29d0c45b-9538-46c3-96ce-d6c4d7a1381e` |
| Runtime | `setta-devbox` (`setta-copper-lantern`), AWS `us-east-1` |
| Route | Ten direct samples via `100.52.178.220`: 36, 37, 35, 37, 38, 36, 43, 35, 36, 38 ms; no DERP samples |
| Workspace | Temporary `/tmp/setta-terminal-latency-phase6-20260711T1826Z` |
| Terminal session | `terminal_cad87613284ba6dca89b62d8f58822fa` |
| Fast-typing output observed | Yes |
| Result | Passed |

The workload is the unchanged production Electron terminal workflow used in
Phase 1 and Phase 5: 125 ms-cadence typing, fast typing with no added delay,
paste, arrows, backspace, Ctrl-C, 200 sustained output lines, reload and
reattach, and close, against a real remote PTY through the production
renderer/preload/main/WebSocket path. The remote run used a temporary copy of
the signed-in runtime registry. Before the run, earlier phase-run workspace
directories that a devbox `/tmp` cleanup had removed were recreated so
workspace restore did not produce unrelated IPC failures.

The devbox clock was 28.5 ms ahead of the desktop by the analyzer's
minimum-round-trip midpoint estimate (minimum round trip 35 ms, uncertainty
±17.5 ms). Cross-host one-way stages apply that offset. The analyzer command
was:

```sh
pnpm --silent -C desktop analyze:terminal-latency \
  ../.recordings/remote-terminal-latency/phase-6-tailscale
```

### Input path against the Phase 1 remote baseline

Input samples: 110 in both runs. Phase 1 values are the direct-Tailscale
protocol 11 per-character HTTP baseline; Phase 6 values are the protocol 15
duplex stream.

| Input stage | Phase 1 p50 | Phase 6 p50 | Phase 1 p95 | Phase 6 p95 | Phase 1 max | Phase 6 max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Client round trip (HTTP dispatch-to-response vs stream dispatch-to-ack) | 69 ms | 42 ms | 275 ms | 108 ms | 307 ms | 127 ms |
| Renderer receipt to PTY write completion, clock-corrected | 33 ms | 19.5 ms | 254 ms | 41.5 ms | 288 ms | 105.5 ms |
| Handler receipt to PTY write completion | 0 ms | 0 ms | 1 ms | 0 ms | 1 ms | 1 ms |
| Renderer receipt to preload receipt | 0 ms | 0 ms | 0 ms | 0 ms | 1 ms | 1 ms |
| Preload receipt to main receipt | 0 ms | 0 ms | 1 ms | 1 ms | 3 ms | 1 ms |
| Main receipt to dispatch | 0 ms | 0 ms | 0 ms | 1 ms | 1 ms | 1 ms |

The headline plan metric, renderer `onData` to PTY write acknowledgement
(`rendererToAck`), measured 42 ms p50, 108 ms p95, 127 ms max. Phase 1 had no
directly recorded equivalent; its closest proxy is the HTTP round trip plus
sub-millisecond renderer/preload/main stages.

Against the goal budgets, indicatively: with this run's direct route at
35-43 ms, transport overhead beyond RTT is roughly 5 ms at p50, within the
15 ms p50 budget. The p95 round trip of 108 ms against a 43 ms route p95
suggests roughly 65 ms p95 overhead, above the 35 ms p95 budget; the p95
population is the fast-typing burst, where acknowledgements queue behind the
per-session serialized PTY writes of preceding keystrokes. Formal budget
assertions are deferred to the deterministic delay-profile workflow with the
recorded interactive/coalesced segmentation, as the plan requires. Fast typing
preserved the ordered output marker in this run; in Phase 1 the same segment
lost ordering at the command boundary and the marker was absent.

### Output path against the Phase 1 remote baseline

Output samples with every stage: 556 in Phase 1, 368 in Phase 6 (Phase 5
frame-coalescing joins bulk chunks into fewer xterm writes, and the commanded
workload is fixed while chunk counts vary).

| Output stage | Phase 1 p50 | Phase 6 p50 | Phase 1 p95 | Phase 6 p95 |
| --- | ---: | ---: | ---: | ---: |
| Backend emission to Electron main, clock-corrected | 63 ms | 68.5 ms | 268 ms | 150.5 ms |
| Electron main to renderer receipt | 6 ms | 0 ms | 18 ms | 5 ms |
| Electron main to xterm write callback | 9 ms | 8 ms | 77 ms | 20 ms |
| Renderer receipt to xterm write callback | 2 ms | 8 ms | 59 ms | 20 ms |
| Xterm write callback to next paint | 10 ms | 15 ms | 15 ms | 22 ms |
| Backend emission to next paint, clock-corrected | 110 ms | 98.5 ms | 286 ms | 183.5 ms |

The analyzer's aggregate maximum for emission-to-main was 80.9 s. That single
sample is the reload/reattach replay: the stream retains original emission
timestamps on replayed events, so buffer retention time appears as delivery
latency, and exactly one replayed event joined all renderer stages (the rest
were frame-coalesced). Excluding delivery lag above two seconds, the live
maximum is 151 ms for emission-to-main and 183 ms for emission-to-paint. The
next plan item records the scheduler's immediate/coalesced decision so the
analyzer can segment replay and bulk output from interactive output instead
of this ad hoc exclusion.

### Spot-check conclusion

No unforeseen remote stream problem surfaced: the ticket round trip, the
long-lived WebSocket over the Tailscale HTTPS path, reload/reattach replay,
and runtime switching all behaved as designed against the deployed runtime.
Input round-trip p95 improved 2.5x over the per-character HTTP baseline,
input ordering survived fast typing, and output tail latency improved at
every percentile beyond p50. Phase 6 can proceed to the deterministic
test-matrix work.

## Verification

- `./scripts/format.sh`, focused Go terminal/httpapi tests through
  `./scripts/go.sh`, focused desktop unit tests, `pnpm typecheck`, and
  `pnpm lint` passed on the instrumentation change.
- `./check_quality.sh --git-changes` passed before the commit. The heavy
  `--all` gate is deferred to the end of the phase per the working agreement;
  the plan's completion checklist still requires it.
- The production Electron terminal workflow passed locally and against the
  direct-Tailscale runtime, including the new dispatched/acknowledged
  recording assertions and the no-terminal-contents recording checks.
- The local workflow analyzer run produced all 110 input samples
  (dispatch-to-ack p95 1 ms locally), confirming the instrumentation
  end-to-end before the remote run.

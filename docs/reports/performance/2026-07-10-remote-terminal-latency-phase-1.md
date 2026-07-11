# Remote Terminal Latency Phase 1 Baseline

**Date:** 2026-07-10
**Phase status:** Complete. The evidence gate supports proceeding to the duplex
transport design in Phase 2.

## Build and reproduction

| Field | Local baseline | Tailscale baseline |
| --- | --- | --- |
| Source | Uncommitted Phase 1 changes on `81450fad8abd9729015c68d52a54cba39bcf46bf` | Same source |
| Backend | Development build, protocol 11 | `phase1-protocol11-81450fad8`, protocol 11 |
| Desktop | Electron 41.7.0, Chrome 146.0.7680.216, Node 24.15.0 | Same desktop build |
| Artifact | `.recordings/remote-terminal-latency/phase-1-local-pass` | `.recordings/remote-terminal-latency/phase-1-tailscale` |
| Run ID | `terminal-latency-97b98eda-10fd-4d4d-9b29-6895710d22ec` | `terminal-latency-76e73402-33f2-4e07-9a9f-ea641e9738b5` |
| Runtime | Local spawned runtime | `setta-devbox`, AWS `us-east-1` (`us-east-1a`) |
| Route | Not applicable | Ten direct samples; no DERP samples |
| Workspace | Temporary local `workspace-root` | Temporary `/tmp/setta-terminal-latency-phase1-20260711T0335Z` |
| Terminal session | `terminal_724d35c61fbdef8e5c14a3a70475fc70` | `terminal_8f434ab8861ec57461c4307a3330e638` |
| Fast-typing output observed | Yes | No; the ordered output marker was absent after one second |
| Result | Passed | Passed after recording the fast-typing ordering failure and resetting the shell |

The deterministic workload types a command one character at a time at 125 ms
cadence, types a second command without added delay, pastes a whole command,
exercises left/right arrows, Backspace, and Ctrl-C, emits 200 numbered output
lines, reloads and reattaches the terminal, and closes a confirmed running
terminal. A 400 ms settle interval separates multi-byte setup/paste input from
Enter so those cases do not inherit the known concurrent-request race; the
fast-typing segment intentionally has no added delay. App data and both
workspaces are temporary. The remote run uses a temporary copy of the signed-in
runtime registry and does not mutate the developer's desktop registry.

The analyzer command was:

```sh
pnpm --silent -C desktop analyze:terminal-latency \
  ../.recordings/remote-terminal-latency/phase-1-local-pass
pnpm --silent -C desktop analyze:terminal-latency \
  ../.recordings/remote-terminal-latency/phase-1-tailscale
```

The workflow asserts that terminal input and output contents do not occur in
the IPC, backend HTTP, app-event, or renderer-event performance records.

## Local measurements

Input samples: 110. Output samples with every output stage: 608.

| Input stage | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| Renderer receipt to preload receipt | 0 ms | 1 ms | 1 ms | 1 ms |
| Preload receipt to main receipt | 0 ms | 1 ms | 2 ms | 4 ms |
| Main receipt to HTTP dispatch | 0 ms | 0 ms | 1 ms | 1 ms |
| HTTP dispatch to handler receipt | 1.5 ms | 8.5 ms | 21.5 ms | 212.5 ms |
| Handler receipt to PTY write completion | 0 ms | 1 ms | 11 ms | 58 ms |
| HTTP dispatch to response receipt | 3 ms | 15 ms | 35 ms | 317 ms |
| Renderer receipt to PTY write completion | 1.5 ms | 9.5 ms | 34.5 ms | 271.5 ms |

| Output stage | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| Backend emission to Electron main | 3.5 ms | 879.5 ms | 882.5 ms | 884.5 ms |
| Electron main to renderer receipt | 5 ms | 102 ms | 111 ms | 122 ms |
| Electron main to xterm write callback | 15 ms | 530 ms | 590 ms | 604 ms |
| Renderer receipt to xterm write callback | 9 ms | 489 ms | 493 ms | 493 ms |
| Xterm write callback to next paint | 15 ms | 109 ms | 110 ms | 110 ms |
| Backend emission to next paint | 295.5 ms | 945.5 ms | 951.5 ms | 951.5 ms |

These aggregate output values include the sustained-output portion. They show
material renderer/output tail cost under the controlled workload; they are not
presented as isolated-character percentiles. They expose severe output-burst
tail latency even without a network hop.

## Direct-Tailscale measurements

Input samples: 110. Output samples with every output stage: 556.

| Input stage | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| Renderer receipt to preload receipt | 0 ms | 0 ms | 1 ms | 1 ms |
| Preload receipt to main receipt | 0 ms | 1 ms | 2 ms | 3 ms |
| Main receipt to HTTP dispatch | 0 ms | 0 ms | 0 ms | 1 ms |
| HTTP dispatch to handler receipt, clock-corrected | 33 ms | 254 ms | 264 ms | 288 ms |
| Handler receipt to PTY write completion | 0 ms | 1 ms | 1 ms | 1 ms |
| HTTP dispatch to response receipt | 69 ms | 275 ms | 285 ms | 307 ms |
| Renderer receipt to PTY write completion, clock-corrected | 33 ms | 254 ms | 264 ms | 288 ms |

| Output stage | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| Backend emission to Electron main, clock-corrected | 63 ms | 268 ms | 269 ms | 269 ms |
| Electron main to renderer receipt | 6 ms | 18 ms | 19 ms | 82 ms |
| Electron main to xterm write callback | 9 ms | 77 ms | 78 ms | 84 ms |
| Renderer receipt to xterm write callback | 2 ms | 59 ms | 70 ms | 72 ms |
| Xterm write callback to next paint | 10 ms | 15 ms | 18 ms | 32 ms |
| Backend emission to next paint, clock-corrected | 110 ms | 286 ms | 287 ms | 287 ms |

The ten route samples captured in `tailscale-ping.txt` were all direct through
`100.52.178.220:23625`: 92, 45, 48, 45, 43, 45, 51, 48, 39, and 54 ms. Their
median is 45 ms and p95 is 92 ms. There was no DERP population in this run, so
no DERP app distribution is reported.

The HTTP request round trip exceeded the route RTT by approximately 24 ms at
p50 and 183 ms at p95 when comparing the captured distributions. This misses
the 15 ms p50 and 35 ms p95 transport-overhead budgets. The fast-typing marker
was observed locally and absent remotely; the earlier remote attempt displayed
a scrambled command, directly confirming that concurrent per-character HTTP
requests do not preserve input order.

The devbox clock was 74 ms ahead of the desktop by the analyzer's minimum-RTT
midpoint estimate. Cross-host one-way stages above apply that offset and carry
an estimated ±19 ms uncertainty. Same-host and round-trip stages do not depend
on that calibration.

## Hypothesis evaluation

- **H1 — per-input HTTP dominates remote typing latency: confirmed.** Direct
  Tailscale HTTP round trips measured 69 ms p50 and 275 ms p95 while the remote
  handler-to-PTY write was 1 ms p95. Fast typing also lost ordering at the
  visible command boundary. Phase 2 should proceed.
- **H2 — DERP routing is the primary cause: rejected for this reproduction.**
  All ten route samples were direct. No conclusion is made about separate DERP
  behavior because this controlled run contained no DERP samples.
- **H3 — SSE delivery or renderer work adds material tail latency: supported
  for the aggregate workload.** Direct-Tailscale main-to-xterm write was 77 ms
  p95 against the 8 ms budget. The local sustained-output run was worse, and
  local xterm-write-to-paint reached 109 ms p95. Phase 5 should use
  workload-segmented profiles after the transport work.

## Verification

- `./scripts/format.sh`, `git diff --check`, the focused Go HTTP API suite, and
  51 focused main/preload/renderer tests passed.
- The complete desktop lint and complexity checks, typecheck, production build,
  dead-code check, and unit suite passed; the unit suite covered 139 files and
  995 tests.
- The production Electron terminal workflow passed locally, passed against the
  direct-Tailscale runtime, and passed again in the required-workflow gate.
- `./check_quality.sh --all` was run after the final source edit. Its terminal
  and deterministic checks passed, but the overall gate remains red for two
  unrelated repository issues: four live Codex tests reject the newly
  advertised `max` reasoning effort, and the ultrawide-layout workflow cannot
  find its E2E driver after reload. The latter reproduces in isolation.
- `./scripts/check_supply_chain.sh` was run and reports GO-2026-5856 in the
  repository-pinned Go 1.26.4 standard library; the advisory is fixed in Go
  1.26.5. Phase 1 did not add or update dependencies.

Phase 1 is complete. This work stops here; Phase 2 has not started.

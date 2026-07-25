# Setta 4 Command Center — Phase 4 Audit

Date: 2026-07-25

## Result

Phase 4 remains open. The audit found and fixed production-shell, projection,
accessibility, and verification-boundary defects. The broad deterministic gate
and the one live-provider suite are green; a focused production workflow, rather
than another broad run, postdates the final UI-only correction.

The integrated performance gate is not complete. Its final broad attempt stopped
at the harness-standard viewport because the newly added in-frame WebGL probe
used a dense-fixture threshold against a sparse live graph. The probe was
corrected and its narrow lifecycle and complete viewport/DPR workflows pass, but
the full matrix was not restarted after the final broad attempt, in accordance
with the audit's at-most-once rule.

## Reviewed Change

The coherent review covered
`86fb3e14a6eb984fab90c3921f781bd98e1e1658..0dca52d427856c7c88d4935c584fbd6b14af56c3`.
Phase 4 starts at `f9ad971a0`; the history contains no earlier Phase 4 work from
a mid-phase loop restart.

The static pass covered the production renderer mount, Director subscription and
projection, text and voice submission, workstream navigation, settings and
workspace state, approvals, resources, artifacts, compact history, WebGL
integration, deterministic Electron ownership, and performance instrumentation.
It did not start Phase 5 deletion work.

## Corrections

- The projector now preserves the user's authored goal and action while placing
  the completed assistant response on the terminal outcome node with both
  terminal and response provenance. Generated gallery fixtures were regenerated
  from the Go owner.
- The app reloads the authoritative workspace session after runtime connection.
  A session opened from the resource rail invalidates stale in-flight loads, and
  a folderless resource request now offers a native Choose folder action before
  resolving the durable request.
- Director events still apply losslessly in sequence, while visible React
  publication is bounded to one animation frame and best-effort text deltas do
  not rebuild or repack the graph. The graph clock is calibrated to durable
  event time instead of page uptime.
- Text submits on Enter, preserves Shift+Enter and IME composition, and restores
  a failed draft. Navigation and rail actions consume rejected intent promises
  through their stable shell-level error surface.
- Conversation narration subscription is disabled for the Director-only shell,
  avoiding a projection dependency the cut-over app no longer mounts; Director
  receipt playback remains active.
- History is limited to user goals and terminal responses. Resource and artifact
  failures use stable public copy, voice and rail arrivals have persistent live
  regions, transient focus restoration is conditional, and the composer keeps a
  16 px mobile-safe input size.
- The selected Now summary no longer presents a resolved resource or approval
  blocker while a workstream is running or queued. Status-aware milestone
  presentation keeps terminal and currently actionable summaries without
  contradicting the live status and activity list.
- Pane-era Electron workflows were moved out of the current required tier. The
  required production-path tier now exercises the Director shell, local Director
  voice submission, and microphone permissions; the main workflow covers
  folderless start, native folder selection, settings continuity, queueing,
  steering, cancellation, approval redaction, failure and recovery, child work,
  artifact detail, compact history, pushed events, and restart.

## Deterministic And Live Verification

Broad command:

```sh
./scripts/test_topic_conversation_workflows.sh --keep-artifacts
```

The first broad attempt found one TypeScript nullability error before producing a
new desktop build. Its Go contract suites and all 1,215 desktop tests passed; its
Electron result was discarded because it necessarily exercised the preceding
build. All four live Codex suites passed in this single attempt with local
ChatGPT auth and without `OPENAI_API_KEY`:

- agent protocol
- conversation side isolation
- topic-conversation lifecycle
- Director command center

After the narrow production build passed, the final deterministic command was:

```sh
./scripts/test_topic_conversation_workflows.sh \
  --skip-build \
  --deterministic-only \
  --keep-artifacts
```

It passed:

- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 135 desktop test files and 1,215 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- microphone-permissions Electron workflow

The live suite was not duplicated after its green result.

Visual inspection of the later viewport evidence found one final UI-only
truthfulness defect: the selected workstream was running while its summary still
described the resolved folder request. After that fix, the narrow production
build, all 12 command-center shell tests, and the Director command-center
Electron workflow passed. The Electron workflow now asserts the running summary
through main, preload, HTTP, store, subscription, and renderer paths. Its artifact
is:
`.recordings/director-command-center/20260725T124123747Z/`.

The already-green broad deterministic gate was not duplicated after this narrow
fix. Consequently, its broad result does not postdate the final UI-only edit;
the focused production workflow does.

## Performance Evidence

Command under audit:

```sh
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build \
  --keep-artifacts
```

Environment:

| Field     | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| Machine   | MacBook Pro `MacBookPro18,3`                                      |
| CPU / GPU | Apple M1 Pro, 8 CPU cores, 14 GPU cores, Metal 4                  |
| Memory    | 32 GB                                                             |
| OS        | macOS 26.5.2, build 25F84, arm64                                  |
| Display   | Built-in Liquid Retina XDR, 3024×1964 native                      |
| Runtime   | Electron 41.7.0, Node 25.2.1, pnpm 10.23.0                        |
| Source    | `0dca52d427856c7c88d4935c584fbd6b14af56c3` plus this audit change |
| Build     | `pnpm -C desktop build`                                           |

The pixel probe now reads the non-preserved WebGL drawing buffer in the same
animation frame that the production graph draws. This avoids treating the
compositor-cleared buffer as a blank graph. Sparse live graphs use peak energy
plus occupied-cell coverage; the denser standalone fixture harness retains its
stronger framing check.

Green measurements:

| Tier / scenario       | Frames |       p95 / p99 / max | Long tasks | DOM |
| --------------------- | -----: | --------------------: | ---------: | --: |
| Laptop / lifecycle    |    149 | 10.1 / 10.3 / 10.4 ms |          0 | 192 |
| Laptop / one active   |     59 |    8.9 / 9.5 / 9.9 ms |          0 | 147 |
| Harness / one active  |     60 |   9.0 / 9.2 / 10.2 ms |          0 | 147 |
| 6K / one active       |     60 |   8.7 / 9.7 / 10.0 ms |          0 | 147 |
| Phone @3 / one active |     60 |   9.0 / 9.2 / 10.1 ms |          0 | 147 |
| Phone @1 / one active |     60 |    8.7 / 9.6 / 9.8 ms |          0 | 147 |
| Laptop / interleaved  |     62 |  9.0 / 10.1 / 16.6 ms |          0 | 178 |
| 4K / interleaved      |     60 |    8.6 / 8.7 / 8.9 ms |          0 | 178 |

Every row had zero frames over 50 ms, stayed inside the committed frame-delta
assertions, passed the in-frame canvas check, and stayed inside DOM bounds.

Artifacts:

- lifecycle:
  `.recordings/director-command-center-performance/20260725T123516205Z/`
- viewport and DPR matrix:
  `.recordings/director-command-center-performance/20260725T123652718Z/`
- graph-update selector:
  `.recordings/director-command-center-performance/20260725T124547638Z/`
- invalid post-presentation 2D probe:
  `.recordings/director-command-center-performance/20260725T123211862Z/`
- over-strict sparse-graph calibration:
  `.recordings/director-command-center-performance/20260725T123550568Z/`

The Phase 2 standalone graph report remains the authoritative CPU-mark,
GPU-timer-query, quality-tier, and framing comparison. No standalone
renderer/harness implementation changed in this audit, so that already-green
gate was not duplicated.

## Remaining Phase 4 Verification

The graph-update selector passed after this audit and is recorded in
[`setta-4-command-center-graph-update-performance-20260725.md`](setta-4-command-center-graph-update-performance-20260725.md).
One full integrated performance run is still required on the corrected probe.
The repository-actionable rows that remain are:

- navigation among 100 workstreams at laptop and 4K
- ten minutes of sustained activity and memory observation at laptop
- restart and durable replay at laptop and harness-standard

Real 4K, 6K, and phone hardware and the side-by-side review on representative
real displays remain the previously recorded release gates. They were not
retried or treated as repository-verification failures.

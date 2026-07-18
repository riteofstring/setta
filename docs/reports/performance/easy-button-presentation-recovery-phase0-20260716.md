# Easy Button Presentation Recovery Phase 0 Baseline - 2026-07-16

## Scope

This is the executable baseline for Phase 0 of
`docs/plans/easy-button-presentation-recovery-20260715.md`. It exercises the
production Electron/main/preload/renderer/HTTP/store path with temporary app
data, a fake Codex CLI, a fake speech provider, and a small supplied dataset.
It does not scan or count the repository.

Command:

```bash
node desktop/tests/electron/run-workflows.mjs \
  --workflow easy-button-presentation-recovery-phase0 \
  --skip-build \
  --keep-artifacts
```

Result: passed.

Local artifact:
`.recordings/easy-button-presentation-recovery-phase0/20260716T055842489Z`

The recording directory is intentionally untracked. Its `summary.json`,
structured logs, screenshot, HTTP trace, IPC trace, renderer console trace, and
renderer layout events were present when this report was written.

## Baseline Metrics

The supplied dataset was:

| Language | Lines |
| --- | ---: |
| Go | 34 |
| TypeScript | 21 |
| CSS | 8 |

Observed current behavior:

| Metric | Value |
| --- | ---: |
| Trajectory events | 7 |
| Narrator events | 3 |
| Milestones | 2 |
| Final summaries | 1 |
| Current focus revisions | 2 |
| Recorded rendered scroll owners | 8 |

Artifact output:

| Field | Value |
| --- | --- |
| Kind | `file` |
| URI | `/tmp/topic-turn-2-artifact.png` |
| Title | `Generated image` |
| Metadata keys | `providerItemId` |
| Typed payload branch present | `false` |

Speech playback latency from narrator creation to renderer observation:

| Event | Action | Latency |
| --- | --- | ---: |
| First milestone | enqueued | 6 ms |
| First milestone | play | 15 ms |
| First milestone | completed | 16 ms |
| Second milestone | enqueued | 12 ms |
| Final summary | enqueued | 15 ms |
| Final summary | play | 21 ms |
| Final summary | completed | 22 ms |

Rendered scroll owners included the NOW rail, artifact rail, agent text, and
terminal summary. The summary captured all owners in `summary.json`; this
report records the count rather than freezing the DOM as a golden fixture.

## Interpretation

This baseline locks in the current regression shape before the recovery phases:
structured data produces a reference-only file artifact, narrator projection
rewrites focus during ordinary work and terminal output, and the Easy Button
surface still presents multiple scroll owners below the mic. Later phases must
replace these outcomes rather than preserve this baseline.

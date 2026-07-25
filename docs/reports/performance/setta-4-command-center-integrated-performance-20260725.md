# Setta 4 Command Center - Integrated Production-Shell Performance

Date: 2026-07-25

## Scope

This starts Phase 4 item 8 in
`docs/plans/setta-4-director-command-center-plan.md`: integrated performance
measurement of the production Director command-center shell.

The workflow measures the real app shell through Electron main, preload, HTTP,
the durable store, the Director registry subscription, React rails/composer, and
the WebGL2 graph mount. It uses the scripted Codex provider already used by the
deterministic Director workflow, so no credentials, GUI-only setup, or remote
access are required.

This is not the Phase 4 audit matrix. It is the first focused production-shell
guardrail and report.

## Method

Command:

```sh
pnpm -C desktop build
node desktop/tests/electron/director-command-center-performance.test.mjs --skip-build
```

Registered workflow selector:
`director-command-center-performance` in the Electron `performance` tier.

The workflow records animation-frame cadence, renderer long tasks, DOM mutation
counts, mounted shell DOM size, graph label count, visible workstream-dot count,
screenshots, and renderer console errors. It asserts the same frame-budget
convention as the existing Electron performance harness.

Environment captured by the run:

| Field              | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Viewport           | 1512 x 982                                                             |
| Device pixel ratio | 2                                                                      |
| Runtime            | Electron 41.7.0 production build                                       |
| Source base        | `447b7b84b` plus this measurement workflow/report commit               |
| Artifact directory | `.recordings/director-command-center-performance/20260725T105859092Z/` |

## Scenarios

| Scenario                   | Production path exercised                                                                                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycle`                | Folderless Director submission, durable resource request, resource binding, active run, queueing, steering, structured approval answer from the rail, failure, recovery, artifact emission, and rich artifact detail opening |
| `navigate-100-workstreams` | 100 durable workstreams in the app-scoped registry and 80 `move_selection` dispatches while the top navigator remains bounded to 19 visible status dots                                                                      |

Both scenarios passed. The renderer console was empty.

## Results

| Scenario                 | Frames | Avg FPS | p50/p95/p99/max frame delta | Long tasks | Frames >50 ms | DOM descendants | Graph labels | Visible dots |
| ------------------------ | -----: | ------: | --------------------------- | ---------: | ------------: | --------------: | -----------: | -----------: |
| lifecycle                |    128 |  120.04 | 8.3 / 9.7 / 10.3 / 10.3 ms  |          0 |             0 |             139 |            7 |            1 |
| navigate-100-workstreams |     62 |  119.67 | 8.3 / 10.2 / 10.3 / 10.3 ms |          0 |             0 |             198 |            7 |           19 |

DOM budgets asserted by the workflow:

| Budget                  | Limit | Observed max |
| ----------------------- | ----: | -----------: |
| Body descendants        |   900 |          198 |
| Graph labels            |    80 |            7 |
| Visible workstream dots |    19 |           19 |

Mutation counts:

| Scenario                 | Callbacks | Records | Added nodes | Removed nodes | Attribute records | Character-data records |
| ------------------------ | --------: | ------: | ----------: | ------------: | ----------------: | ---------------------: |
| lifecycle                |       172 |   1,437 |         173 |           151 |             1,150 |                     59 |
| navigate-100-workstreams |       145 |   1,283 |         217 |           219 |               639 |                    242 |

## Result

Pass. The first integrated production-shell guardrail sustained the observed
120 Hz frame cadence, had no renderer long tasks, kept navigation bounded with
100 workstreams, and exercised resource, approval, artifact, failure, recovery,
graph, rail, and composer state through production paths.

## Remaining Gates

Recorded once here, not treated as routine implementation blockers:

- The full Phase 4 audit still needs the complete required live scenario set and
  comparison against the Phase 2 standalone graph renderer report.
- Real 4K, 6K, phone hardware, and the side-by-side real-display mockup review
  remain release gates already named by the plan and mockup checklist.
- GPU timer-query percentiles are still owned by the standalone graph harness;
  this integrated shell probe records user-visible frame cadence, long tasks,
  DOM bounds, screenshots, and renderer console health.

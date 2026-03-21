# Section Benchmark Shell Rollback Rerun

Date: `2026-03-20`

Question:

- After restoring the shared top-level shell toward the `bf6487690` grid-era behavior, does the standardized paired benchmark improve enough to justify keeping the rollback?

Implementation under test:

- Restored the shared shell toward the grid-era baseline in:
  - `frontend/src/components/Section/Container/sectionChrome.ts`
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
- Explicitly deferred:
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
  - the old gesture-time compositor-promotion path remains off because the current contract still forbids motion blur as an accepted tradeoff

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-shell-rollback-rerun`
- pre-rollback baseline for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-paired-baseline`

Method:

- Same canonical scenes and same CDP replay flow as the paired baseline:
  - `settings` targeting `backendArgs`
  - `tier1Synthetic` targeting `callable_00`
- Same reusable runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same live ports:
  - worktree:
    - frontend `http://127.0.0.1:3012`
    - CDP `http://127.0.0.1:9234`
  - untouched `main`:
    - frontend `http://127.0.0.1:3087`
    - CDP `http://127.0.0.1:9309`

Relevant automated verification before the rerun:

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionChrome.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Section/Header/SectionHeader.test.tsx`
  - `35` tests passed

Benchmark-window totals after the shell rollback, in milliseconds:

| Scene | Branch | Window duration | `Paint` | `UpdateLayoutTree` | `RunTask` | `Commit` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `settings` | untouched `main` | `18034.158` | `7.624` | `74.107` | `3277.194` | `52.205` |
| `settings` | worktree | `18049.941` | `159.227` | `68.796` | `4194.861` | `58.082` |
| `tier1Synthetic` | untouched `main` | `17416.033` | `15.138` | `21.032` | `15606.217` | `114.841` |
| `tier1Synthetic` | worktree | `17550.145` | `1433.618` | `21.212` | `16065.687` | `125.415` |

Worktree deltas versus the pre-rollback baseline:

| Scene | Phase | Metric | Before | After | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `619.310` | `159.227` | `-460.083` |
| `settings` | overview horizontal pan slow | `Paint` | `118.025` | `29.623` | `-88.402` |
| `settings` | overview vertical pan slow | `Paint` | `121.345` | `28.612` | `-92.733` |
| `settings` | overview-to-detail zoom slow | `Paint` | `24.234` | `11.230` | `-13.004` |
| `settings` | detail-to-overview zoom slow | `Paint` | `17.753` | `9.795` | `-7.958` |
| `tier1Synthetic` | benchmark | `Paint` | `1533.374` | `1433.618` | `-99.756` |
| `tier1Synthetic` | benchmark | window duration | `20997.810` | `17550.145` | `-3447.665` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `313.508` | `280.745` | `-32.763` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `323.234` | `319.938` | `-3.296` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `76.156` | `61.551` | `-14.605` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `63.630` | `65.669` | `+2.039` |

Interpretation:

- `settings` improves materially:
  - full-window `Paint` drops from `619.310ms` to `159.227ms`
  - the slow overview pans drop from roughly `118-121ms` paint down to roughly `29ms`
  - the worktree is still worse than untouched `main`, but the shell rollback clearly removes a large chunk of the paint regression
- `tier1Synthetic` improves only partially:
  - full-window `Paint` drops from `1533.374ms` to `1433.618ms`
  - the benchmark window shortens a lot, mainly because `RunTask` drops, but the paint totals are still extremely high
  - the slow vertical overview pan barely changes on paint, and one zoom phase regresses slightly
- Read:
  - the selective shell rollback is worth keeping as a Phase 1 checkpoint
  - it is not sufficient to solve the dense Tier 1 problem by itself
  - the next meaningful gains still have to come from deeper body/render-mode work, not more top-level shell churn

CDP visual sanity:

- DevTools pages opened successfully on:
  - `http://127.0.0.1:3012/settings`
  - `http://127.0.0.1:3087/settings`
- The shared shell remained functional on both pages:
  - header controls visible
  - section chrome intact
  - no obvious auth or layout collapse
- Targeted first-section screenshots were captured at:
  - `perf/tmp/worktree-settings-first-section.png`
  - `perf/tmp/main-settings-first-section.png`
- The captured first-section image bounds were close but not identical:
  - worktree: `476x300`
  - untouched `main`: `468x304`
- That is a useful visual sanity check, but it is not yet a full pixel-parity gate for the touched shell seam.

Conclusion:

- Keep the selective shell rollback.
- Do not spend another cycle trying to solve the full problem at the shell layer.
- Move on to the next planned phase:
  - continue Tier 1 body simplification
  - add the section-body render-mode / preview infrastructure
  - keep using the same paired benchmark matrix after each checkpoint

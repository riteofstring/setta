# All Settings Branch Commit Rebenchmark (Corrected)

Date: 2026-03-02
Area: frontend
Branch: `frontend-performance`

## Goal

Recompute `Settings -> All Settings` performance numbers across key commits in this branch after suspecting prior CDP-server measurement issues.

## Scenario

- Screen: `Settings` project, `All Settings` view
- Interaction loop:
  - `All Settings -> Core`
  - `Core -> All Settings`
- Browser/runtime: Playwright Chromium via `./scripts/run-playwright-e2e.sh`
- Workspace/data: disposable e2e workspace seeded by test harness (`setta-settings-project.json`)
- Sampling:
  - warmup cycles: `2`
  - measured cycles: `9`
  - reported values: median per commit

## Method

A dedicated local benchmark spec measured:

- elapsed time (`click` to target view settled)
- `longtask` total duration (via `PerformanceObserver`)
- `longtask` count

for both tab-switch directions.

Note: this rebenchmark intentionally uses one identical harness across all commits for comparability.

## Corrected Medians By Commit

| Commit | Context | `All -> Core` elapsed (ms) | `All -> Core` longtask total (ms) | `Core -> All` elapsed (ms) | `Core -> All` longtask total (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| `f54045e8` | plan commit baseline | `487.2` | `145` | `1128.8` | `901` |
| `d13114f7` | edge-handle updates | `466.9` | `139` | `1033.1` | `804` |
| `689a182b` | remove dead param-area measurements | `517.2` | `132` | `1048.1` | `815` |
| `63b78c14` | temporary height write batching | `455.2` | `122` | `1107.5` | `887` |
| `dff8bad0` | header/kwargs layout-read work | `526.5` | `206` | `1136.0` | `866` |
| `5dca5073` | current branch head | `446.4` | `116` | `1044.1` | `819` |

## Stepwise Delta (Median, New vs Previous)

| Transition | `All -> Core` elapsed | `All -> Core` longtask | `Core -> All` elapsed | `Core -> All` longtask |
| --- | ---: | ---: | ---: | ---: |
| `f54045e8 -> d13114f7` | `-4.2%` | `-4.1%` | `-8.5%` | `-10.8%` |
| `d13114f7 -> 689a182b` | `+10.8%` | `-5.0%` | `+1.5%` | `+1.4%` |
| `689a182b -> 63b78c14` | `-12.0%` | `-7.6%` | `+5.7%` | `+8.8%` |
| `63b78c14 -> dff8bad0` | `+15.7%` | `+68.9%` | `+2.6%` | `-2.4%` |
| `dff8bad0 -> 5dca5073` | `-15.2%` | `-43.7%` | `-8.1%` | `-5.4%` |

## Overall Delta (Head vs Baseline)

`5dca5073` relative to `f54045e8`:

- `All Settings -> Core`
  - elapsed: `-8.4%`
  - longtask total: `-20.0%`
- `Core -> All Settings`
  - elapsed: `-7.5%`
  - longtask total: `-9.1%`

## Notes

- Absolute timings differ from previously published values; this pass is the corrected branch-to-branch comparison under one consistent harness.
- The strongest net gain in this corrected pass is lower long-task cost in both directions at branch head, with a larger reduction in `All -> Core` than in `Core -> All`.

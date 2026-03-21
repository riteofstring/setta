# Section Benchmark Tier 1 Switch Compact Host Rerun

Date: `2026-03-21`

Question:

- Does shrinking the shared switch value host to an intrinsic-width compact surface help the real `settings` target enough to keep as the next Tier 1 non-code value-host experiment?

Implementation under test:

- Experimental change under test:
  - add a compact shared switch value-host class in:
    - `frontend/index.css`
  - apply that compact host class only to the switch path in:
    - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - add focused regression coverage for the compact host classification in:
    - `frontend/src/components/Params/ParamContainer.test.tsx`
- Intended structural effect:
  - stay in the Dict/plain-label non-code family that still dominates the real `settings` page
  - avoid reviving the rejected old explicit leaf-grid shell
  - test whether the repeated switch value side becomes cheaper if the shared `.section-value` host stops reserving a larger flex surface

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-switch-compact-host-rerun`
- retained baseline for comparison:
  - `perf/reports/frontend/artifacts/2026-03-20_section-benchmark-tier1-nested-guide-removal-rerun`

Method:

- Same reusable benchmark runner stack:
  - `perf/scripts/runSectionBenchmarkViaCdp.js`
  - `perf/scripts/sectionPanZoomBenchmarkReplay.js`
  - `perf/scripts/summarizeSectionTopLevelGridBenchmarkTrace.js`
- Same canonical scene pair:
  - `settings` on the authoritative `All Settings` view
  - `tier1Synthetic`
- Same browser/frontend pair used for the reruns:
  - worktree browser CDP `http://127.0.0.1:9233`
  - worktree frontend `http://127.0.0.1:3011`
  - untouched `main` browser CDP `http://127.0.0.1:9309`
  - untouched `main` frontend `http://127.0.0.1:3087`
- Focused validation while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Params/ParamContainer.test.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx`
    - `5` files passed
    - `7` tests passed
- Fresh subagent CDP read while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - `All Settings` was already active
  - repeated rows such as `Is Frozen` and `Is Minimized` rendered with `section-value-compact` on the value host
  - no obvious viewport-level clipping, misalignment, or broken row rendering was visible in the inspected area

Why this seam was chosen:

- The last rejected non-code experiments established two constraints:
  - the right family is still Dict/plain-label switch/dropdown-heavy rows
  - the wrong mechanism is reviving the old explicit leaf-grid shell
- This compact-host probe kept the same family focus while changing only the shared switch value-host sizing contract.

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.237` | `3235.187` | `66.774` |
| `settings` | worktree experiment | `425.736` | `35192.596` | `498.884` |
| `settings` | untouched `main` | `63.897` | `26206.432` | `278.114` |
| `tier1Synthetic` | retained baseline | `825.999` | `13271.540` | `18.282` |
| `tier1Synthetic` | worktree experiment | `723.167` | `15021.713` | `19.853` |
| `tier1Synthetic` | untouched `main` | `16.319` | `13756.598` | `18.747` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `425.736` | `+277.499` |
| `settings` | benchmark | `RunTask` | `3235.187` | `35192.596` | `+31957.409` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `498.884` | `+432.110` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `37.906` | `+9.517` |
| `settings` | overview horizontal pan slow | `RunTask` | `392.838` | `4265.845` | `+3873.007` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `57.729` | `+30.573` |
| `settings` | overview vertical pan slow | `RunTask` | `399.964` | `3383.397` | `+2983.433` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `16.239` | `+7.443` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `23.274` | `+14.366` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `723.167` | `-102.832` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `15021.713` | `+1750.173` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `19.853` | `+1.571` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `129.797` | `-16.160` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `139.092` | `-20.353` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `36.242` | `-4.287` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `39.128` | `-4.206` |

Interpretation:

- This is the same failure shape as the last few non-code probes:
  - `tier1Synthetic` paint improves
  - the mandatory real `settings` target gets dramatically worse
- The `settings` regression is decisive:
  - aggregate `Paint`, `RunTask`, and `UpdateLayoutTree` all spike sharply
  - every representative slow pan/zoom paint phase also regresses
- The live subagent CDP check matters here because it rules out a false negative from a broken layout:
  - the compact host really was live on the repeated switch rows
  - the viewport did not obviously collapse visually
  - so the benchmark failure is a genuine performance rejection, not a malformed render artifact
- Strongest read:
  - the family diagnosis remains correct
  - but local flex/width retuning of the shared switch value host is still the wrong mechanism
  - the next worthwhile non-code pass should preserve the current row geometry and instead target ownership or DOM deletion deeper in the shared non-code input/value-host path

Conclusion:

- Reject this Tier 1 switch compact-host experiment as a keep for `HEAD`.
- Revert the in-flight code changes after recording the docs.
- Keep the directional finding:
  - stay in the Dict/plain-label non-code family
  - avoid more immediate local width/flex retunes of the shared non-code value host
  - move the next experiment toward a deeper shared non-code host/input seam that preserves the current row geometry

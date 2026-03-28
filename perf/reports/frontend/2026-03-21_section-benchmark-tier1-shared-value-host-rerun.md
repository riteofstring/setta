# Section Benchmark Tier 1 Shared Value Host Rerun

Date: `2026-03-21`

Question:

- Does introducing a shared `valueHostMode` seam for top-level Dict plain-label switch/dropdown rows recover the non-code family win without reviving the old grid shell?

Implementation under test:

- Experimental change under test:
  - add a shared `valueHostMode` policy at the `ParamContainer -> ParamInput -> ParamUI` seam
  - narrow that policy to top-level Dict `textLabelLeaf` rows with `SwitchParam` or `DropdownParam` value bodies
  - make the switch branch hostless under a shared `.section-value` wrapper
  - make the dropdown branch hostless at the `IdNameCombobox` outer wrapper while preserving the current `.section-value` sibling contract
- Experimental files under test:
  - `frontend/src/components/Params/ParamContainer.tsx`
  - `frontend/src/components/Params/ParamItems/ParamInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ConfiguredParamInputs.tsx`
  - `frontend/src/components/Params/ParamUIs/DropdownInput.tsx`
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - `frontend/src/components/Params/ParamUIs/SwitchInput.tsx`
  - `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx`
  - focused helper and seam tests added temporarily under:
    - `frontend/src/components/Params/getParamValueHostMode.test.ts`
    - `frontend/src/components/Params/ParamContainer.test.tsx`
    - `frontend/src/components/Params/ParamUIs/SwitchInput.test.tsx`
    - `frontend/src/components/Utils/Combobox/IdNameCombobox.test.tsx`

Authoritative artifacts:

- rerun artifact root:
  - `perf/reports/frontend/artifacts/2026-03-21_section-benchmark-tier1-shared-value-host-rerun`
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
- Focused automated verification while the experiment was live:
  - `pnpm -C frontend exec vitest run src/components/Params/getParamValueHostMode.test.ts src/components/Params/ParamContainer.test.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Utils/Combobox/IdNameCombobox.test.tsx src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx`
    - `7` files passed
    - `13` tests passed
- Fresh subagent CDP visual check while the experiment was live:
  - `http://127.0.0.1:3011/settings`
  - `All Settings` was active
  - the shared value-host treatment appeared live across the repeated switch/dropdown rows
  - no obvious viewport regression was visible, with the caveat that the inspected view was still zoomed out enough that this was a thumbnail-level confirmation rather than a close row-level inspection

Why this seam was chosen:

- The prior non-code probes had already narrowed the remaining hotspot family to Dict/plain-label switch/dropdown rows.
- The prior mechanism probes had already ruled out:
  - reviving the old explicit grid shell
  - collapsing layout classes onto a single widget root
  - local width/flex retunes of the shared switch host
- This experiment was the first attempt to change the same family through a deeper shared ownership seam while preserving the current `.section-value` sibling geometry.

Paired benchmark totals versus the retained baseline:

| Scene | Branch | `Paint` | `RunTask` | `UpdateLayoutTree` |
| --- | --- | ---: | ---: | ---: |
| `settings` | retained baseline | `148.237` | `3235.187` | `66.774` |
| `settings` | worktree experiment | `511.182` | `40801.357` | `579.305` |
| `settings` | untouched `main` | `78.746` | `31214.425` | `325.761` |
| `tier1Synthetic` | retained baseline | `825.999` | `13271.540` | `18.282` |
| `tier1Synthetic` | worktree experiment | `872.664` | `23072.874` | `24.475` |
| `tier1Synthetic` | untouched `main` | `17.978` | `22616.961` | `25.043` |

Authoritative worktree deltas versus the retained baseline:

| Scene | Phase | Metric | Before | First rerun | Delta |
| --- | --- | --- | ---: | ---: | ---: |
| `settings` | benchmark | `Paint` | `148.237` | `511.182` | `+362.945` |
| `settings` | benchmark | `RunTask` | `3235.187` | `40801.357` | `+37566.170` |
| `settings` | benchmark | `UpdateLayoutTree` | `66.774` | `579.305` | `+512.531` |
| `settings` | overview horizontal pan slow | `Paint` | `28.389` | `45.713` | `+17.324` |
| `settings` | overview vertical pan slow | `Paint` | `27.156` | `71.480` | `+44.324` |
| `settings` | overview-to-detail zoom slow | `Paint` | `8.796` | `19.708` | `+10.912` |
| `settings` | detail-to-overview zoom slow | `Paint` | `8.908` | `27.120` | `+18.212` |
| `tier1Synthetic` | benchmark | `Paint` | `825.999` | `872.664` | `+46.665` |
| `tier1Synthetic` | benchmark | `RunTask` | `13271.540` | `23072.874` | `+9801.334` |
| `tier1Synthetic` | benchmark | `UpdateLayoutTree` | `18.282` | `24.475` | `+6.193` |
| `tier1Synthetic` | overview horizontal pan slow | `Paint` | `145.957` | `168.545` | `+22.588` |
| `tier1Synthetic` | overview vertical pan slow | `Paint` | `159.445` | `172.461` | `+13.016` |
| `tier1Synthetic` | overview-to-detail zoom slow | `Paint` | `40.529` | `39.408` | `-1.121` |
| `tier1Synthetic` | detail-to-overview zoom slow | `Paint` | `43.334` | `47.857` | `+4.523` |

Interpretation:

- This is a stronger rejection than the earlier non-code host probes:
  - the mandatory real `settings` target gets dramatically worse
  - the canonical `tier1Synthetic` scene also regresses on aggregate `Paint`, `RunTask`, `UpdateLayoutTree`, and both slow overview-pan paint phases
- That makes the mechanism read much clearer:
  - broader switch/dropdown shared host ownership is not just the wrong local tradeoff for `settings`
  - it is the wrong direction for both authoritative Tier 1 scenes
- The subagent visual check matters because it confirms the experiment really was live in-browser and did not simply collapse the inspected viewport.
- Strongest read:
  - the non-code family diagnosis was not enough by itself
  - the shared value-host ownership seam is also a dead end
  - the next Tier 1 pass should move away from switch/dropdown host ownership entirely and target a different always-mounted dense-row/body seam

Conclusion:

- Reject this Tier 1 shared value-host experiment as a keep for `HEAD`.
- Revert the in-flight code changes after recording the docs.
- Keep the directional finding:
  - do not reopen the switch/dropdown shared-host path immediately
  - the next Tier 1 probe should target a different repeated row/body seam that does not perturb non-code value-host ownership

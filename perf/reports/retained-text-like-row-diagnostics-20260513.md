# Retained Text-Like Row Diagnostics - 2026-05-13

Date: 2026-05-13
Area: frontend
Branch/Commit: diagnostics/retained-text-recording-20260513 @ fd9c7b3ab
Recording: `recording-20260513-094544`

## Goal

Measure the retained text-like row blanking, pan/zoom upload pressure, and row
spacing issue with diagnostic-only Chrome repro logging.

## Scenario

- Entry point: `/settings`
- Browser: Chrome recording produced by `./scripts/record-chrome-repro.sh`
- User-visible checks:
  - pan/zoom and wheel over the settings canvas
  - click a blank retained text-like field
  - inspect `callableSectionDefault` row spacing

## Observations

- The recording emitted 249 retained text-like snapshot state events and 356
  snapshot maintenance events.
- Visible passive rows peaked at 403.
- Worst passive readiness was 352 missing passive rows, including 350 fully
  blank rows.
- The final snapshot event still had 89 missing passive rows and 81 blank rows
  out of 371 passive rows.
- Snapshot maintenance was budget-exhausted on 280 of 356 events.
- Snapshot maintenance uploaded about 786 MB across 1,049 uploads.
- Peak queued/missing retained page work reached 233 items.
- The skipped work diagnostics were dominated by visible `lod-refinement` work.
- The recording had 19 frame-gap events, average 98.2 ms, max 391.7 ms.
- The recording had 13 long tasks, max 350 ms.

## Activation Probes

- `sectionSizingPolicy.metaControlByType.TextParam.minHeight`

  - preflight row policy: `text`, `single-line`, 24px row
  - preflight source element: missing
  - preflight canvas probe: all zero pixels
  - active geometry 116 ms later: DOM editor text `32`

- `callableSectionDefault.columnWidth`
  - preflight row policy: `textarea`, `multiline-fixed`, 4 lines, 72px row
  - preflight source element: present and source-key matched
  - preflight canvas probe: all zero pixels
  - active geometry 97 ms later: DOM editor text `null`

## Row Policy Finding

`callableSectionDefault.columnWidth`, `edgeInputParams`, and `edgeOutputPorts`
are currently described as fixed four-line textarea rows. This is why the
section shows excessive spacing; the retained renderer is following its input.

## Conclusion

The blank-on-click bug is not just a missing source DOM problem. A row can have
current source DOM and still have blank passive retained pixels. The principled
fix is a row-owned passive snapshot lifecycle with stale-visible replacement,
plus an owner-defined text-like presentation policy so compact settings fields
are not inferred as four-line rows by frontend-only type mapping.

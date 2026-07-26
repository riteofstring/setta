# Setta 4 Command Center — Phase 4 Coherent Audit

Date: 2026-07-25

## Result

The repository-actionable Phase 4 audit corrections are complete and green.
Phase 4 remains open for the already-recorded side-by-side mockup review on
representative real displays and any polish that external evidence finds. Those
unavailable physical-display gates were not retried, and Phase 5 did not start.

## Reviewed Change

The coherent review covered
`86fb3e14a6eb984fab90c3921f781bd98e1e1658..d17cb72ec0ca4b8fb66caa0525c811dce634a9b6`.
Phase 4 starts at `f9ad971a0`; the history contains no earlier Phase 4 work from
a mid-phase loop restart.

The static pass reviewed the production renderer cutover, Director snapshot and
pushed-event lifecycle, runtime switching, text and voice dispatch, speech
playback, workstream navigation, settings and workspace state, approvals,
resources, artifacts, history, WebGL packing and scheduling, responsive shell
geometry, deterministic Electron ownership, and integrated performance
instrumentation. It also checked the assumptions left by removal of the pane
workspace from the primary app mount.

## Corrections

- Director state is now keyed to the connected runtime. A runtime change clears
  the old snapshot and transient receipt state, replaces the pushed
  subscription, ignores late dispatch results from the previous runtime, and
  keeps overlapping busy actions counted until all current-runtime actions
  settle.
- A typed resync received while snapshot/subscription setup is still in flight
  is coalesced and replayed after setup instead of being dropped. Direct
  selection and action receipts no longer erase the latest submitted public
  response.
- Director voice capture now uses the same delayed disposal lifetime as the
  established app-shell capture provider, so React StrictMode effect replay
  cannot dispose the controller that the replayed effect still owns.
- The history surface is a labelled modal dialog. The command-center background
  becomes inert and hidden from assistive technology, focus starts on the close
  action, Tab and Shift+Tab remain inside the dialog, Escape and backdrop
  dismissal work, and focus returns only after the trigger is interactive
  again.
- Artifact detail focuses when a new artifact opens, not again when its
  asynchronous payload changes from loading to loaded or failed.
- The compact chrome no longer clips the required 19-dot workstream window at
  laptop or 4K widths. Smaller widths use an accessible horizontal overflow
  path that keeps the selected dot centered. A truncated 200-row registry
  snapshot reports the known total without inventing a global selected ordinal.
- The integrated navigation probe now measures dot rectangles inside the actual
  selector and fails if the bounded window or selected dot is clipped; counting
  DOM nodes alone is no longer accepted as visual evidence.

## Verification

Focused unit verification:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/director-command-center/DirectorCommandCenterShell.test.tsx \
  src/renderer/src/features/global-speech/app-shell-speech-capture.test.ts
```

Result: 2 files and 18 tests passed.

Production build and typecheck:

```sh
pnpm -C desktop build
```

Result: passed.

The final changed TypeScript/JavaScript files also passed focused ESLint, and a
final `pnpm -C desktop typecheck` passed after the non-behavioral export cleanup.

Production Director workflow:

```sh
node desktop/tests/electron/director-command-center-workflow.test.mjs \
  --skip-build \
  --keep-artifacts
```

Result: passed. The workflow now verifies modal background isolation, initial
focus, forward and reverse Tab containment, trigger restoration, the complete
Director lifecycle, pushed event sequence, and restart/replay. Artifact:
`.recordings/director-command-center/20260725T142529942Z/`.

Scripted local Director voice workflow:

```sh
node desktop/tests/electron/director-command-center-local-voice-workflow.test.mjs \
  --skip-build \
  --keep-artifacts
```

Result: passed with no external credential. Artifact:
`.recordings/director-command-center-local-voice/20260725T142549342Z/`.

Affected integrated performance row:

```sh
node desktop/tests/electron/director-command-center-performance.test.mjs \
  --skip-build \
  --keep-artifacts \
  --scenario navigate-100-workstreams
```

| Tier        | Frames |       p95 / p99 / max | Long tasks | DOM | Dots | Selector    |
| ----------- | -----: | --------------------: | ---------: | --: | ---: | ----------- |
| Laptop      |     62 | 10.3 / 10.4 / 10.4 ms |          0 | 171 |   19 | all visible |
| Emulated 4K |     57 | 10.2 / 10.4 / 10.4 ms |          0 | 184 |   19 | all visible |

Both rows had zero frames over 50 ms, passed the live canvas probe, kept the
selected dot visible, reported a 546 px selector client and scroll width, and
finished with an empty renderer console. The screenshots were inspected after
the run. Artifact:
`.recordings/director-command-center-performance/20260725T142608919Z/`.

## Existing Broad And Live Evidence

The already-green broad deterministic matrix and four-suite live-provider
attempt recorded in
[`setta-4-command-center-phase4-audit-20260725.md`](setta-4-command-center-phase4-audit-20260725.md)
postdate the last backend, generated-contract, provider-protocol, and speech
resolver changes. This audit changed renderer lifecycle, accessibility, CSS,
and focused instrumentation only, so those broad and external-provider gates
were not duplicated. The focused production workflows above postdate every
behavioral audit correction and cover the affected paths.

## Remaining Phase 4 Work

- Perform the committed side-by-side visual and interaction review against the
  fullscreen mockup at representative real desktop and phone-sized displays.
- Apply and verify only the Phase 4 polish that review identifies.

Real-device access and side-by-side capture were unavailable to this repository
audit and were not treated as executable verification failures.

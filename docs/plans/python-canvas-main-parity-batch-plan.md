# Python Canvas Sizing, Generated Formatting, and Callable Reconciliation Plan

## Status and purpose

**Status: Completed on 2026-08-23.**

Implement one bounded Python Canvas parity batch covering three behaviors already present on
`main` but absent or incomplete on this branch:

1. section kinds have their own size defaults and limits, and List of Objects cannot be stretched
   vertically;
2. generated Callable, Param Dict, and List of Objects compositions use main's deterministic
   multiline layout; and
3. when an authored Python edit resolves an undefined callable symbol, its diagnostic clears and
   its parameters are retrieved automatically.

Main at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` is the behavior reference. Architecture remains
owned by the current monorepo: `@setta/workspace` owns generic section sizing, the Python Canvas Go
backend owns generated Python and provider reconciliation, and the frontend projects canonical
snapshots. Do not import main modules or recreate its global state architecture.

The completed plans previously stored beside this document were removed because Git already owns
that history and several of them contained stale instructions. This document is the only active
plan in `docs/plans`.

## Authoritative donor behavior

Read only the following main sources needed for this batch before editing:

- `internal/settingsstate/defaults.json`, specifically `sectionSizingPolicy`,
  `callableSectionDefault`, `dictSectionDefault`, and `listRootSectionDefault`;
- `frontend/src/state/hooks/sectionSizes.ts` and the resize wrapper that consumes its min/max
  dimensions;
- `internal/codegen/python_value_codec.go`, specifically `formatCollection`,
  `shouldMultilineCollection`, and the Callable/Dict/List formatters;
- `internal/codegen/python_code_renderer_test.go` multiline collection tests;
- `internal/lsp/project_synchronizer.go`, specifically generated-callable diagnostic transition
  tracking;
- `internal/lsp/project_synchronizer_test.go`, especially
  `TestProjectSynchronizerAutoRefetchesResolvedUndefinedCallableSections`; and
- `internal/app/project_state_updates.go` and `internal/projectstate/callable_refetch.go` for the
  backend-owned refetch and publication flow.

Do not broaden the source review beyond those owners unless a named acceptance path exposes a
concrete contradiction.

## Fixed product outcome

### 1. Per-kind section sizing

`@setta/workspace` must let an ordinary registered section kind declare consumer-neutral minimum
and maximum dimensions in addition to its existing default size. The package validates the complete
declaration once at registration and combines it with its global safety policy when rendering,
resizing, double-clicking to auto-size, and loading a persisted manual size. Invalid or contradictory
constraints fail at registration rather than being silently repaired.

Register the supported Python Canvas kinds with the equivalent main policies:

| Python Canvas kind                | Main donor type | Minimum height | Maximum height | Minimum width | Maximum width |
| --------------------------------- | --------------- | -------------: | -------------: | ------------: | ------------: |
| Callable and pending Callable     | `Callable`      |            104 |         100000 |           200 |        100000 |
| Param Dict and pending Param Dict | `Dict`          |             78 |         100000 |           200 |        100000 |
| List of Objects and pending List  | `ListRoot`      |             50 |             50 |           200 |        100000 |

The List of Objects remains horizontally resizable but has no bottom or bottom-right vertical
resize affordance. An existing persisted oversized List is rendered and normalized to the fixed
height; reload cannot restore the oversized value. Keep the current placeholder reconciliation so
creation remains immediate and does not flash through a different geometry. If Workspace's stored
numeric size model requires an equivalent numeric default instead of main's literal `auto`, prefer
stable visible parity over reintroducing the creation delay.

This is one generic registered-kind contract. Do not add Python, List, Callable, or Param Dict
vocabulary to `@setta/workspace`, and do not build a settings framework or user-configurable sizing
system.

### 2. Deterministic multiline generated Python

Port main's collection-layout rule into the existing Go renderer. Callable arguments, dictionary
items, and list items stay inline only when every item is single-line, there are fewer than four
items, and the rendered collection expression is at most 88 characters. Otherwise render one item
per line, add a trailing comma to every item, indent continuation items one Python level beyond the
assignment, and align the closing delimiter with the assignment value.

Use one renderer-owned helper for all three generated composition types. Preserve:

- the exact authored prefix and suffix;
- authored callable, parameter, and dictionary-leaf expressions byte-for-byte;
- deterministic forest and parameter ordering;
- source ranges, composition ranges, and callable signature-help positions as exact UTF-8 byte
  coordinates after multiline output; and
- the existing generated-body protection and presentation in the editor.

This is renderer-native formatting, not whole-file post-processing. Do not add Ruff, a formatter
route, a new dependency, automatic rewriting of authored expressions, configurable line lengths,
or a general pretty-printer. The editor's soft wrapping is presentation only and is not acceptance
for this requirement.

### 3. Undefined callable resolution and automatic parameter retrieval

Every accepted Python prefix/suffix mutation already renders the candidate and replaces its
Basedpyright diagnostics. Extend the backend-owned flow to recognize the exact main transition:

1. a persisted Callable currently has a targeted `reportUndefinedVariable` diagnostic;
2. a later accepted Python-target mutation removes that undefined-symbol diagnostic; and
3. no other callable-targeted error replaces it.

That transition triggers one forced signature refresh for the callable's current persisted
expression. A successful refresh atomically replaces its provider-owned parameters and publishes
the resulting canonical snapshot. A failed automatic signature lookup does not roll back the
already valid Python-target edit, invent empty parameters, or become a giant application error.
Repeated diagnostic publications without a new undefined-to-resolved transition do not refetch
again.

Keep this policy in the Go application/domain flow where canonical diagnostics and signatures are
available. The frontend must not inspect diagnostic message text, infer imports, simulate a second
Enter press, or own a shadow set of unresolved callables. The automatic refresh must not disable
the callable field, lock the section, resize a row, or show a spinner. Explicit Enter and
Option/Alt+Enter behavior remains unchanged.

Implement only the undefined-symbol recovery path requested here. Main's separately configurable
signature-mismatch refetch policy is outside this batch; do not turn it into an audit or settings
port.

## Acceptance behavior

Extend the existing production headless-browser walkthrough and focused boundary tests to prove:

1. Create a List of Objects, attempt a large vertical resize, and observe the main-equivalent fixed
   height before and after reload. Horizontal resize and nested-child indentation still work.
2. Render a Callable, Param Dict, and List with four items and with a shorter collection whose
   expression exceeds 88 characters. Generated Python uses main's multiline shape and valid syntax;
   three short items remain inline.
3. In a fresh project without `import math`, commit `math.sqrt`. The expression persists, the
   callable field shows the Basedpyright undefined-symbol error, and no parameters appear.
4. Add `import math` to the editable generated-Python prefix and make no further callable action.
   The callable error clears and parameter `x` appears automatically. Generated Python contains the
   refreshed call, and there is no lock flash, spinner, height change, or giant error panel.

Use the real Go service, pinned Basedpyright, production frontend, isolated temporary project, and
raw headless Chrome. Never launch or attach to an interactive browser profile and never request
Keychain access. Reuse the existing browser harness and suite rather than adding a second harness
or screenshot framework.

## Observable tests

Add only the focused proof required by the acceptance behavior:

- Workspace registry and sizing tests for valid/invalid kind constraints, fixed-height resize
  enablement, and clamping an existing oversized section;
- Python Canvas projection tests proving pending and canonical kinds share the same declared policy
  without a creation geometry swap;
- renderer tests for the exact inline/multiline thresholds and all semantic byte coordinates;
- coordinator tests for undefined-to-resolved refetch, no replacement-error refetch, failure that
  preserves the Python target, and no duplicate transition refetch;
- frontend/controller tests only where canonical snapshot projection needs direct proof; and
- one extension to the existing production browser acceptance route for the user-visible sequence.

Tests assert outputs and interactions, not private helper implementation. Do not add broad malformed
input matrices, fuzzing, mutation testing, unrelated DnD cases, arbitrary LSP-code classification,
or a general browser visual audit.

## Implementation sequence and supervision guardrails

Implement coherent batches in this order:

1. Add the generic registered-kind sizing contract, apply the three Python Canvas policies, and
   prove List of Objects cannot retain an oversized height.
2. Add the shared Go multiline collection renderer and repair semantic coordinates.
3. Add the backend undefined-to-resolved callable transition and automatic signature refresh.
4. Extend the existing real headless acceptance path, then run the required policy verification.

The implementation and review agents may make private commits for these batches. They must not
leave a committed partial public API, compatibility path, feature flag, migration, or duplicated
owner. A claimed blocker must cite a contradiction between this plan and checked-in code. Difficulty,
possible future features, and unrequested edge cases are not blockers.

The supervisor must inspect every progress report. Interrupt and redirect an agent that starts a
general sizing system, formatter service, LSP framework, main-wide parity audit, browser-harness
rewrite, or edge-case inventory. Once the four acceptance paths pass, stop implementation work.

Run the loop from the existing caller-scoped Code Policy task session with:

```sh
code-policy plan-loop docs/plans/python-canvas-main-parity-batch-plan.md \
  --agent-1-model gpt-5.6-terra \
  --agent-1-reasoning-effort max \
  --agent-2-model gpt-5.6-terra \
  --agent-2-reasoning-effort max \
  --module workspace \
  --module python-canvas-backend \
  --module python-canvas-frontend \
  --verification recommended \
  --require-suite python-canvas-browser \
  --max-iterations 10 \
  --progress-interval 30 \
  --unattended-permission-bypass
```

Do not run supplemental, mutation, `test --all`, `verify`, or `gate` inside the loop. The supervisor
owns the final `code-policy test --changed` and ordinary merge gate after reviewing the candidate.

## Plan-loop checklist

### Phase 1 — Main parity batch

- [x] Registered per-kind sizing and fixed-height List of Objects
- [x] Main-equivalent generated multiline layout with correct semantic coordinates
- [x] Undefined callable auto-refresh after Python-target resolution
- [x] Production headless acceptance route extended for the required verification

## Completion evidence

- The supervised GPT-5.6 Terra/max implementation stayed within the three named product outcomes
  and stopped after the acceptance paths were complete.
- `pnpm --filter @setta/python-canvas test` passed with 72 Vitest tests and 24 browser-harness
  tests.
- `pnpm --filter @setta/python-canvas run browser:test` passed against the production frontend,
  real Go service, pinned Basedpyright provider, isolated temporary project, and raw headless Chrome.
  The route covers the actual resize/reload, multiline thresholds, and held-response callable
  reconciliation states required above.

# OpenUI Artifact Phase 1 Audit - 2026-07-26

## Result

Phase 1 is complete. The Go-owned catalog generates every TypeScript surface,
the catalog has an exhaustive renderer, every shadcn-labeled primitive is
traceable to the pinned official Base UI registry, and the applicable
deterministic and live-provider gates are green. Nothing in production imports
the OpenUI, Recharts, or artifact-renderer half yet.

Phase 2 did not start.

## Scope

The requested minimum review range was
`ee1480dcdb2e085403f087614b48f80b1f07db82..48bfc5bb45ee00a56a9628b617a12d34417192c9`.
Because the implementation loop restarted after the earlier static-profile
audit, the coherent review expanded through
`fc84ac1b55cae29e43feb628e6203242678ae667^..48bfc5bb45ee00a56a9628b617a12d34417192c9`,
plus this audit's fixes. That includes the original plan and refinement, the
Phase 0 compiler and earlier audit, the parser-conformance continuation, the
official primitive replacement, the complete catalog generator, and the
artifact renderer catalog.

Before running commands, one static pass inspected:

- the plan, commit history, prior audit evidence, grammar, compiler, catalog,
  generator, generated outputs, and model-facing instructions
- dependency pins, the pinned upstream registry boundary, copied primitive
  provenance, style source, local modifications, and every Button, Badge, and
  Input consumer
- the OpenUI library, parser projection, exhaustive renderer map, every artifact
  adapter, and the limits and invariants each adapter relies on
- color contrast, non-color semantics, heading order, keyboard focus, table
  semantics, large bounded tabs and tables, reduced motion, text selection, and
  sensitive-input behavior
- production entry points and source imports, confirming that only the official
  primitive replacements and Base UI dependency reach production in Phase 1

Static searches also confirmed exact direct dependency pins; no OpenUI default
UI package, shadcn CLI, direct `@radix-ui/*` dependency, Radix registry variant,
old Button/Badge/Input compatibility API, arbitrary style/action catalog
property, or production import of the artifact renderer.

## Audit Corrections

The audit fixed the following current-phase issues:

- Root-anchored the copied Chart primitive's dark selector. The previous
  `:not([data-color-mode="light"])` selector matched through an ordinary
  ancestor even when the document root was explicitly light.
- Removed an undocumented `initialDimension` extension from the copied Chart
  primitive, restoring the official upstream contract, and updated the
  provenance record to describe the sole Setta theme adaptation precisely.
- Corrected model-facing catalog text that advertised Markdown emphasis and
  code syntax highlighting even though Phase 1 renders neither. The TypeScript
  outputs were regenerated from the Go owner, and catalog tests now compare
  component and property descriptions as well as argument order and required
  properties.
- Replaced low-contrast status-colored text with the validated card
  foreground/background pair. In the default light appearance, the former
  subtle treatments measured 1.49:1 for information and 3.49:1 for danger.
  Distinct icons and screen-reader labels now carry danger, information,
  success, warning, positive, and negative meaning without relying on color.
- Made Metric a semantic description list, added column scope to tables,
  labelled charts, restored visible keyboard focus for chart surfaces and tab
  panels, and bounded a 100-tab list with horizontal overflow.
- Kept artifact prose selectable despite the app shell's drag-oriented global
  selection rule.
- Offset Markdown headings below the artifact title while preserving the
  existing Markdown consumer's heading levels.
- Prevented callers from overriding `SettaStatusBadge`'s official Badge variant
  or its validated semantic color pair.
- Disabled capitalization, completion, and spellchecking on the OpenAI API-key
  field.

The first broad run exposed a deterministic workflow-harness race unrelated to
the renderer. Its pre-restart checkpoint accepted an available artifact while
that artifact's run was still active; the completion event committed before the
process stopped, so the restored durable snapshot was correctly newer. The
checkpoint now requires the same workstream to be terminal before comparing
restart state.

## Deterministic Verification

The changed Go catalog/compiler package passed once:

```sh
./scripts/go.sh test ./internal/conversation/artifactdoc -count=1
```

The initial broad invocation was:

```sh
./scripts/test_topic_conversation_workflows.sh --deterministic-only
```

Its production build, backend contracts, and all 75 desktop test files with 656
tests passed. The Director command-center Electron workflow then exposed the
pre-restart race above.

The narrow failing workflow passed after the correction:

```sh
node desktop/tests/electron/director-command-center-workflow.test.mjs --skip-build
```

Artifact:
`.recordings/director-command-center/20260727T040234801Z/`.

One final broad invocation of the same deterministic command then passed:

- production desktop typecheck and Electron/Vite build
- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 75 desktop test files and 656 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- microphone-permissions Electron workflow

Deterministic artifacts:

- `.recordings/director-command-center/20260727T040324689Z/`
- `.recordings/director-command-center-local-voice/20260727T040339729Z/`
- `.recordings/microphone-permissions/20260727T040351560Z/`

The already-green parser benchmarks in the
[Phase 0 audit](openui-artifact-phase0-audit-20260726.md) were not duplicated:
no parser or parser-performance path changed after that evidence.

## Live Provider

The phase-specific OpenUI output-quality check ran once, with the API-key
environment excluded:

```sh
env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 \
  ./scripts/go.sh test ./internal/conversation/artifactdoc \
  -run '^TestLiveCodexComposesStaticProfileDocument$' \
  -count=1 \
  -v
```

Result: passed with local Codex ChatGPT auth.

- instruction input: 6,141 bytes
- request input: 596 bytes
- returned structured JSON: 1,004 bytes
- returned OpenUI source: 844 bytes
- returned source compile: 279.167 microseconds

The returned document compiled on its first and only live invocation and
satisfied the mixed-content fact checks.

## Phase Boundary

Every Phase 1 gate is satisfied. The unavailable pre-change Electron artifact
performance baseline remains recorded as the sole Phase 0 gap and was not
retried. Under the plan, it does not block the completed primitive and
unreachable catalog work in Phase 1, but it continues to block Phases 2, 3, and
4. No contract replacement, storage change, generation cutover, or production
artifact-renderer work from those phases was started.

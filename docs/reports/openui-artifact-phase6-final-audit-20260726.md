# OpenUI Artifact Phase 6 Final Audit - 2026-07-26

## Result

All repository-actionable implementation and verification in
`docs/plans/openui-artifact-system-plan.md` is complete.

The final audit found four actionable issues introduced or exposed by the last
renderer cleanup commit. They are fixed, focused checks are green, and the one
missing whole-plan deterministic gate passed on the stable tree. The existing
live-provider matrix was not repeated because it already postdated the last
provider, backend, and contract changes. Unavailable driven-performance
evidence remains a release gate and was not retried or estimated.

## Evidence And History Review

Before running any implementation or verification command, the audit read the
complete plan and the append-only evidence for Phases 0 through 5:

- `docs/reports/openui-artifact-phase0-audit-20260726.md`
- `docs/reports/openui-artifact-phase1-audit-20260726.md`
- `docs/reports/openui-artifact-phase2-3-audit-20260726.md`
- `docs/reports/openui-artifact-phase4-audit-20260726.md`
- `docs/reports/performance/openui-artifact-post-change-20260726.md`

It then reconciled the complete implementation history from the plan commit
through `b6452dcf4` with the current tree. The static review covered:

- the Go-owned OpenUI grammar, catalog, compiler, conformance corpus,
  instructions, generated TypeScript surfaces, and exact dependency pins
- the direct artifact contract cutover, schema, store, tool repair path,
  generated-image publication, durable replay, and identity/provenance rules
- the generated HTTP registry, Electron main/preload/IPC read path, Director
  projection, runtime-scoped cache, bounded rail, and neighbour prefetch
- official shadcn/ui Base UI provenance and direct consumer cutover
- Markdown, link, file, table, chart, remote-content, and workspace-containment
  security
- preview and browser semantics, lazy boundaries, focus, keyboard navigation,
  announcements, reduced motion, responsive layout, appearance, and graph
  preservation
- removal of old artifact kinds, payloads, SQL columns, renderers, fixtures,
  dependencies, compatibility paths, and transitional code

The current contracts and generated outputs matched their Go owners. No old or
dual artifact implementation remained.

## Audit Corrections

The audit corrected:

- The Phase 5 lazy overlay boundary made the mounted shell inert while rendering
  no replacement surface until the Dialog chunk arrived. It now mounts a
  lightweight native modal during that handoff, retries a transient overlay
  import once, and contains a terminal chunk or overlay error behind generic
  failure UI and typed telemetry. The official shadcn/Base UI Dialog and Scroll
  Area remain lazy, and previous/next navigation retains one persistent browser.
- Rail previews marked their complete projected content `inert`, removing
  readable headings, status, text, and data from the accessibility tree even
  though the projection contains no interactive controls. The preview remains
  pointer-inert through CSS while its bounded readable content stays exposed.
- The rail live region announced every artifact as available and ordered it by
  creation time. It now uses the typed `declared`, `unresolved`, and `available`
  lifecycle vocabulary and the artifact update time, so readiness transitions
  are announced.
- Production owner comments, the generated corpus comment, and the preview
  surface comment still described the compiler or accessibility behavior from
  before cutover. The comments now describe the production authority and
  readable preview, and the generated output was regenerated from its Go owner.

The performance cost of the accessible handoff is recorded as an append-only
addendum in the Phase 5 performance report: +2.66 kB of initial JavaScript and
+0.75 kB of CSS. The 110.42 kB browser overlay and 1,012.56 kB full renderer
chunks are unchanged and remain lazy.

## Focused Verification

Focused lint and the lifecycle unit suite passed:

```sh
pnpm -C desktop exec eslint \
  src/renderer/src/features/artifacts/artifact-telemetry.ts \
  src/renderer/src/features/director-command-center/ArtifactBrowserOverlaySlot.tsx \
  src/renderer/src/features/director-command-center/DirectorArtifactPreviewCard.tsx \
  src/renderer/src/features/director-command-center/DirectorArtifactsRail.tsx \
  src/renderer/src/features/director-command-center/DirectorCommandCenterShell.test.tsx \
  tests/electron/director-command-center-workflow.test.mjs

pnpm -C desktop exec vitest run \
  src/renderer/src/features/director-command-center/DirectorCommandCenterShell.test.tsx
```

The unit file passed all 22 tests. Production typecheck and build passed through
`pnpm -C desktop build`.

The first focused Electron attempt exposed an assertion that sampled
synchronously before React committed the programmatic click. The assertion was
narrowly corrected to observe the first commit that makes the shell inert and
require an open, focused modal at that boundary. No product workaround or test
hook was added. The exact focused workflow then passed:

```sh
node desktop/tests/electron/director-command-center-workflow.test.mjs --skip-build
```

Artifact:
`.recordings/director-command-center/20260727T071221721Z/`.

## Whole-Plan Deterministic Gate

Exactly one missing broad deterministic invocation ran after static review and
focused stabilization:

```sh
env -u OPENAI_API_KEY \
  ./scripts/test_topic_conversation_workflows.sh --deterministic-only
```

It passed:

- production desktop typecheck and Electron/Vite build
- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 77 desktop test files and 688 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- microphone-permissions Electron workflow

Final deterministic artifacts:

- `.recordings/director-command-center/20260727T071356426Z/`
- `.recordings/director-command-center-local-voice/20260727T071412365Z/`
- `.recordings/microphone-permissions/20260727T071424201Z/`

## Live Provider Evidence

The Phase 4 audit records the complete live Codex matrix green after the last
provider, backend, and contract changes:

- agent protocol
- active-side isolation
- topic-conversation workflow, controls/restart, and artifact publication
- Director command center

All later production changes are renderer-local. The final audit therefore did
not rerun a live-provider gate that had already passed after its last relevant
change. It did not inspect credentials or use `OPENAI_API_KEY`.

## Retained Release Gates

The driven Electron latency, scrolling, memory, and frame-behavior rows in the
Phase 5 performance report still require an external driven session and remain
release gates. The `director-command-center-performance` workflow also remains
a release gate because its blank-graph-pixel assertion fails identically on the
pinned pre-change revision in this environment.

Neither unavailable check was retried. No credential, privilege, GUI
application, background service, or remote access was sought.

## Final Boundary

The artifact implementation, generated contracts, repository-verifiable
performance bounds, deterministic production workflows, and applicable
live-provider evidence satisfy the plan. Only the explicitly retained external
release gates remain.

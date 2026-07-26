# Native Artifact Routing Phase 3 Audit - 2026-07-27

## Result

Phase 3 is complete. Bound and unbound topic agents receive the same
`setta.emit_artifact` capability and the same composition contract. Each call
publishes one independently durable OpenUI document, while the model decides
whether a request deserves one coherent mixed-content artifact or several
separate artifacts.

The audit corrected the artifact-read service boundary and strengthened
coverage for repeated independent publication and folderless renderer reads.
The focused checks, required deterministic workflow matrix, and complete live
Codex matrix are green. Phase 4 did not start.

## Scope And Existing Evidence

The requested minimum review range was
`400f7edc85ab6cb227e276e7566e2e71aeb258a9..3543644017585f366c25aa69390aaed0dfd218d6`.
It contains the complete Phase 3 implementation in one commit. History
inspection found no earlier Phase 3 implementation or mid-phase loop restart,
so the audit reviewed that minimum range plus the audit corrections as one
coherent change.

Before verification, the audit inspected:

- the active plan, complete native-routing lineage, minimum diff, Phase 1 and
  Phase 2 audit reports, and the original failure recording under
  `.recordings/20260727T073439Z`
- topic-agent and Director instructions, artifact-tool availability, validation,
  correction, persistence, provenance, replay, and per-turn capacity boundaries
- every artifact workspace consumer across the conversation store and service,
  HTTP endpoint registry and handler, generated TypeScript contract, IPC,
  renderer document cache, Director registry, rail, browser, and live workflow
- artifact declaration/creation ordering, optional workspace cloning and
  validation, later folder binding, multiple publications in one run, and
  restart materialization from the committed log
- all production searches for superseded single-document instructions,
  artifact-intent classifiers, semantic expectations, count enforcement,
  completion gates, and repair loops

The Phase 2 broad evidence was recorded at `20260727T101804353Z` through
`20260727T101832099Z`, before the Phase 3 implementation at
`2026-07-27T03:37:40-07:00`. No already-green broad or live gate postdated the
last relevant Phase 3 code change, so none could be reused.

The static pass confirmed that Phase 3 introduced no workspace fabrication,
artifact-intent metadata, user-text classifier, expected-output counter,
semantic completion gate, count-repair loop, compatibility path, migration, or
transitional schema. The existing `MaxArtifactsPerTurn` storage bound predates
this plan and does not encode an expected semantic quantity.

## Audit Corrections

The implementation had added `ReadArtifactByID` beside the old
workspace-bound `ReadArtifact`. That left the conversation service and store
with a dual-read contract even though Setta is unreleased and the plan requires
direct replacement with optional execution scope.

The audit replaced both methods with one `ReadArtifact` contract carrying an
optional workspace from HTTP through the service and store:

- a present workspace retains the bound scope check
- a null workspace reads the artifact by the conversation that published it,
  including an artifact recorded before that conversation later gained a folder
- no compatibility alias or alternate service path remains

Focused coverage now also proves that:

- one folderless run can publish multiple independent artifacts and the Director
  replay lists and counts every record separately beside a bound artifact
- the renderer sends `workspaceId: null` through the same artifact-read request
  contract
- the bound and folderless HTTP requests reach the same typed service method

The plan's Phase 3 status and reports index were updated with this evidence, and
its verification ownership now distinguishes implementation-time focused checks
from the one stable-tree broad gate each phase audit may run.

## Focused Verification

Focused Go checks passed for bound and unbound tool publication, repeated rail
records, and the optional HTTP/service/store boundary:

```sh
./scripts/go.sh test ./internal/conversation ./internal/director ./internal/httpapi \
  -run '^(TestEmitArtifactToolCommitsTypedArtifact|TestEmitArtifactToolPublishesWithoutAFolder|TestArtifactsArePublishedWithOrWithoutAFolder|TestReadConversationArtifactUsesTypedServiceBoundary)$' \
  -count=1
```

The folderless renderer read check passed:

```sh
pnpm -C desktop exec vitest run \
  src/renderer/src/features/artifacts/artifact-document-cache.test.ts
```

## Required Deterministic And Live Gate

Exactly one combined broad invocation ran after static review, corrections,
formatting, and focused stabilization:

```sh
env -u OPENAI_API_KEY ./scripts/test_topic_conversation_workflows.sh
```

The deterministic matrix passed:

- production desktop typecheck and Electron/Vite build
- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 77 desktop test files and 689 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- microphone-permissions Electron workflow

Deterministic artifacts:

- `.recordings/director-command-center/20260727T104826083Z/`
- `.recordings/director-command-center-local-voice/20260727T104842295Z/`
- `.recordings/microphone-permissions/20260727T104853920Z/`

Local Codex ChatGPT auth was available. The same invocation excluded
`OPENAI_API_KEY` and passed the complete live matrix:

- agent ephemeral-thread lifecycle and discovery isolation
- active-side conversation lifecycle
- topic-conversation workflow, controls and restart, and artifact publication
- Director command center

No broad or live gate was duplicated.

## Phase Boundary

Every available Phase 3 gate is satisfied. Phase 4 remains pending and owns the
plan's dedicated final deterministic production workflow and recorded
"create five varied artifacts" live behavioral regression. This audit did not
add semantic output enforcement or begin that final-verification phase.

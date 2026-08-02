# Native Artifact Routing Phase 1 Audit - 2026-07-27

## Result

Phase 1 is complete. The Director owns and validates the workspace requirement
for every new work delivery, commits it durably, reports it back to the
Director, and preserves it through replay. The Director's instructions and
tool schemas now describe native Setta artifacts without inventing a folder,
website, Sites project, gallery page, or source tree.

The focused checks, required deterministic workflow matrix, and complete live
Codex matrix are green. Phase 2 did not start: the existing execution gate still
turns an attempted delivery with a missing workspace into a folder resource
request.

## Scope And Existing Evidence

The requested minimum review range was
`14d09484f7c40a41315c4b047abf54da92e60348..4086ccc1dbfa4c73515ee3bf21e6a1edd0633d81`.
The phase loop began one commit earlier with the initial plan and was refined at
the minimum range's lower endpoint, so the coherent review expanded through
`96b9bf1da3b7830ceec31056404d8c7da698de41^..4086ccc1dbfa4c73515ee3bf21e6a1edd0633d81`,
plus this audit's fixes.

Before running implementation or verification commands, the audit inspected:

- the plan, the three-commit phase history, the minimum range, and the earlier
  OpenUI audit boundary
- `.recordings/latest.json` and its referenced failure evidence in
  `.recordings/20260727T073439Z`
- the Director instructions, decision protocol, authority checks, commit path,
  execution receipts, durable facts, conversation persistence and replay,
  projection fixtures, tool schemas, and provider fixture calls
- every production constructor and consumer of create, send, queue, steer, and
  recovery decisions
- Go-owned generation boundaries and the checked-in TypeScript gallery output
- the unconditional folder gate and mandatory workspace execution contracts
  reserved for Phase 2, and the artifact execution and validation paths
  reserved for Phase 3

The referenced recording predates the Phase 1 implementation and records the
original failure: no open workspace, an invented artifact gallery project, a
folder request, and no native artifact publication. There was no green broad or
live evidence after `4086ccc1d`, so no post-change gate could be reused.

The static pass also confirmed that Phase 1 introduced no artifact-intent
metadata, expected-output counter, semantic completion gate, count-repair loop,
user-text classifier, fake workspace, compatibility path, or TypeScript mirror
of a Go-only Director contract.

## Audit Corrections

The audit corrected two current-phase issues:

- `internal/director/fixtures.go` had changed its Go-owned resource-request
  description, but the checked-in projection-gallery fixture still contained
  the superseded “folderless work blocked” description. The owner generator was
  run and the generated TypeScript output was formatted, leaving only the
  intended semantic update:

  ```sh
  ./scripts/go.sh run ./cmd/generate-director-graph-gallery
  pnpm -C desktop exec prettier --write \
    src/renderer/src/features/director-graph/projection-gallery-fixtures
  ```
- The new contract was exercised mostly by updated pre-existing fixtures rather
  than direct assertions. Focused deterministic coverage now fixes the product
  instructions, tool-schema enum and required field, invalid-value rejection,
  create/send/queue/recovery commit mapping, absence on steer/select, receipt
  pass-through, and durable replay behavior.

The reports index and completed OpenUI plan were also corrected so only the
native-artifact plan is identified as the active plan of record.

## Focused Verification

The focused Director checks passed:

```sh
./scripts/go.sh test ./internal/director \
  -run '^(TestDirectorInstructionsPreserveNativeArtifactIntent|TestDirectorTurnIsDurableInOrder|TestCommittedDecisionsRecordWorkspaceRequirements|TestDecisionAuthorityRejectsUnauthorizedDecisions|TestDirectorDeliveryToolsExposeWorkspaceRequirements|TestDirectorReportsTheCommittedWorkspaceRequirement)$' \
  -count=1
```

## Required Deterministic And Live Gate

Exactly one combined broad invocation ran after the static review and focused
stabilization:

```sh
env -u OPENAI_API_KEY ./scripts/test_topic_conversation_workflows.sh
```

The deterministic matrix passed:

- production desktop typecheck and Electron/Vite build
- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 77 desktop test files and 688 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- microphone-permissions Electron workflow

Deterministic artifacts:

- `.recordings/director-command-center/20260727T085257282Z/`
- `.recordings/director-command-center-local-voice/20260727T085313441Z/`
- `.recordings/microphone-permissions/20260727T085325061Z/`

Local Codex ChatGPT auth was available. The same invocation excluded
`OPENAI_API_KEY` and passed the complete live matrix:

- agent ephemeral-thread lifecycle and discovery isolation
- active-side conversation lifecycle
- topic-conversation workflow, controls and restart, and artifact publication
- Director command center

No broad or live gate was duplicated.

## Phase Boundary

Every available Phase 1 gate is satisfied. Phase 2 remains pending and owns
honoring `WorkspaceRequirement`, private provider working directories, nullable
workspace execution, and removal of `requireFolderResource`. Phase 3 still owns
workspace-independent artifact publication and the topic-agent composition
instructions. Neither phase was started by this audit.

# Native Artifact Routing Phase 2 Audit - 2026-07-27

## Result

Phase 2 is complete. A topic conversation can execute, queue, steer, cancel,
recover, restart, and finish work without a workspace. Unbound work runs in an
owner-only Setta directory that authorizes no user files, while a bound
conversation continues to resolve its workspace and file authority through the
workspace registry.

The audit corrected current-phase scope, lifecycle, configuration, and privacy
defects. Focused checks, the required deterministic workflow matrix, and the
complete live Codex matrix are green. Phase 3 did not start: artifact
composition judgment, the superseded single-document instruction, and
workspace-independent artifact reads remain unchanged.

## Scope And Existing Evidence

The requested minimum review range was
`e073f631ab9734d00e91e1e2411ee8272d12e259..05caa62258a32a43bbcf60d5c63c27c7b5334c07`.
It contains the complete Phase 2 implementation in one commit. The audit
inspected the earlier plan and Phase 1 lineage through
`96b9bf1da3b7830ceec31056404d8c7da698de41`, but found no earlier Phase 2
implementation or mid-phase restart to add to the change range. This report
therefore reviews the minimum range plus the audit corrections as one coherent
change.

Before running implementation or verification commands, the audit inspected:

- the active plan, commit lineage, minimum diff, Phase 1 audit report, and
  referenced failure recording
- every changed production caller and consumer of optional workspace identity
  across Director decisions, runtime adapters, conversation commands, routing,
  persistence, recovery, role profiles, carriers, and artifact authorization
- all assumptions left behind by removal of the unconditional folder gate,
  including active-run controls, queue promotion, restart recovery, folder
  binding during a run, side/fork rejection, and workspace-scoped reads
- every provider-authored string that can become durable trajectory, approval,
  terminal, or artifact state
- existing Phase 2 tests and the broad workflow script's deterministic and live
  coverage

The only broad evidence available before this audit was the Phase 1 gate. It
predated `05caa6225` and could not verify Phase 2. No already-green broad or live
gate postdated the Phase 2 implementation or the audit fixes.

The static pass also confirmed that Phase 2 introduced no fake workspace,
polling, compatibility path, artifact-intent classifier, expected-output
counter, semantic completion gate, or count-repair loop. Side conversations and
forks remain workspace-scoped and reject an unbound execution request at their
boundary.

## Audit Corrections

The audit corrected these current-phase issues:

- A nil workspace was serving two incompatible meanings in snapshot reads:
  “prove unbound” and “read by conversation ID.” Director callers could
  therefore address a bound conversation as unbound, while binding a folder
  during an active unbound run could break later lifecycle persistence.
  Caller-scoped reads now compare the current optional binding exactly.
  App-owned active lifecycle and recovery paths use explicit by-ID reads.
- Queue promotion previously retained the workspace pointer from the completed
  run. It now resolves the conversation's current durable binding, so a folder
  attached during an active unbound run applies to the next queued turn without
  changing the run already in flight.
- A provider carrier could survive a workspace, working-directory, permission,
  or approval-policy change. Primary carriers now record their thread-start
  execution contract and rotate before the next turn when that contract
  changes.
- Generated-media publication used the provider process directory as file
  authority. It now uses only the authorized workspace root, so files generated
  in private unbound execution space never become file-reference artifacts.
- Provider output could expose the private absolute working directory in
  streamed answer text, reasoning, progress, plans, activities, file changes,
  approvals, validations, or terminal errors. Unbound events now redact exact
  and canonical path spellings before persistence, including paths split across
  stream deltas. Explicit artifact titles and compiled document strings reject
  the path with retryable field guidance.
- Private execution directories now reject file or symlink substitution and
  reapply owner-only `0700` permissions to their root and per-conversation
  directory.
- Three unbound narrator/router resolution paths returned built-in settings
  without consulting app-global or conversation overrides. They now use the
  same effective-profile source as bound conversations while omitting only the
  workspace layer.
- Recovery targets retained workspace fields after lifecycle recovery became
  conversation-addressed. The superseded fields and SQL projections were
  removed.

## Focused Verification

Focused checks passed for the adapter marker used by stream redaction:

```sh
./scripts/go.sh test ./internal/agent \
  -run '^TestCompletedTextItemsMarkFinalSnapshots$' \
  -count=1
```

Focused conversation checks passed for private execution, strict optional
scope, folder binding during a run, carrier rotation, controls, recovery,
restart, artifact authorization, path redaction, encoded artifact strings, and
generated-media behavior:

```sh
./scripts/go.sh test ./internal/conversation \
  -run '^Test(DirectorRunsAnUnboundTurnInAPrivateWorkingDirectory|DirectorCommandsRequireTheCurrentOptionalWorkspaceBinding|BindingFolderDuringUnboundRunFreezesTheRunAndRotatesTheNextCarrier|DirectorControlsAndRecoversUnboundTurns|RecoverAgentTurnsInterruptsRestartedUnboundRunAndPromotesQueue|ServiceRunsFolderlessTopicTurnsInAPrivateWorkingDirectory|ServiceRejectsSymlinkedUnboundWorkingDirectory|RedactPrivateExecutionEvent.*|ArtifactPrivateExecutionValidationChecksCompiledStrings|GeneratedMediaProducesTheArtifactItSaved|GeneratedMediaWithoutAnAuthorizedSafeFileProducesNoArtifact)$' \
  -count=1
```

Focused unbound role-profile and routing checks passed:

```sh
./scripts/go.sh test ./internal/narration \
  -run '^Test(ModelResolverUsesEffectiveNarratorProfileWithoutAWorkspace|ServiceAttemptContextLimitsUseEffectiveProfileWithoutAWorkspace|ConversationInputRouterContextLimitsUseEffectiveUnboundProfile|ConversationInputRouterDeliversFolderlessParentWork)$' \
  -count=1
```

Focused Director and runtime boundary checks also passed:

```sh
./scripts/go.sh test ./internal/director \
  -run '^Test(SendingWorkAddressesTheDurableSubstrate|SteeringNamesTheActiveRunTheAppKnowsAbout|WorkNeedingTheUsersFilesOpensADurableResourceRequest|WorkNeedingNoFilesRunsWithoutAFolder|RecoveringRestartsTheWorkThatFailed|CancelStopsTheRunTheUserSaw|ResolvingAnApprovalAnswersOnItsOwnRun|CommandCenterSubmitCarriesOneRequestIntoWork|DirectorDeliveryToolsExposeWorkspaceRequirements|DirectorReportsTheCommittedWorkspaceRequirement)$' \
  -count=1

./scripts/go.sh test ./internal/runtime \
  -run '^TestConversationRouteCommandExecutor(CompletesPersistedNarratorDegradation|RunsFolderlessNarratorAnswer)$' \
  -count=1
```

## Required Deterministic And Live Gate

Exactly one combined broad invocation ran after the static review, corrections,
formatting, and focused stabilization:

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

- `.recordings/director-command-center/20260727T101804353Z/`
- `.recordings/director-command-center-local-voice/20260727T101820463Z/`
- `.recordings/microphone-permissions/20260727T101832099Z/`

Local Codex ChatGPT auth was available. The same invocation excluded
`OPENAI_API_KEY` and passed the complete live matrix:

- agent ephemeral-thread lifecycle and discovery isolation
- active-side conversation lifecycle
- topic-conversation workflow, controls and restart, and artifact publication
- Director command center

No broad or live gate was duplicated, and no unavailable external verification
was retried.

## Phase Boundary

Every available Phase 2 gate is satisfied. Phase 3 remains pending and owns the
topic-agent composition contract, independent artifact judgment, identical
artifact-tool semantics, and workspace-independent artifact reads. This audit
did not replace the single-document instruction, add semantic output
enforcement, or begin Phase 3 implementation.

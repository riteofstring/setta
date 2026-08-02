# Native Artifact Routing Final Audit - 2026-07-27

## Result

The native artifact routing and execution plan is repository-actionably
complete.

The whole-plan audit reviewed the phase evidence and implementation lineage
before running verification. Static review found one in-plan privacy defect:
an unbound provider could surface its private Setta-owned working directory in
a standard URL-encoded form, bypassing both durable-event redaction and artifact
validation. The audit corrected that boundary and added focused coverage.

After the correction stabilized, exactly one broad deterministic gate and one
complete live-provider gate ran. Both passed. The live run used local ChatGPT
auth with `OPENAI_API_KEY` removed and included the exact zero-workspace native
artifact regression. No broad or live gate was duplicated or retried.

## Evidence And History Reviewed First

The audit inspected the following before verification:

- the complete plan and its hard rules, direct-contract requirements, phase
  ownership, focused workflow requirements, and definition of done
- the Phase 1, Phase 2, and Phase 3 audit reports and their focused,
  deterministic, and live-provider evidence
- the original failure recording at `.recordings/20260727T073439Z`, including
  the zero-workspace artifact request, incorrect folder request, and
  unrequested website/Sites behavior
- the final focused native workflow recordings through
  `.recordings/native-artifact-routing/20260727T111612853Z`
- implementation history from the initial plan at `96b9bf1da` through the
  dedicated Phase 4 checks at `189f99924`

The history is a direct implementation sequence: plan refinement, Phase 1
contracts and Director semantics, Phase 2 workspace-independent execution,
Phase 3 AI artifact semantics, each coherent phase audit, then the Phase 4
deterministic and live regression checks. No superseded implementation branch,
compatibility layer, or migration path was found.

## Static Whole-Plan Review

The static audit traced the current contracts and execution paths rather than
accepting status-only claims.

- `WorkspaceRequirement` is a Go-owned closed contract on Director create and
  submit decisions. Its committed fact and tool receipt preserve it through
  persistence and replay; steering does not redeclare it.
- Only a delivery explicitly declaring `required` opens the folder resource
  request. Optional work starts with a bound workspace when present and
  otherwise starts in a private per-conversation app-data directory.
- Workspace identity, authorized file root, and provider process directory are
  separate execution-scope fields. The private directory is not registered as
  a workspace and never authorizes `FileReference`.
- Queue promotion, steering, cancellation, approval continuation, recovery, and
  provider-carrier rotation preserve the optional execution scope and resolve
  the current workspace binding at the correct lifecycle boundary.
- Every free-form provider-authored event field and streamed text/progress delta
  crosses the private-path redactor before durable projection. Artifact title,
  source, and compiled document strings cross the corresponding rejection
  boundary.
- `setta.emit_artifact` is offered from the same dynamic tool definition in
  bound and unbound turns. Each invocation publishes one document; product code
  does not infer artifact intent or enforce a semantic count.
- Artifact declaration, publication, Director projection, replay, rail listing,
  and reads preserve every independent artifact. The artifact-read contract is
  one optional-workspace contract from the HTTP registry through generated
  TypeScript, the conversation service, and the store.
- A bound artifact may resolve a compiled `FileReference` only to an existing
  regular file inside the authorized workspace. An unbound reference fails
  loudly with the retryable `invalid_file_reference` result.
- Director and topic-agent instructions define native Setta artifacts, preserve
  explicit output distinctions, and prohibit inventing a website, Sites
  project, source tree, or gallery wrapper.

Repository searches and diff inspection found no special artifact workstream,
fake workspace, user-text artifact classifier, expected-output metadata,
semantic completion gate, count-repair loop, compatibility shim, migration,
dual read path, hardcoded TypeScript mirror, OpenUI catalog change, shadcn/ui
change, or command-center/artifact-browser redesign. The existing storage
capacity limit is not a semantic artifact expectation.

The Phase 4 Electron workflow was also reviewed end to end. It exercises the
production Electron/main/preload/renderer/HTTP/store paths with temporary app
data and covers zero-workspace startup, multiple separate artifacts, rail and
browser reads, bound equivalence, valid and invalid file references, queueing,
steering, cancellation, recovery, reload, restart, and a genuinely
file-dependent folder request.

## Audit Correction

The private-path alias set previously covered cleaned, slash-normalized, and
canonical filesystem spellings. It did not cover standard URL path, escaped
path-component, or query encodings. A path containing `Application Support`,
for example, could appear as `Application%20Support`; the raw private alias was
then absent, so the value could reach durable provider output or an artifact.

The alias resolver now derives those deterministic URL representations from
each filesystem spelling and canonical spelling. The same resolved alias set
continues to own:

- event and stream redaction
- artifact title, source, and compiled-string rejection
- the user-visible working-directory boundary

Focused tests use a private path containing spaces and prove redaction of
`file:` URL paths, path-component encoding, and query encoding, plus retryable
artifact rejection. No heuristic classifier or alternate privacy path was
introduced.

## Focused Verification

After the static review and correction, the narrow privacy checks passed:

```sh
env -u OPENAI_API_KEY ./scripts/go.sh test ./internal/conversation \
  -run '^(TestRedactPrivateExecutionEventRemovesWorkingDirectoryFromDurableFields|TestRedactPrivateWorkingDirectoryTextRemovesURLPathRepresentations|TestArtifactPrivateExecutionValidationChecksCompiledStrings|TestArtifactPrivateExecutionValidationRejectsURLPathRepresentations)$' \
  -count=1
```

## Final Deterministic Gate

The privacy correction touched production conversation execution, making the
earlier phase gates stale. Exactly one deterministic-only broad invocation ran
against the stabilized tree:

```sh
env -u OPENAI_API_KEY \
  ./scripts/test_topic_conversation_workflows.sh --deterministic-only
```

It passed:

- production desktop typecheck and Electron/Vite build
- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 77 desktop test files and 689 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- native-artifact-routing Electron workflow
- microphone-permissions Electron workflow

The final deterministic recordings are:

- `.recordings/director-command-center/20260727T113140610Z/`
- `.recordings/director-command-center-local-voice/20260727T113156916Z/`
- `.recordings/native-artifact-routing/20260727T113208532Z/`
- `.recordings/microphone-permissions/20260727T113223789Z/`

The native workflow summary reports seven durable artifacts across bound and
unbound work, the intended private generated-image fixture, and a passing
status.

## Final Live-Provider Gate

Because the correction changed provider-event privacy, the earlier live matrix
also no longer postdated the last relevant production change. Local Codex
ChatGPT auth was available. Exactly one complete live-only invocation ran with
API-key auth excluded:

```sh
env -u OPENAI_API_KEY \
  ./scripts/test_topic_conversation_workflows.sh --skip-build --live-only
```

It passed all five suites:

- live Codex agent protocol
- live Codex side isolation
- live Codex topic conversation
- live Codex Director command center
- live Codex unbound native artifacts

The last suite ran the recorded “create five varied artifacts” request with
zero open workspaces. It observed no folder resource request or workspace
registration and verified multiple separately readable, separately sourced
OpenUI documents. This is behavioral evidence only; production code contains
no requested-count metadata or enforcement.

## Completion Boundary

Every definition-of-done item and every repository-actionable verification gate
is satisfied. Native artifacts are available with or without a workspace,
file-dependent work can still request a real workspace, private execution
details remain private, and artifact quantity and composition remain AI
judgment. No external verification is unavailable, and no release gate remains
open for this plan.

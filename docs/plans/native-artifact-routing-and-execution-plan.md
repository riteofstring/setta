# Native Artifact Routing And Execution Plan

**Date:** 2026-07-27
**Status:** Active plan of record.

## Outcome

An explicit request for Setta artifacts must produce native artifacts through
`setta.emit_artifact`.

- Artifact creation never requires a project folder.
- A workspace-bound agent can create the same native artifacts and may reference
  authorized workspace files.
- A workspace-unbound agent can create native artifacts from conversation
  context without exposing or requesting a folder.
- If the user asks for five distinct artifacts, the agent emits five artifacts,
  not one gallery document and not a website project.
- The existing artifact rail, previews, and large carousel browser remain the
  presentation experience.

Failure evidence for this correction is in
`.recordings/20260727T073439Z`.

## Root Causes

1. The Director is not told what a Setta artifact is, so it rewrote the request
   as a self-contained web project with an index page.
2. Work delivery currently treats a missing workspace as a blocking resource,
   even when the work needs no user files.
3. The topic-agent instructions say to compose the deliverable as one artifact
   document, which conflicts with requests for multiple independent artifacts.
4. Setta records artifact-tool failures, but it does not detect a successful
   provider completion that emitted fewer artifacts than explicitly requested.

OpenUI parsing, validation, persistence, shadcn/ui rendering, the artifact rail,
and the artifact browser were not reached in the failed recording and are not
the cause.

## Product Model

Workspace access and artifact delivery are independent properties of a turn.

### Workspace Requirement

Each work delivery declares one Go-owned requirement:

```go
type WorkspaceRequirement string

const (
    WorkspaceOptional WorkspaceRequirement = "optional"
    WorkspaceRequired WorkspaceRequirement = "required"
)
```

- `optional` plus a bound workspace: run with that authorized workspace.
- `optional` plus no workspace: run immediately in a private Setta-owned
  working directory.
- `required` plus a bound workspace: run with that authorized workspace.
- `required` plus no workspace: open the existing folder resource request and
  do not start the work.

Artifact output never makes a workspace required. A workspace is required only
when the requested work needs access to the user's files.

The provider's process working directory is an execution detail, not a Setta
workspace. Keep the private working directory outside the workspace registry,
workspace UI, artifact metadata, and `FileReference` authorization.

### Artifact Expectation

Each work delivery may also carry:

```go
type ArtifactDeliveryExpectation struct {
    ExpectedCount int `json:"expectedCount"`
}
```

A nil expectation means the turn has no mandatory native-artifact output. A
non-nil expectation is bounded by `MaxArtifactsPerTurn` and means:

- the requested outputs are native Setta artifacts
- each independent requested output requires one successful
  `setta.emit_artifact` call
- the turn cannot complete successfully with fewer emitted artifacts
- Setta does not persist artifacts beyond the expected count

This is structured Director-owned intent. Do not infer it later with keyword or
number parsing.

## Hard Rules

- Do not create a special artifact workstream type.
- Do not create or register a fake workspace for workspace-unbound work.
- Do not expose the private provider working directory to the user.
- Do not authorize `FileReference` against the private working directory.
- Do not translate "Setta artifact" into a site, app, source tree, gallery page,
  or file unless the user explicitly asks for that additional deliverable.
- Do not combine separately requested artifacts into one tabbed, accordion, or
  gallery artifact unless the user explicitly requests one combined artifact.
- Mixed content belonging to one artifact remains one OpenUI document.
- Keep `setta.emit_artifact` available to both workspace-bound and
  workspace-unbound topic-agent turns.
- Do not change the WebGL command center, artifact rail, preview, or carousel
  interaction design in this plan.
- Do not change the OpenUI catalog or shadcn/ui component implementation.
- Do not install or invoke the shadcn CLI.

## Direct Contract Replacement

Setta is unreleased. Change current contracts directly.

- Replace mandatory workspace strings in work-delivery, steering, cancellation,
  approval, recovery, active-turn, and conversation-service paths with the new
  optional execution scope.
- Remove `requireFolderResource` and every assumption that all executable work
  needs a folder.
- Keep folder resource requests only for deliveries whose
  `WorkspaceRequirement` is explicitly `required`.
- Separate the provider working directory from the optional authorized
  workspace root throughout agent and artifact-file validation.
- Add the artifact delivery expectation to Director decisions and durable turns.
- Update owner-defined Go contracts and regenerate affected TypeScript outputs.
- Update current SQL schema and fixtures directly if persistence changes.

Do not add migrations, adapters, aliases, dual paths, compatibility fields, or
fallback behavior. Delete superseded tests and comments rather than preserving
the old folder-gated contract beside the new one.

## Director Contract

Teach the Director these product facts:

- A Setta artifact is a durable, directly viewable OpenUI document published by
  the topic agent through `setta.emit_artifact`.
- Native artifacts appear in Setta's artifact rail and browser.
- Native artifact creation does not require a workspace.
- Existing workspace context may be used when the user asks for artifacts based
  on project files.
- Preserve explicit artifact count and separateness in authored work.
- Never introduce website, Sites, gallery-page, or source-file requirements that
  the user did not request.

Update `create_workstream`, `submit_work`, and applicable steering tool schemas
so the Director supplies:

- `workspaceRequirement`
- nullable `artifactDelivery.expectedCount`

The Director must send the user's artifact intent to the worker without
rewriting its delivery medium.

## Topic-Agent Contract

Replace the current single-document instruction with:

> Each `setta.emit_artifact` call publishes one artifact. When the user requests
> multiple distinct artifacts, call it once for each requested artifact. Keep
> mixed content that belongs to one artifact in one document. Do not combine
> separately requested artifacts into a gallery, tabs, or accordion unless the
> user explicitly requests one combined artifact.

For a turn with an artifact delivery expectation:

1. Include the expected count in trusted model context.
2. Count durable `artifact_emitted` events for that Setta turn.
3. Do not mark provider completion successful while the count is below the
   expectation.
4. Use a bounded private repair continuation on the same carrier to request only
   the missing artifacts.
5. Once the expected count exists, return a structured non-emitting
   `artifact_count_satisfied` result for any additional call; do not persist an
   extra artifact and do not treat that result as an unresolved tool failure.
6. Never ask the user to retry a missing artifact-tool call and never report
   success with an unmet requirement.

Keep the existing retry behavior for malformed artifact documents. The count
repair is deterministic and must not inspect prose for intent.

## Execution Changes

### Phase 1 - Contracts And Director Semantics

**Status:** Pending.

- Add the workspace requirement and artifact delivery expectation at their Go
  ownership boundaries.
- Carry them through create, send, queue, steer, recovery, persistence, replay,
  and Director receipts.
- Update Director instructions and tool descriptions with native artifact
  semantics.
- Regenerate all affected generated contracts.
- Remove the old "folderless means waiting for a folder" descriptions and
  fixtures.

### Phase 2 - Workspace-Independent Agent Execution

**Status:** Pending.

- Let an unbound conversation accept, queue, steer, cancel, recover, and complete
  turns without a workspace ID.
- Give unbound turns a private Setta-owned working directory required by the
  provider runtime.
- Keep workspace identity nullable and separate from that directory.
- Resolve workspace-scoped role configuration only when a workspace is bound;
  otherwise use the current app/conversation defaults.
- Validate `FileReference` only against an authorized workspace root. Return the
  existing retryable field error when an unbound turn attempts one.
- Preserve the existing folder-resource UX only when a delivery explicitly
  declares `WorkspaceRequired`.

### Phase 3 - Artifact Cardinality And Repair

**Status:** Pending.

- Offer `setta.emit_artifact` identically in bound and unbound turns.
- Apply the revised one-call-per-output topic-agent instructions.
- Persist and replay the artifact delivery expectation.
- Extend terminal handling to compare expected and emitted counts.
- Add a bounded internal continuation for a shortfall and keep all resulting
  emissions attached to the same Setta turn.
- Ensure queueing, steering, cancellation, failure, and restart cannot silently
  discard or falsely satisfy the expectation.

### Phase 4 - Final Verification

**Status:** Pending. The user has authorized this phase after Phases 1-3 are
fully implemented and the branch is ready to merge.

Do not run automated tests during Phases 1-3. Once implementation is complete,
run the narrowest focused checks below first, fix any failures, and then run the
required broader deterministic and live-provider gates once against the stable
implementation.

The focused deterministic workflow must prove:

- with zero open workspaces, "create five varied Setta artifacts" starts
  immediately, opens no folder request, emits five artifacts, and creates no
  website or project files
- the five outputs are five durable artifact records and five rail previews,
  not one combined gallery artifact
- a workspace-bound conversation can emit the same artifacts
- a workspace-bound artifact may use a valid `FileReference`
- an unbound artifact cannot reference the private working directory
- an artifact shortfall is repaired before successful completion
- a genuinely file-dependent delivery with no workspace still opens a folder
  resource request
- queue, steer, cancellation, recovery, reload, and restart preserve the new
  optional workspace and artifact expectation contracts

Because this changes conversation execution, Director routing, provider
lifecycle, generated contracts, and artifact publication, final verification
must include a deterministic production Electron/main/preload/renderer/HTTP/
store workflow using temporary app data. Run the live Codex workflow only with
ChatGPT auth and without `OPENAI_API_KEY`; if ChatGPT auth is unavailable,
record the narrow skip and do not treat deterministic coverage as proof of
provider integration.

## Definition Of Done

- Native artifact requests never require a folder solely because they produce
  artifacts.
- Workspace-bound and workspace-unbound agents use the same artifact tool and
  artifact UX.
- The Director preserves native artifact delivery and explicit output count.
- Five requested artifacts produce five separate durable artifacts.
- Missing required artifacts are repaired internally before completion.
- No unrequested Sites project, gallery page, or source tree is created.
- Private execution directories never become workspaces or artifact file
  references.
- File-dependent work can still request a real user workspace explicitly.
- Superseded folder-gating code and single-artifact instructions are removed.
- No compatibility, migration, legacy, transitional, or dual-path code exists.

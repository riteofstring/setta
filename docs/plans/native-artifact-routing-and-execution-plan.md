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
- The AI decides when artifacts are useful, how many to create, and how to
  compose them from the user's request and conversation context.
- When the AI creates multiple independent artifacts, it publishes them
  separately rather than wrapping them in one gallery document or website.
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

OpenUI parsing, validation, persistence, shadcn/ui rendering, the artifact rail,
and the artifact browser were not reached in the failed recording and are not
the cause.

## Product Model

Workspace access is optional context. Artifact creation is an AI capability
available with or without that context.

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

## Hard Rules

- Do not create a special artifact workstream type.
- Do not add artifact intent metadata, expected-output counters, semantic
  completion gates, or semantic repair loops.
- Do not parse user text to decide whether an artifact was required or whether
  the AI created the "correct" number.
- Leave the decision to create artifacts, including their number and
  composition, to the Director and topic agent.
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
- Preserve the user's artifact intent and requested distinctions in authored
  work.
- Never introduce website, Sites, gallery-page, or source-file requirements that
  the user did not request.

Update `create_workstream` and `submit_work` so the Director supplies the
`workspaceRequirement`. Artifact output needs no separate routing field.

The Director must send the user's artifact intent to the worker without
rewriting its delivery medium.

## Topic-Agent Contract

Replace the current single-document instruction with:

> Each `setta.emit_artifact` call publishes one artifact. Use judgment to decide
> whether content belongs in one coherent mixed-content artifact or in multiple
> independently useful artifacts. Publish independent artifacts separately.
> Follow explicit user requests about the desired outputs without inventing a
> website, source project, or combined gallery.

The topic agent decides whether to call the tool and may call it repeatedly.
Setta continues to validate each individual document and return structured
correction feedback for malformed calls. Final prose is not a substitute when
the agent has decided to produce a durable artifact, but product code does not
judge the semantic completeness of the agent's chosen outputs.

## Execution Changes

### Phase 1 - Contracts And Director Semantics

**Status:** Complete. The coherent phase audit, corrections, deterministic
verification, and live-provider evidence are recorded in
[`docs/reports/native-artifact-routing-phase1-audit-20260727.md`](../reports/native-artifact-routing-phase1-audit-20260727.md).

- Add the workspace requirement at its Go ownership boundary.
- Carry it through create, send, queue, recovery, persistence, replay, and
  Director receipts.
- Update Director instructions and tool descriptions with native artifact
  semantics.
- Regenerate all affected generated contracts.
- Remove the old "folderless means waiting for a folder" descriptions and
  fixtures.

`WorkspaceRequirement` is owned by the Director decision protocol, because a
delivery is what declares it. `create_workstream` and `submit_work` supply it;
`steer_work` does not, because steering changes a run already carrying work
under the scope its workstream already has. Recovery does not declare it either:
it restarts a run the workstream already carried, so it is `optional` by
construction. The declaration reaches the durable `DirectorDecisionCommitted`
fact and the Setta tool receipt, so replay and the Director both see what the
app recorded. No generated TypeScript surface carries it, because no renderer
shape does.

Phase 2 is what honors the declaration: the executor gate that turns a missing
workspace into a folder request is still unconditional, and removing
`requireFolderResource` belongs with the execution change that lets an unbound
turn run.

### Phase 2 - Workspace-Independent Agent Execution

**Status:** Implemented, ready for phase audit.

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

The conversation service now resolves one execution scope per turn: the optional
authorized workspace, the authorized root a `FileReference` may resolve inside,
and the working directory the provider process runs in. A bound turn resolves
all three from the workspace registry. An unbound turn authorizes nothing and
runs in a private per-conversation directory under the app's own data location,
which is not a workspace and never authorizes a file reference.
`requireFolderResource` is gone: the Director opens the folder request from the
requirement its committed decision declared, so only work that said it needs the
user's files waits for one. Steering and recovery declare nothing, because
neither is a new delivery.

The topic-pane router follows the same rule. Delivering work to the conversation
itself is offered and executed without a folder; a side conversation and a fork
are still workspace-scoped durable records, so an unbound conversation is not
offered them and the execution boundary rejects one loudly.

Phase 3 owns the topic-agent side: identical `setta.emit_artifact` availability
and composition judgment in bound and unbound turns. Reading a published
artifact back is still addressed by workspace through
`ReadConversationArtifactRequest`, so an unbound conversation's artifacts are not
readable yet; that belongs with Phase 3's "offer the tool identically" work
rather than with this execution change.

### Phase 3 - AI Artifact Semantics

**Status:** Pending.

- Offer `setta.emit_artifact` identically in bound and unbound turns.
- Apply the revised AI-judgment topic-agent instructions.
- Keep artifact quantity and composition under model judgment.
- Preserve existing per-document validation, retryable correction, durable
  publication, provenance, and replay.
- Confirm no artifact expectation or semantic count-enforcement code was
  introduced.

### Phase 4 - Final Verification

**Status:** Pending. The user has authorized this phase after Phases 1-3 are
fully implemented and the branch is ready to merge.

Do not run automated tests during Phases 1-3. Once implementation is complete,
run the narrowest focused checks below first, fix any failures, and then run the
required broader deterministic and live-provider gates once against the stable
implementation.

The focused deterministic workflow must prove:

- with zero open workspaces, a native artifact request starts immediately,
  opens no folder request, and creates no website or project files
- one turn can emit multiple independent durable artifacts and show each in the
  rail without a combined gallery wrapper
- a workspace-bound conversation can emit the same artifacts
- a workspace-bound artifact may use a valid `FileReference`
- an unbound artifact cannot reference the private working directory
- a genuinely file-dependent delivery with no workspace still opens a folder
  resource request
- queue, steer, cancellation, recovery, reload, and restart preserve optional
  workspace execution and normal artifact publication

Because this changes conversation execution, Director routing, provider
lifecycle, generated contracts, and artifact publication, final verification
must include a deterministic production Electron/main/preload/renderer/HTTP/
store workflow using temporary app data. Run the live Codex workflow only with
ChatGPT auth and without `OPENAI_API_KEY`; if ChatGPT auth is unavailable,
record the narrow skip and do not treat deterministic coverage as proof of
provider integration. Include the recorded "create five varied artifacts"
request as a live behavioral regression, without adding production count
metadata or enforcement for the test.

## Definition Of Done

- Native artifact requests never require a folder solely because they produce
  artifacts.
- Workspace-bound and workspace-unbound agents use the same artifact tool and
  artifact UX.
- The Director and topic agent understand native Setta artifact semantics.
- Artifact quantity and composition remain AI decisions.
- Multiple independently composed artifacts remain separate durable artifacts.
- No unrequested Sites project, gallery page, or source tree is created.
- Private execution directories never become workspaces or artifact file
  references.
- File-dependent work can still request a real user workspace explicitly.
- Superseded folder-gating code and single-artifact instructions are removed.
- No artifact expectation, semantic counter, completion gate, or count-repair
  mechanism exists.
- No compatibility, migration, legacy, transitional, or dual-path code exists.

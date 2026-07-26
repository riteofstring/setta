# Command Center Conversation Input Surface Plan

**Date:** 2026-07-27
**Status:** Active plan of record.

## Outcome

Setta will have one predictable place for workstream-owned user action:
immediately above the text and voice composer, layered over the live graph.

- A request appears only while its owning workstream is selected.
- Switching workstreams removes the old workstream's request surface
  immediately. The destination workstream shows only its own pending request.
- A background workstream that needs the user is marked in workstream
  navigation, but its controls never leak into the selected workstream.
- Pending attention state survives renderer reload and pushed-stream resync.
- A full Setta restart follows each domain's honest lifecycle: a carrier-owned
  input or approval is durably interrupted before the rebuilt UI can offer it,
  while an independently actionable resource request remains pending.
- The surface disappears only after Setta has durably resolved the request.
- The graph retains a concise public account of what the user selected.
- The right rail becomes an artifacts-only rail. Approval controls, resource
  controls, and the manual "New workstream" folder panel are removed from it.
- A stable **New workstream in folder…** command remains in workstream chrome.
  It opens the native folder picker and directly creates and selects an idle
  folder-backed workstream without asking AI.

AI-authored input uses a hybrid contract:

- ordinary questions use Setta-owned, hardcoded controls generated from typed
  fields;
- a richer request may include a bounded OpenUI input document that arranges
  explanatory content and references those same trusted fields;
- file and folder selection always use Setta-owned native pickers;
- approval, elicitation, and resource selection remain different domain
  concepts even though the command center presents them in one place.

The OpenUI document controls composition, never authority. It cannot define an
event handler, submit action, tool call, filesystem path, network request, or
arbitrary host capability.

## Product Decision

The command center needs a **conversation attention surface**, not a general
interactive-artifact platform.

Three kinds of durable state can require the user:

1. **Input request** — the AI needs information or a choice.
2. **Approval request** — Setta needs an explicit safety or permission
   decision.
3. **Resource request** — work needs a trusted app resource such as a folder.

They share placement and interaction lifecycle, but not contracts. A renderer
selector may compose them into a local discriminated union for presentation.
The backend must not flatten them into a generic form record or infer their
meaning from labels.

A user choosing to start a workstream in a folder is not responding to any of
these requests. It is a direct user command in stable workstream chrome and
must remain available when no AI work or attention card exists.

An OpenUI input document is not a conversation artifact:

- it does not appear in the artifact rail or artifact browser;
- it is not a durable deliverable;
- it cannot outlive the request that owns it as an actionable surface;
- its source remains in durable request history only so replay and renderer
  reconnection can reconstruct live pending state truthfully.

The existing `setta.artifacts.v1` catalog remains display-only. Interactive
input receives a separate catalog and lifecycle.

## Current System

The current implementation already has the durable foundations, but its domain
and presentation boundaries are mixed.

### Provider input is represented as approval

- `internal/agent/approvals.go` normalizes Codex `request_user_input` and MCP
  elicitation into `agent.ApprovalRequest`.
- `internal/conversation/service_agent_approvals.go` maps that state into
  trajectory approval kinds such as `structured_input` and
  `mcp_elicitation`.
- `internal/conversation/trajectory.go` puts questions on
  `TrajectoryApprovalRequest`.
- `internal/conversation/commands.go` puts structured answers on
  `ConversationApprovalResponse`.

This overloads two different questions:

- "May the agent perform this action?"
- "What information should the agent use?"

It also forces the Director and renderer to treat ordinary elicitation as an
approval.

### Action controls live in the Artifacts rail

`desktop/src/renderer/src/features/director-command-center/DirectorArtifactsRail.tsx`
currently owns:

- command, file-change, and permission approvals;
- structured question forms;
- pending folder-resource requests;
- active and recent workspace choices;
- the manual "New workstream" folder panel;
- artifact previews.

The right rail therefore mixes durable outputs with transient blockers and
manual workstream creation.

### The renderer receives app-windowed requests

`DirectorSnapshot` carries app-windowed unresolved approvals and resource
requests. `DirectorCommandCenterShell` currently passes the complete arrays to
the right rail. The arrays are not reduced to the selected workstream before
controls are rendered.

That is appropriate for app-wide aggregation, but not for a
conversation-scoped input surface.

### OpenUI is intentionally display-only

The current artifact plan and implementation prohibit model-defined mutation
or host actions. The catalog, compiler, renderer, persistence, and security
boundaries under `internal/conversation/artifactdoc` and
`desktop/src/renderer/src/features/artifacts` are valuable foundations, but
the artifact catalog must not acquire form submission as an incidental
extension.

### The graph already has the right durability model

Approval and resource requests already produce durable waiting nodes and
durable resolutions. The new input lifecycle should follow that event-driven
projection pattern rather than introducing renderer-only state or polling.

## Hard Cutover Rule

Setta is unreleased. Implement the target design directly.

- Do not add migrations.
- Do not read or write both old and new event shapes.
- Do not retain old approval kinds as aliases.
- Do not keep structured questions on approvals.
- Do not add compatibility adapters around old generated TypeScript.
- Do not render requests in both the right rail and the new surface.
- Do not keep the manual folder-start panel in the Artifacts rail. Replace that
  presentation directly with one stable **New workstream in folder…** command.
- Do not route that direct command through the Director or turn it into an
  ephemeral resource request.
- Do not add feature flags, shadow writes, schema-version bridges, or fallback
  UI for the superseded design.
- Do not preserve old fixtures or tests by translating their payloads.
- Change the current SQL schema, Go contracts, fixtures, and generated outputs
  to the final shape and delete superseded code in the same implementation.

Existing developer data may be reset. No production data or released behavior
exists to migrate.

Implementation phases below are sequencing boundaries inside one direct
replacement. They do not authorize shipping or retaining mixed behavior.

## Goals

- Give every selected workstream one stable place for pending user action.
- Preserve a direct, AI-independent way to create and select a workstream in a
  folder.
- Keep the text and voice composer available for steering, cancellation, or a
  changed request while work is blocked.
- Let an AI compose a richer explainer without giving model output executable
  authority.
- Preserve typed provider requests and responses end to end.
- Keep secrets, filesystem paths, and permission details out of public graph
  summaries.
- Survive workstream switching, renderer reload, pushed-stream resync, and
  duplicate pushed events.
- Resolve carrier-owned input truthfully on provider loss or full process
  restart without orphaning its card or inventing a resumed provider call.
- Keep graph rendering isolated from DOM input work.
- Keep the initial shell cheap when no input request exists.
- Make every flow keyboard- and screen-reader-complete.

## Non-Goals

- A generic web-form builder.
- Arbitrary JSON Schema rendering.
- Model-authored JavaScript, callbacks, links that execute host actions, or
  direct OpenUI tool providers.
- Treating a folder or file picker as an OpenUI field.
- Turning pending input into a durable artifact.
- Treating **New workstream in folder…** as an AI request or ephemeral
  attention item.
- Replacing the normal composer with a request form.
- Automatically interpreting composer text as a structured response.
- Showing every app-wide pending request at once.
- Adding polling.
- Inferring request kind, field type, privacy, or graph meaning from prose.
- Redesigning the artifact browser or the WebGL renderer.
- Reworking ordinary Director prose clarification in this plan. The new
  surface belongs to a selected workstream; app-level Director conversation can
  continue to clarify through the composer.

## Target Experience

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ workstream navigation                  New workstream in folder…         │
│                                                                          │
│  Now                    selected workstream graph              Artifacts │
│                                                                          │
│                          ┌──────────────────────┐                        │
│                          │ Input needed         │                        │
│                          │ [choice] [choice]    │                        │
│                          │          Continue    │                        │
│                          └──────────────────────┘                        │
│                          ┌──────────────────────┐                        │
│                          │ Ask the Director…  🎙 │                        │
│                          └──────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────────┘
```

### Placement

Replace the composer as a direct stage child with a bottom interaction dock.
The dock owns:

1. the selected workstream's attention card;
2. the existing text and voice composer.

The dock occupies the current bottom stage row. The graph continues to span the
entire stage underneath it, so the card and composer are depth-layered over the
canvas without absolute-position offsets tied to composer height.

The card:

- aligns to the composer's inline edges;
- sits vertically above the composer with a clear gap;
- uses a higher local layer than the graph and rails but remains below the top
  bar and modal artifact/history surfaces;
- is non-modal and does not make the graph, rails, or composer inert;
- has a bounded block size and scrolls internally when expanded;
- keeps primary actions in a stable footer;
- may collapse to a one-line summary, but never dismisses or cancels merely
  because it was collapsed.

The entire dock does not intercept canvas input. Only the visible card and
composer receive pointer events.

### Selected-workstream scope

The owning `workstreamId` is authoritative.

- Filter approvals, inputs, and resource requests by
  `selectedWorkstreamId` before creating any interactive element.
- Key form state by both `workstreamId` and request ID.
- On selection change, unmount the outgoing card before rendering the incoming
  workstream.
- Do not include the attention card in the graph's outgoing switch snapshot.
  An old request must not appear visually or in the accessibility tree after
  the destination selection commits.
- Do not auto-select a workstream when it begins waiting for input.
- Mark its workstream navigation control with a visible and accessible
  "input needed", "approval needed", or "folder needed" state.

### Arrival and focus

When a request arrives for the selected workstream:

- show the card in its actionable state;
- announce it through a pre-mounted polite live region;
- do not steal focus from the composer, voice capture, a rail control, or the
  graph;
- allow a keyboard user to reach it in normal DOM order immediately before the
  composer.

When a request arrives for another workstream, update only that workstream's
navigation status and accessible name.

### Multiple pending actions

Render one action at a time. Order selected-workstream actions by:

1. `requestedAt`;
2. stable request ID as the tie breaker.

Do not invent semantic priority from titles or request text. Show a count such
as "1 of 2" and explicit previous/next controls when more than one item is
pending. Each item retains independent form state keyed by request ID.

Provider and product invariants should prevent most simultaneous blockers, but
the renderer must remain deterministic when replay exposes more than one.

### Submission and disappearance

Submitting a response:

1. validates the typed fields;
2. disables only that card's actions while the direct intent is in flight;
3. sends the response to the trusted backend boundary;
4. keeps the card mounted until the pushed durable update marks it resolved;
5. then removes it with a short opacity/block-size transition;
6. immediately shows the next pending item, if one exists.

A dispatch promise or optimistic local state is not resolution authority.

If focus is inside a card when its durable resolution removes it, move focus to
the composer. Otherwise, preserve the user's current focus.

With reduced motion, remove the size transition and use an immediate
replacement or a simple opacity crossfade.

### AI-requested folder flow

A folder request card contains:

- the trusted public explanation of why the work needs a folder;
- currently open workspace choices by display name;
- a "Choose folder" action that opens the native picker;
- a cancel action only when the resource lifecycle supports cancellation.

The native picker returning no selection leaves the request pending. A selected
folder is resolved to a trusted workspace ID before the Director intent is
dispatched. Model output never supplies or receives an arbitrary filesystem
path through this UI.

Remove the right-rail `WorkspaceStartPanel`, but preserve its direct
user-initiated capability as one stable **New workstream in folder…** command
owned by workstream navigation.

The direct flow is:

1. The user invokes **New workstream in folder…**.
2. Setta opens the native folder picker without starting a Director turn.
3. Cancelling the picker changes nothing and returns focus to the command.
4. A selected folder becomes a trusted workspace ID.
5. Setta directly creates and selects one idle folder-backed workstream, using
   the workspace display name as the initial title.
6. The user may then type or speak the first instruction through the normal
   composer.

This flow creates no `ResourceRequest`, asks no model for a decision, and emits
no ephemeral attention card. A resource request remains reserved for work
already committed to a workstream that cannot continue without a folder.

The read-only folder chip in workstream chrome remains useful persistent
context and is not an input control.

## Domain Boundaries

### Approval

An approval is a safety decision over a proposed action.

Keep only:

- command;
- file change;
- permission.

An approval accepts an approval decision. It does not contain questions or
structured answers.

Remove from the approval domain:

- `structured_input`;
- `user_input`;
- `mcp_elicitation`;
- `ApprovalStatusAnswered`;
- question arrays;
- answer arrays;
- secret-question handling that exists only because input was overloaded as
  approval.

### Input

An input request asks the user to supply information. Introduce a first-class
input lifecycle from provider adapter through graph projection.

The intended Go-owned shape is:

```go
type InputFieldKind string

const (
    InputFieldSingleChoice   InputFieldKind = "single_choice"
    InputFieldMultipleChoice InputFieldKind = "multiple_choice"
    InputFieldText           InputFieldKind = "text"
)

type InputOption struct {
    Value       string `json:"value"`
    Label       string `json:"label"`
    Description string `json:"description"`
}

type InputField struct {
    ID         string         `json:"id"`
    Kind       InputFieldKind `json:"kind"`
    Header     string         `json:"header"`
    Prompt     string         `json:"prompt"`
    Required   bool           `json:"required"`
    Secret     bool           `json:"secret"`
    AllowOther bool           `json:"allowOther"`
    Options    []InputOption  `json:"options"`
}

type InputDocument struct {
    Language  OpenUIDocumentLanguage `json:"language"`
    CatalogID OpenUICatalogID        `json:"catalogId"`
    Source    string                 `json:"source"`
}

type TrajectoryInputRequest struct {
    ID             string         `json:"id"`
    ProviderItemID string         `json:"providerItemId"`
    PublicSummary  string         `json:"publicSummary"`
    Fields         []InputField   `json:"fields"`
    Document       *InputDocument `json:"document"`
    RequestedAt    string         `json:"requestedAt"`
}
```

This is a contract direction, not permission to hand-maintain TypeScript
mirrors. Final names should remain domain-specific and generated from Go.

Validation rules:

- field IDs are unique, stable, and trimmed;
- at least one field exists;
- choice fields have bounded, unique option values;
- text fields do not carry options;
- `AllowOther` is valid only for a choice field;
- a secret field never contributes its value to durable history, a graph
  summary, telemetry, or a Director activity response;
- all collections are non-null and bounded at their Go owner;
- all user-visible strings are size-bounded before persistence;
- an input document is optional and, when present, must compile against the
  exact input catalog;
- every input-field slot in the document references a declared field;
- every declared field appears exactly once in the document;
- the document cannot define submit or cancel controls.

Introduce distinct trajectory events:

- `input_requested`;
- `input_resolved`.

Introduce a distinct user command and Director intent for input response. Use a
typed resolution kind such as:

- `answered`;
- `cancelled`;
- `superseded` for provider-owned withdrawal only;
- `interrupted` for system-owned loss of the live provider carrier.

Only `answered` carries answers. `superseded` and `interrupted` are never
accepted from the renderer.

### Resource

Keep `ResourceRequest` separate because trusted product code, not OpenUI or the
model, resolves it into a binding.

The current folder kind remains. A future file kind must be added explicitly at
this same boundary with its own native picker and validation. Do not pre-build a
generic resource schema.

The stable **New workstream in folder…** command bypasses this lifecycle. It
creates a workstream with an already trusted folder binding; it does not
manufacture a pending request merely to reuse the attention UI.

### Presentation-only union

The renderer may define:

```ts
type DirectorAttentionItem =
  | { kind: "input"; request: InputRequest }
  | { kind: "approval"; request: ApprovalRequest }
  | { kind: "resource"; request: ResourceRequest };
```

This union is derived from typed backend records and selected-workstream state.
It is not persisted and does not replace the three domain lifecycles.

## Provider And AI Input

### Provider-native requests

Split provider handling at `internal/agent`:

- command/file/permission server requests produce `ApprovalRequest`;
- `request_user_input` produces `InputRequest`;
- MCP elicitation produces `InputRequest`;
- provider response methods become `SubmitApproval` and `SubmitInput`, with
  distinct validation.

Preserve provider option descriptions instead of reducing each option to its
label. Provider-native requests use the standard hardcoded presentation and do
not need an OpenUI document.

Provider-native input, MCP elicitation, and rich Setta input are intentional
ingress adapters to one current input lifecycle. They are not old/new
compatibility paths.

Do not infer a field kind from prose. Derive it only from typed provider
metadata. If a provider requests a schema Setta does not support, fail the
provider boundary specifically; do not guess a UI and do not show a protocol
error to the user.

### Rich Setta input

Add one topic-agent capability:

```text
setta.request_input
```

Its strict input contains:

- a short public summary;
- the typed field definitions;
- an OpenUI input-document source.

The tool:

1. validates the strict JSON arguments;
2. compiles and cross-validates the OpenUI document and field slots;
3. returns retryable, field-specific correction feedback to the model if
   invalid;
4. commits the durable input request before anything renders;
5. waits without polling for the user resolution;
6. returns typed answers to the active provider call;
7. commits resolution only through the normal conversation lifecycle.

Malformed model output never becomes user-visible input UI. The model repairs
its tool call just as it repairs an invalid emitted artifact.

Rename the current topic-agent tool assembly from an artifact-only concept to a
Setta conversation-tool catalog and offer both:

- `setta.emit_artifact`;
- `setta.request_input`.

Do not add a general capability broker or arbitrary action registry. This tool
does one thing: request typed user input for the current turn.

### Pending-call lifecycle

The rich tool may remain actionable only while its provider carrier is live.

- A committed pending request survives renderer reload and pushed-stream
  resync.
- The live carrier continues waiting without polling and accepts the typed
  answer after the renderer reconnects.
- If the provider withdraws the request, Setta commits `superseded`.
- If the provider carrier is lost or Setta restarts, startup or failure recovery
  commits `interrupted` before the turn's terminal event and before any rebuilt
  Director snapshot can offer the request.
- Setta never rebinds, persists, or resumes an ephemeral provider carrier.
- Setta never leaves an actionable card whose provider continuation cannot
  consume the answer.
- Secret values and draft answers remain renderer- or process-local. A renderer
  reload may require re-entry while the request is still pending; a full
  process restart interrupts the request instead of pretending the answer can
  reach a dead call.
- This interruption rule applies to input and approval requests owned by a live
  provider run. A resource request that remains independently actionable keeps
  its own durable lifecycle.

Do not fall back to injecting untyped prose, matching question text, or asking
the user to retry an internal routing failure.

## OpenUI Input Profile

### Catalog separation

Introduce a new catalog identity:

```text
setta.inputs.v1
```

Keep:

```text
setta.artifacts.v1
```

display-only.

The input catalog contains:

- a dedicated input-document root;
- the bounded explanatory content and layout primitives actually useful inside
  the card;
- one `InputField` slot component whose only model-authored property is a
  declared field ID.

The host renderer looks up the field definition and renders the native,
controlled React field. The model cannot override:

- control type;
- option values;
- required state;
- secret state;
- labels used in the provider response;
- validation;
- submit/cancel behavior;
- disabled or pending state.

Submit, cancel, collapse, and multi-request navigation remain outside the
OpenUI document in stable host chrome.

### Shared compiler ownership

There are now two real OpenUI consumers. Extract only the genuinely shared
language/compiler/catalog machinery from the artifact-specific package.

A direct target shape is:

```text
internal/conversation/openuidoc/
  language, parser, compiler, values, limits
  artifact catalog
  input catalog
```

Rename `cmd/generate-artifact-catalog` to a generator that owns both catalogs,
for example:

```text
cmd/generate-openui-catalogs
```

Generate:

- catalog identities;
- component-name unions;
- component props schemas;
- model-facing signatures;
- catalog limits;
- conformance fixtures needed by each renderer.

Do not duplicate the parser, compiler, Zod schema generation, or component
constants into an input-only implementation. Do not introduce a plugin system
or runtime catalog registry; two explicit catalogs are sufficient.

On the frontend, extract shared display renderers only where both artifact and
input catalogs use them. Keep artifact browser behavior and input form state in
their domain features.

### Input-document safety

Use lower, independently owned bounds for an input document where the overlay
needs them. Bound:

- source bytes;
- statements;
- expanded nodes;
- nesting depth;
- fields;
- options per field;
- total option text;
- rendered table or list size.

Select final limits from the Phase 0 baseline and record them at the Go owner.
Do not reuse a larger artifact limit merely because it already exists.

The input profile permits no:

- file reference;
- image or remote content;
- raw HTML;
- script;
- arbitrary URL action;
- model-authored button;
- tool invocation;
- network access;
- filesystem capability.

Local tabs, accordions, and scrolling may remain presentation-only.

## Conversation Persistence And Privacy

The trajectory remains canonical.

- Commit an input request before pushing it to the Director registry.
- Commit its resolution before removing it from the pending snapshot.
- Rebuild pending input state by folding request and resolution events.
- Keep only unresolved inputs in `DirectorSnapshot`.
- During full-process startup recovery, resolve every input owned by a dead
  carrier as `interrupted` before publishing the first rebuilt Director
  snapshot or promoting queued work.
- Preserve source event IDs and request ownership through replay.
- Treat a pushed duplicate as idempotent event replay, not a second request.

For non-secret fixed choices, durable resolution may retain the selected option
values and labels. For free text, secrets, and provider fields marked private,
store only the fact that input was provided unless the contract explicitly
classifies the value as public.

Never place in public graph state:

- secret values;
- arbitrary free text;
- permission payloads;
- commands or diffs;
- filesystem paths;
- provider request envelopes.

No analytics or fault telemetry may include answer values or full input
document source.

## Director Registry And Graph

### Registry state

Add a first-class Director `InputRequest` record and lifecycle.

Update:

- registry maps and order;
- per-workstream unresolved input membership;
- workstream public counts;
- app-wide aggregates;
- snapshot bounds;
- pushed Director event catalog;
- event reducers;
- activity summaries;
- snapshot validation;
- clone helpers;
- archive and removal invariants.

Add:

- `WorkstreamStatusAwaitingInput`;
- `UnresolvedInputCount`;
- app-wide awaiting/unresolved input counts;
- `DirectorEventInputUpdated`.

Keep approval and resource counts separate. Define status precedence in the
workstream state table rather than in the renderer. Security approvals should
remain more prominent than ordinary input if impossible replay state exposes
both.

### Graph projection

Add a typed semantic input node and source mapping.

- `input_requested` creates a waiting node linked with `blocked_by` to the run
  it pauses.
- `input_resolved` updates that same node to succeeded, cancelled, superseded,
  or interrupted.
- A public single-choice response updates the summary deterministically to
  retain the question and selected label, such as
  `Choose review scope — Focused files`.
- Multiple public choices use a bounded trusted summary.
- Secret and free-text responses use a generic summary such as
  `Input provided`.
- A runtime interruption uses the generic summary `Input interrupted` and never
  exposes draft values.
- Folder resolution updates the existing resource node with a trusted display
  name, never a root path.

The graph projector derives these summaries from typed fields and trusted
resolution data. It must not ask a model to summarize the response or parse
prose.

Graph updates remain push-driven. The DOM form never writes directly to WebGL
state.

## Renderer Architecture

### Component ownership

Add a focused feature under:

```text
desktop/src/renderer/src/features/director-command-center/
```

Suggested ownership:

- `DirectorWorkstreamNavigation.tsx` — stable
  **New workstream in folder…** command;
- `DirectorInteractionDock.tsx` — composer and attention-layer placement;
- `DirectorAttentionLayer.tsx` — selected-workstream filtering, ordering, and
  request navigation;
- `DirectorInputRequestCard.tsx` — typed fields and optional OpenUI document;
- `DirectorApprovalRequestCard.tsx` — true safety approvals;
- `DirectorResourceRequestCard.tsx` — native resource selection;
- `director-command-center-input.css` — dock, card, responsive, and motion
  rules;
- small field/answer helpers colocated with the input card unless a second
  consumer proves a shared owner.

Do not build a global form framework.

### Shell changes

`DirectorCommandCenterShell` should:

- derive selected-workstream attention items with `useMemo`;
- pass native folder and workspace-selection capabilities to both the stable
  workstream command and the resource card;
- mount one interaction dock;
- keep graph snapshot updates independent of form-state updates;
- include attention-layer disclosure in global keyboard handling only where a
  real shortcut is specified;
- keep history and artifact modals as the only surfaces that make command
  center content inert.

### Artifacts rail cleanup

`DirectorArtifactsRail.tsx` becomes artifact-only.

Delete:

- approval list and forms;
- resource-request list;
- the right-rail workspace-start panel and its active/recent workspace grid;
- approval answer builders;
- rail-owned resource picker state;
- CSS selectors used only by those controls.

Keep renderer-facing `DirectorIntentCreateWorkstream` as the direct command
boundary for **New workstream in folder…**. It accepts only the trusted
workspace ID returned by the native picker and the product-derived initial
title. It must not accept a model-authored path.

The Director's model-owned `create_workstream` tool is a separate backend
contract and also remains.

Rename props, announcements, and empty states so the rail speaks only about
artifacts.

### Form behavior

Use native controls:

- radio inputs for single choice;
- checkboxes for multiple choice;
- text or password inputs for text;
- a real form submit button;
- real buttons for cancel, collapse, and request navigation.

Keep submit enabled until submission begins. Validate on submit, mark invalid
fields with `aria-invalid`, connect inline errors with `aria-describedby`, and
focus the first invalid field.

OpenUI `InputField` slots render these same host-owned controls through a
request context. They do not receive callbacks from document source.

## Accessibility Contract

- The attention card is a labelled `<section>` or `<form>`, not a dialog.
- Do not trap focus and do not make the background inert.
- Keep one empty polite live region mounted before request text is injected.
- Announce the owning workstream and public summary.
- Do not announce secret values or selected filesystem paths.
- Use visible `:focus-visible` rings.
- Keep a minimum 40×40 px desktop hit area and 44×44 px where touch input is
  plausible.
- Put the card before the composer in DOM and reading order.
- Keep **New workstream in folder…** in the normal workstream-navigation tab
  order with a visible focus ring.
- Use arrow-key behavior only for native radio groups or an established
  composite pattern; Tab moves between widgets.
- Escape may collapse an expanded card. It must never silently cancel a
  request.
- If the focused card disappears after durable resolution, focus the composer.
- If it disappears because the user selected another workstream, place focus
  on the selected workstream control or composer according to the initiating
  interaction; never leave focus on a detached node.
- Errors use an assertive announcement only for the specific failed action.
  Routine arrival and resolution use polite status.
- The layout must reflow at 200% zoom and 320 CSS px without horizontal
  scrolling.
- Use logical CSS properties and preserve reading order under RTL.
- Honor `prefers-reduced-motion`.

## Failure Handling

The user should never see parser, projection, schema, provider-envelope, or
routing errors.

- Invalid AI input documents return structured repair feedback to the AI before
  a request is committed.
- An invalid renderer response focuses the field the user can correct.
- A cancelled native picker leaves the card unchanged.
- A folder that cannot be opened produces a specific inline action message and
  leaves the request pending.
- A lost pushed-event cursor triggers the existing typed Director resync.
- A request superseded by the provider resolves through a typed event.
- An internal response failure keeps the card present only while its carrier
  remains live and Setta performs a specific typed retry.
- Carrier loss or full-process restart commits an `interrupted` resolution
  before the run's terminal event; it never retries against or renders a dead
  provider call.
- Do not add broad catch-all fallbacks, fake success, keyword routing, or
  "please retry" UI for internal contract failures.

## Performance Contract

This is a performance-relevant renderer change.

- Capture a command-center baseline before implementation and append it under
  `docs/reports/performance/`.
- Re-measure the same scenarios after the direct cutover.
- Keep standard input controls in the shell path and load the rich OpenUI input
  renderer only when a rich request exists if measurement shows the parser and
  catalog would materially grow the idle shell.
- A lazy rich renderer must not make the shell inert. Its card keeps a native
  public summary and pending state while the chunk loads.
- Render only the selected workstream's current request document.
- Unmount resolved and foreign-workstream documents.
- Bound rendered DOM through the Go-owned input catalog.
- Keep form state out of the Director graph snapshot and graph packer.
- Do not recreate the WebGL canvas or repack an unchanged graph because a field
  value changed.
- Preserve structural sharing in Director event reducers.
- Batch pushed semantic updates through the existing frame path.
- Add no timers or polling.

Record at minimum:

- idle shell JavaScript and CSS;
- first input-card appearance latency after the durable event;
- workstream-switch latency with an input card on the outgoing workstream;
- field-edit behavior while the graph animates;
- rich-document expansion cost at maximum supported bounds;
- resolution-to-graph-update latency;
- DOM node count and retained memory after repeated request resolution.

Do not invent estimates when the driven environment is unavailable. Record the
missing evidence as a release gate.

## Implementation Phases

The user has approved implementation through the repository's unattended plan
loop. Phase status is authoritative and must be updated in the same commits that
change implementation or audit evidence.

- Do not run automated tests, broad quality gates, or supply-chain gates during
  Phases 0–5. Static inspection, owner generators, formatting, and the required
  performance measurements remain allowed.
- The user's approval authorizes Phase 6 verification only after Phases 0–5 are
  complete and the branch is ready to merge.
- A phase audit before Phase 6 inspects the implementation and existing
  evidence; it does not override the repository's no-tests-during-implementation
  rule.

### Phase 0 — Ownership audit, protocol proof, and baseline

**Status:** Pending.

- Record the exact current approval, input, resource, Director snapshot, IPC,
  renderer, graph, and recovery owners.
- Confirm the pinned provider protocol behavior for native user input, MCP
  elicitation, pending dynamic tool calls, supersession, and live-carrier
  cancellation.
- Establish from pinned provider source and current Go concurrency ownership
  that the `setta.request_input` wait can be satisfied by a concurrent direct
  command without blocking other workstreams or the app-scoped pushed stream.
- Establish that a renderer reconnect can rebuild and answer the same request
  while its carrier remains live.
- Record the existing ephemeral-carrier invariant and the required ordering for
  an `interrupted` input resolution during provider loss and process restart.
- Capture the required frontend performance baseline.
- Write the Phase 0 audit report.

The Phase 0 protocol proof is a static source and ownership audit. Executable
coverage belongs to Phase 6.

Gate: do not begin production work until the pinned provider boundary can hold
one dynamic tool call open while Setta services the direct response path. Do not
invent an asynchronous token protocol, prose injection, provider-thread
persistence, or a best-effort fallback.

### Phase 1 — Direct domain split

**Status:** Pending.

- Split agent approvals from agent input requests.
- Add input field, option, request, answer, resolution, and lifecycle types.
- Add input trajectory events and validation.
- Remove input kinds, questions, answers, secrets, and `answered` status from
  approvals.
- Add provider-native and MCP input adapters.
- Add distinct `SubmitInput` execution.
- Replace current schema and fixtures directly.
- Update conversation status derivation and startup recovery so a dead
  carrier's pending input is resolved as `interrupted` before the turn's
  terminal event.
- Regenerate Go-owned TypeScript after owner changes.
- Delete superseded approval code before closing the phase.
- Write the Phase 1 audit report.

### Phase 2 — OpenUI input profile and rich request capability

**Status:** Pending.

- Extract the narrow shared OpenUI document compiler ownership.
- Add `setta.inputs.v1` with input-document root and field slots.
- Add cross-validation between field definitions and document slots.
- Rename and extend the catalog generator to own both explicit catalogs.
- Generate both TypeScript libraries from Go.
- Add the controlled input renderer context and field-slot renderer.
- Add `setta.request_input` with validation, repair, durable request, push-based
  live-carrier wait, response, cancellation, renderer reconnection, and typed
  interruption.
- Keep `setta.artifacts.v1` display-only.
- Add no general action registry.
- Write the Phase 2 audit report.

### Phase 3 — Director registry and graph cutover

**Status:** Pending.

- Add Director input records, counts, lifecycle, snapshot window, pushed event,
  and reducers.
- Add `awaiting_input` workstream status and navigation labels.
- Add the semantic input node and typed public response summary.
- Update resource resolution to retain a safe public selection summary.
- Update Director activity so input, approval, and resource state are reported
  separately.
- Add the direct `resolve_input` intent and execution path.
- Regenerate backend TypeScript.
- Remove old structured-approval Director handling.
- Write the Phase 3 audit report.

### Phase 4 — Command-center presentation cutover

**Status:** Pending.

- Add the interaction dock and selected-workstream attention layer.
- Add standard input, OpenUI input, approval, and resource cards.
- Move AI-requested folder selection to the resource card.
- Move direct folder-backed workstream creation from the Artifacts rail to a
  stable **New workstream in folder…** command in workstream navigation.
- Move true approvals to the same attention layer.
- Add off-workstream navigation indicators.
- Implement durable-resolution dismissal, focus restoration, live
  announcements, responsive layout, and reduced motion.
- Convert the right rail to artifacts only.
- Remove `WorkspaceStartPanel` and right-rail request UI while retaining the
  direct renderer create-workstream intent at its new stable owner.
- Ensure the outgoing request is absent immediately after workstream selection.
- Write the Phase 4 audit report.

### Phase 5 — Cleanup and performance remeasurement

**Status:** Pending.

- Search for and remove every superseded approval kind, answer field, old UI
  label, old selector, old CSS rule, and old generated surface.
- Confirm generated contracts come only from current Go owners.
- Format changed files with repository tooling.
- Re-measure the Phase 0 performance scenarios and append the before/after
  report.
- Inspect the complete diff for compatibility code, duplicated contracts,
  polling, unbounded DOM, and unrelated changes.
- Do not begin Phase 6 verification until the branch is ready to merge.

### Phase 6 — User-authorized merge verification

**Status:** Pending. The user has authorized this phase after Phases 0–5 are
complete and the branch is ready to merge.

Start with the narrowest checks for:

- input contract validation and provider mapping;
- OpenUI input compilation and field-slot cross-validation;
- input response privacy and redaction;
- Director input registry/event folding;
- graph request/resolution projection;
- selected-workstream attention selection;
- form validation, focus, keyboard, and reduced motion;
- native folder resolution;
- direct folder-backed workstream creation without a Director turn.

Then run the required deterministic production Electron workflow through real
main/preload/renderer/HTTP/store paths with temporary app data. It must cover:

- opening the app and creating/selecting workstreams;
- invoking **New workstream in folder…**, selecting a temporary folder, and
  creating an idle selected workstream without a Director turn or resource
  request;
- cancelling that native picker without creating a workstream;
- submitting text and voice input;
- streamed assistant output;
- a simple single-choice request;
- a multi-question request;
- a rich OpenUI explainer with embedded field slots;
- a secret input;
- a true approval;
- a folder resource request and native picker;
- switching from workstream X to Y while X waits;
- the absence of X's controls in Y;
- background navigation indicators;
- switching back and preserving pending request state;
- submission, durable resolution, disappearance, and graph update;
- picker cancellation and recoverable folder failure;
- provider supersession;
- provider loss resolving the pending input as `interrupted` before the
  terminal turn event;
- queueing and steering while a request is pending;
- completion, cancellation, and failure;
- queued-work promotion or preservation;
- renderer reload and pushed-stream resync while a live request is pending;
- renderer reconnect around response delivery;
- full-process restart resolving carrier-owned input before the rebuilt
  Director snapshot is published;
- absence of an actionable input card or provider-carrier resume after restart;
- artifact creation and browsing remaining unaffected.

For performance-relevant merge verification, exercise maximum supported input
documents while the graph animates and compare against the recorded baseline.

If local Codex is signed in with ChatGPT auth, run the live Codex workflows
without `OPENAI_API_KEY`, including:

- provider-native user input;
- rich `setta.request_input`;
- folder-required work;
- renderer reconnection around a live pending request;
- full-process restart interrupting a pending request without orphaned UI.

If ChatGPT auth is unavailable, report the live-provider skip explicitly and do
not treat deterministic coverage as provider-integration proof.

Do not run `./check_quality.sh`, supply-chain gates, or broad test suites unless
the user's verification request includes them or a focused failure establishes
a concrete cross-boundary need.

## Deletion Checklist

The implementation is incomplete while any superseded path remains.

- [ ] Input-related values are removed from `TrajectoryApprovalKind`.
- [ ] Structured questions are removed from approval contracts.
- [ ] Structured answers are removed from approval commands and Director
      intents.
- [ ] `ApprovalStatusAnswered` is removed.
- [ ] Provider input is no longer emitted as `EventKindApprovalRequested`.
- [ ] Director approvals no longer contain question arrays or secret markers.
- [ ] Right-rail approval and resource sections are removed.
- [ ] `WorkspaceStartPanel` is removed.
- [ ] **New workstream in folder…** exists in stable workstream chrome.
- [ ] The stable command uses the direct renderer create-workstream intent and
      never invokes AI or opens a `ResourceRequest`.
- [ ] Old action-list CSS is removed.
- [ ] Old generated TypeScript is regenerated, not patched.
- [ ] Artifact OpenUI remains display-only.
- [ ] No provider-carrier persistence, resume, or rebind path was added for
      pending input.
- [ ] Startup recovery resolves dead-carrier input before publishing the rebuilt
      Director snapshot.
- [ ] No compatibility aliases, schema shims, migrations, feature flags, dual
      reads, or dual writes exist.

## Definition Of Done

- Every pending workstream-owned user action appears above the composer and
  nowhere else.
- The surface is scoped strictly to the selected workstream.
- Other workstreams expose only truthful attention indicators until selected.
- The right rail contains artifacts, not transient user actions or folder
  creation controls.
- A user can create and select an idle folder-backed workstream through
  **New workstream in folder…** without asking AI.
- Cancelling that native picker has no effect.
- Ordinary elicitation is a first-class input domain, not an approval kind.
- True approvals remain typed safety decisions.
- Folder selection remains a trusted native resource operation.
- Rich AI-authored input uses a dedicated bounded OpenUI catalog with only
  host-owned field slots.
- OpenUI cannot execute arbitrary host actions.
- Request and resolution survive replay; a live pending request survives
  renderer reload and pushed-stream resync.
- Provider loss or full-process restart durably interrupts carrier-owned input
  before the rebuilt UI can offer it.
- No provider carrier is persisted, resumed, or rebound.
- The UI disappears only after durable resolution.
- Public fixed choices and safe folder display names remain visible in the
  graph; secrets, free text, and paths do not.
- The composer remains usable while an input request is pending.
- Keyboard, screen-reader, zoom, RTL, and reduced-motion behavior are complete.
- Graph animation and input editing remain responsive at measured bounds.
- Superseded contracts and UI are deleted.
- No migration, compatibility, legacy, transitional, heuristic, polling, or
  old/new dual-path implementation remains.

# Review frontend design rationale

This document owns current non-local rationale for the `review-frontend` module. Public behavior
belongs in `apps/review/README.md`.

## Projection and ownership

The validated backend snapshot is authoritative for request identity, imported assessments,
evidence resolution, response drafts, and revision. React projects that value into one
`@setta/workspace` host. Workspace owns the shell, outline, canvas, section chrome, selection,
attention, framing, graph interaction, saved presentations, and managed windows. Review owns only
its typed section bodies, controlled semantic graph, disposable exploration state, and response
actions.

Claim, option, factor, candidate, and evidence selection is disposable browser state. Selecting a
subject never replaces evidence content. It projects only that subject's canonical relations,
focuses exact cited content, and asks Workspace to frame the participating sections. A durable
action is sent only at a coherent user boundary with the observed revision. Project SSE replacement
retains compatible disposable selection and otherwise chooses a deterministic first subject.

Review uses two system-projected Workspace saved views rather than app-owned navigation. Current
shows requests without a final response; Old shows requests with one. Each request's decision and
evidence sections move together, while Workspace preserves independent layout and viewport state
for both views. Review does not expose saved-view editing for this lifecycle split.

## Completion review

Each completion request projects one claims section whose title is the submitted request. Every
claim stays visible, including consensus, disagreement, unresolved, and zero-assessment cases.
Expanding a claim shows recorded assessments named by model and harness. Agent assessments and the
human response use distinct visual and semantic states. Human actions resolve, qualify, reject,
request evidence, or leave the claim unresolved with optional rationale.

Evidence uses rich reusable views: a real unified-diff renderer, read-only Workspace CodeMirror
for generic source files and structured JSON, exact-line log surfaces, and artifact previews.
Semantic support, challenge, qualification, and informational relations become typed controlled
graph edges. Low-information bespoke receipt or file-summary sections are not introduced.

## Choice review

A choice matrix is one section whose title is the submitted question, options are rows, factors
are columns, and cells are tradeoffs. Its width follows content up to a bounded maximum and then
scrolls. Selecting an option is provisional until confirmation. Selecting a factor highlights its
column, semantic edge, evidence section, and exact citation. The response supports selection,
rejection, qualification, and a focused request-changes form.

Artifact comparison is another projection of the same request and response contract. Candidate
sections render admitted images, text, or JSON at useful fidelity in managed windows. Selection is
synchronized with the outline and response controls. Explicit drawing mode records normalized
paths only on the selected exact artifact, survives candidate switching, and supports clear and
revision-request actions. A drawing remains a response overlay rather than modified evidence.

## Application state and dependencies

`@setta/workspace` remains the only canvas and shell dependency. Existing Workspace CodeMirror and
Markdown surfaces render ordinary code and text. Pierre Diffs renders unified Git evidence.
Workspace's controlled normalized-stroke surface owns annotation gesture mechanics and passive SVG
rendering. Review still owns contained-image placement, artifact identity, path styling, response
mutation, and persistence; Fabric is not required for an overlay that has no object editing
semantics. Ajv validates generated wire contracts. No Review UI imports another app's private
frontend code.

The checked-in playground contains real request, diff, source-code, JSON, log, image, and choice
artifacts. A launcher copies it into ignored working state. Component tests cover typed sections
and revision actions; browser acceptance covers completion selection and resolution,
Current-to-Old movement, factor-to-evidence highlighting, artifact choice, drawing, reload
persistence, and CLI assessment ingestion at normal and constrained viewport sizes.

## Unsubmitted feedback

Feedback text, claim notes, and drawing overlays are tab-local drafts until the human submits a
response. Session storage retains them across refresh and section remounts. Keys include project
identity and the admitted request digest; drawing restoration also validates the response shape
and exact artifact digest. Storage failures retain in-memory work, show a visible notice, and
warn before leaving while unsaved work remains. They do not prevent review or submission. A
successful response clears only the submitted drawing draft; strokes added during the request
remain pending. Save conflicts retain feedback and remain visible after refreshing the snapshot.

## Playground guidance

The `review-playground` manifest enables a Start here shell tab with three independent challenges.
Buttons resolve each sample request's Current or Old view from its live response before framing
the request. Finishing a review therefore does not strand its guide action on a hidden section.
The shared Workspace quick-start surface owns presentation and navigation mechanics; Review owns
request identity and instructional content. The guide clearly distinguishes fictional local
responses from external communication and collapses before framing the destination on narrow screens.

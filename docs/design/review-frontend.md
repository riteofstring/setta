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

## Completion review

Each completion request projects one claims section whose title is the submitted request. Every
claim stays visible, including consensus, disagreement, unresolved, and zero-assessment cases.
Expanding a claim shows recorded assessments named by model and harness. Agent assessments and the
human response use distinct visual and semantic states. Human actions resolve, qualify, reject,
request evidence, or leave the claim unresolved with optional rationale.

Evidence uses rich reusable views: a real unified-diff renderer, Workspace code and text surfaces,
structured JSON, logs, and artifact previews. Semantic support, challenge, qualification, and
informational relations become typed controlled graph edges. Low-information bespoke receipt or
file-summary sections are not introduced.

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
Annotation gestures use a small app-owned normalized SVG path model; Fabric is not required for an
overlay that has no object editing semantics. Ajv validates generated wire contracts. No Review UI
imports another app's private frontend code.

The checked-in playground contains real request, diff, JSON, log, image, and choice artifacts. A
launcher copies it into ignored working state. Component tests cover typed sections and revision
actions; browser acceptance covers completion selection and resolution, factor-to-evidence
highlighting, artifact choice, drawing, reload persistence, CLI assessment ingestion, and export at
normal and constrained viewport sizes.

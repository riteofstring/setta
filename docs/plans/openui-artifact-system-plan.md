# OpenUI Artifact System Plan

**Date:** 2026-07-26
**Status:** Active plan of record.

## Executive Summary

Replace Setta's fixed markdown, table, bar-chart, and file artifact types with
one composable OpenUI document format.

OpenUI owns the document language and React rendering protocol. Setta continues
to own artifact identity, generation policy, validation, durable publication,
conversation and trajectory provenance, persistence, lifecycle projection,
security, and the Director artifact experience.

Artifacts render through a Setta OpenUI component catalog backed by selected
official shadcn/ui Base UI component source. Setta will not use
`@openuidev/react-ui`, imitate shadcn styling with custom substitutes, or invoke
the shadcn CLI.

The cutover is direct:

- delete the old artifact kinds and payloads
- replace the current database schema in place
- replace the old tool contract
- replace the renderer switch
- regenerate Go-owned TypeScript contracts
- discard incompatible local development data

There will be no migration, compatibility layer, dual path, old-field alias,
legacy reader, legacy renderer, or transitional artifact format.

## Product Decision

Adopt OpenUI Lang as the composition format only if Setta can validate the
supported language profile authoritatively before persistence.

The intended product model is:

```text
Codex composes a Setta OpenUI document
                  |
                  v
Setta validates the complete document and catalog contract
                  |
                  v
Setta atomically stores the artifact and trajectory event
                  |
                  v
OpenUI parses the stored document in the renderer
                  |
                  v
Official shadcn/ui Base UI components render with Setta theme tokens
```

The AI controls content and composition. Setta controls the component catalog,
data limits, actions, security, styling, and publication.

## Goals

- Let the AI compose useful reports, comparisons, dashboards, code summaries,
  file references, charts, and mixed-content documents without adding a new
  backend artifact kind for every combination.
- Make artifacts look native to Setta by rendering through actual shadcn/ui
  Base UI component implementations and Setta's existing theme tokens.
- Preserve durable artifact delivery, model retry, provenance, lifecycle,
  event-stream, and reload guarantees.
- Reject malformed or unsafe documents before they become durable user-visible
  state.
- Keep artifact rendering responsive and bounded for large conversation
  histories and large artifact documents.
- Keep the OpenUI dependency behind Setta-owned contracts so upstream changes
  do not become Setta's persisted public contract accidentally.

## Non-Goals

- Replacing Setta's conversation UI with OpenUI AgentInterface.
- Using OpenUI Cloud for storage, model routing, correction, or rendering.
- Using `@openuidev/react-ui` as Setta's design system.
- Allowing arbitrary HTML, JSX, JavaScript, CSS, Tailwind classes, or component
  imports in model output.
- Allowing OpenUI `Query`, `Mutation`, tool providers, MCP calls, or arbitrary
  actions in the first catalog.
- Rendering external images or loading other remote resources from artifacts.
- Streaming a partially generated artifact in the first release. Setta's
  current dynamic-tool boundary receives complete JSON arguments.
- A collapsed text-only artifact list or a single-click rail-expansion state.
- Preserving artifacts created with the superseded artifact schema.
- Installing or running the shadcn CLI, including temporary, global, `npx`, or
  `pnpm dlx` installation.
- Importing shadcn/ui Radix or React Aria variants, mixing shadcn primitive
  bases, or retaining Radix primitives for the replaced UI responsibilities.

## Current System

The current artifact contract is a Go-owned union in
[`internal/conversation/domain.go`](../../internal/conversation/domain.go):

- `markdown`
- `table`
- `bar_chart`
- `file`

That closed list is repeated in:

- the `setta.emit_artifact` dynamic-tool schema and developer instructions
- domain validation and tool failure handling
- four nullable SQLite payload columns
- generated TypeScript contracts
- Director artifact labels, icons, and renderer branches
- fixtures and deterministic/live workflow coverage

The following behavior is valuable and must survive:

- a retryable tool failure can be corrected in the same provider turn
- an artifact is considered emitted only after durable publication
- artifact and trajectory state commit atomically
- artifact metadata carries conversation, turn, and trajectory provenance
- conversation snapshots bound artifact history
- Director lifecycle projection distinguishes declared, available, and
  unresolved artifacts
- the desktop reads artifacts through production HTTP, main, preload, IPC, and
  renderer paths

The implementation changes the payload model, not those guarantees.

## Hard Cutover Rule

Setta is unreleased. Implement this plan as a replacement, never as a
transition.

The implementation must:

- remove `ArtifactKind`, `MarkdownArtifactPayload`, `TableArtifactPayload`,
  `BarChartArtifactPayload`, and `FileArtifactPayload`
- remove the `kind`, `markdown`, `table`, `barChart`, and `file` fields from the
  current artifact contract
- remove old tool branches and their validation
- remove the four artifact payload columns and their database checks from
  `schema_v1.sql`
- remove kind-specific renderer components, labels, and icons
- update existing fixtures and tests to the new contract instead of adding new
  fixtures alongside old ones
- change the current schema and contracts directly

The implementation must not:

- detect or read an old artifact row
- transform an old artifact row into an OpenUI document
- introduce a schema migration
- retain old JSON fields as optional
- support both old and new `setta.emit_artifact` inputs
- retain a fallback renderer for old kinds
- add a feature flag for the old artifact implementation
- preserve incompatible local development databases

Developers will delete and recreate local app data once the schema changes. No
runtime code should recognize the old schema.

## Target Artifact Contract

The Go-owned domain contract should have one document payload:

```go
type ArtifactDocumentLanguage string
type ArtifactCatalogID string

const (
    ArtifactDocumentLanguageOpenUI ArtifactDocumentLanguage = "openui_lang"
    ArtifactCatalogSettaV1         ArtifactCatalogID          = "setta.artifacts.v1"
)

type ArtifactDocument struct {
    Language  ArtifactDocumentLanguage `json:"language"`
    CatalogID ArtifactCatalogID         `json:"catalogId"`
    Source    string                    `json:"source"`
}

type Artifact struct {
    ID                 string           `json:"id"`
    ConversationID     string           `json:"conversationId"`
    TurnID             *string          `json:"turnId"`
    TrajectorySequence *int             `json:"trajectorySequence"`
    Title              string           `json:"title"`
    Document           ArtifactDocument `json:"document"`
    CreatedAt          string           `json:"createdAt"`
}
```

`ArtifactMetadata` keeps identity, title, provenance, and time. It does not
carry a synthetic replacement for `kind`.

The model-facing `setta.emit_artifact` input is:

```json
{
  "title": "Quarterly support review",
  "source": "root = Document([...])"
}
```

The model does not choose `language` or `catalogId`. The backend attaches the
only supported values after successful validation.

The SQLite artifact table should store one `language`, one `catalog_id`, and
one `source` value with the existing identity and provenance fields. It must not
retain generic nullable payload columns or an old `kind`.

## Setta OpenUI Static Profile

Setta will support a deliberately small, static subset of OpenUI Lang in the
first catalog.

Supported syntax:

- one assignment statement per line
- one required `root` document assignment
- registered component calls
- string, finite number, boolean, and null literals
- arrays and objects with bounded size
- inline registered components
- references to uniquely named document statements

Unsupported syntax:

- `Query` and `Mutation`
- `Action` and tool invocation
- state variables and bindings
- edit patches
- conditionals, arithmetic, and other runtime expressions
- unknown built-ins
- executable or raw markup

The backend owns a strict parser and compiler for this static profile. It does
not port the entire OpenUI parser. It only accepts the grammar above, resolves
all references, maps positional arguments through the active catalog, validates
every value, and returns structured field errors.

The renderer uses the pinned upstream OpenUI parser. Phase 0 must establish a
conformance corpus proving that every document accepted by Setta's compiler is
interpreted equivalently by the pinned OpenUI renderer. If that boundary cannot
be made deterministic without a JavaScript runtime or a second service in the
backend, stop the cutover. Do not weaken pre-persistence validation.

Initial safety limits should be Go-owned constants and should start with:

- 64 KiB maximum UTF-8 source
- 256 maximum statements and rendered component nodes
- 12 maximum component nesting depth
- 100 maximum entries in any data array
- 12 maximum table columns
- 100 maximum table rows
- 8 maximum chart series
- 200 maximum chart points across all series
- finite numeric values only

Phase 0 may lower these limits based on prompt, payload, and rendering
measurements. Raising them requires measured evidence.

## Catalog Ownership And Generation

Go owns the catalog identity, component names, ordered properties, property
types, enum values, required fields, limits, and model-facing descriptions.
These definitions belong at the conversation artifact boundary, not in a
global constants file.

A dedicated generator, `cmd/generate-artifact-catalog`, derives:

- TypeScript component-name and property contracts, including the OpenUI
  library JSON Schema the parser reads argument order and requiredness from
- Zod schemas required by `@openuidev/react-lang`
- the model-facing catalog signatures and generation instructions
- the safety limits a Setta renderer has to size something by
- typed fixtures used by the renderer's production-path gallery

Phase 0 landed the first and last of those, and Phase 1 landed the rest. Later
phases extend that one generator rather than adding a second.

Generated outputs must be marked generated and must never be edited manually.
The handwritten React renderer map must use a generated component-name union
with `satisfies` so a missing renderer is a compile-time error.

The normal HTTP contract generator remains owned by the
`internal/httpapi` endpoint registry. After the Go artifact contract changes,
regenerate `desktop/src/generated/backend.ts` with:

```bash
./scripts/go.sh run ./cmd/generate-contracts
```

The artifact catalog generator must not maintain a separate list of HTTP
request or response types.

## Official shadcn/ui Base UI Boundary

In this plan, "use shadcn" means using selected official shadcn/ui Base UI
component source, not recreating its visual style.

As of July 2, 2026, Base UI is shadcn/ui's default and recommended component
base for new projects. shadcn/ui rebuilt its component catalog for Base UI;
Radix remains supported upstream, but this plan explicitly selects Base UI
only.

shadcn/ui is source-distributed. Without the CLI, Setta will check selected
official Base UI variant source into
`desktop/src/renderer/src/components/ui/` manually from a pinned upstream
shadcn/ui revision.

The selected source baseline is shadcn/ui revision
[`7774cd7dcee1e98d0815aa6e829f33a7fc952fdf`](https://github.com/shadcn-ui/ui/commit/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf).
Components must come from that revision's
`apps/v4/registry/bases/base/ui/` registry, and the initial Base UI runtime
dependency is exactly `@base-ui/react` `1.6.0`. Do not take components from the
sibling `radix` or `aria` registries.

No shadcn CLI package may appear in a package manifest or lockfile. Do not use
`npx shadcn`, `pnpm dlx shadcn`, a global shadcn installation, or any equivalent
temporary CLI installation. Retrieve the official component source directly
from the pinned upstream repository or registry files.

The existing local `button.tsx`, `badge.tsx`, and `input.tsx` implementations
are not considered official shadcn/ui source by this plan. All three must be
replaced directly with their official shadcn/ui Base UI implementations as
part of Phase 1, whether or not the artifact catalog exposes them to the model.

This replacement applies to their existing consumers across settings, runtime
selection, speech, and account UI. It is an application primitive cleanup
inside this plan, not an artifact-only copy of shadcn.

Do not preserve the current local component APIs:

- remove the current Button `primary` and `secondary` variant API; update
  callers to the official shadcn Base UI variant and composition API or a
  clearly named Setta-domain wrapper
- remove the current Badge `neutral`, `success`, and `danger` variant API; use
  the official Badge plus a separate Setta status component when domain status
  semantics are required
- remove the current Input implementation and update callers to the official
  Input, using an explicitly named Setta-domain wrapper only when a product
  surface needs stable compact sizing

No wrapper may duplicate the official primitive or retain an old API merely to
avoid updating callers.

Requirements:

- record the upstream shadcn/ui revision and registry source for every imported
  component in a small provenance manifest, including `base` as the selected
  registry
- keep the official Base UI component structure and accessibility primitives
- make only the changes required for Setta import aliases, exact dependency
  versions, and existing CSS variable names
- place Setta-specific behavior in wrappers outside the copied shadcn
  primitives
- do not label a custom approximation as a shadcn component
- do not keep an old custom component beside a new official component with the
  same responsibility
- when an existing `components/ui` file conflicts, replace it directly and
  update all consumers in the same phase
- use Base UI composition contracts such as `render` where the official source
  requires them; do not introduce or preserve Radix-specific `asChild`
  contracts
- do not add direct `@radix-ui/*` dependencies or copy any shadcn Radix variant

The initial official shadcn/ui Base UI set should cover:

- Accordion
- Alert
- Badge
- Button
- Card
- Chart
- Dialog
- Input
- Scroll Area
- Separator
- Table
- Tabs
- Tooltip

Use the shadcn Base UI registry's Chart implementation with its Recharts
dependency. Dependencies introduced by official components must be direct,
exactly pinned dependencies and must be added through
`./update_dependencies.sh`.

Some required artifact concepts do not exist in shadcn/ui. These should be
clearly named Setta components rather than shadcn substitutes:

- `ArtifactDocument`
- `ArtifactSection`
- `ArtifactStack`
- `ArtifactGrid`
- `ArtifactHeading`
- `ArtifactText`
- `ArtifactMarkdown`
- `ArtifactCodeBlock`
- `ArtifactFileReference`
- Setta status and compact-control wrappers required by existing application
  surfaces
- chart and table adapters that enforce Setta data limits

These components may compose official shadcn Base UI primitives internally
where appropriate.

## Initial Model-Visible Catalog

The first catalog should be expressive enough to replace the current system and
build useful mixed documents without exposing application actions.

Content:

- `Document`
- `Section`
- `Heading`
- `Text`
- `Markdown`
- `CodeBlock`
- `FileReference`

Layout:

- `Stack`
- `Grid`
- `Card`
- `Separator`
- `Tabs`
- `Tab`
- `Accordion`
- `AccordionItem`

Data display:

- `Metric`
- `Badge`
- `Alert`
- `Table`
- `BarChart`
- `LineChart`
- `AreaChart`
- `PieChart`

The catalog must not expose `className`, `style`, raw colors, arbitrary icon
names, event handlers, URLs, React props, or DOM attributes. Limited semantic
props such as `tone`, `size`, `density`, and chart intent may be enums owned by
the catalog.

The root `Document` component is unframed. Cards are optional content-grouping
components, not a mandatory wrapper around the artifact or every section.

## Styling Model

OpenUI selects registered components and supplies validated content. It does not
control arbitrary visual styling.

Official shadcn/ui Base UI primitives use Setta's existing Tailwind v4 setup
and shadcn-compatible CSS variables. Artifact wrappers must use the same tokens
as the command center:

- background and foreground
- card and popover
- muted and accent
- primary and status colors
- border, input, and focus ring
- Setta font families

Artifact appearance must follow the active Setta appearance settings and work
in light and dark modes without a separate artifact theme.

The AI cannot choose fonts, pixel dimensions, arbitrary colors, shadows,
border radii, or CSS utilities. Responsive layout comes from the component
implementation, not generated source.

## Validation And Repair

Validation happens before artifact IDs are published and before the artifact
transaction begins.

The compiler must reject:

- invalid UTF-8 or oversized source
- invalid statements or trailing unparsed text
- missing or duplicate `root`
- duplicate statement names
- missing or cyclic references
- unknown components or unsupported OpenUI features
- missing, extra, or incorrectly typed component arguments
- non-finite numbers
- source that exceeds node, depth, table, chart, or array limits
- forbidden URL, HTML, style, action, or tool values
- unsafe file references

Failures return the existing typed dynamic-tool failure shape with:

- a stable failure code
- `retryable: true` for model-correctable documents
- line, statement, component, and property information
- a concise correction instruction
- no parser stack trace or internal OpenUI error shown to the user

Codex must correct and retry `setta.emit_artifact` in the same turn. A failed
attempt remains a trajectory fact, but no artifact row or artifact-created
event is committed.

The renderer's OpenUI `onError` callback is telemetry and defense only. It is
not a substitute for backend validation.

## Persistence And Replay

Store the validated source exactly as accepted, together with its language and
catalog ID.

On read:

1. HTTP returns the Go-owned artifact contract.
2. Electron main and preload decode the generated contract.
3. The renderer selects the catalog by exact `catalogId`.
4. OpenUI parses the stored source.
5. The Setta renderer map produces official shadcn/ui Base UI and Setta domain
   components.

Within this unreleased plan, `setta.artifacts.v1` may be changed in place and
development data discarded. Do not add a catalog compatibility registry for
superseded development documents.

The renderer may memoize parsed results by artifact ID and source identity. It
must not persist a second renderer-owned artifact representation.

## File And Link Security

`FileReference` receives a workspace-relative path only.

The backend must:

- reject absolute paths
- reject traversal outside the conversation workspace
- reject references when the conversation has no authorized workspace
- normalize and validate the path against the workspace root

The renderer must not use `file://` URLs or open a path directly. File actions
go through typed Setta IPC and revalidate authorization at the owning process.

Markdown and text components must:

- disable raw HTML
- reject embedded images
- allow only explicitly supported link protocols
- route any allowed external navigation through a typed host action

The first implementation may render external links as inert text. It must not
load remote artifact resources.

## Renderer Integration

Replace the kind switch in `DirectorArtifactsRail.tsx` with one
`SettaArtifactRenderer`.

The artifact rail becomes an always-visible preview gallery. There is no
collapsed artifact row, selected-card expansion, or other single-click layout
state.

Every artifact occupies a stable-height preview card containing:

- title, availability, and concise provenance metadata
- a bounded, content-aware visual preview
- an explicit icon-only expand control with an accessible name and tooltip

Available artifacts render previews from the same validated OpenUI document:

- text and Markdown show a short excerpt
- tables show the header and first two rows
- charts show a small static, nonanimated plot
- code shows its first few lines
- mixed documents show the first two meaningful content blocks

Declared or unresolved artifacts retain a stable status preview and disabled
expand control until content becomes available. The artifact browser sequence
contains available artifacts only.

Preview cards must not store or request a separate preview document. When a
preview enters the visible rail viewport, read the artifact through the
existing production API, parse it once, and project the parsed document through
an exhaustive Setta preview-renderer map. Reuse that parsed result when the
full artifact opens.

Preview rendering must:

- use a fixed content viewport so arrivals and loads do not shift the rail
- be noninteractive and pointer-transparent apart from the expand control
- disable chart animation, tabs, accordions, links, file actions, code copy,
  hover tooltips, and all other document interactions
- cap rendered preview nodes independently of the full-document limits
- avoid mounting content that falls outside the preview projection
- lazy-load only previews that enter the rail viewport
- release offscreen preview DOM while retaining only the bounded parse cache

Activating the expand control opens the complete artifact in a large
`ArtifactBrowserOverlay` rendered as normal React DOM above the WebGL command
center. Double-clicking the preview may perform the same action as a pointer
shortcut. Double-click is never the only affordance, and a single click must
not change the preview's size or layout.

"Artifact browser" means a carousel-style browser for Setta artifacts. It does
not mean an embedded web browser, webview, iframe, remote page, or new network
surface.

Opening any preview sets that artifact as the active document in one persistent
browser overlay. The user can then move through all available artifacts in the
same authoritative rail order without closing the overlay.

The artifact browser must:

- show the active artifact title and position, such as `3 of 8`
- provide visible previous, next, and close icon controls with accessible names
  and tooltips
- disable previous or next at the corresponding collection boundary rather
  than wrapping chronology unexpectedly
- update the active artifact in place without closing and reopening the Dialog
- support Left and Right Arrow shortcuts when focus is not inside an
  interactive artifact control
- announce the newly active artifact title and position through a polite live
  region
- keep only the active full document mounted
- prefetch and parse only the immediate previous and next available artifacts
  into the bounded cache
- keep the current artifact active when new artifacts arrive, recomputing only
  its position in the authoritative collection
- respect reduced-motion preferences for any directional transition

Use controlled shadcn Base UI Dialog content and Button controls by default. Do
not add a carousel dependency that requires adjacent full artifact documents
to remain mounted.

The overlay must:

- use the official shadcn/ui Base UI Dialog primitive for modal semantics,
  focus containment, Escape handling, and focus restoration
- leave the WebGL graph mounted behind a simple dim layer so closing the
  artifact returns to the same graph state
- disable graph, rail, top-bar, and composer interaction while open
- provide a large, scrollable, unframed document surface on desktop
- fill the available Electron content area at the existing compact-window
  breakpoint; this is narrow desktop-window behavior, not a mobile-app target
- restore focus to the expand control that opened it
- use an icon close control and a stable title association
- avoid nesting the artifact document inside an additional decorative card
- keep OpenUI and chart code out of the initial command-center bundle

The WebGL renderer does not render OpenUI or shadcn content and does not
receive artifact component state. Electron's Chromium renderer composites the
DOM overlay above the canvas.

The renderer must:

- lazy-load OpenUI and chart code when artifact details open
- replace the current artifact rows and in-rail detail presentation with
  stable-height visual preview cards
- keep the full OpenUI and Recharts presentation in the overlay; preview charts
  use a lightweight static projection
- use a generic artifact identity treatment instead of guessing a type from the
  document
- render semantic headings, lists, tables, code, and status content
- preserve visible focus, keyboard navigation, and screen-reader naming
- respect reduced-motion preferences
- constrain wide tables and charts without resizing the command-center shell
- avoid nested card defaults and decorative section cards
- keep presentational state such as the selected tab local and ephemeral
- contain an unexpected component failure without crashing the command center

Large collections must remain bounded by backend limits. Tables at the maximum
row count must avoid unnecessary duplicate DOM trees, and chart components must
not mount while their tab or accordion section is hidden.

## Frontend State Ownership

Do not introduce an artifact Zustand store.

State ownership remains:

- Go and SQLite own durable artifacts, workstreams, approvals, selection, and
  lifecycle facts
- the existing runtime, workspace, appearance, and settings-navigation Zustand
  stores own only their current app-wide responsibilities
- `DirectorCommandCenterShell` owns the active artifact ID and artifact-browser
  lifecycle as local React state
- the artifact preview loader owns local loading and failure state, reads only
  visible previews through the existing production Setta API, and shares its
  parsed result with the overlay
- OpenUI tabs, accordions, scroll position, and other presentation-only state
  remain local to their rendered components
- `DirectorGraphCanvas` continues to own camera, buffers, pointer state, and
  animation outside React and Zustand

Reset the active artifact when the connected runtime changes or when that
artifact is no longer present in the authoritative Director snapshot. Do not
persist browser-open state or presentation state in Go, SQLite, or Zustand.

A bounded in-memory parse cache may be keyed by artifact ID, catalog ID, and
source identity. It must not become a second durable artifact representation
and must clear on runtime change. It may prefetch only the active artifact's
immediate available neighbors. There is no selected-preview state or separately
stored browser ordering.

## Interaction Boundary

The first catalog is display-only. Tabs, accordions, scrolling, code copy, and
chart hover are local presentation interactions.

There are no model-defined mutations, network calls, MCP calls, shell commands,
or arbitrary host actions.

If interactive artifacts are proposed later, they require a separate plan.
Every action must go through a Setta-owned capability broker with typed
arguments, authorization, approvals where applicable, trajectory recording,
and explicit results. OpenUI's direct tool-provider path must not bypass those
boundaries.

## Dependency Policy

Use only the narrow OpenUI packages needed for the language and React renderer.
Do not add `@openuidev/react-ui`.

Expected direct dependencies include:

- `@openuidev/react-lang`
- its required OpenUI core package if it is not bundled
- Zod 4
- `@base-ui/react` `1.6.0`
- exact dependencies required by the selected official shadcn/ui components
- Recharts for the official shadcn Chart component

Do not add direct `@radix-ui/*` dependencies. All selected shadcn component
source must use the Base UI registry variant.

All checked-in direct versions must be exact. Use:

```bash
./update_dependencies.sh
```

Pin the OpenUI package versions. An OpenUI upgrade is an explicit catalog and
compiler change, not an incidental dependency refresh.

## Performance Requirements

This is a performance-relevant renderer change.

Before changing production rendering, record a baseline under
`docs/reports/performance/` for:

- command-center initial bundle and load
- artifact rail open and close latency
- current markdown, table, chart, and file artifact detail latency
- memory and DOM counts with 100 artifact metadata entries
- a maximum-size table artifact

After the cutover, append a comparable report covering:

- lazy chunk size and load latency
- time until visible artifact previews are ready
- first and repeat artifact open latency
- artifact browser open and close latency
- previous and next artifact transition latency with cold and prefetched
  neighbors
- parse and render duration for representative and maximum-size documents
- preview DOM counts and artifact-read counts with 100 metadata entries
- scroll performance through eight mixed-content preview cards
- DOM counts for large tables and hidden tabs/accordions
- memory after repeatedly opening and closing artifacts
- command-center frame behavior while an artifact is open

The OpenUI and chart bundle must not move into the initial command-center chunk.
Performance regressions require correction before merge verification.

## Implementation Phases

### Phase 0 - Static Profile Feasibility And Baseline

**Status:** In progress. The backend half of the spike is implemented in
[`internal/conversation/artifactdoc`](../../internal/conversation/artifactdoc):
the grammar, the Go-owned catalog manifest and model-facing signatures, the
strict compiler, and the accepted and rejected conformance corpus. The desktop
half is implemented in
[`desktop/src/renderer/src/features/artifacts`](../../desktop/src/renderer/src/features/artifacts):
the generated catalog schema, the generated accepted corpus, and the parser
conformance suite. Nothing in production imports either half. The audit and
local verification evidence for the coherent Phase 0 spike is recorded in
[`docs/reports/openui-artifact-phase0-audit-20260726.md`](../reports/openui-artifact-phase0-audit-20260726.md).

Landed:

- static-profile grammar, stated as EBNF plus the profile decisions the grammar
  cannot carry, in the package documentation
- Go-owned limits, catalog identity, and the 23-component
  `setta.artifacts.v1` manifest with ordered properties, enums, object shapes,
  and model-facing descriptions
- catalog signature rendering, which is the text prompt-size measurement and the
  generated developer instructions are both taken from, plus the complete
  catalog-owned generation instructions used by the output-quality spike
- lexer, parser, reference resolution, positional argument mapping, value
  validation, Markdown and file-path safety rules, cross-property invariants,
  and structured diagnostics carrying a stable code, position, statement,
  component, property, and correction instruction
- a delimiter guard before recursive parsing, matching-bracket validation,
  JSON-strict number syntax, and expanded path, Markdown, and Unicode safety
- 16 accepted fixtures covering every catalog component, scalar, object, array,
  alias, forward, and shared component references, CRLF and JSON syntax edges,
  optional `null` normalization, and semantic limit boundaries; 60 rejected
  fixtures covering every failure code plus the affected syntax, safety, and
  limit variants
- one green deterministic compiler, generated-corpus, upstream-parser, and
  typecheck matrix, including prompt, tool argument, representative and
  maximum-source compile measurements
- one green ChatGPT-authenticated live output-quality check using the
  catalog-owned instructions, with `OPENAI_API_KEY` excluded, that verifies the
  requested metrics, chart points, table rows, link, command, and file reference
- the official shadcn/ui Base UI source decision pinned to upstream revision
  `7774cd7dcee1e98d0815aa6e829f33a7fc952fdf` and `@base-ui/react` `1.6.0`
- the pinned OpenUI dependency: `@openuidev/react-lang` `0.2.8` and its required
  peer `zod` `4.4.3`, with `@openuidev/lang-core` `0.2.9` resolved and
  integrity-pinned in `desktop/pnpm-lock.yaml`. Setta consumes the published
  packages rather than an upstream checkout, so the lockfile is the revision
  pin. `@openuidev/react-lang` `0.2.9` exists but is younger than the
  repository's seven-day minimum release age.
- `cmd/generate-artifact-catalog`, which renders the TypeScript half of
  `setta.artifacts.v1` from its Go owner: the catalog identity, the
  component-name union, the OpenUI library JSON Schema the pinned parser
  compiles into its positional-argument map, and the accepted corpus carried
  with the tree Setta's compiler produced for it
- one green desktop conformance suite proving the pinned upstream parser reads
  every accepted fixture into the tree Setta's compiler accepted, with no parse
  error, no incomplete input, and no unresolved or orphaned statement
- reproducible upstream-parser measurements: 0.0298 ms mean for the
  representative document and 0.8123 ms mean for a 64 KiB maximum source

Two interpretation rules came out of that conformance work and constrain the
later phases:

- a skipped optional argument or object field is absent in Setta's compiled
  tree and present as `null` in the parser's, so the renderer map must read a
  `null` property as absent at every object depth
- the generated catalog schema must never carry a JSON Schema `default`,
  because the upstream parser substitutes a declared default where Setta's
  compiler leaves the property absent

Blocked on evidence this repository cannot produce:

- the pre-change performance baseline, which needs a driven Electron session

Deliverables:

- pin the candidate OpenUI revision and package versions for the spike
- define the static-profile grammar and initial Go-owned catalog manifest
- build a narrow backend compiler spike for representative documents
- build the equivalent generated React library with no production cutover
- create accepted and rejected conformance fixtures
- confirm accepted source parses to the same component tree in OpenUI
- measure prompt size, tool argument size, parse time, and representative model
  output quality
- capture the required pre-change performance baseline
- record the selected official shadcn/ui Base UI upstream revision

Gate:

- proceed only if the Go backend can validate the complete supported profile
  without renderer assistance, a JavaScript runtime, or a network service
- proceed only if the pinned OpenUI renderer interprets every accepted fixture
  equivalently
- stop if upstream parser behavior cannot be constrained deterministically
- stop if the catalog prompt or JSON string escaping makes generation
  materially less reliable than the current tool

The compiler, parser-equivalence, prompt, escaping, and output-quality gates
above are satisfied. Phase 0 is still incomplete because the pre-change
performance baseline needs a driven Electron session and remains a release
gate.

The automated conformance checks ran with explicit user authorization and
passed after the last relevant changes. Do not duplicate them without another
relevant change.

The baseline needs a driven Electron session, which this repository cannot
produce. It is recorded once as a release gate rather than held as an
implementation blocker, because a gate nothing in the repository can satisfy
would stop the plan permanently. Later phases therefore proceed, and the
baseline is captured against pinned pre-change revisions when a driven session
is available:

- renderer bundle and load figures come from a revision at or before
  `fd9d6fb21`, the last commit before the first primitive replacement, because
  Phase 1 moves `@base-ui/react` into the renderer bundle
- artifact surface figures come from a revision at or before `3ed68d293`, the
  last commit before the artifact contract, schema, and renderer changed

Nothing else Phase 1 adds reaches the renderer bundle: the OpenUI, Recharts, and
artifact-component code has no importer outside its own tests until the Phase 2
renderer cutover, where it becomes a lazily loaded chunk rather than part of the
command center's bundle.

### Phase 1 - Catalog Generation And Official shadcn Base UI Primitives

**Status:** Complete. The catalog generator, the official shadcn Base UI
primitives, the Setta artifact components, and the exhaustive renderer map are
all in place. Nothing in production imports the artifact half yet; the Director
cutover is Phase 4. The coherent implementation audit and verification evidence
is recorded in
[`docs/reports/openui-artifact-phase1-audit-20260726.md`](../reports/openui-artifact-phase1-audit-20260726.md).

Landed:

- `@base-ui/react` `1.6.0` as an exact direct dependency, added through
  `./update_dependencies.sh`
- the official Base UI `Button`, `Badge`, and `Input` source from the pinned
  `bases/base` registry, together with the `cn-*` rules they resolve, taken from
  the pinned `style-nova.css`. `nova` is the selected shadcn style because its
  `sm` control height matches the density Setta's surfaces already used.
- [`desktop/src/renderer/src/components/ui/PROVENANCE.md`](../../desktop/src/renderer/src/components/ui/PROVENANCE.md),
  recording the upstream revision, registry, style source, the exact local
  modifications, and the renderer audit
- Setta's `dark:` variant bound to the app's own `data-color-mode`, so the
  copied source follows the appearance setting instead of the OS preference.
  The appearance store's redundant `.dark` class toggle is removed.
- every Button, Badge, and Input consumer moved to the official variant, size,
  and composition contracts. The `primary`/`secondary`,
  `neutral`/`success`/`danger`, and compact-input APIs are removed rather than
  aliased, and the call-site colour overrides that defeated them are gone.
- the two Setta-domain wrappers those surfaces need: `SettaCompactInput` for
  dense settings and runtime controls, and `SettaStatusBadge` for connection,
  account, and provider status. The audit's hand-rolled badge spans and raw
  API-key input now render through them, dropping their raw palette colours.
  Status meaning is carried by distinct icons and screen-reader text rather
  than colour alone, while text stays on a validated foreground/background
  pair.
- `cmd/generate-artifact-catalog` extended to the two outputs it still owed:
  the Zod props schemas `defineComponent` takes, and the model-facing
  signatures, catalog reference, and generation instructions. Both are rendered
  from the same Go catalog as the JSON Schema and the corpus, so the generator
  is now the whole TypeScript half.
- the desktop conformance suite holding those outputs to one
  positional-argument map: the library the Zod schemas build registers exactly
  the catalog's components, its `toJSONSchema()` property order and required
  set match both the Go-rendered schema and the signatures the model is given,
  neither half declares a JSON Schema `default`, and a parser built from the
  library reads the accepted corpus into the same trees Setta's compiler
  produced.
- the official Base UI `Accordion`, `Alert`, `Card`, `Chart`, `Separator`,
  `Table`, and `Tabs` source from the same pinned `bases/base` registry, with
  their `style-nova.css` sections, and `recharts` `3.8.0` - the version upstream
  pins for its Chart - added through `./update_dependencies.sh`. The local
  modifications the new source needed, and the accordion animation and
  `data-open`/`data-closed` wiring it depends on, are recorded in
  `PROVENANCE.md` beside the existing ones.
- `cmd/generate-artifact-catalog` extended a fifth time, with the Go-owned
  safety limits. The chart adapter's series palette is declared to be exactly
  `maxChartSeries` long, so the catalog's cap and the renderer's palette cannot
  drift apart without a compile error, and no TypeScript file restates a limit.
- the Setta artifact components under
  [`features/artifacts/components`](../../desktop/src/renderer/src/features/artifacts/components):
  the document, section, heading, text, stack, and grid layout primitives; the
  Markdown, code, and file-reference content blocks; the metric and severity
  alert; and the table and chart adapters. Markdown renders through the
  renderer's existing text-only `MarkdownText`, which has no raw-HTML, image, or
  link path at all, and a file reference is inert text rather than a link.
  Markdown headings stay below the artifact title; tables carry column
  semantics; status meaning does not depend on colour; and charts are named,
  keyboard-focusable surfaces whose series use Setta's appearance-driven accent
  tokens.
- the exhaustive renderer map and the library binding it, typed by the generated
  `ArtifactComponentProps` map and made exhaustive by the generated
  component-name union, plus the suite that renders the whole accepted corpus
  and every adapter's own behaviour through the production library

Two upstream behaviours came out of that work and constrain the renderer map:

- a component slot must be a fresh schema instance at every use. Zod lifts a
  schema it visits twice into an anonymous `$defs` entry, and the parser reads
  every `$defs` key as a component name, so a shared slot would put a component
  the catalog never registered into the argument map.
- a slot's schema is the child's props object, which is what makes
  `toJSONSchema()` emit `$ref: "#/$defs/<Component>"`, while the value a parent
  renderer receives is the child's `ElementNode`. The generated slot declares
  the node type, matching `defineComponent().ref`.

Three renderer decisions came out of the second half:

- `Tabs` and `Accordion` render their own triggers, so they read the label off a
  child node the parser typed only as an element. The catalog admits exactly one
  child component in each of those slots, and a different one throws rather than
  rendering around the problem. `Tab` and `AccordionItem` still own their own
  body content, so neither is a dead entry in the map.
- the backend is the only acceptance authority, so the adapters do not
  re-validate a stored document. They fail loudly on the one shape that would
  otherwise be rendered wrong in silence: a table row whose cell count disagrees
  with its columns, which would shift every later cell into the wrong column.
- artifacts are static documents, so chart animation is off at the source rather
  than behind a reduced-motion query.

Deferred to Phase 4, which is where their consumers land:

- Dialog and Scroll Area, which the artifact browser overlay uses, and Tooltip,
  which the preview card's expand control uses. This plan's own import rule is
  to take a component alongside its consumer rather than check it in unused.
- a code block's syntax highlighting. The language the catalog collects is shown
  beside the block; highlighting it needs a dependency this plan has not taken.

Deliverables:

- add the Go-owned catalog definition and generator
- generate TypeScript names, schemas, and catalog signatures
- add exact OpenUI, Zod, `@base-ui/react`, and Recharts dependencies through
  the repository dependency script
- check in the selected official shadcn/ui Base UI component source manually
- add the shadcn provenance manifest
- directly replace the current local Button, Badge, and Input implementations
- update every existing Button, Badge, and Input consumer in the same change
- remove old variants and props instead of aliasing them through the official
  primitives
- audit the rest of the renderer for anything described as shadcn-style and
  either replace it with official source or name it as a Setta-domain component
- implement Setta-specific artifact content and layout components
- create the exhaustive OpenUI-to-React renderer map

Gate:

- every generated component name has exactly one renderer
- every shadcn-labeled primitive is traceable to official source
- every imported shadcn primitive comes from the pinned `bases/base` registry
- Button, Badge, and Input no longer contain Setta's prior local
  implementations or compatibility variants
- no OpenUI default UI package or shadcn CLI dependency exists
- no direct `@radix-ui/*` dependency or shadcn Radix variant exists
- no arbitrary styling or action property is present in the model catalog

The gate above is satisfied by the static audit, deterministic matrix, and
single live-provider check recorded in the Phase 1 audit.

### Phase 2 - Artifact Contract And Storage Replacement

**Status:** Complete, together with Phase 3. Removing the payload union forces
the tool boundary to change in the same commit: there is no `title` plus
`source` tool without the document contract, and no document contract that can
be written without the compiler accepting it first. Splitting the two would have
meant a tool that accepts a shape nothing validates, which is the transitional
code this plan forbids. The coherent implementation audit and verification
evidence is recorded in
[`docs/reports/openui-artifact-phase2-3-audit-20260726.md`](../reports/openui-artifact-phase2-3-audit-20260726.md).

Landed:

- `ArtifactDocument` carrying one language, one catalog ID, and the accepted
  source; `Artifact` and `ArtifactMetadata` rebuilt around it. `ArtifactKind`,
  the four payload types, the branch-count and payload validators, and the
  payload byte, column, row, and item limits are gone; the limits the profile
  needs already live in `artifactdoc`.
- `ArtifactDocument.Validate` compiles through `artifactdoc.Compile`, so the
  same acceptance rule applies to every full-document write and read.
  Conversation snapshot windows continue to scan bounded artifact metadata,
  which does not carry a document to compile.
- the `artifacts` table replaced in place with `language`, `catalog_id`, and
  `source` columns, their value checks, and no nullable payload columns or
  branch check; every full-artifact insert, scan, side-context, and
  narrator-context query updated to the document columns, while bounded
  snapshot metadata queries drop the old kind.
- `TrajectoryArtifactEmitted`, `SideInFlightArtifactMetadata`, the Director's
  `WorkstreamArtifact` and registry identity, and the narrator's route artifact
  all drop `kind`. The route summary now names the components the stored
  document renders, taken from a compile rather than from a payload branch.
- the provider carrier's artifact receipt names the document instead of a kind.
- the generated `Artifact` tagged union and `ArtifactKind` value set are gone,
  replaced by `ArtifactDocumentLanguage` and `ArtifactCatalogID` value sets;
  `desktop/src/generated/backend.ts` regenerated at protocol version 103.
- the image-generation artifact Setta composes itself is now a document. The
  provider reports an absolute host path, and an artifact may only address a
  real regular file inside the conversation's authorized workspace, so the
  workspace and saved path are canonicalized before containment is decided.
  Missing files, directories, and symlink escapes stay completed activities
  with no artifact. `artifactdoc.FileReferenceSource` renders that document
  without lossy string replacement, and the result compiles before an artifact
  ID is minted, so source text is built and accepted by the grammar owner rather
  than concatenated in the service.
- every old artifact fixture and assumption replaced: the Go unit fixtures, the
  HTTP boundary fixture, the live Codex workflow assertions, which now read the
  model's table out of the compiled document, and the Electron fake provider's
  artifact tool and image-save fixtures.

Deliverables:

- replace the Go artifact union with `ArtifactDocument`
- remove `ArtifactKind` and every old payload type
- replace `schema_v1.sql` artifact columns directly
- replace store scans, writes, snapshot records, and validation
- remove kind-specific metadata
- update HTTP endpoint responses from their Go owners
- regenerate `desktop/src/generated/backend.ts`
- update Electron main, preload, IPC, Director, narrator, and recording contracts
- delete all old artifact fixtures and assumptions

Gate:

- repository search finds no old artifact kinds, payload fields, or SQL columns
  outside historical reports
- a clean app-data directory is the only supported database state
- no migration or compatibility code exists

The gate is satisfied: a repository search finds no removed kind symbol,
payload field, or column in the implementation. The sole old-kind input string
outside historical reports is a negative strict-tool test proving that `kind`
is rejected. `schema_v1.sql` was replaced in place with no migration path, and
no compatibility or dual-read code exists.

### Phase 3 - Generation, Validation, Repair, And Durable Publication

**Status:** Complete, in the same change as Phase 2.

The combined Phase 2-3 audit and verification evidence is recorded in
[`docs/reports/openui-artifact-phase2-3-audit-20260726.md`](../reports/openui-artifact-phase2-3-audit-20260726.md).

Landed:

- `setta.emit_artifact` takes exactly `title` and `source`. Its input schema is
  one strict object with no branch union, and its `source` bound is the
  Go-owned `MaxSourceBytes`.
- the topic agent's developer instructions state the artifact policy and then
  append the catalog's own `GenerationInstructions`, rendered from the same Go
  catalog the compiler accepts against.
- the tool compiles the source before any artifact or emitted-trajectory ID is
  minted and before the transaction opens. It walks the compiled document's
  `FileReference` paths and requires each one to resolve to an existing regular
  file inside the active turn's canonical authorized workspace; missing files,
  missing workspace authority, directories, and symlink escapes are retryable
  field failures. An invalid or unauthorized document therefore cannot produce
  an artifact row or an artifact-created event.
- compiler diagnostics map onto the existing typed failure: the failure code is
  the diagnostic's own stable code, `retryable` is true, and each field error
  carries the diagnostic's rooted field path plus its position, component, and
  correction instruction. No parser internals reach the model or the user.
- the provider receipt and the narrator's route context describe the generic
  document; atomic publication, delivery-attempt reduction, unresolved-delivery
  handling, and the per-turn and snapshot artifact bounds are unchanged.

Deliverables:

- replace the dynamic-tool input with `title` and `source`
- generate developer instructions from the Go-owned catalog
- complete the strict static-profile compiler and limits
- validate source before durable publication
- map compiler failures into structured retryable field errors
- preserve atomic artifact and trajectory publication
- preserve artifact delivery attempt reduction and unresolved-delivery handling
- update provider receipts and narration context for the generic document
- keep the existing per-turn and snapshot artifact bounds

Gate:

- invalid source cannot create an artifact row or artifact-created event
- a retryable failure gives Codex enough information to correct the document
- successful emission has the same provenance and lifecycle guarantees as the
  current system
- no renderer or desktop process participates in backend acceptance

The gate is satisfied by the focused Go coverage, full deterministic matrix,
and single live-provider matrix recorded in the combined audit. The
rejected-document table asserts a retryable typed failure with the compiler's
code and field for empty source, a missing root, an unknown component, a table
row-width mismatch, and an unsafe file reference. Workspace-resolution coverage
adds missing authority, missing files, and symlink escape, and the emission
tests assert publication, snapshot, trajectory, and read-back on the accepted
document.

### Phase 4 - Director Renderer Cutover

**Status:** Complete. Two deliverables landed early, with the Phase 2 contract
replacement, because the artifact-kind switch could not survive it: the rail's
kind switch, labels, icons, and per-kind payload renderers were replaced by the
lazily loaded `SettaArtifactRenderer`. The rest landed as one change, because
the preview gallery, the browser overlay, and the cache between them are one
read path: a preview that could not hand its parse to the overlay would read
every artifact twice, and an overlay opened from anything but the preview's own
expand control would have nothing to restore focus to. The coherent
implementation audit and verification evidence is recorded in
[`docs/reports/openui-artifact-phase4-audit-20260726.md`](../reports/openui-artifact-phase4-audit-20260726.md).

Landed:

- the official Base UI `Dialog`, `Scroll Area`, and `Tooltip` source from the
  pinned `bases/base` registry, with their `style-nova.css` sections and
  `PROVENANCE.md` entries. Their styles name upstream's enter and exit animation
  utilities, so `tw-animate-css` `1.4.0` — the version upstream pins at the same
  revision — is now an exact direct dependency added through
  `./update_dependencies.sh`, and the accordion keyframes are redeclared after
  it so the Base UI panel height still wins over the package's Radix-keyed ones.
- the rail's artifact rows replaced by always-visible, stable-height preview
  cards. The card reserves one fixed content viewport whatever its artifact
  holds, so an arriving artifact never moves the rail; it is not a control, so a
  single click does nothing; and the icon-only expand control, with its
  accessible name and tooltip, and a double-click on the card open the same
  artifact.
- an exhaustive preview projection keyed by the generated component-name union,
  so a catalog addition without a preview is a compile error. It is bounded by
  its own limits rather than the document's: two content blocks, a short text or
  Markdown excerpt, three code lines, a table header and two rows, and one
  static plot of a chart's first series drawn as an SVG rather than mounted
  through Recharts.
- `ArtifactDocumentCache`: one bounded, runtime-scoped cache holding each read
  artifact and its projection, sharing reads already in flight. A preview asks
  for its document only when it enters the rail viewport and releases the
  rendered DOM when it leaves, so the parse survives scrolling but the nodes do
  not.
- the `ArtifactBrowserOverlay`, built on the official Dialog: one persistent
  overlay with the active title, a `3 of 8` position, previous, next, and close
  icon controls with accessible names and tooltips, boundary disabling, Left and
  Right Arrow shortcuts that stand down inside an interactive artifact control,
  a polite live region, and the WebGL graph left mounted behind the backdrop.
  Only the active document is mounted; the neighbours either side are read ahead
  into the same cache.
- active-artifact and browser state owned by `DirectorCommandCenterShell`
  through `useDirectorArtifactBrowser`. No store was added: the cache is
  rebuilt on a runtime change, the active artifact resets when the Director
  snapshot no longer holds it, and its position is recomputed rather than stored
  when new artifacts arrive. The shell's own keyboard shortcuts stand down while
  the browser is open.
- renderer telemetry for a document that fails after acceptance: the cache
  reports a projection failure and `SettaArtifactRenderer`'s `onError` reports a
  render failure, both as Setta faults rather than as something shown to the
  reader.

One upstream constraint shapes the cache. `Renderer` takes source text, not a
parse tree, so the overlay cannot be handed the preview's tree; what it reuses
is the cached read and projection, and the pinned parser reads the same accepted
source again inside the renderer. Parsing a representative document measured
0.0298 ms in Phase 0, so this is a second parse rather than a second read.

Deliverables:

- import the official Base UI Dialog and Scroll Area source the overlay uses and
  the Tooltip source the expand control uses, with their `style-nova.css`
  sections and provenance entries
- replace the artifact-kind switch with `SettaArtifactRenderer`
- render through the generated OpenUI library and official shadcn Base UI
  primitives
- implement safe Markdown, code, table, chart, and file-reference behavior
- lazy-load OpenUI and chart dependencies
- replace artifact rows with stable-height, always-visible visual preview cards
- implement an exhaustive, bounded, noninteractive preview renderer for every
  model-visible component
- lazy-read and parse only previews entering the rail viewport
- reuse the bounded parse cache between previews and the full overlay
- replace the in-rail detail panel with the shadcn Base UI Dialog-backed
  `ArtifactBrowserOverlay`
- open the overlay from the explicit expand control and optional double-click,
  with no collapsed or single-click-expanded rail state
- add previous, next, position, boundary, keyboard, and live-announcement
  behavior across the authoritative available-artifact order
- mount only the active full artifact and prefetch only its immediate neighbors
- keep active-artifact and browser state local to `DirectorCommandCenterShell`
- add responsive, theme, keyboard, screen-reader, and reduced-motion handling
- add renderer telemetry for impossible post-validation parse failures
- update the artifact rail to use generic artifact identity treatment
- remove all old renderer branches and styles

Gate:

- all current artifact capabilities are expressible in the new catalog
- every available artifact has a meaningful fixed-height rail preview,
  including mixed-content documents
- mixed documents render coherently in the large artifact browser
- light and dark appearance settings apply without a separate artifact theme
- no artifact can load remote content or invoke an unbrokered action
- opening an artifact cannot destabilize the command-center layout
- opening and closing an artifact preserves the mounted WebGL graph state,
  contains focus, and restores focus to the originating expand control
- previous and next navigation traverse every available artifact without
  closing the browser or mounting adjacent full documents
- a single click never changes preview size, and both the expand control and
  double-click shortcut open the same artifact
- no new Zustand store owns artifact content or artifact-view state

The gate is met by the implementation above and by the deterministic Director
command-center workflow, which now traverses three unique artifacts and asserts
stable projected previews, single-click behavior, both open paths, light and
dark appearance, mixed content, button and keyboard traversal through both
boundaries, table arrow ownership, one active full document, active retention
when a new artifact arrives, native background inertness, focus restoration,
mounted graph identity, and restart durability. A renderer build confirms the
initial command-center chunk statically imports neither the OpenUI parser nor
Recharts; both stay behind the preview and overlay chunks.

The Phase 4 audit is the phase's own step. `director-command-center-performance`
cannot run here: its blank-graph-canvas assertion fails identically on the
pre-change revision, so this sandbox's WebGL readback, not the artifact
cutover, is what stops it. It joins the pre-change baseline as a release gate
needing a driven session.

### Phase 5 - Cleanup And Performance Remeasurement

**Status:** Complete for the repository-actionable work. The post-change
measurements are recorded in
[`docs/reports/performance/openui-artifact-post-change-20260726.md`](../reports/performance/openui-artifact-post-change-20260726.md),
which also carries the driven-session rows as a release gate.

Landed:

- the cleanup sweep found nothing left to remove, which the earlier phases'
  replace-in-place discipline is what earned. Go dead-code analysis over the
  conversation, director, narration, httpapi, and catalog-generator packages
  reports no unused symbol; the desktop dead-export analysis reports only the
  pre-existing `decodeStringRecord` contract-runtime helper, which predates this
  plan and is not superseded by it; `noUnusedLocals` and `noUnusedParameters`
  hold every import; a class-by-class sweep of the renderer stylesheets finds no
  artifact rule and no custom property without a consumer. The three dead shell
  classes it did find were already dead before this plan's first commit.
- regeneration of both Go-owned TypeScript surfaces produced no diff, so the
  checked-in catalog and backend contracts match their owners.
- one measured bundle regression corrected. The artifact browser overlay was
  statically imported by `DirectorCommandCenterShell`, so the Dialog and Scroll
  Area primitives it alone consumes were paid for on first paint by every reader.
  `ArtifactBrowserOverlaySlot` now holds that chunk boundary, moving 105.82 kB
  out of the initial command-center chunk. The rail's Tooltip stays, because the
  expand control on every preview card needs it.
- `DirectorCommandCenterShell` brought back under the repository's file-length
  and complexity limits, which the artifact browser is what pushed it past. The
  Now rail moved into `DirectorNowRail`, beside the artifacts rail it mirrors and
  owning its own load-state vocabulary, and Escape's meaning moved out of the
  keydown handler into one named function.
- the artifact document pipeline benchmark, which replaces the Phase 0
  parser-only benchmark: parse, preview projection, preview render, and full
  document render, for the representative document and the catalog's maximum
  source, table, and node-count boundaries.
- two bounds moved from inspection into tests: a maximum table spends exactly one
  DOM row per model row, and a hidden tab panel or closed accordion section
  mounts neither a chart nor a table.

Measured, with the full table in the report:

- 249.57 kB of JavaScript and 12.64 kB of CSS added to the initial chunk by
  Phases 2 through 4, against 1,421.16 kB of artifact code behind lazy
  boundaries. The initial chunk statically imports no other emitted chunk, and
  Recharts appears only in `SettaArtifactRenderer`.
- a rail preview costs under 0.05 ms for a representative artifact and under
  0.86 ms for the largest document the catalog admits; opening one costs 0.91 ms
  and 6.99 ms respectively.
- the pinned parser did not get slower across the cutover: 0.0306 ms and
  0.8129 ms against Phase 0's 0.0298 ms and 0.8123 ms.
- backend acceptance is roughly a third of one renderer parse of the same source,
  so validating before persistence is not what bounds the artifact path.

Blocked on evidence this repository cannot produce, and recorded once as a
release gate rather than held as an implementation blocker:

- the pre-change baseline's latency rows and every post-change row that needs a
  driven Electron session, listed in the report's release gate

Two decisions are final and carry into Phase 6:

- a code block shows its language beside the block and is not syntax
  highlighted. Highlighting needs a dependency this plan did not take, and the
  catalog already collects the language, so adding one later is a catalog-neutral
  change.
- `director-command-center-performance` stays a release gate rather than a Phase
  5 measurement. Its blank-graph-canvas assertion fails identically on the pinned
  pre-change revision here, so this sandbox's WebGL readback, not the artifact
  cutover, is what stops it.

Deliverables:

- remove superseded constants, helpers, styles, imports, tests, and fixtures
- regenerate every affected generated output
- format changed files with `./scripts/format.sh`
- record the post-change append-only performance report
- inspect dependency and bundle impact
- inspect the complete diff for compatibility or transitional code
- update this plan's phase status and final decisions

Gate:

- no old artifact implementation remains
- generated outputs match the new Go-owned contracts
- the OpenUI renderer remains lazy
- measured performance is acceptable on the repository's target matrix
- the worktree contains only intentional implementation and evidence

Every gate above is satisfied for the repository-actionable work. No removed
kind, payload field, column, renderer branch, or fixture remains; both
generators reproduce their checked-in outputs exactly; the OpenUI parser,
generated catalog, Recharts, catalog components, and browser overlay are all
behind lazy boundaries the initial chunk does not statically import; and the
measured pipeline and DOM bounds are recorded in the post-change report. The
latency half of "measured performance" is the release gate above.

### Phase 6 - User-Authorized Merge Verification

**Status:** Pending until the branch is ready and the user explicitly requests
verification.

Do not run automated tests during implementation. When the branch is ready to
merge and the user authorizes verification, start with the narrowest relevant
checks and broaden only after they are stable.

Required focused coverage:

- static-profile lexer, parser, reference resolution, limits, and failures
- Go catalog generation and TypeScript consumption
- artifact domain and storage behavior
- dynamic-tool correction and durable publication
- OpenUI parser conformance corpus
- shadcn Base UI-backed renderer semantics and accessibility
- safe Markdown, links, files, tables, and charts
- generated HTTP, main, preload, and IPC contracts

Required deterministic production-path workflow coverage:

- open a temporary workspace
- create and open a conversation
- submit input and receive streamed assistant output
- emit a mixed OpenUI artifact and observe its rail preview
- confirm a single click does not change preview layout
- open the complete artifact through both the expand control and double-click
- browse previous and next artifacts, including collection boundaries and
  keyboard navigation
- receive a new artifact while browsing and retain the active artifact
- close the artifact browser and confirm focus and graph state are restored
- reject malformed output and repair it within the same provider turn
- queue and steer while a run is active
- complete, cancel, and fail relevant runs
- preserve or promote queued work
- reload and restart against temporary app data
- replay the artifact through Go HTTP, Electron main, preload, renderer, and
  Director projection

When locally signed in to Codex with ChatGPT auth, run the relevant live Codex
end-to-end artifact workflow. Do not use `OPENAI_API_KEY`. If ChatGPT auth is
unavailable, record the live-provider skip and do not treat deterministic
coverage as proof of provider integration.

Run broader quality or supply-chain gates only when the user explicitly asks
for merge verification.

## Definition Of Done

This plan is complete only when:

- AI-generated artifacts use one validated OpenUI document contract
- actual official shadcn/ui Base UI component source renders the supported UI
  primitives
- the artifact rail shows stable, content-aware previews rather than collapsed
  text rows or a single-click expansion state
- rich artifacts open in one large carousel-style DOM browser above the WebGL
  canvas, with previous and next navigation across all available artifacts
- the existing local Button, Badge, and Input implementations have been
  replaced with official shadcn/ui Base UI source and all consumers use the
  new contracts directly
- no shadcn Radix variant or direct `@radix-ui/*` dependency remains
- Setta's theme, accessibility, security, and performance constraints apply
- invalid model output is repaired before persistence
- artifact identity, provenance, lifecycle, and replay remain durable
- old artifact kinds, payloads, SQL columns, renderers, and tests are deleted
- there is no compatibility, migration, legacy, transitional, or dual-path
  code
- user-authorized deterministic and live verification has completed or any
  unavailable live-provider gate is recorded accurately

## Reference Material

- [OpenUI Lang overview](https://www.openui.com/docs/openui-lang/overview)
- [How OpenUI Lang works](https://www.openui.com/docs/openui-lang/how-it-works)
- [Defining OpenUI components](https://www.openui.com/docs/openui-lang/defining-components)
- [OpenUI custom artifacts](https://www.openui.com/docs/agent/guides/custom-artifacts)
- [OpenUI open-ended HTML guidance](https://www.openui.com/docs/agent/guides/open-ended-html)
- [shadcn/ui documentation](https://ui.shadcn.com/docs)
- [shadcn/ui Base UI default announcement](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)
- [Pinned shadcn/ui Base UI registry source](https://github.com/shadcn-ui/ui/tree/7774cd7dcee1e98d0815aa6e829f33a7fc952fdf/apps/v4/registry/bases/base/ui)
- [Base UI documentation](https://base-ui.com/react/overview/quick-start)

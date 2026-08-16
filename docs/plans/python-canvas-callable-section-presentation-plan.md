# Python Canvas Callable Section Presentation Plan

## Purpose and status

**Status: Phase A is complete, including its audit corrections. Phase B has not started.**

This plan corrects the first Python Canvas Callable section's presentation without moving Python,
Basedpyright, transport, or project semantics into `@setta/workspace`. The completed
[first vertical slice](python-canvas-first-vertical-slice-plan.md) and
[callable completion](python-canvas-callable-completion-plan.md) plans remain historical evidence
and must not be rewritten.

The current slice proves the backend and interaction path, but its section composition is not an
acceptable rendering of the main-branch donor:

- the package inserts its Args toolbar before all registered application content, even though the
  callable editor is the section's primary control;
- the app uses the public parameter-row `TextValueEditor` presentation as a standalone field;
- backend-derived parameters expose permanently disabled structural authoring controls; and
- a full-width Basedpyright sentence visually dominates the section in its normal idle state.

This is not a request for complete main-branch parity. It is one observed consumer-driven correction
to the reusable workspace presentation boundary, followed by one direct Python Canvas cutover.

## Fixed product and ownership decisions

1. `@setta/workspace` owns a generic item-section presentation that can place one application-owned
   leading control above the item toolbar and list.
2. `@setta/workspace` owns the visual and interaction implementation of a compact, single-line
   section-field presentation built on the existing `TextValueEditor` core.
3. Python Canvas continues to own the `python-canvas.callable` section kind. There is no public
   `CallableSection`, Python section type, signature model, provider status, or callable mutation in
   the workspace package.
4. Python Canvas supplies the leading editor's value, Python language selection, completion
   provider, commit callback, pending/error adornment, and backend-derived item projection.
5. The current vertical slice has no parameter-structure mutations. Its Args surface must not show
   Add, Remove, or Delete controls that can never succeed. Filtering may remain available.
6. Main is a visual and interaction donor, not a source module to import. Do not restore its global
   project store, OpenAPI wiring, share state, tool-preview state, measurement state, or LSP hooks.
7. No Go, HTTP, generated-contract, LSP, code-generation, or dependency change is expected.
8. Make one direct public cutover. Do not add aliases, deprecated props, old/new rendering paths,
   adapters, migrations, feature flags, compatibility modes, or transitional code.
9. Visual completion requires developer-accepted live evidence. Automated screenshots may lock an
   already accepted result; they do not decide whether the new presentation is acceptable.

## Acceptance experience

Starting from `./scripts/run-python-canvas.sh`, the live app must demonstrate this order inside the
**Square Root** section:

1. The package-owned section header and chrome.
2. A compact, full-width, single-line callable editor matching the main donor's visual hierarchy.
   Its accessible name remains **Callable expression**, but no redundant large visible label is
   required.
3. Any normal pending state appears as a compact application-owned adornment associated with the
   editor. A genuine completion or mutation failure remains visible and accessible without turning
   ordinary idle state into a paragraph of infrastructure text.
4. The Args toolbar follows the callable editor. For this slice it contains the Args label and
   filter behavior, but no unavailable structural authoring actions.
5. Signature-derived parameter rows follow the toolbar and retain workspace-owned item layout,
   filtering, selection, column sizing, diagnostics, and text-control interaction.

The existing product walkthrough must remain unchanged:

1. Type `math.sq` in the leading field.
2. Select the accessible `sqrt` completion; selection changes only the local draft.
3. Press Enter again to commit `math.sqrt`.
4. Observe the real Basedpyright-derived `x` parameter.
5. Enter `missing_value`, observe its range-mapped diagnostic and regenerated Python, then enter
   `3` and observe the diagnostic clear.

At every stage, the Generated Python section and Go-owned canonical behavior remain those already
accepted. This plan changes presentation and composition only.

## Main donor boundary

Main's Callable area establishes the intended composition:

```text
SectionSearch
KwargsControls
ParamGroupContainer
```

The donor's `SectionSearch` is not reusable package code. It directly reads the old global project
state and depends on application OpenAPI calls, LSP waiting state, errors, share mode, tool previews,
section-style state, and edge-handle measurements. The donor's `KwargsControls` also owns mutations
that do not exist in the first Python Canvas slice.

Reuse the composition and craft, not those dependencies. The new package surface must remain useful
to a non-Python consumer that has an item tree and wants an arbitrary leading control.

## Ownership and dependency direction

| Concept                                                 | Authoritative owner    | Consumer form                                             |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Section shell, header, body ordering, and resizing      | `@setta/workspace`     | Existing registered section-kind boundary                 |
| Leading-content placement and item-toolbar mode         | `@setta/workspace`     | Generic section-kind presentation metadata                |
| Single-line section-field editor surface and lifecycle  | `@setta/workspace`     | Existing `TextValueEditor` with one explicit presentation |
| Callable draft, completion, commit, and provider status | Python Canvas frontend | Props and application-owned adornment                     |
| Callable/parameter semantic state and diagnostics       | Go backend             | Existing canonical V1 snapshot                            |
| Parameter row structure and interaction                 | `@setta/workspace`     | Existing `WorkspaceItemList` and public controls          |

The dependency direction remains:

```text
@setta/workspace generic presentation
                 ^
                 |
Python Canvas callable renderer --> existing generated Go-owned contracts
                 |
                 v
          existing thin HTTP client
```

No workspace package source may import from `apps/python-canvas`, mention Python or Basedpyright in
public types, or interpret the Callable section's opaque data.

## Workspace public cutover

### Item-area composition

Extend the ordinary `SectionKindDefinition` with one closed, generic item-area presentation. Exact
type names may be finalized during implementation, but the public semantics are fixed:

```ts
type WorkspaceItemToolbarMode =
  "authoring-and-filter" | "filter-only" | "hidden";

type WorkspaceItemAreaPresentation = Readonly<{
  renderLeadingContent?: (section: WorkspaceSection) => ReactNode;
  toolbar: WorkspaceItemToolbarMode;
}>;
```

An ordinary section kind whose documents carry an `itemTree` declares this presentation. The
package renders one coherent item area in this exact order:

```text
renderLeadingContent(section), when present
item toolbar selected by the declared mode
definition.renderContent(section)
```

The existing item-filter provider remains the single owner around all three regions. The toolbar
modes mean:

- `authoring-and-filter`: current package behavior for a structurally editable item tree;
- `filter-only`: render the existing Args/filter surface without Add, Remove, or Delete actions;
- `hidden`: render no toolbar while retaining an ordinary unfiltered item-list context.

Do not infer a mode from a missing item factory, section lock, disabled buttons, item count, section
name, or application data. The registered kind declares presentation once. A malformed combination
must fail at the document/registration boundary rather than silently choosing a plausible toolbar.

The declared presentation governs the item area only, so it applies to a kind's item-carrying
sections. A kind may legitimately hold both item-carrying and plain sections — the existing
`moveItems` contract already loads a plain section under an item kind — and a plain section renders
`definition.renderContent(section)` with no leading slot and no toolbar. That combination is not
malformed and must not fail; only an item-carrying section whose kind declares no presentation is.
Do not place a control the section always needs in the leading slot without giving that section an
item tree.

Update every current owner directly. The playground item section explicitly declares its intended
mode, and Python Canvas declares `filter-only`. Do not preserve the old implicit-toolbar route.
Meta-control presentations remain headerless and cannot declare item-area presentation.

The leading slot is deliberately content-agnostic. Do not add `callable`, `expression`, `language`,
`provider`, `pending`, or `diagnostic` fields to `SectionKindDefinition`.

### Single-line section-field editor presentation

Refactor the sole existing `TextValueEditor` implementation so its public contract explicitly
distinguishes its two supported placements:

```ts
type TextValueEditorPresentation = "item-row" | "section-field";
```

Use one internal editor lifecycle, controlled-value path, completion adapter, keymap, activation
model, and theme. Do not create a second CodeMirror wrapper or fork completion behavior.

As part of the same direct cutover:

- replace the item-specific public identity name with one generic `controlId` owner and update all
  package, playground, and Python Canvas callers in place;
- make presentation explicit at every call site rather than guessing from IDs or DOM placement;
- keep the existing `item-row` presentation for parameter controls;
- add the `section-field` presentation as a compact full-width rounded surface with its own public
  wrapper, focus treatment, idle highlighted layer, live editor layer, padding, and disabled state;
- permit one optional generic end adornment only on the section-field presentation, with layout
  space owned by the package and semantics/ARIA owned by its caller; and
- preserve the accepted commit, completion-popup precedence, cancellation, IME, Escape, disabled,
  syntax-highlight, and controlled-value behavior exactly.

Do not expose package-private selectors or a general `className` escape hatch so the app can restyle
CodeMirror internals. The scoped package stylesheet owns the section-field surface. The app may style
only its own adornment and application error content.

The public types remain React- and editor-domain types. No CodeMirror class, extension, state,
view, LSP request, network client, Python language contract, or application status enum crosses the
package root.

## Python Canvas direct cutover

Keep the registered kind name and canonical projection unchanged. Recompose its renderer through
the new package presentation:

- move the callable editor into the registered kind's generic leading-content callback;
- use `TextValueEditor` with the explicit `section-field` presentation, stable generic `controlId`,
  Python highlighting, existing completion provider, existing draft callback, and existing Enter
  commit callback;
- project pending state into a compact end adornment and keep it accessible through an app-owned
  live region;
- remove the large normal **Callable expression** label while retaining that exact accessible name;
- remove the normal idle sentence about what Basedpyright will do after commit;
- keep genuine completion and mutation failures distinct, visible, and accessible;
- declare the item toolbar `filter-only` and render the existing `WorkspaceItemList` after it;
- register application-owned searchable text from the canonical parameter name and displayed
  metadata so the retained filter operates on what the row actually shows; and
- keep parameter items on the `item-row` editor presentation with completion disabled.

The app must not reproduce the package's toolbar, filter, item rows, CodeMirror wrapper, focus
behavior, or section chrome. App CSS may arrange its own status/error content but must not select
package-private classes or depend on the toolbar's internal DOM.

Do not enable Add, Remove, or Delete as cosmetic controls. Adding parameter-structure mutations
requires a separate backend-semantic plan and is not implied by reproducing main's visual layout.

## Explicit non-goals

Do not use this work to add:

- a workspace `CallableSection`, callable data schema, Python section kind, LSP status type, or
  backend adapter;
- callable catalogs, arbitrary expressions, multiple callables, parameter add/remove/delete
  mutations, parameter completion, hover, documentation, or completion resolve;
- changes to Go state, HTTP routes, generated TypeScript contracts, code generation, Basedpyright,
  diagnostics mapping, or the wrapper script;
- ports, edges, handles, variants, source discovery, execution, persistence, CLI, MCP, Watch Code,
  or the deferred workspace transaction core;
- a general slot framework, arbitrary toolbar renderer, styling callback, public CodeMirror wrapper,
  or speculative section-template catalog;
- wholesale main parity, dark-mode redesign, unrelated typography work, unrelated accessibility
  auditing, or visual cleanup outside the Callable and directly changed workspace primitives; or
- backward compatibility, legacy props, aliases, deprecated exports, migrations, feature flags,
  dual renderers, or transitional code.

Concrete keyboard, focus, accessible-name, live-status, DOM-order, and changed responsive behavior
remain in scope. Do not turn those proofs into an audit of every historical section or CodeMirror
edge case.

## Implementation phases

### Phase A — atomic generic presentation and Callable cutover

- [x] Atomic presentation cutover complete

Implement one coherent public cutover across the package and its checked-in consumers:

1. Add the closed item-area presentation and toolbar-mode validation to the section-kind registry.
2. Refactor the item toolbar internally so `authoring-and-filter`, `filter-only`, and `hidden` have
   exact behavior without duplicating filter state or mutation logic.
3. Render leading content, the selected toolbar, and registered content in the fixed public order.
4. Cut `TextValueEditor` directly to generic `controlId` plus explicit `item-row` and
   `section-field` presentations, with the optional section-field end adornment over the sole editor
   core.
5. Update the playground and every package caller directly. Do not retain an `itemId` alias or an
   implicit editor-presentation default.
6. Recompose Python Canvas through the leading slot, compact editor/adornment, `filter-only`
   toolbar, and existing item list. Remove the redundant label and ordinary provider paragraph.
7. Update focused tests and public-root type proofs in the same phase. Public fixtures use generic
   item and expression labels rather than Python or provider vocabulary.

An atomic public cutover is an externally visible contract, not a one-turn or one-commit constraint.
Coherent private implementation commits are allowed, but the phase may not finish with both old and
new identities, duplicate editor cores, a package seam without its checked-in consumer, or a
partially converted public API.

**Focused proof:**

- section-container tests assert leading content precedes the selected toolbar and registered list;
- document-load and section-container tests reject an item-tree section whose registered kind lacks
  explicit item-area presentation, while registry tests reject item-area presentation on an
  incompatible section presentation;
- toolbar tests prove filter-only contains no structural mutation controls and hidden contains no
  toolbar while authoring-and-filter retains its existing behavior;
- editor tests run the accepted commit/completion/IME/Escape/disabled cases for the new
  section-field presentation and prove its adornment does not become editor value or steal keyboard
  behavior;
- package public-API and built-artifact boundary checks prove only the generic types are exported;
- playground tests prove its existing editable item section still selects the full toolbar mode;
  and
- Python Canvas component tests prove the callable editor is leading content, uses the
  section-field presentation, retains callable-only completion, exposes compact pending/error
  state, filters against app-projected parameter text, and leaves parameter editors on item-row
  presentation.

**Avoid rabbit holes:** implement the two observed generic seams and the one consumer. Do not add a
slot system, toolbar plugin API, arbitrary adornment positions, new editor services, backend work,
or inspect unrelated main UI while closing this phase.

**Implementation record.** `SectionKindDefinition.itemArea` carries the closed
`{ renderLeadingContent?, toolbar }` presentation with `WorkspaceItemToolbarMode`; registration
rejects it on meta-control presentation, rejects unknown modes and a non-function leading
renderer, and both document load and the section container reject an item-carrying section whose
kind declares none. `WorkspaceItemAuthoringToolbar` became `WorkspaceItemToolbar`, keeping one
filter surface and one mutation implementation while `filter-only` drops the structural actions
and `hidden` renders no toolbar. `TextValueEditor` now takes generic `controlId` plus an explicit
`item-row`/`section-field` presentation over the sole editor core, with the optional end adornment
typed onto `section-field` alone and its surface owned by `styles/sectionField.css`. The
playground, packed-consumer fixture, and Python Canvas were cut over directly: the Callable kind
declares `filter-only` with the compact editor as leading content, projects parameter searchable
text, and drops the large label and idle provider sentence for an adornment, a live region, and
failure-only blocks. The section-field surface signals focus through its border colour while the
live editor suppresses the redundant native outline, so `styles/sectionField.css` also carries the
package's established `forced-colors: active` focus fallback, proved by `adaptiveStyles.test.ts`
alongside the existing item-filter fallback.

**Phase A audit-correction record.** The first independent audit found five non-canonical fixture
indentations and caught that this candidate, rather than the trusted base, had increased two files
whose `quality.fileLength` exceptions carry exact subjects. All three corrections are applied and
`.code-policy.json` is untouched.

The five fixture hunks in `itemPresentation`, `itemSelection`, `moveItems`, `selectedItemMoves`,
and `WorkspaceItemConfigurationEditor` now carry canonical indentation.
`apps/playground/src/sectionKinds.tsx` is back to exactly 1125 lines: the test-only exported
registry factory and its direct-inspection test are gone, `itemArea` is declared inside the
existing registration object, and the accepted-geometry comment above it was rewrapped from five
lines to four without dropping a fact. The playground's mode is still proved where it is observable
— the package's own registry, document-load, and section-container tests own the three modes' exact
behavior, while every playground component test loads the real registration and would fail loudly
if its item-carrying section declared no item area.
`packages/workspace/src/canvas/keyActivations.test.tsx` is back to exactly 2002 lines: the hoisted
`LEAF_KIND` stays, its expanded type-only import is gone, its comment is one line, and its toolbar
literal is narrowed locally with `as const`.

The earlier “pre-existing red” claim was wrong and is withdrawn: the trusted base sits at exactly
1125 and 2002 lines, and `code-policy check` now reports both files `WAIVED` at those exact
subjects. That run's only remaining findings are the sealed JavaScript tool bundle and OSV-Scanner
being uninstalled in this task worktree, which is tool-installation state rather than a repository
finding.

Verification: `code-policy test --changed` and the authorized `code-policy test --recommended` both
completed without findings over the nine ordinary suites (workspace 1156 tests, playground 40,
Python Canvas frontend 34, cross-language boundary 9, plus the Go, contract-drift, and browser
suites), with the workspace and playground TypeScript projects clean.

**Phase A second audit-correction record.** The second independent audit found two bounded proof
gaps. The playground now mounts its real public `WorkspaceCanvas` and observes that its item panel
renders the `authoring-and-filter` toolbar, Args/filter surface, structural actions, ordering, and
an add/delete round trip; changing the consumer to `filter-only` or `hidden` breaks this proof.
The package's section-field fixture now uses the generic `expression` control id and `Expression`
accessible name instead of Python Canvas's exact identity. Small adjacent test-quality cleanups make
the public toolbar-mode proof exhaustive, inspect the registered leading field by rendered output,
fail loudly on missing editor fixtures, and give the existing invalid meta-control/item-tree case
its precise error. The toolbar-mode list backing that union is now module-private, since the union
itself is the public surface and registration is its only runtime reader. No backend,
browser-harness, dependency, Code Policy configuration, compatibility, migration, or transitional
change belongs to this correction.

Verification for this correction: the `code-policy` CLI is not installed in this task worktree, so
the declared suite commands ran directly. The workspace (1157 tests), playground (43), and Python
Canvas frontend (34) suites pass, the workspace, playground, and Python Canvas TypeScript projects
are clean, and the packaged boundary check passes over both source and built artifacts.

**Phase A third audit-correction record.** The third independent audit found one repository-contract
defect: `packages/workspace/README.md` asserted both that every item-tree section receives the
package-owned parameter filter and that a registered `hidden` mode renders no toolbar, so the
package's own contract document contradicted itself and a host could register `hidden` expecting to
keep a filter surface it never gets. The mode set stays as this plan fixes it, so the filter
paragraph now states that an item-tree section's filter follows the item-area toolbar mode its kind
declares, that both toolbar-rendering modes present the same filter, and that `hidden` presents none
and leaves that list unfiltered; every unconditional behavior below it now reads as the behavior of
a rendered filter. The item-area paragraph carries the reciprocal sentence and documents
`data-workspace-item-toolbar` as the one public hook for observing the selected mode, which was
previously untracked DOM surface that only tests read.

The same audit's accessibility recommendation is applied: `.python-canvas-pending-mark` conveyed
ordinary pending state through `background` alone on an `aria-hidden` dot, so forced colours could
erase the only sighted cue while the live region stayed screen-reader-only. The app now restores it
from the forced palette exactly as the package restores its own authored surfaces, proved by a
`CallableSection` stylesheet assertion that fails when the block is removed.

Two audit recommendations are deliberately not code changes here. The item row's context menu still
offers `deleteItemCommand` because Python Canvas never lowers `canEditStructure`, which also gates
section-title editing; that surface is outside this phase's declared Args-surface scope, so the
Phase B acceptance bullet below now names the context menu explicitly and that walkthrough decides
it rather than a silent capability change. The section-field surface keeps its own
`margin-block-start`, because the package owns the surface it renders directly under section chrome
while the app's grid gap spaces only the app's own status and error rows; Phase B's live visual
acceptance judges that spacing deliberately.

Verification for this correction: the `code-policy` CLI is still not installed in this task
worktree, so the declared suite commands ran directly. The Python Canvas frontend suite passes (35
tests) and its TypeScript project is clean. The workspace change is README prose only.

### Phase B — production interaction, live visual acceptance, and closeout

- [ ] Production acceptance and closeout complete

Run the production frontend, real Go service, and pinned Basedpyright through the established
browser walkthrough. Extend only the assertions needed to prove this presentation correction:

- the callable editor precedes the Args toolbar in rendered and keyboard order;
- the idle section has no large provider-status paragraph;
- no Add, Remove, or Delete parameter controls are exposed in filter-only mode, including the
  parameter row's context menu;
- the Args filter remains operable;
- the accessible callable name, `math.sq` completion selection, second-Enter commit, `x` parameter,
  generated Python, diagnostic, and diagnostic-clear behavior remain intact; and
- one Ctrl-C still cleans up the app processes through the existing wrapper.

Present the live section to the developer for visual acceptance. Record the accepted candidate
commit and concise observation in this plan. Only after acceptance may an existing visual baseline
be updated or a new regression lock be checked in. If the developer rejects the composition, fix
the declared Callable surface and repeat the live evidence; do not broaden the package API to polish
unrelated screens.

Near completion, run `code-policy test --changed --base <trusted-base>` in the one caller-scoped task
session. Then run `code-policy test-levels --base <trusted-base>`, present its exact recommended and
full ordinary choices, and obtain the authorization required by the repository policy before either
ordinary profile, `verify`, or `gate`. No supplemental mutation or risk suite is expected.

No `.code-policy.json`, dependency manifest, or lockfile change is expected. If implementation
requires one, stop and explain the exact missing ownership, suite, or dependency rather than folding
it into this presentation plan.

**Avoid rabbit holes:** verify the accepted callable flow and the exact changed workspace
presentations. Do not audit unrelated sections, all responsive widths, every CodeMirror state,
historical main parity, or speculative toolbar combinations.

## Stop conditions

Stop and request a scope decision if:

- a faithful callable-first order requires selecting a package-private class, reparenting private
  DOM, or duplicating the item filter/provider outside `@setta/workspace`;
- the section-field surface cannot reuse the sole existing editor lifecycle and completion adapter;
- a public workspace type would need Python, callable, Basedpyright, LSP, HTTP, application error,
  or generated-contract vocabulary;
- hiding structural controls would require fake successful mutations or frontend-only semantic
  state;
- the correction expands beyond the closed leading-content and toolbar-mode seams into a general
  layout/plugin framework;
- the real completion, commit, parameter, code-generation, or diagnostics walkthrough regresses;
- live developer evidence rejects the result and fixing it would materially change the agreed
  generic boundary; or
- Code Policy cannot own or verify the exact files without a protected configuration change.

The plan is complete when both phase markers are checked, the direct public cutover contains no
legacy or transitional surface, the established production walkthrough remains green, and the
developer accepts live evidence showing the compact callable editor above the filter-only Args area.

# Python Canvas Callable Section Presentation Plan

## Purpose and status

**Status: Phase A's structural cutover is complete, including its audit corrections. The Phase B
candidate at `1217367302fe4d3213f01d9064dff0ce2eefce37` passed its automated walkthrough but was
rejected in developer visual review on 2026-08-19. Phase B is reopened for a bounded visual
correction: exact Callable field state parity and the Generated Python section's generic
generated-output presentation.**

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

The first Phase B handoff exposed two further presentation defects that automated behavior checks
did not cover:

- the Callable surface does not match the current main donor, and its dimensions and typography
  change when the idle layer swaps to the live editor; and
- Generated Python is painted as an ordinary read-only editor. Clicking its still-editable
  CodeMirror content exposes a tall black focus/caret line instead of the donor's blue generated
  region and non-editing interaction.

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
9. The visual donor is current main commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864`, not a
   remembered approximation. Its exact checked-in captures include
   `docs/evidence/phase0/reference/screenshots/27-root-callable-selected-with-params-light.png`,
   `25-root-callable-selected-with-params-dark.png`,
   `26-final-fixture-light-1440x900.png`, and
   `01-full-workspace-dark-1440x900.png`. Its source-level visual contracts are
   `frontend/src/components/Section/SectionParts/Search.tsx` and
   `frontend/src/components/Section/Layouts/CodeArea.tsx` in the clean `setta-main` worktree.
10. `@setta/workspace` owns a generic generated-output presentation for its built-in Code section.
    Python Canvas selects that presentation but does not recreate it with app CSS or private
    selectors. This is presentation vocabulary, not a Python/code-generation backend concept.
11. Replace the built-in Code section's public `readOnly` boolean directly with one required closed
    mode. Do not retain the boolean, infer a mode, accept both shapes, or add an adapter.
12. Headless Chrome must capture the exact idle, focused/clicked, light, and dark states and record
    computed geometry and typography before developer review. The supervisor inspects those images;
    behavior-only browser success is not visual acceptance.
13. Visual completion still requires developer-accepted live evidence. An automated threshold can
    reject a regression, but it cannot declare a new result aesthetically accepted.

## Acceptance experience

Starting from `./scripts/run-python-canvas.sh`, the live app must demonstrate this order inside the
**Square Root** section:

1. The package-owned section header and chrome.
2. A compact, full-width, single-line callable editor matching the main donor's visual hierarchy.
   Its accessible name remains **Callable expression**, but no redundant large visible label is
   required. In both light and dark appearance it is the donor's 16px-radius pill with 4px block
   padding, 10px inline padding, 2px inline margin, 12px monospace type, and donor border/background
   colors. Moving from idle to focused/live changes the focus border color only: the outer rectangle
   differs by at most 1 CSS px and computed `font-family`, `font-size`, `font-weight`, and
   `line-height` are identical.
3. Any normal pending state appears as a compact application-owned adornment associated with the
   editor. A genuine completion or mutation failure remains visible and accessible without turning
   ordinary idle state into a paragraph of infrastructure text.
4. The Args toolbar follows the callable editor. For this slice it contains the Args label and
   filter behavior, but no unavailable structural authoring actions.
5. Signature-derived parameter rows follow the toolbar and retain workspace-owned item layout,
   filtering, selection, column sizing, diagnostics, and text-control interaction.
6. The **Generated Python** section presents its entire body as generated output: a light/dark blue
   region with the donor's leading rail and compact **GENERATED READ-ONLY** badge. It is selectable
   and copyable, but its text surface is not editable, does not receive a text caret, and does not
   reveal an inner black outline or change paint when clicked.

The existing product walkthrough must remain unchanged:

1. Type `math.sq` in the leading field.
2. Select the accessible `sqrt` completion; selection changes only the local draft.
3. Press Enter again to commit `math.sqrt`.
4. Observe the real Basedpyright-derived `x` parameter.
5. Enter `missing_value`, observe its range-mapped diagnostic and regenerated Python, then enter
   `3` and observe the diagnostic clear.

At every stage, Generated Python's bytes and all Go-owned canonical behavior remain those already
accepted. This plan changes only its generic workspace presentation and non-editing interaction.

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

Main's `SectionSearch` establishes the exact Callable field paint. Its idle and live layers use the
same rounded geometry, spacing, `font-mono text-xs` metrics, light/dark background, and line padding;
the live layer changes the border to the donor's blue focus color. Port that owned surface faithfully
into scoped package CSS. Do not translate it into nearby eight-pixel radii, translucent backgrounds,
different borders, or editor-default type.

Main's `GEN_CODE_READONLY_THEME` establishes the generated-output language: blue-tinted light/dark
background, three-pixel leading rail, rounded region ends, compact uppercase generated/read-only
label, and explicit selection paint. The main implementation surrounds editable prefix and suffix
with one protected generated range. Python Canvas currently has no prefix or suffix, so its whole
Code section uses the generic generated-output mode. Do not add fake prefix/suffix editors,
placeholders such as **Add imports here**, mixed-region transactions, or code-generation semantics
to the package in this slice.

## Ownership and dependency direction

| Concept                                                 | Authoritative owner    | Consumer form                                             |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Section shell, header, body ordering, and resizing      | `@setta/workspace`     | Existing registered section-kind boundary                 |
| Leading-content placement and item-toolbar mode         | `@setta/workspace`     | Generic section-kind presentation metadata                |
| Single-line section-field editor surface and lifecycle  | `@setta/workspace`     | Existing `TextValueEditor` with one explicit presentation |
| Callable draft, completion, commit, and provider status | Python Canvas frontend | Props and application-owned adornment                     |
| Callable/parameter semantic state and diagnostics       | Go backend             | Existing canonical V1 snapshot                            |
| Parameter row structure and interaction                 | `@setta/workspace`     | Existing `WorkspaceItemList` and public controls          |
| Editable/read-only/generated Code section presentation  | `@setta/workspace`     | Required closed built-in Code section mode                |
| Generated Python source bytes                           | Go backend             | Existing canonical generated-code field                   |

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

For `section-field`, port the main donor's concrete surface instead of approximating it. One shared
wrapper owns all box geometry; the idle highlighted layer and live CodeMirror layer must inherit the
same font shorthand and line box through every relevant CodeMirror descendant. Activation must not
change width, height, padding, font, baseline, or wrapping. Broad application `:focus-visible`
rules must not leak through the package surface. Retain a clear package-owned focus indicator,
including forced-colors behavior, without adding a second outline inside the pill.

Do not expose package-private selectors or a general `className` escape hatch so the app can restyle
CodeMirror internals. The scoped package stylesheet owns the section-field surface. The app may style
only its own adornment and application error content.

The public types remain React- and editor-domain types. No CodeMirror class, extension, state,
view, LSP request, network client, Python language contract, or application status enum crosses the
package root.

### Built-in Code section mode cutover

Replace `WorkspaceCodeSectionData.readOnly` with one required discriminant:

```ts
type WorkspaceCodeSectionMode =
  | "editable"
  | "read-only"
  | "generated-output";
```

`editable` retains the ordinary authored editor. `read-only` retains ordinary Code-section paint
but is non-editable. `generated-output` is also non-editable and selects the donor-derived generated
region paint. A section position/size lock still prevents editing, but does not falsely turn an
ordinary editor into generated output. Update constructors, parsing, actions, tests, README,
playground fixtures, packed-consumer fixtures, and Python Canvas in one direct cutover; reject the
old `readOnly` document field at the existing data boundary.

Both non-editable modes use CodeMirror's read-only state and non-editable view contract rather than
leaving a focusable `contenteditable` element that merely rejects transactions. Text remains
selectable and copyable. The section wrapper keeps a coherent keyboard/focus target and accessible
read-only naming, while Enter does not send focus into a nonexistent editing surface. The generated
mode must never show a caret, inner focus outline, active-line paint, or editable cursor.

The generated visuals belong to package source and its scoped stylesheet/theme. Expose only the
closed mode and stable public observation needed by consumers/tests; do not export CodeMirror
extensions, decoration classes, or package-private selectors and do not add an app `className`
escape hatch.

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
- project Generated Python through the built-in Code section's required `generated-output` mode;
  remove the former `readOnly: true` projection rather than accepting both document shapes; and
- remove or narrow any broad app focus rule that paints inside package-owned editors, while
  retaining explicit accessible focus treatment on application-owned controls.

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
- editable generated-code prefix/suffix regions, an imports placeholder, mixed-region mutation
  filters, or a general protected-range editor;
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

Completing that same reconciliation, the `createItem` paragraph held the last unconditional toolbar
claim: it said a kind without a factory keeps disabled Add parameter controls, which describes
`authoring-and-filter` alone, because the other two modes render no toolbar Add control at all. That
sentence now states the missing-factory effect per mode and carries the reciprocal limit this mode
set needs — the declared mode selects the toolbar and nothing else, so structure capability, the
registered factory, and the canonical operations the item menu, Inspector, and direct host actions
call behave the same in every mode. `SectionContainerContent` is the sole runtime reader of
`itemArea.toolbar`, so that limit states the package's actual behavior rather than an aspiration.

That documented hook also has to hold in the checked-in consumer. The playground's toolbar-mode
proof read the Args label through the package-private `.setta-workspace-item-toolbar-label` class,
so the one consumer this repository ships depended on exactly the toolbar structure the README now
declares non-public. It reads the declared mode from `data-workspace-item-toolbar` and the label
from the toolbar's rendered text instead, which proves the same Args surface without that class;
the class no longer appears outside the package's own component and stylesheet.

The same audit's accessibility recommendation is applied: `.python-canvas-pending-mark` conveyed
ordinary pending state through `background` alone on an `aria-hidden` dot, so forced colours could
erase the only sighted cue while the live region stayed screen-reader-only. The app now restores it
from the forced palette exactly as the package restores its own authored surfaces, proved by a
`CallableSection` stylesheet assertion that fails when the block is removed.

Two audit recommendations are deliberately not code changes here, and neither becomes a Phase B
acceptance requirement. The item row's context menu still offers `Delete parameter`, because Python
Canvas never lowers `canEditStructure` and that capability also gates section-title editing. That
menu is the package's ordinary item menu rather than the Args surface fixed decision 5 and the
Python Canvas cutover bound this correction to, and changing it would need either a new package
capability seam or the frontend-only structure state this plan's stop conditions refuse. It is
therefore an observation for a separate decision, and Phase B's acceptance bullet stays scoped to
the filter-only toolbar it already names. The section-field surface keeps its own
`margin-block-start`, because the package owns the surface it renders directly under section chrome
while the app's grid gap spaces only the app's own status and error rows; Phase B's live visual
acceptance judges that spacing deliberately.

Verification for this correction: the `code-policy` CLI is still not installed in this task
worktree, so the declared suite commands ran directly. The Python Canvas frontend suite passes (35
tests) and its TypeScript project is clean. The playground's declared focused suite passes, its
component suite passes over the corrected consumer proof (43 tests across eight files), and its
TypeScript project is clean. Both workspace changes are README prose; the package suite was re-run
over the completing hunk and passes (1157 tests across 140 files), and the `itemArea.toolbar` reader
claim was confirmed by inspecting every runtime reference to it.

### Phase B — production interaction, live visual acceptance, and closeout

- [ ] Production acceptance and closeout complete

First correct the developer-rejected candidate without reopening Phase A's accepted composition:

1. Port the exact donor field geometry, light/dark paint, and typography into the package-owned
   `section-field` surface. Eliminate the idle/live size and font change.
2. Cut the built-in Code section directly from `readOnly` to the required closed mode and implement
   the generic `generated-output` paint and non-editing behavior.
3. Select `generated-output` in Python Canvas and remove the old boolean projection and any leaking
   broad app focus outline.
4. Update focused package, packed-boundary, playground, and Python Canvas tests. Do not preserve old
   fixtures or parsing behavior for compatibility.

Then run the production frontend, real Go service, and pinned Basedpyright through the established
headless-Chrome walkthrough. Extend only the assertions and evidence needed to prove this bounded
presentation correction:

- the callable editor precedes the Args toolbar in rendered and keyboard order;
- the idle section has no large provider-status paragraph;
- no Add, Remove, or Delete parameter controls are exposed by the filter-only toolbar;
- the Args filter remains operable;
- the Callable idle and focused states have stable geometry and identical computed typography;
- light and dark captures show donor-equivalent Callable borders, backgrounds, radius, and spacing;
- Generated Python exposes the generic generated-output mode, blue rail/region/badge, non-editable
  semantics, selectable text, and no inner caret/outline before or after a real pointer click;
- the accessible callable name, `math.sq` completion selection, second-Enter commit, `x` parameter,
  generated Python, diagnostic, and diagnostic-clear behavior remain intact; and
- one Ctrl-C still cleans up the app processes through the existing wrapper.

Use a fixed 1440x900 CSS-pixel viewport at device scale 1 and capture deterministic component crops
for Callable idle/focused and Generated Python idle/clicked in both appearances. Record computed
rectangles, font properties, border/radius/background values, editability, active element, and
outline/caret-relevant values in machine-readable evidence bound to the exact candidate commit.
Compare component crops—not unrelated full-app pixels—to the exact main-reference images and source
tokens above, with any small antialiasing tolerance stated. The supervisor must open and inspect
every resulting image before presenting the live section to the developer.

Record the accepted candidate commit and concise developer observation in this plan. Only after
acceptance may the captures become an accepted regression lock. If the developer rejects them,
correct these two surfaces and repeat the same states; do not broaden the package API or polish
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

**Rejected Phase B candidate record.** Candidate
`1217367302fe4d3213f01d9064dff0ce2eefce37` established the following behavior evidence, but it is
not visually accepted and does not complete this phase. The established production browser
walkthrough proves
the idle callable editor precedes the `filter-only` Args toolbar and parameter list, the idle section
has no provider prose or alert, and the toolbar exposes none of its structural parameter actions.
It reads only the section's accessible group, the documented toolbar-mode hook, the Args filter's
accessible wiring, and app-owned content: no package-private class is selected, and no visual
baseline or screenshot lock is checked in.

The keyboard assertion starts from the last ordinary focus target preceding the callable field,
dispatches a real Tab, waits for that keyboard entry to mount and focus the live editor, and proves
the next Tab lands on `Filter parameters`. After the existing callable, code-generation, and
diagnostic flow, a nonmatching filter query hides the `x` row and reports zero matches; its clear
control restores the row while the toolbar remains free of structural actions. The Args label proof
uses text containment and therefore does not depend on private ordering inside the toolbar.

Running the suite also settled the earlier activation timeout. The first checked-in form focused the
callable field programmatically and then waited for its live layer, and that wait timed out at this
point in the walkthrough, so synthetic focus does not reliably mount the editor here. Real keyboard
entry does: tabbing in from the preceding control mounts and focuses the live editor before the
order assertion continues, and it exercises the traversal this assertion is about rather than a
focus call no keyboard user makes. Two consecutive production walkthroughs pass with that path, so
neither a product activation change nor a test-only retry is needed.

The suite passed twice in a row against the production build, the real Go service built from the
pinned toolchain this repository's locked Code Policy release carries, pinned Basedpyright, and
headless Chrome — and the base commit's assertion still fails there, so the fix is proved by the
suite it repairs. The wrapper separately reaches its backend-ready and Vite-ready states, then one
Ctrl-C to its process group exits with signal status 130, leaves neither port 8080 nor port 5173
listening, and leaves no surviving backend, Basedpyright, or Vite process.

That evidence also withdraws the earlier claim that this task worktree could not run the suite: the
locked release carries the Go toolchain the wrapper already resolves outside `PATH`, and only the
`code-policy` CLI itself is missing here. Because that CLI is missing, the declared suite commands
ran directly, with the locked release's pinned Go on `PATH` for the ones that invoke `go`; the
changed walkthrough's own module suite passed with them (35 Python Canvas frontend tests).

Developer review then found the Callable activation geometry/type change, missing generated-output
paint, and black inner focus/caret line described above. The former assertion that Generated Python
should accept focus on its textbox is therefore withdrawn: it encoded the defect. Replace it with
the non-editable/selectable/copyable and click-state proof in this reopened phase. Developer visual
acceptance, the accepted-candidate record, corrective screenshots/metrics, and this phase's closing
`test --changed` and `test-levels` steps remain open.

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
- matching the whole-output donor requires public mixed generated/editable ranges, prefix/suffix
  application state, or Python/code-generation vocabulary in the package;
- live developer evidence rejects the corrected states and fixing them would materially change the
  agreed generic boundary; or
- Code Policy cannot own or verify the exact files without a protected configuration change.

The plan is complete when both phase markers are checked, the direct public cutovers contain no
legacy or transitional surface, the established production walkthrough remains green, headless
evidence proves the exact idle/focused/clicked states, the supervisor has inspected the captures,
and the developer accepts the donor-matched Callable field and generated-output section above the
unchanged filter-only Args area.

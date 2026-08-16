# Python Canvas Callable Section Presentation Plan

## Purpose and status

**Status: Phase A's structural cutover is complete, including its audit corrections. Phase B
remains open. The developer rejected source candidate
`666af132be38edf4186e80ad7cf4788c32ff9fd0` and its evidence commit
`7abd2332d18fa89aef3b5b550e75737dd0e163a1` on 2026-08-19. Candidate
`2679b147443f67400e219e4189098fb6008a3008` now models and paints only the canonical generated
body and observes it through the package's documented public marks, but it is not an accepted
visual candidate. Supervisor comparison with donor source found that the candidate's self-authored
4px field-to-toolbar allowance contradicts main's explicit Callable `mt-0 pb-0` toolbar
composition. That zero-gap compact toolbar is now implemented and measured live, and the audit
conflict it introduced — the item area reading its content-agnostic leading slot to select that
spacing — is resolved by keying the composition to the declared renderer instead. The eight
complete-section and generated-reader captures are rerun from that corrected candidate. Six are
byte-identical; the two focused crops differ only by sub-perceptual one-channel rasterization in the
leading header glyph, while their field bands are byte-identical. Supervisor inspection, developer
visual acceptance, and this phase's closing `test --changed` and `test-levels` steps remain open.**

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
10. `@setta/workspace` owns a generic generated-document presentation for its built-in Code
    section: one non-editable document may identify exactly one generated region while text before
    and after it keeps ordinary read-only paint. Python Canvas supplies that region from its
    canonical backend response and does not recreate it with app CSS or private selectors. This is
    presentation vocabulary, not a Python/code-generation backend concept.
11. Replace the rejected whole-document `generated-output` shape directly. The built-in Code
    section keeps required closed modes, but its generated variant must require one validated
    region in the same document. Do not retain `generated-output`, make the region optional, infer
    it from text, accept both shapes, or add an adapter.
12. Headless Chrome must capture the exact idle, focused/clicked, light, and dark states and record
    computed geometry and typography before developer review. The supervisor inspects those images;
    behavior-only browser success is not visual acceptance.
13. Visual completion still requires developer-accepted live evidence. An automated threshold can
    reject a regression, but it cannot declare a new result aesthetically accepted.
14. Generated-document paint follows the donor's line-scoped composition for the declared region
    only. In the canonical seven-line idle document, `import math` on line 1 and
    `state = SettaState()` on line 7 remain on the ordinary Code-section surface; body lines 3–5
    carry the blue region and leading rail, with the blank separator lines supplying only the
    donor's partial rounded boundary and centered **GENERATED READ-ONLY** badge geometry. Unused
    fixed-section height is not painted. A whole-document fill, a full-height fill, or a corner
    badge is not a close visual match.
15. Capture evidence records an immutable source candidate. Commit generated evidence separately
    from the source commit it names; never repeatedly amend evidence into the commit whose hash the
    evidence embeds, because that hash cannot converge.
16. Visual evidence must not create a public inspection API. Use the documented section-field,
    item-toolbar, section-editor, and generated-line hooks together with accessible roles, ordinary
    HTML landmarks, app-owned content, and bounding geometry. Do not add public document-line or
    section-header hooks merely to make a capture script convenient.

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
   This match applies to the complete section composition, not just the field crop: the field sits
   immediately below the header with main's narrow inline inset, and the Args surface begins at the
   field's lower boundary with a measured zero-pixel gap, within one CSS pixel of rounding. The
   toolbar uses main's compact Callable block spacing (`mt-0 pb-0`), rather than the ordinary item
   toolbar's `mt-1 pb-1`. Python Canvas must not add content-area padding or a grid gap around
   package-owned section content.
3. Any normal pending state appears as a compact application-owned adornment associated with the
   editor. A genuine completion or mutation failure remains visible and accessible without turning
   ordinary idle state into a paragraph of infrastructure text.
4. The Args toolbar follows the callable editor. For this slice it contains the Args label and
   filter behavior, but no unavailable structural authoring actions.
5. Signature-derived parameter rows follow the toolbar and retain workspace-owned item layout,
   filtering, selection, column sizing, diagnostics, and text-control interaction.
6. The **Generated Python** section presents the canonical prefix, generated body, and suffix in
   one reader. Only the declared generated region receives the light/dark blue block, donor leading
   rail, and centered compact **GENERATED READ-ONLY** badge. For the initial snapshot the generated
   content is lines 3–5; lines 1 and 7 retain ordinary Code-section paint, and the blank boundary
   lines may carry only the donor's partial rounded-edge geometry. The region hugs those lines
   rather than filling unused fixed-section height. The whole reader remains selectable and
   copyable but non-editable in this V1 slice, receives no text caret, reveals no inner black
   outline, and does not change paint when clicked.

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

Main's `GEN_CODE_READONLY_THEME` establishes the generated-region language: blue-tinted light/dark
background, three-pixel leading rail, rounded region ends, compact uppercase generated/read-only
label, and explicit selection paint. The main implementation surrounds an immutable generated body
with editable prefix and suffix. Python Canvas already receives the same three authoritative parts:
`pythonTarget.prefix`, `generatedCode.body`, and `pythonTarget.suffix`, as well as their canonical
combined `generatedCode.code`. This V1 slice has no prefix/suffix mutation endpoint, so the package
does not make the outer text editable. It does preserve the donor's authority boundary visually:
one generic declared generated region is painted, while prefix and suffix use ordinary read-only
paint. Do not add fake local editing, placeholders such as **Add imports here**, transaction
filters, completion endpoints, or Python/code-generation semantics to the package.

## Ownership and dependency direction

| Concept                                                 | Authoritative owner    | Consumer form                                             |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Section shell, header, body ordering, and resizing      | `@setta/workspace`     | Existing registered section-kind boundary                 |
| Leading-content placement and item-toolbar mode         | `@setta/workspace`     | Generic section-kind presentation metadata                |
| Single-line section-field editor surface and lifecycle  | `@setta/workspace`     | Existing `TextValueEditor` with one explicit presentation |
| Callable draft, completion, commit, and provider status | Python Canvas frontend | Props and application-owned adornment                     |
| Callable/parameter semantic state and diagnostics       | Go backend             | Existing canonical V1 snapshot                            |
| Parameter row structure and interaction                 | `@setta/workspace`     | Existing `WorkspaceItemList` and public controls          |
| Editable/read-only/generated-region Code presentation   | `@setta/workspace`     | Required closed mode and one validated region             |
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

The completed `readOnly`-boolean cutover remains correct, but the rejected whole-document
`generated-output` variant does not. Replace it directly with a closed discriminated data shape
equivalent to:

```ts
type WorkspaceGeneratedRegion = Readonly<{
  from: number;
  to: number;
}>;

type WorkspaceCodeSectionData = WorkspaceCodeSectionCommon &
  (
    | { code: string; mode: "editable" | "read-only" }
    | {
        code: string;
        generatedRegion: WorkspaceGeneratedRegion;
        mode: "generated-document";
      }
  );
```

Exact internal factoring may vary, but the public semantics are fixed. `editable` retains the
ordinary authored editor. `read-only` retains ordinary Code-section paint but is non-editable.
`generated-document` is also wholly non-editable in this slice and requires exactly one UTF-16
CodeMirror-offset range whose intersecting lines receive donor generated-region paint. Reject a
missing, empty, reversed, fractional, out-of-document, or mode-incompatible region at the existing
data boundary. Do not retain `generated-output`, accept a generated region on either ordinary mode,
support a list of ranges, or infer a range by searching the code.

The Python Canvas projection verifies that
`prefix + "\n\n" + body + "\n\n" + suffix === generatedCode.code` and then declares the range
from the end of the prefix to the start of the suffix. That range includes the two blank separator
boundaries, matching main's partial first/last-line geometry, while its only generated content is
`generatedCode.body`. This is a frontend projection assertion over an already canonical response;
it does not alter the Go or generated TypeScript contract.

Both non-editable presentations use CodeMirror's read-only state and non-editable view contract
rather than leaving a focusable `contenteditable` element that merely rejects transactions. Text
remains selectable and copyable. The section wrapper keeps a coherent keyboard/focus target and
accessible read-only naming, while Enter does not send focus into a nonexistent editing surface.
The generated document must never show a caret, inner focus outline, active-line paint, or editable
cursor.

The generated visuals belong to package source and its scoped stylesheet/theme. Expose only the
closed mode, region value, and stable public observation needed by consumers/tests; do not export
CodeMirror extensions, decoration classes, or package-private selectors and do not add an app
`className` escape hatch. This is one presentation region, not a general protected-range or
mixed-authority editor service.

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
- remove Python Canvas's callable content padding and any app-owned gap around the package's field,
  toolbar, and item list; let the package-owned field and toolbar form the same adjacent stack as
  main without selecting package-private DOM;
- project Generated Python through `generated-document`, using the canonical prefix/body/suffix to
  verify the combined bytes and declare exactly one generated region; remove `generated-output`
  rather than accepting both document shapes; and
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
  filters, multiple generated regions, or a general protected-range editor;
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

Correct the second developer-rejected candidate without reopening Phase A's accepted generic item
composition:

1. Compare the complete Square Root section against main's accepted full-section captures, not the
   callable field alone. Remove Python Canvas's 14px content padding, remove the field's invented
   block-start gap, and make the package-owned field/toolbar boundary match main. In particular,
   main's Callable toolbar selects `mt-0 pb-0`; the field-to-toolbar gap is zero within one CSS
   pixel. Preserve the already-correct idle/focused box and type stability, and preserve ordinary
   item sections' existing `mt-1 pb-1` toolbar spacing.
2. Replace `generated-output` directly with the required `generated-document` plus one validated
   generated region. Update constructors, parser, actions, package root, README, playground,
   packed-consumer fixtures, and Python Canvas in one cutover; old documents fail rather than
   receiving compatibility handling.
3. Rework the package-owned line decorations so only lines intersecting that declared region carry
   generated paint. Retain main's partial first/last separator-line geometry, centered badge,
   leading rail, explicit selection paint, unused-height behavior, and caret-free reader.
4. Project the region from the existing canonical prefix/body/suffix fields, with an exact combined
   byte/string assertion. Do not add a backend route, local prefix/suffix state, editing,
   completions, or transaction filters.
5. Update focused package, packed-boundary, playground, and Python Canvas tests. Delete the rejected
   whole-document assumptions; do not preserve fixtures or parsing behavior for compatibility.

The generated-document correction must port main's line decorations for one declared region rather
than approximate them with a whole-document or flex-wrapper background. Keep this generic and
package-owned: decorate only the intersecting CodeMirror lines, center the badge at that region's
upper boundary without changing document bytes, and leave prefix, suffix, and unused editor height
on the ordinary Code-section surface. Do not introduce prefix/suffix editing, mutation protection,
or a general range service.

Then run the production frontend, real Go service, and pinned Basedpyright through the established
headless-Chrome walkthrough. Extend only the assertions and evidence needed to prove this bounded
presentation correction:

- the callable editor precedes the Args toolbar in rendered and keyboard order;
- the idle section has no large provider-status paragraph;
- no Add, Remove, or Delete parameter controls are exposed by the filter-only toolbar;
- the Args filter remains operable;
- the Callable idle and focused states have stable geometry and identical computed typography;
- complete light and dark Square Root section captures show donor-equivalent header-to-field,
  field-to-toolbar, toolbar-to-first-row, and inline-edge spacing, as well as the field's accepted
  border, background, radius, and typography;
- Generated Python exposes `generated-document`, leaves prefix line 1 and suffix line 7 unpainted,
  paints generated body lines 3–5 with the donor rail/region/badge, remains non-editable and
  selectable, and has no inner caret/outline before or after a real pointer click;
- the accessible callable name, `math.sq` completion selection, second-Enter commit, `x` parameter,
  generated Python, diagnostic, and diagnostic-clear behavior remain intact; and
- one Ctrl-C still cleans up the app processes through the existing wrapper.

Use a fixed 1440x900 CSS-pixel viewport at device scale 1 and capture deterministic **complete
section crops** for Square Root idle/focused and Generated Python idle/clicked in both appearances.
The Square Root crop must include the whole section card: header, field, Args toolbar, and first
parameter row or the empty item area. A field-only crop is insufficient evidence. Record section,
header, field, toolbar, first-row, editor-content-box, and generated-region rectangles, along with
font properties, border/radius/background values, editability, active element, and
outline/caret-relevant values in machine-readable evidence bound to the exact candidate commit.
Prove the authored prefix and suffix through the canonical reader text, their exclusion from the
documented generated-line marks, and at least one full reader line box outside each end of the
generated block. Do not inspect or publish every private CodeMirror document line merely to obtain
separate prefix-line and suffix-line rectangles.
Compare the complete section composition to the exact main-reference images and source tokens above,
with any rescaling and small antialiasing tolerance stated. The supervisor must open and inspect
every resulting image at original resolution before presenting the live section to the developer.

The capture script may require a clean source tree, but the resulting images and metrics must be a
new evidence commit whose recorded source is its immutable parent candidate. The evidence commit is
not itself the rendered source candidate. A rerun against a different source commit replaces the
unaccepted evidence set; it does not amend the source and retry in a self-referential loop.

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

**Callable-field correction record.** The first of this phase's four corrections is implemented: the
package-owned `section-field` surface carries frozen main's callable field instead of an
approximation of it. `styles/sectionField.css` is the one box owner — 16px radius, a one-pixel
border, 4px block and 10px inline padding, 2px inline margin, white/`setta-950` backgrounds, and
`setta-100`/`setta-800` borders — and the one type owner for both layers, at `ui-monospace` 12px
over a 16px line box, weight 400, tab size 4. Main leaves its live layer on CodeMirror's own generic
`monospace` and 1.4 line box and patches the difference with a three-pixel line offset; here the
live layer's `.cm-editor`, `.cm-scroller`, `.cm-content`, and `.cm-line` take `font: inherit` and
drop CodeMirror's own padding, so activation changes the border colour to main's focus blue and
nothing else. Two deliberate consequences: the idle layer now paints the value editor theme's own
foreground, so a committed callable does not repaint when it activates, and the disabled state no
longer repaints the surface at all. Disabled is interaction-only here, as it is in main and in the
package's item-row control, so an ordinary pending callable no longer flips the field's background.

The field wrapper carries `data-workspace-section-field`, documented in the package README as the
one public hook for observing or capturing this surface. The production walkthrough and this phase's
remaining capture evidence both need the field's own rectangle, and a consumer proof in this
repository may not select a package-private class.

Proofs: `styles/sectionField.test.ts` pins the donor box, the light and dark paint, the
focus-changes-only-the-border rule, and the single type owner, and fails on a second box owner or
any live-only font declaration. A section-field component case proves both layers carry that one
type owner across the activation swap and that the field exposes the documented hook. In the
production walkthrough a real pointer click on the idle field proves the donor surface values, box
drift within one CSS pixel, and identical computed font family, size, weight, and line height, with
the focused border at main's blue; the same pass repeats over the committed `math.sqrt` value, where
it also compares text colour. An empty field's placeholder layer carries its own muted colour in
both states, so colour belongs to that value pass rather than to the placeholder one.

Verification for this correction: the `code-policy` CLI is still not installed in this task
worktree, so the declared suite commands ran directly. The workspace suite passes (1164 tests across
141 files) alongside its declared public-API focused suite, the playground suite passes (43 tests),
the Python Canvas frontend suite passes (35 tests), the workspace, playground, and Python Canvas
TypeScript projects are clean, and the packaged boundary check passes over source and built
artifacts. The production browser walkthrough — production build, the real Go service built from
the locked release's pinned toolchain, pinned Basedpyright, and headless Chrome at 1440x900 and
device scale 1 — passed twice in a row. Two negative controls bind the new assertion to this fix: against the
previous stylesheet it fails on the translucent idle background, and with only the live layer's
`font: inherit` removed it fails with that layer falling back to CodeMirror's generic `monospace`.

The rest of this phase stays open: the built-in Code section's `readOnly`-to-mode cutover and its
generated-output presentation, the Python Canvas selection of that mode with its broad app focus
rule, the light and dark capture evidence with machine-readable metrics, the supervisor's inspection
of those images, developer visual acceptance, and this phase's closing `test --changed` and
`test-levels` steps.

**Generated-output correction record.** This phase's second, third, and fourth corrections are
implemented. `WorkspaceCodeSectionData.readOnly` is gone: the contract now carries a required
`mode` of `editable`, `read-only`, or `generated-output`, parsed at the same boundary, and a
document still naming `readOnly` fails there as an unknown field. Both non-editable modes take
CodeMirror's `EditorState.readOnly` **and** `EditorView.editable.of(false)`, so the text stops
being an editing surface instead of refusing transactions inside a focusable `contenteditable`
element — which is exactly what drew the rejected candidate's black caret line. The shared
`WorkspaceSectionEditor` now takes that closed presentation rather than an `isReadOnly` boolean,
keeps its wrapper as the section's focus and scroll target, names both non-editable presentations
read-only, and stops advertising `Enter` where there is no editor to enter. A position/size lock
still turns an `editable` section read-only and never turns one into generated output.

The first `generated-output` candidate adds the donor's colour tokens through
`styles/generatedOutput.css`: main's
`GEN_CODE_READONLY_THEME` colours on its own custom properties, the blue light/dark region behind a
three-pixel leading rail, six-pixel rounded ends, its explicit selection paint, and the compact 8px
uppercase **GENERATED READ-ONLY** pill, with a forced-colours block restoring region, rail, and
badge. That candidate deliberately painted the flex-filling wrapper once and moved the badge to its
top corner. Supervisor inspection of its exact 1440×900 captures rejected both departures: the
blue region became a 640×390 empty panel below eight lines of code, unlike main's generated block,
and the badge lost the donor's centered relationship to that block. Replace those two choices with
the donor's line-scoped composition. Retain the already-correct non-editable/selectable behavior,
explicit selection paint, missing active-line/caret layers, and absence of an inner pointer-focus
outline.

Python Canvas projects Generated Python through that mode and no longer writes the boolean, and its
broad `.python-canvas-app :focus-visible` rule is gone rather than narrowed: every focus target in
that view belongs to the package, so the app declares no focus rule at all and says why. Sharing one
editor has one deliberate consequence beyond the Code section: a read-only or locked Text section is
now non-editable the same way, and its component test says so instead of asserting the old
`contenteditable="true"`.

Two file extractions in this batch are forced by `quality.fileLength` and are behaviour-preserving.
`apps/playground/src/sectionKinds.tsx` is waived at the exact subject `1125`, so any line-count
change other than dropping below the shared 1000-line limit is a new finding, and the three-mode
select cannot fit a boolean switch's line budget; its two Inspector contributions moved to
`sectionOptionInspectors.tsx` and the registry is now 926 lines. The browser walkthrough was already
1098 lines against that same 1000-line limit with no exception — a finding the earlier Phase B
commits could not see because the `code-policy` CLI was unavailable to them — so its process and
page harnesses moved to `browser-processes.mjs` and `browser-page.mjs`, leaving the walkthrough at 846. Both new files sit directly under paths the existing module globs already own, and
`.code-policy.json` is untouched.

Proofs: `styles/generatedOutput.test.ts` pins the donor region, rail, badge, selection paint, and
the absence of any plain `:focus` rule; `adaptiveStyles.test.ts` covers its forced-colours
fallbacks; the code-section body suite proves both non-editable modes, the documented
`data-workspace-section-editor` hook, the generated surface's missing caret, active line, and focus
fill, that `Enter` stays on the wrapper, and that a lock does not manufacture generated output; the
data suite proves every mode round-trips and that `readOnly` is rejected; the public-root proof is
keyed by mode so adding or renaming one fails at compile time; the playground authors all three
modes from its own Inspector; and a Python Canvas stylesheet case fails if the app reintroduces a
descendant focus rule. In the production walkthrough the former "generated Python must accept
keyboard focus" assertion is replaced, as this phase requires, by one that reads the donor region
and badge, proves the text is non-editable, unfocusable, caret-free, and outline-free before and
after a real pointer click, proves a real pointer drag still selects it, and only then proves typed
input cannot reach it.

Verification for this correction: the locked release's `code-policy` binary is present in this task
worktree even though `code-policy` is not on `PATH`, so `code-policy check` ran over the 27 changed
files; its only findings are the sealed JavaScript tool bundle and OSV-Scanner being uninstalled
here, which is tool-installation state rather than a repository finding. All nine ordinary suites
pass: workspace 1174 tests across 142 files, playground 43, Python Canvas frontend 36, the Go
backend, contract drift, the cross-language boundary 9, and the production browser walkthrough,
which passed three times. The workspace, playground, and Python Canvas TypeScript projects are
clean and the packaged boundary check passes over source and built artifacts. One negative control
binds the walkthrough to this fix: projecting `read-only` instead of `generated-output` fails it.

**Supervisor visual rejection record.** Headless captures rendered from
`84cf58de5d26ab80ec9cdc9bc433f61122225451` prove that Callable idle/focused geometry and type are
stable in light and dark appearance and that Generated Python remains caret-free after a real
click. They also expose the unacceptable full-height generated fill and top-corner badge described
above. Those captures are rejected working evidence, not a regression lock, and must not be
committed as accepted evidence. The attempted capture additionally exposed a self-referential
receipt error: amending the images into the commit hash recorded inside their metrics changes that
hash forever. The next capture records the immutable corrected source commit and lands separately.

**Line-scoped generated block record.** The rejected wrapper fill and corner badge are replaced by
main's own composition. `getSectionEditorExtensions` now compiles main's
`getGenReadOnlyLineDecorations` for the `generated-output` presentation alone: one line decoration
per rendered document line, carrying `data-workspace-generated-line` with that line's position in
the block. Main marks the first and last line of a protected range inside an otherwise editable
document; here the whole document is generated, so the marks run from the first line to the last,
and a one-line document is `only` — both ends at once, which main's three-line minimum never has to
answer for. The decorations are computed from the document alone, so they are rebuilt exactly when
the host regenerates the code.

`styles/generatedOutput.css` paints from those marks. Each line carries main's region behind its
three-pixel rail through a `::before` that overlaps its neighbours by main's own two pixels, the
block's ends carry the six-pixel rounded corners, and the badge is main's `::after` on the block's
first line, centred on the block's upper boundary. The wrapper keeps only what belongs to the whole
surface: the appearance colours the lines inherit, the reader's selection paint, and the
keyboard-only focus cue. It no longer paints a region, a radius, or a badge, so a section taller
than its generated document leaves that height on the ordinary Code-section surface.

Two deliberate departures from a literal transcription, both forced by the whole-document case.
Main reserves the badge's room with the blank separator line above its generated range and starts
its region four fifths of the way down that line; a generated document has no line to spare and its
bytes are canonical, so the region starts at the first line and the editor's own
`padding-block-start` reserves the badge's space instead — CodeMirror offsets its gutters by that
same content padding, so the line numbers stay on their lines. Main's `after-start` and
`before-end` classes exist only to keep neighbouring regions out of that separator geometry; with
the region hugging the first and last line they would decorate nothing, so they are not ported.
Main's `not-allowed` cursor is not ported either: it marks the part of an editable document that
refuses authoring, while this whole surface is a reader's, and its accepted behaviour is selecting
and copying.

Proofs: `styles/generatedOutput.test.ts` pins the line-scoped region, the overlap, the separately
rounded ends, the centred badge and the padding that gives it room, and fails if the wrapper
regains a background, a radius, or a badge; the code-section body suite reads the block through the
documented per-line hook and proves an ordinary read-only section carries none, that the marks
cover the whole document, and that they follow a host's regeneration from one line to three. In the
production walkthrough the generated assertions now read the block's own region and badge, prove
the badge's origin is the block's top edge and that it is centred on the block within three CSS
px, and prove the block ends at least 100 CSS px above the fixed section's own bottom while the
wrapper itself paints nothing — the exact pair of defects the supervisor rejected.

Verification for this correction: `code-policy check` over the eight changed files reports one
finding, `quality.deadCode` on `apps/python-canvas/vitest.setup.ts`; that finding reproduces on the
unmodified trusted base, belongs to a file this correction does not touch, and its only remedies
are deleting a live vitest setup file or editing protected `.code-policy.json` scope, so it is
reported rather than folded into this presentation plan. The workspace suite passes (1176 tests
across 142 files), as do the playground suite (43), the Python Canvas frontend suite (37), and the
production browser walkthrough against the production builds, the real Go service, pinned
Basedpyright, and headless Chrome at 1440x900 device scale 1. All nine ordinary recommended suites
pass over this candidate. One negative control binds the walkthrough to this fix: restoring the
rejected wrapper fill fails it on the editor wrapper painting a region its document lines own.

**Capture record.** All eight captures are rerun and committed at
`docs/evidence/python-canvas-callable-presentation`, rendered from the immutable source candidate
`666af132be38edf4186e80ad7cf4788c32ff9fd0` and committed separately from it, as decision 15
requires. The bundle holds the Callable field idle and focused and Generated Python idle and
clicked, in light and dark appearance, as component crops with eight CSS px of surrounding surface,
plus `computed/presentation-metrics.json` with each crop's clip rectangle, SHA-256, computed
geometry, and computed typography or paint beside the donor values it was asserted against, and a
hand-written README stating what the images have to show. The capture asserts every donor value
while it records, so it cannot file a capture of a drifted surface, and it names the source commit
it rendered.

In the light idle generated capture the eight-line block ends 232 CSS px above the fixed 390px
section's own bottom, the wrapper's own `background-image` is `none`, the region carries the
donor's gradient and 6px radius, and the badge's origin is the block's top edge with a
two-dimensional negative translation that centres it there, 3 CSS px from the block's centre. The
clicked captures repeat those values with no caret layer, no active line, and no inner outline; the
section-selection chrome visible around them is ordinary workspace behaviour rather than part of
this surface. This is unaccepted working evidence, not a regression lock.

What remains in this phase: supervisor inspection of those eight images and developer visual
acceptance with its accepted-candidate record; then this phase's closing
`test --changed --base <trusted-base>` and `test-levels --base <trusted-base>` steps.

**Second developer visual rejection record.** The preceding capture record is superseded. Developer
review of source candidate `666af132be38edf4186e80ad7cf4788c32ff9fd0` and evidence commit
`7abd2332d18fa89aef3b5b550e75737dd0e163a1` found two blocking defects that the evidence design
missed. First, the field-only Callable crops hid the complete card's layout: Python Canvas's
`.python-canvas-callable-section-content { padding: 0.875rem; }`, the section-field's invented
block-start margin, and the toolbar's adjacency leave much more space around the primary control
than main. Main's accepted crop shows a continuous header → field → Args composition, with the
field beginning at the header boundary and the Args surface beginning at the field boundary.
Second, Python Canvas projected `generatedCode.code` as one whole generated output even though its
already-parsed backend contract separately provides `pythonTarget.prefix`, `generatedCode.body`,
and `pythonTarget.suffix`. The resulting blue block wrongly includes `import math` and
`state = SettaState()`; only the body on lines 3–5 is generated content in the shown snapshot.

This rejection withdraws three earlier assertions: the eight component crops are not adequate
visual evidence; `generated-output` is not the correct public model; and Python Canvas does have
prefix and suffix data even though it intentionally lacks prefix/suffix editing. The next
implementation directly removes the rejected mode and evidence. It must not preserve either as a
legacy path, and it must not expand this correction into backend editing or an arbitrary protected-
range editor.

**First complete-composition and generated-region correction record.** The generated-region defect
is fixed without a legacy shape. The first composition candidate removed the app-owned padding but
its final field-to-toolbar step was subsequently found not to match the donor.

The composition candidate is the package's own. Python Canvas's
`.python-canvas-callable-section-content` padding and the `contentClassName` that mounted it are
gone, and the package's `section-field` surface no longer carries a `margin-block-start`. Measured
live at 1440x900, the field begins exactly at the header's boundary, the Args surface begins 4 CSS
px below the field, the first parameter row follows the toolbar by the item list's own 8 CSS px,
and the field is inset from both card edges by nothing but its own 2px margin. The app's remaining
grid gap spaces only its own error rows. The recorded 4px Args step was an approximation, not
main's value; the supervisor correction record below supersedes that one metric.

`generated-output` is replaced outright by `generated-document` plus one required
`WorkspaceGeneratedRegion`. The public `WorkspaceCodeSectionData` is now a discriminated union, so a
region cannot ride an ordinary mode and a generated document cannot omit one; the parser reads the
mode first, admits `generatedRegion` only for that mode, and rejects a missing, malformed, empty,
reversed, fractional, negative, out-of-document, or extra-field range at the same boundary. The
decorations follow: a line joins the block when the region covers part of it or spans across it, so
the line the region starts at the end of and the line it ends at the start of stay on the ordinary
surface. `styles/generatedDocument.css` paints from those marks — the region and rail on the covered
lines, the donor's 80% lip on the block's first and last line, and the badge centred on that lip.
Main's separator line above its range is what reserves the badge's room, so the editor's own
`padding-block-start` departure from the previous candidate is gone and the literal transcription is
restored; a block that begins and ends on one line keeps the whole line box, which the reference's
separator-bounded range never has to answer for.

Python Canvas projects that region from data it already had: it asserts
`prefix + "\n\n" + body + "\n\n" + suffix === generatedCode.code` and declares the range from the end
of the prefix to the start of the suffix. In the canonical seven-line document that paints body
lines 3–5 with the blank separators as boundaries, leaving `import math` and `state = SettaState()`
unpainted. No backend, route, generated contract, or local prefix/suffix state changed.

The evidence design is corrected with the source. The capture harness crops the **complete Square
Root card** rather than the field, and records the section, header, field, toolbar, and first-row
rectangles beside the donor composition it asserts while recording. Its first implementation
inspected each private CodeMirror document line to record prefix and suffix paint; the
consumer-boundary correction below supersedes that implementation with public block/content
geometry and canonical text inclusion/exclusion. The production walkthrough gained the same two
proofs: one complete-card composition assertion in the committed state, and one that the block is
exactly the region between the target's prefix and suffix with those two authored lines unpainted.

The playground authors the new shape from its own Inspector: selecting `generated-document` seeds a
separator-bounded range and reveals two clamped offset controls, switching away drops the region
rather than leaving a field the new mode may not carry, and an empty document cannot select the mode
at all because a generated document must have generated content.

Verification for this correction: the locked release's `code-policy` binary ran `check` over the
worktree. Its findings are `quality.deadCode` on `apps/python-canvas/vitest.setup.ts`,
`quality.goComplexity` on `apps/python-canvas/backend/internal/contracts/generate.go`, and
`quality.format` on `.code-policy.json`, `apps/python-canvas/vite.config.ts`,
`apps/python-canvas/src/sections/CallableSection.tsx`,
`docs/plans/python-canvas-callable-completion-plan.md`, and
`packages/workspace/src/section/container/SectionContainer.test.tsx`. Every one of them reproduces
on the trusted base over files this correction does not touch, and `.code-policy.json` is untouched;
they are reported rather than folded into this presentation plan. The workspace suite passes (1179
tests across 142 files), as do the playground suite (43), the Python Canvas frontend suite (38), and
the production browser walkthrough against the production builds, the real Go service, pinned
Basedpyright, and headless Chrome at 1440x900 device scale 1, which passed three times. The
workspace, playground, and Python Canvas TypeScript projects are clean and the packaged boundary
check passes over source and built artifacts. Two negative controls bind the walkthrough to this
fix: restoring the app's 14px content padding fails it on a 14 CSS px header-to-field step, and
declaring the whole document generated fails it on marking 7 of 7 document lines.

What remains in this phase: a capture rendered from this corrected source candidate, replacing the
rejected bundle at `docs/evidence/python-canvas-callable-presentation`; supervisor inspection of
those images; developer visual acceptance with its accepted-candidate record; and this phase's
closing `test --changed --base <trusted-base>` and `test-levels --base <trusted-base>` steps.

**Consumer-boundary and contract-strictness correction record.** The independent audit of the
preceding correction found one repository-contract defect, and it is fixed.
`apps/python-canvas/callable-presentation.mjs` had begun observing the package's generated surface
by enumerating CodeMirror's private `.cm-line` elements and reading each one's `::before` paint.
That is a positive structural dependency on exactly the internal `packages/workspace/README.md`
declares non-public, unlike the pre-existing `.cm-cursor`/`.cm-activeLine` reads, which assert those
layers are _absent_ and so need no internal structure to exist. It is also the rule this plan's
Phase A third audit-correction record already enforced once, when it removed the playground's
dependence on the package-private `.setta-workspace-item-toolbar-label`.

The rejected defect is provable without it, so it now is. The state script enumerates the block
through the documented `data-workspace-generated-line` marks alone, and records the reader's own
`[role="textbox"]` content box beside the block's two ends.
`assertGeneratedRegionBoundsItsBody` states the same boundary three public ways: the block's marks
are one well-formed run of `start`, at least one `middle`, and `end`; a whole line box of the reader
stays outside each of the block's ends, which is where the target's authored prefix and suffix are;
and the block's own text claims neither authored statement while the reader shows both, which also
keeps the canonical-document check the removed per-line text read used to carry.
`assertGeneratedBlockHugsCode` drops the `documentLineCount - 2` comparison it had inherited, so
hugging is now only the property its name states and the prefix/suffix relationship belongs wholly
to the region-bounds assertion. The file's boundary claim is restated to match and names its one
sanctioned exception rather than overstating itself. No package API is broadened to close this:
every value read is a documented hook, an accessible name or role, an HTML landmark, or this app's
own content.

Three of the audit's five recommendations are applied and one is answered by that same rewrite.
`WorkspaceCodeSectionDataOverrides` now requires `code` on its generated variant, so a generated
document whose region indexes text the caller never supplied fails at compile time instead of
producing an empty document the parser always rejects; the public-root proof carries the reciprocal
`@ts-expect-error` beside its existing region-on-an-ordinary-mode one. `getGeneratedBlockLines`
hoists `doc.lineAt(to).number` out of its loop condition beside the existing `doc.lineAt(from)`
call, so the clamped bounds read as one pair. The playground's expected region asserts both edges
against the seeded document's own boundaries instead of reusing the Inspector's own `indexOf`
expression for `from`. The recommendation to derive the expected marked-line count from the
target's prefix and suffix has nothing left to correct, because that helper no longer counts
document lines at all.

The remaining recommendation — expressing or validating the reference's separator-bounded
convention in the region's own vocabulary, because a range declared on real line boundaries gets the
80% lip mostly unpainted — is deliberately not a code change here. Fixed decision 10 makes this a
_generic_ generated-document presentation, and constraining the public `WorkspaceGeneratedRegion` to
one host's boundary convention would narrow it for every other consumer; the README already states
the convention where it describes the type. It is an observation for a separate decision rather than
a Phase B acceptance requirement.

Verification for this correction: the locked release's `code-policy` CLI ran `check` over the five
changed files. Its only finding is the `quality.deadCode` on `apps/python-canvas/vitest.setup.ts`
this plan already reports, confirmed here to reproduce on the unmodified trusted base over a file
this correction does not touch. `code-policy test --changed` passes, `code-policy test-levels`
reports the six-suite recommended and eleven-suite full ordinary choices, and the authorized
`code-policy test --recommended` passes all six: workspace focused and component (1179 tests across
142 files), playground focused and component (43), Python Canvas frontend (38), and the production
browser walkthrough against the production builds, the real Go service, pinned Basedpyright, and
headless Chrome at 1440x900 device scale 1. The workspace, playground, and Python Canvas TypeScript
projects are clean. Two negative controls bind the rewritten walkthrough assertion to the defect it
replaces: declaring the whole document generated fails it with the block leaving 4 CSS px of the
reader above it instead of the 18 CSS px line box the authored prefix occupies, and declaring a
single-line region fails it on a block marked `["only"]`.

What remains in this phase is unchanged except for which commit the capture must name: the capture
renders from **this** corrected candidate rather than the preceding one, replacing the rejected
bundle at `docs/evidence/python-canvas-callable-presentation`; then supervisor inspection of those
images, developer visual acceptance with its accepted-candidate record, and this phase's closing
`test --changed --base <trusted-base>` and `test-levels --base <trusted-base>` steps against the
accepted candidate.

**Independent re-review scope correction.** Re-review of candidate
`2679b147443f67400e219e4189098fb6008a3008` correctly noticed that the older acceptance paragraph
still asked for prefix-line and suffix-line rectangles after the consumer-boundary correction had
removed the private document-line query. The requirement, not the public package API, is corrected
above: the reader content box, generated block bounds, one full line box outside each block end, and
canonical inclusion/exclusion proof establish the same outcome. Do not add
`data-workspace-document-line`, `data-workspace-section-header`, or equivalent capture-only hooks.
An interrupted attempt to do so was discarded before this plan revision and is not part of the
candidate.

**Supervisor donor-source correction.** The candidate is not yet a visual handoff. Direct inspection
of donor `frontend/src/components/Section/SectionParts/kwargsControlsStyles.ts` at
`043d3b2e9c69caf99d1246f1408b3ad7194b7864` found the exact conditional the prior evidence constant
missed: a Callable toolbar uses `mt-0 pb-0`, while an ordinary toolbar uses `mt-1 pb-1`.
`WorkspaceItemToolbar` currently applies `mt-1 pb-1` unconditionally, and
`donorSectionComposition.fieldToToolbarCssPx: 4` merely blesses that candidate output. Replace the
constant with zero and make the package render the compact toolbar when it directly follows its
declared leading content. Keep this a package-internal composition input derived at
`renderItemArea`; do not add another consumer-facing presentation mode or Python-specific branch.
Focused component tests must pin both paths: leading-content item areas use the compact zero-gap
toolbar, while item areas without leading content retain their existing ordinary spacing. The new
headless capture must measure zero within the existing one-CSS-pixel tolerance and include the
complete card, so the stale four-pixel approximation cannot be accepted again.

What remains now: this one bounded package-internal toolbar correction, its focused tests and
existing public evidence assertion, a fresh immutable source candidate and separate capture commit,
supervisor inspection of every full-resolution image, developer visual acceptance, and the closing
Code Policy steps. Do not address any other audit recommendation or broaden the public surface.

**Compact callable toolbar record.** The donor's conditional is ported. `WorkspaceItemToolbar` no
longer hardcodes `mt-1 pb-1`: it takes a package-internal `followsLeadingContent` composition input
and renders the reference's `mt-0 pb-0` when the toolbar sits directly on a section's leading
control. `renderItemArea` derives that input from what the declared leading renderer actually
returned, so the compact spacing follows the composition the package renders rather than a declared
mode. Nothing consumer-facing grows: `WorkspaceItemToolbarMode` and the registered `itemArea` shape
are untouched, there is no Python-specific branch, and an item area whose leading slot renders
nothing keeps the ordinary toolbar's own step, because that toolbar then opens the item area
directly under the section header. `donorSectionComposition.fieldToToolbarCssPx` is `0`, so the
existing public composition assertion now measures the donor's zero step in both the production
walkthrough and the capture instead of blessing the previous candidate's four pixels. The package
README carries the reciprocal sentence beside the item-area order it already documents.

Proofs: a `WorkspaceItemToolbar` case pins both spacings on the rendered toolbar's own classes, and
a `SectionContainer` case pins the same two paths through the real registered item area — the
declared kind with leading content, then the same kind without it. Both fail if the component
reverts to one unconditional spacing.

Verification for this correction: the locked release's `code-policy` CLI ran `check` over the seven
changed files; its only finding is the `quality.deadCode` on `apps/python-canvas/vitest.setup.ts`
this plan already reports, over a file this correction does not touch. The pre-existing
`quality.format` finding on `packages/workspace/src/section/container/SectionContainer.test.tsx` is
cleared with the policy-owned formatter rather than reported again, because this correction edits
that file; the reflow is one existing assertion and no other reported finding's file is touched.
`code-policy test --changed --base e0f0480d0` passes over this batch's three focused suites, and the
authorized `code-policy test --recommended --base e0f0480d0` passes all six: workspace focused and
component (1181 tests across 142 files), playground focused and component (43), Python Canvas
frontend (38), and the production browser walkthrough against the production builds, the real Go
service, pinned Basedpyright, and headless Chrome at 1440x900 device scale 1. Two negative controls
bind this fix: restoring the unconditional `mt-1 pb-1` fails both focused cases, and it fails the
walkthrough with _the light Square Root card measured fieldToToolbarCssPx at 4 CSS px instead of the
donor's 0_.

One donor observation is deliberately left to a separate decision rather than folded in here: the
same `getKwargsControlsContainerClassName` conditional also gives a Callable toolbar
`bg-setta-50 dark:bg-setta-860` where an ordinary one inherits the section's background. This
correction is scoped to the spacing the supervisor named, so the package's toolbar keeps its own
background in every composition. The captures below show what that reads like beside main's.

**Corrected-composition capture record.** All eight captures are rerun and committed at
`docs/evidence/python-canvas-callable-presentation`, rendered from the immutable source candidate
`bbb827aa36553f50031256d261c2fed6e0238ccf` and committed separately from it, as decision 15
requires. The bundle replaces the rejected field-only set: it holds the **complete Square Root
card** idle and focused and the Generated Python reader idle and clicked, in light and dark
appearance, with eight CSS px of surrounding surface, beside
`computed/presentation-metrics.json` — each crop's clip rectangle, SHA-256, computed geometry, and
computed typography or paint against the donor values it was asserted against — and the
hand-written README rewritten for this design. The capture asserts every donor value while it
records, so it cannot file a capture of a drifted surface, and it names the source commit it
rendered.

In the light idle card the field's bottom and the Args toolbar's top are the same 259.39 CSS px and
the header's bottom is the field's top, so both donor steps measure zero rather than the rejected
four; the first parameter row follows the toolbar by the item list's own 8 CSS px, the field's
inline inset matches the donor's 2 CSS px within the stated one-pixel tolerance on both edges, and
the app's own content root and the package's content slot both report `0px` padding. In the light
idle generated capture the block is one well-formed run of `start`, four `middle`, and `end` marks
covering the six lines between the authored prefix and suffix, its text claims neither
`import math` nor `state = SettaState()`, it ends 258 CSS px above the fixed 390px section's own
bottom, and the wrapper's own `background-image` is `none` while the region carries the donor's
gradient and 6px radius under the centred badge. The clicked captures repeat those values with no
caret layer, no active line, and no inner outline; the section-selection chrome visible around them
is ordinary workspace behaviour rather than part of this surface. This is unaccepted working
evidence, not a regression lock.

**Leading-slot opacity audit correction.** The first independent audit of candidate
`ae6f0a38005b8d8f311546b72a23972edee36f62` found one repository-contract conflict. The item-area
contract says the leading slot is content-agnostic, but `renderItemArea` called
`rendersLeadingContent` on the returned `ReactNode` to select toolbar spacing. Resolve only that
conflict: the presence of the already-validated `renderLeadingContent` renderer declares the
compact composition, and its returned content remains opaque. Render it normally, but do not
branch on whether it returns an element, `null`, a boolean, a string, an array, or a fragment. A
kind with the renderer declared therefore keeps compact toolbar spacing for all of its sections; a
kind without it keeps ordinary spacing. Update the adjacent README wording to state that declared
composition rule without weakening the content-agnostic boundary.

This is a narrow audit correction. Do not build React-node emptiness classification, add null/array
edge cases, extract shared test-helper infrastructure, or act on the audit's non-blocking
recommendations. The existing two SectionContainer paths already distinguish a kind that declares
leading content from one that does not. Because the source candidate changes, rerun and recommit
the same eight headless captures from the new immutable source hash even though the Python Canvas
renderer continues to return its field and the pixels are expected to remain unchanged.

**Leading-slot opacity record.** The conflict is resolved where it was introduced. `renderItemArea`
no longer reads the leading slot's return value: the already-validated `renderLeadingContent`
renderer is what declares the compact composition, so `followsLeadingContent` is
`itemArea.renderLeadingContent !== undefined` and the returned node is rendered without being
inspected. The `rendersLeadingContent` classifier is deleted rather than narrowed, so the package
holds no notion of an empty React node at all. A kind that declares the renderer therefore composes
the compact `mt-0 pb-0` toolbar for every one of its item-carrying sections, and a kind that
declares none keeps the ordinary `mt-1 pb-1` step, because its toolbar then opens the item area
directly under the section header. Nothing else moved: `WorkspaceItemToolbarMode`, the registered
`itemArea` shape, `WorkspaceItemToolbar`'s own composition input, and
`donorSectionComposition.fieldToToolbarCssPx` are untouched, and Python Canvas's declared renderer
still returns its field, so the rendered surface is unchanged.

The README states that rule where it already documents the item-area order: the compact spacing
follows the composition the kind declares, not the toolbar mode it selects and not anything the
slot renders. That paragraph still closes on the content-agnostic boundary, which the new sentence
now reinforces instead of contradicting.

Proofs are the existing ones, as this correction requires. The two `SectionContainer` paths still
pin both spacings through the real registered item area — the declared kind with leading content,
then the same kind without it — and the `WorkspaceItemToolbar` case still pins both on the rendered
toolbar's own classes. No emptiness edge case, null/array fixture, or shared test helper is added.
This correction is a contract fix with no rendered difference for any checked-in consumer, so it
carries no new negative control of its own; the control that binds the spacing rule still holds,
and restoring the unconditional `mt-1 pb-1` fails both of those cases.

Verification for this correction: the locked release's `code-policy` CLI ran `check` over the
worktree; its only finding is the `quality.deadCode` on `apps/python-canvas/vitest.setup.ts` this
plan already reports, over a file this correction does not touch.
`code-policy test --changed --base bf336c346` passes over the three impacted focused suites
(workspace, playground, and the Python Canvas frontend's 38 tests), and the workspace, playground,
and Python Canvas TypeScript projects are clean.

**Recapture record.** All eight captures are rerun and recommitted at
`docs/evidence/python-canvas-callable-presentation`, rendered from the immutable source candidate
`7c3bea76ae3a5a11a4202116ad3932922a4a097e` and committed separately from it, as decision 15
requires. The bundle's design is the one the preceding capture record describes — the complete
Square Root card idle and focused and the Generated Python reader idle and clicked, in light and
dark appearance, with eight CSS px of surrounding surface, beside `computed/presentation-metrics.json`
and its hand-written README — and the harness again asserted every donor value while recording.

Six of the eight images are byte-identical to the bundle rendered from
`bbb827aa36553f50031256d261c2fed6e0238ccf`. The two focused Callable crops differ only by a
maximum one-channel delta of 1 across 46 pixels in light and 36 in dark, confined to the leading
header glyph above the field. The field bands are byte-identical, so the earlier attribution to a
blinking caret is withdrawn; this is sub-perceptual header-glyph rasterization variance, not a
composition change. Every recorded rectangle, font property, and paint value is unchanged, so the
light idle card still measures both donor steps at zero — the field's bottom and the Args toolbar's
top at the same 259.39 CSS px, and the header's bottom at the field's top — with the item list's own
8 CSS px to the first parameter row and `0px` padding on both the app's content root and the
package's content slot. In the metrics file only `capturedAt`, `sourceCommit`, and those two crops'
SHA-256 values moved. This remains unaccepted working evidence, not a regression lock.

Verification over this candidate: `code-policy test-levels --base bf336c346` reports a five-suite
recommended and an eleven-suite full ordinary choice, and the authorized
`code-policy test --recommended --base bf336c346` passes all five — the workspace, playground, and
Python Canvas frontend focused suites plus the workspace and playground component suites — and
`code-policy check` over the recorded evidence reports no finding.

**Format closeout correction.** The task-added `parameterItemSearchableText` signature is the only
Prettier delta in `CallableSection.tsx`; the trusted-base file itself is formatted. Collapse that
signature to the formatter-owned one-line form. This changes no behavior or rendered surface, but
it changes the source hash, so decision 15 requires one final recapture commit before developer
review.

What remains in this phase: supervisor confirmation that the eight images remain visually unchanged
at full resolution, and developer visual acceptance with its accepted-candidate record; then this
phase's closing `test --changed --base <trusted-base>` and `test-levels --base <trusted-base>`
steps against the accepted candidate.

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
- matching the donor requires editable prefix/suffix state, mutation-filtered protected ranges,
  multiple/arbitrary region infrastructure, or Python/code-generation vocabulary in the package;
- live developer evidence rejects the corrected states and fixing them would materially change the
  agreed generic boundary; or
- Code Policy cannot own or verify the exact files without a protected configuration change.

The plan is complete when both phase markers are checked, the direct public cutovers contain no
legacy or transitional surface, the established production walkthrough remains green, headless
evidence proves the exact idle/focused/clicked states, the supervisor has inspected the captures,
and the developer accepts the donor-matched complete Callable composition and the single generated
region above the unchanged filter-only Args area.

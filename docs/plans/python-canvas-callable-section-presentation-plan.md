# Python Canvas Callable Section Presentation Plan

## Purpose and status

**Status: Complete. Phase A's structural cutover and Phase B's production correction are
developer-accepted. The final live-review correction is source candidate
`c18baf47bb6333fe3a06712a5469958612e1e726`; its closing Code Policy verification and exact-range
Opus review passed. For every behavior included in this callable workflow, current main remains the
authoritative reference.**

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

This is not a request to port every main-branch feature. It is a requirement that the callable
workflow included in this slice match main's behavior and craft. Narrow scope limits which
workflows exist; it does not authorize simplified, invented, or lower-quality behavior inside a
workflow that does exist.

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
5. Python Canvas implements real ordered-parameter authoring for this callable: Add, Remove Last,
   Delete Selected, rename of app-authored parameters, value editing, reordering, and filtering.
   The existing generic workspace item toolbar and item operations own the interaction; Python
   Canvas projects each complete proposed parameter list into one backend-owned atomic mutation.
   Do not add cosmetic or permanently disabled controls. Pinning and edge conversion remain absent
   because this app has neither concept yet.
6. Main is a visual and interaction donor, not a source module to import. Do not restore its global
   project store, OpenAPI wiring, share state, tool-preview state, measurement state, or LSP hooks.
7. The shipped Square Root example continues to start from a real canonical `math.sqrt` commit and
   provider-derived parameter. The Go store remains the sole semantic owner. This correction may
   directly replace the narrow parameter-expression mutation with one revision-bound, complete
   ordered-parameter mutation and add one complete Python-target mutation for prefix and suffix.
   Both validate and render the entire candidate, atomically materialize generated Python, and only
   then publish one new snapshot. No frontend-only semantic state or duplicated signature data is
   permitted.
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
    section: one editable document identifies exactly one protected generated region. User edits
    outside that range update the document and map the range; user transactions touching the range
    are rejected atomically. Python Canvas supplies the range and persists the two editable outer
    regions through its canonical backend. This is generic mixed-authority editor vocabulary, not a
    Python/code-generation backend concept.
11. Replace the rejected whole-document `generated-output` shape directly. The built-in Code
    section keeps required closed modes, but its generated variant must require one validated
    protected region in the same document. Do not retain `generated-output`, make the region
    optional, infer it from text, accept both shapes, or add an adapter. This is a direct semantic
    correction to `generated-document`, not a second compatibility mode.
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
17. When this plan and main disagree about an included interaction, main wins. The mandatory source
    reading for this correction is main's `CallableArea.tsx`, `Search.tsx`, `ParamTextLabel.tsx`,
    text-parameter branch in `ParamUI.tsx`, `KwargsControls.tsx`, and CodeMirror
    `TextInputCodeMirror.tsx`, `getExtensions.ts`, `getOnCreateEditor.ts`,
    `useCodeMirrorStyle.ts`, plus the generated Python branch of `CodeArea.tsx`. Do not infer their
    behavior from the rejected Python Canvas tests.
18. Do not add backward compatibility, legacy support, migrations, feature flags, dual paths,
    deprecated props, or transitional code. Replace the rejected behavior directly.

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
3. Application-wide mutation progress appears only in the app-owned live status. A field adornment
   is reserved for that field's own draft, failure, or LSP wait; this slice has no such field-local
   pending state and therefore supplies no pending adornment. A genuine completion or mutation
   failure remains visible and accessible without turning ordinary idle state into a paragraph of
   infrastructure text.
4. The Args toolbar follows the callable editor. It uses the existing `authoring-and-filter`
   presentation and exposes working Remove Last, Add, and Delete Selected actions. The active
   section's empty filter displays the resolved platform label for the same configurable
   `workspace.focus-item-filter` binding that focuses it (default `Mod + K`, shown as `⌘ + K` on
   macOS); inactive sections display **Filter**. No string duplicated by Python Canvas may claim a
   shortcut the workspace dispatcher does not run.
5. Signature-derived parameter rows follow the toolbar and retain workspace-owned item layout,
   filtering, selection, column sizing, diagnostics, and text-control interaction.
6. The **Generated Python** section presents the canonical prefix, generated body, and suffix in
   one editor. Only the declared generated region receives the light/dark blue block, donor leading
   rail, and centered compact **GENERATED READ-ONLY** badge. For the initial snapshot the generated
   content is lines 3–5; lines 1 and 7 retain ordinary Code-section paint, and the blank boundary
   lines may carry only the donor's partial rounded-edge geometry. The region hugs those lines
   rather than filling unused fixed-section height. Prefix and suffix are ordinary editable Python;
   edits persist through Go and survive the canonical response. The separator-bounded generated
   range remains selectable and copyable but rejects typing, paste, cut, deletion, and replacement
   transactions that touch it. A caret may exist only where authoring is allowed, no inner black
   outline appears, and generated paint does not change when clicked.

The corrected product walkthrough starts at the raw page load, before a test performs any setup
mutation:

1. The Square Root field contains the real committed value `math.sqrt`; it is not empty and does
   not obtain those bytes from a placeholder. The real Basedpyright-derived `x` parameter and the
   corresponding generated call are already present.
2. Clicking the field preserves its exact text, syntax colors, font metrics, and box geometry. It
   adds only main's focus border and ordinary caret. It must not add an inner horizontal rule,
   stretch the caret, or repaint the text.
3. Replace the draft with `math.sq`. As in main, Tab may accept the accessible `sqrt` completion
   without committing. One subsequent unmodified Enter commits `math.sqrt`; an active completion
   popup must not consume that commit Enter. Escape before commit restores the canonical value.
4. The parameter row displays the same product information as main: the visible label is `x`.
   Passing style and analyzer spelling such as `positional only` and `_SupportsFloatOrIndex` do not
   appear in the row. Because `math.sqrt` has no default, its empty value editor has no invented
   `Python expression` placeholder.
5. Enter `missing_value`, observe its range-mapped diagnostic and regenerated Python, then enter
   `3` and observe the diagnostic clear.
6. With Square Root active, the filter shows `⌘ + K` on macOS and that exact chord focuses the
   filter.
   Add creates one blank app-authored argument through the workspace factory and canonical Go
   mutation; name it `scale`, enter `2`, and observe its keyword argument in generated Python.
   Remove Last deletes it. Add two arguments, select them, and Delete Selected removes both in one
   validated mutation. The provider-derived `x` row remains name-read-only while app-authored names
   use the package's existing name editor.
7. In Generated Python, add a prefix import and a suffix statement and observe both survive the
   backend response and page reload while the generated body remains byte-for-byte protected.
   Attempts to type inside, paste over, delete, or replace any part of the declared protected range
   make no document or backend change. Undo and redo for accepted outer edits keep the protected
   range aligned.
8. At a supported enlarged canvas zoom, wait for the gesture to settle. Text, icons, and borders
   must be as crisp as the same main-branch scene. An idle or merely hovered section must not retain
   the package-only `will-change: transform`, `translateZ(0)`, hidden backface, or isolated
   compositor layer that main does not apply.

At every stage, Generated Python's rendering algorithm and LSP ownership remain backend-owned.
This correction directly replaces the too-narrow mutation contracts; it does not preserve the old
parameter-expression route alongside the complete parameter-list mutation or add a second local
prefix/suffix authority.

## Main donor boundary

Main's Callable area establishes the intended composition:

```text
SectionSearch
KwargsControls
ParamGroupContainer
```

The donor's `SectionSearch` is not reusable package code. It directly reads the old global project
state and depends on application OpenAPI calls, LSP waiting state, errors, share mode, tool previews,
section-style state, and edge-handle measurements. The donor's `KwargsControls` also owns pin and
edge mutations that do not exist in Python Canvas. Its add/remove/delete and active filter shortcut
do exist here through generic workspace item and key-binding contracts.

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
combined `generatedCode.code`. The package enforces one declared protected range and maps it through
accepted outer edits; Python Canvas splits the resulting document only at those validated offsets
and sends the complete prefix/suffix candidate to Go. Do not find the body by substring, retain
edits only in React state, or move Python/code-generation semantics into the package. Completion in
the outer regions is not required by this correction; editability, highlighting, persistence, and
range protection are.

## Ownership and dependency direction

| Concept                                                 | Authoritative owner    | Consumer form                                             |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Section shell, header, body ordering, and resizing      | `@setta/workspace`     | Existing registered section-kind boundary                 |
| Leading-content placement and item-toolbar mode         | `@setta/workspace`     | Generic section-kind presentation metadata                |
| Single-line section-field editor surface and lifecycle  | `@setta/workspace`     | Existing `TextValueEditor` with one explicit presentation |
| Callable draft, completion, commit, and provider status | Python Canvas frontend | Props and application-owned adornment                     |
| Callable/parameter semantic state and diagnostics       | Go backend             | Existing canonical V1 snapshot                            |
| Item row structure, authoring actions, and filter chord | `@setta/workspace`     | Existing item operations plus one built-in key binding    |
| Parameter meaning, ordering, and mutation               | Go backend             | One complete revision-bound parameter-list mutation       |
| Editable/read-only/protected-region Code presentation   | `@setta/workspace`     | Required closed mode and one validated mapped region      |
| Prefix, generated body, suffix, and combined source     | Go backend             | One canonical Python target and generated-code response   |

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
mode, and Python Canvas declares `authoring-and-filter` with a real item factory and backend
reconciliation. Do not preserve the old implicit-toolbar route or a Python Canvas-only toolbar.
Meta-control presentations remain headerless and cannot declare item-area presentation.

### Item-filter shortcut

Add one built-in workspace operation, `workspace.focus-item-filter`, to the existing key-binding
registry with default chord `Mod + K`. It resolves the sole active section and focuses that
section's mounted item filter; without exactly one eligible active section it declines and leaves
the browser chord untouched. The filter provider registers and unregisters that focus target by
host and section, so the dispatcher never searches consumer DOM or relies on generated IDs.

`WorkspaceItemFilterControls` reads the resolved binding descriptor from the same registry. When
its section is the sole active section and its query is empty, the input placeholder is the
descriptor's platform-formatted `chordLabel`; otherwise it is **Filter**. A host rebind or unbind is
therefore reflected in both dispatch and display. Preserve the existing accessible label **Filter
parameters**; a placeholder is not its name. Do not hardcode `⌘ + K`, inspect `navigator.platform`
in Python Canvas, or install an app-level key listener.

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
`generated-document` is editable outside exactly one protected UTF-16 CodeMirror-offset range whose
intersecting lines receive donor generated-region paint. Reject a
missing, empty, reversed, fractional, out-of-document, or mode-incompatible region at the existing
data boundary. Do not retain `generated-output`, accept a generated region on either ordinary mode,
support a list of ranges, or infer a range by searching the code.

The Python Canvas projection verifies that
`prefix + "\n\n" + body + "\n\n" + suffix === generatedCode.code` and then declares the range
from the end of the prefix to the start of the suffix. That range includes the two blank separator
boundaries, matching main's partial first/last-line geometry, while its only generated content is
`generatedCode.body`. This is a frontend projection assertion over an already canonical response;
it does not alter the Go or generated TypeScript contract.

`read-only` uses CodeMirror's read-only state and non-editable view contract. `generated-document`
uses the ordinary editable view plus one high-precedence transaction filter: every user transaction
is accepted only when every change lies wholly before or wholly after the protected half-open range.
Accepted changes map `from` and `to` through CodeMirror's change description so boundary insertions
belong to the outer text and the region never drifts. Programmatic canonical replacement may replace
the complete document and region together. The editor reports both the next text and mapped range
through an internal generic change value; no CodeMirror type crosses the package root.

The generated document keeps the ordinary editor's focus/escape/undo lifecycle, syntax highlighting,
selection, and copy behavior. Its prefix and suffix may show a caret and active line; the protected
region uses a not-allowed cursor and refuses mutation. It must not show a second inner focus outline
or repaint the generated block merely because the editor is focused. Tests cover insertion,
deletion, replacement, paste, cut, undo, and redo at representative before/inside/across/after
positions without expanding into an audit of every CodeMirror transaction annotation.

The generated visuals and protection belong to package source and its scoped stylesheet/theme.
Expose only the closed mode, region value, and stable public observation needed by consumers/tests;
do not export CodeMirror extensions, decoration classes, or package-private selectors and do not
add an app `className` escape hatch. This is one protected region required by the built-in Code
section, not an arbitrary range list or application-extensible editor service.

## Python Canvas direct cutover

Keep the registered kind name and canonical projection unchanged. Recompose its renderer through
the new package presentation:

- move the callable editor into the registered kind's generic leading-content callback;
- use `TextValueEditor` with the explicit `section-field` presentation, stable generic `controlId`,
  Python highlighting, existing completion provider, existing draft callback, and existing Enter
  commit callback;
- keep application-wide mutation progress in the app-owned live region, and reserve the optional
  field end-adornment seam for genuinely field-local state;
- remove the large normal **Callable expression** label while retaining that exact accessible name;
- remove the normal idle sentence about what Basedpyright will do after commit;
- keep genuine completion and mutation failures distinct, visible, and accessible;
- declare the item toolbar `authoring-and-filter`, register an app-owned item factory, and render
  the existing `WorkspaceItemList` after it;
- register application-owned searchable text from the canonical parameter name and displayed
  metadata so the retained filter operates on what the row actually shows; and
- keep parameter items on the `item-row` editor presentation with completion disabled.
- remove Python Canvas's callable content padding and any app-owned gap around the package's field,
  toolbar, and item list; let the package-owned field and toolbar form the same adjacent stack as
  main without selecting package-private DOM;
- project Generated Python through `generated-document`, using the canonical prefix/body/suffix to
  verify the combined bytes and declare exactly one generated region; remove `generated-output`
  rather than accepting both document shapes; and
- observe accepted generated-document edits through the ordinary host document subscription, split
  prefix and suffix only at the mapped protected offsets, and reconcile them through the Go target
  mutation; and
- remove or narrow any broad app focus rule that paints inside package-owned editors, while
  retaining explicit accessible focus treatment on application-owned controls.

The app must not reproduce the package's toolbar, filter, item actions, shortcut display,
CodeMirror wrapper, focus
behavior, or section chrome. App CSS may arrange its own status/error content but must not select
package-private classes or depend on the toolbar's internal DOM.

### Canonical parameter-list mutation

Replace the single-parameter projection and parameter-expression route directly. The callable owns
an ordered list of parameter records. Provider-derived records retain provider-owned passing style,
type/default metadata, and a non-editable name; app-authored records use positional-or-keyword
passing, editable names, no fabricated type/default, and stable IDs proposed once by the app's item
factory. A new authored parameter may have an empty name and value, matching main; the renderer
omits any incomplete record until both a valid name and expression exist. Non-empty authored names
must be valid non-keyword Python identifiers. The backend snapshot says explicitly whether a name is
editable; the frontend never infers that from an ID, blank name, type, or list position.

Use one complete ordered mutation with `projectId`, `callableId`, `expectedRevision`, and the
proposed list of `{id, name, authoredExpression}` records. The store validates the full request
before writing: IDs are stable and unique, immutable names are unchanged, new IDs do not collide,
names/expressions satisfy their lexical and size bounds, and every retained record belongs to this
callable. It then clones canonical state, preserves backend-only metadata for retained records,
creates backend defaults for new records, applies order/deletions/edits, renders the whole module,
atomically materializes it, synchronizes diagnostics, validates the response, and publishes one
revision. A stale revision is a typed conflict. Delete Selected is therefore one transaction, not a
loop of partial deletes.

The workspace item tree uses the canonical parameter IDs directly. Its factory creates one complete
blank app-authored item with a collision-resistant stable ID; Add, Remove Last, Delete Selected,
drag reorder, `ItemNameEditor`, and `TextValueEditor` all change the controlled workspace document
through existing package funnels. Python Canvas coalesces those proposals, sends the complete list,
and replaces them with the canonical response. On a typed failure it restores the last canonical
snapshot and presents the error. Do not keep the old parameter-expression route, fixed placeholder
item, one-parameter parser, or parallel frontend parameter model.

Committing a different callable continues to replace the callable's parameter list from the newly
resolved provider signature. This slice does not attempt cross-callable reconciliation of custom
parameters. Recommitting the same canonical callable remains idempotent.

### Canonical Python-target mutation

Move prefix and suffix from Go constants into canonical store state initialized to the same shipped
values. Add one revision-bound mutation carrying the complete `{prefix, suffix}` target. Empty outer
text is valid, because main permits deleting either region; NUL and oversized input are not. The
store renders, materializes, synchronizes, validates, and commits through the same atomic candidate
path as every other project mutation. The generated body is never accepted from the client.

Python Canvas derives the proposal from the code section's validated `code` and mapped
`generatedRegion`: `prefix = code.slice(0, from)` and `suffix = code.slice(to)`. It verifies the
protected bytes equal the canonical separator/body/separator before sending. Debounce/coalesce
ordinary typing, bind the request to the latest canonical revision, and reproject the response.
Do not locate the body with string search, maintain an uncommitted second source model, or retain
the old constant-only target path.

## Explicit non-goals

Do not use this work to add:

- a workspace `CallableSection`, callable data schema, Python section kind, LSP status type, or
  backend adapter;
- callable catalogs, arbitrary callable expressions, multiple callables, parameter completion,
  hover, documentation, or completion resolve;
- generated-code body editing, multiple protected regions, arbitrary host-supplied CodeMirror
  extensions, or a general protected-range service;
- Basedpyright provider replacement, outer-region LSP completion, execution, persistence to a
  project file, or wrapper-script changes;
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

- [x] Production acceptance and closeout complete

Correct the second developer-rejected candidate without reopening Phase A's accepted generic item
composition:

1. Compare the complete Square Root section against main's accepted full-section captures, not the
   callable field alone. Remove Python Canvas's 14px content padding, remove the field's invented
   block-start gap, and make the package-owned field/toolbar boundary match main. In particular,
   main's Callable toolbar selects `mt-0 pb-0`; the field-to-toolbar gap is zero within one CSS
   pixel. Preserve the already-correct idle/focused box and type stability, and preserve ordinary
   item sections' existing `mt-1 pb-1` toolbar spacing.
2. Keep the completed `generated-output` to `generated-document` cutover and change that one mode
   directly from whole-document read-only to editable outer text plus one protected, transaction-
   mapped region. Update parser/actions/editor lifecycle, package root and README, playground,
   packed-consumer fixtures, and Python Canvas together; do not introduce a second mode or preserve
   the rejected behavior.
3. Preserve the package-owned line decorations that paint only lines intersecting the declared
   region, including main's partial first/last separator-line geometry, centered badge, leading
   rail, selection paint, and unused-height behavior. Add range protection without changing those
   visuals or forking the section editor.
4. Add `workspace.focus-item-filter` to the existing binding registry and make the package filter
   display that resolved binding for the sole active section. Switch Python Canvas to the existing
   `authoring-and-filter` mode with its existing package item actions; do not copy main's toolbar or
   hardcode a macOS shortcut in the app.
5. Generalize the Go store from one fixed parameter pointer and constant target strings to an
   ordered canonical parameter list plus mutable prefix/suffix. Replace the narrow parameter route
   with the one complete revision-bound parameter-list mutation, add the target mutation, regenerate
   the TypeScript contract, and cut the frontend client/projection/controller over in the same
   phase. Do not retain old routes, request types, fixed item IDs, or parsing branches.
6. Update focused backend, package, packed-boundary, playground, and Python Canvas tests. Delete the
   rejected filter-only and whole-document-read-only assumptions; do not preserve fixtures or
   parsing behavior for compatibility.

The generated-document correction must keep main's line decorations for one declared region rather
than approximate them with a whole-document or flex-wrapper background. Keep this generic and
package-owned: decorate only the intersecting CodeMirror lines, center the badge at that region's
upper boundary without changing document bytes, protect and map exactly that range, and leave
prefix, suffix, and unused editor height on the ordinary editable Code-section surface. Do not
introduce a range list, extension hook, or Python-aware package logic.

Then run the production frontend, real Go service, and pinned Basedpyright through the established
headless-Chrome walkthrough. Extend only the assertions and evidence needed to prove this bounded
presentation correction:

- the callable editor precedes the Args toolbar in rendered and keyboard order;
- the idle section has no large provider-status paragraph;
- Add, Remove Last, and Delete Selected are exposed by `authoring-and-filter` and each completes a
  real canonical round trip; no pin or edge control is shown without an app concept behind it;
- the Args filter remains operable, displays the active binding's `⌘ + K` label on macOS, and is
  focused by that exact binding;
- the Callable idle and focused states have stable geometry and identical computed typography;
- complete light and dark Square Root section captures show donor-equivalent header-to-field,
  field-to-toolbar, toolbar-to-first-row, and inline-edge spacing, as well as the field's accepted
  border, background, radius, and typography;
- Generated Python exposes `generated-document`, leaves prefix line 1 and suffix line 7 unpainted
  and editable, paints generated body lines 3–5 with the donor rail/region/badge, rejects mutations
  touching the protected separator/body/separator range, persists accepted outer edits through Go,
  and has no inner outline before or after a real pointer click;
- the accessible callable name, `math.sq` completion selection, one-Enter commit, `x` parameter,
  generated Python, diagnostic, and diagnostic-clear behavior remain intact; and
- a blank authored parameter can be added, named, valued, reordered, removed, and bulk-deleted;
  generated code includes it only after it has both a valid name and value; and
- one Ctrl-C still cleans up the app processes through the existing wrapper.

Use a fixed 1440x900 CSS-pixel viewport at device scale 1 and capture deterministic **complete
section crops** for Square Root idle/focused and Generated Python idle/clicked in both appearances.
The Square Root crop must include the whole section card: header, field, Args toolbar, and first
parameter row or the empty item area. A field-only crop is insufficient evidence. Record section,
header, field, toolbar, first-row, editor-content-box, and generated-region rectangles, along with
font properties, border/radius/background values, editability, active element, and
outline/caret-relevant values in machine-readable evidence bound to the exact candidate commit.
Prove the authored prefix and suffix through the canonical editor text, their exclusion from the
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

No `.code-policy.json`, dependency manifest, or lockfile change is expected. The task boundary must
include `workspace`, `playground`, `python-canvas-backend`, and `python-canvas-frontend`; this is a
consumer-driven backend contract correction rather than a presentation-only continuation. If implementation
requires one, stop and explain the exact missing ownership, suite, or dependency rather than folding
it into this presentation plan.

**Avoid rabbit holes:** verify the accepted callable flow, the three real generic toolbar actions,
the one filter binding, the one protected editor range, and the two canonical backend mutations.
Do not add pinning/edges, inspect unrelated sections, audit all responsive widths or every
CodeMirror annotation, pursue outer-region completion, or generalize beyond the concrete consumer.

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

**Final format recapture record.** The same eight captures are rerun from immutable source
candidate `838ad70b9116e0e9bb54993836cd4a38401f4773`. The capture harness again passes every donor
geometry, typography, generated-region, and interaction assertion. Seven images are byte-identical
to the preceding bundle; the focused light card moves only within the already bounded
sub-perceptual header-glyph rasterization variance. All recorded presentation values are unchanged;
only `capturedAt`, `sourceCommit`, and that image's SHA-256 move. This remains working evidence for
developer review, not an accepted regression lock.

What remains in this phase: supervisor confirmation that the eight images remain visually unchanged
at full resolution, and developer visual acceptance with its accepted-candidate record; then this
phase's closing `test --changed --base <trusted-base>` and `test-levels --base <trusted-base>`
steps against the accepted candidate.

**Developer-rejected workflow record and required main-parity correction.** The developer exercised
the application from a raw launch rather than the capture harness's prepared state and found that
the harness had certified the wrong experience. The backend booted an empty callable, the UI
painted `math.sqrt` as placeholder copy, and the capture script silently committed the sample
before recording it. With completion active, the package deliberately gave the first Enter to
completion and the second to commit even though main's callable search gives its commit binding
precedence. The resulting parameter row then displayed raw passing-style and Basedpyright type
spelling plus an invented `Python expression` placeholder, none of which main's parameter row
shows. At enlarged settled zoom, all section content was blurred by package-only persistent leaf
layer promotion applied on ordinary hover. These are failures in the shipped workflow, not evidence
gaps and not polish follow-ups.

Implement this as one bounded Phase B correction. Before editing, read the current main donor files
listed in decision 17 and write a concise mapping in the implementation report from each donor
behavior to its workspace or Python Canvas owner. Do not copy main's global stores or transport
adapters, and do not invent a new general framework. Make only the following direct replacements:

- Bootstrap the Square Root demo through the existing Go store/provider commit path before the HTTP
  service becomes available. The first GET must already return canonical `math.sqrt`, the real `x`
  parameter, and matching generated Python. Do not hard-code a frontend value, parameter, signature,
  diagnostic, or generated source.
- Remove `math.sqrt` as callable placeholder copy. The field renders the canonical committed value.
  Its local draft remains separate only for main's ordinary edit/revert behavior.
- Make the section-field commit key behavior match main: Tab can accept completion without commit;
  one unmodified Enter commits the current draft even when completion UI is active; Escape abandons
  the uncommitted draft and restores the canonical value. Delete tests that require two Enter
  presses and replace them with tests that fail if that behavior returns. Do not change ordinary
  item-row completion behavior unless main requires it.
- Render the parameter row like main's ordinary text parameter: visible name only, normal value
  editor, and the actual default as placeholder only when a default exists. Keep passing style and
  type annotation in the canonical backend contract for code generation and diagnostics, but do
  not expose them as permanent row copy. Remove the invented generic value placeholder.
- Remove the package-only persistent per-section compositor promotion on hover and on hoverless
  idle canvases. A narrowly transient interaction marker may remain only if it is cleared after the
  gesture and settled screenshots are crisp; do not replace it with another permanent GPU layer.
- Diagnose and remove the inner horizontal line visible in the focused callable field at enlarged
  zoom. Compare the live CodeMirror DOM and computed styles to main rather than adding a cosmetic
  cover. The pill border and ordinary text caret are the only focused lines.

Keep the corrected generated-document region behavior already implemented. Do not reopen unrelated
workspace APIs, arbitrary signature support, structural parameter authoring, MCP/CLI work, or edge
case audits. Do not preserve rejected behavior for old callers.

The browser proof must exercise the product the way the developer did. Start the production Go
service and production frontend from fresh processes and assert the raw first render before any
test mutation: actual `math.sqrt`, present `x`, no callable placeholder substitution, no raw
signature metadata, no invented parameter placeholder, and correct generated Python. Then exercise
click, draft, Tab completion, one-Enter commit, Escape revert, parameter diagnostic/clear, and
generated reader selection. Capture complete light and dark cards at raw startup, focused at 1x,
and idle/focused after enlarged canvas zoom has settled. Record computed field geometry/type and the
settled section's compositor properties. Captures are working evidence for supervisor inspection;
they cannot declare visual acceptance.

Run focused tests while implementing, then the already authorized recommended ordinary profile.
The correction is complete only after a fresh read-only Claude Opus review finds no repository or
requested-outcome issue, the supervisor inspects the raw-startup and settled-zoom captures at full
resolution, the live workflow matches main, and the developer receives the corrected application
for visual acceptance.

**Donor mapping for the main-parity correction.** The decision 17 files were read at
`043d3b2e9c69caf99d1246f1408b3ad7194b7864` before editing. Each donor behavior this correction
touches, and the owner it maps to here:

| Donor behavior (main)                                                                   | Owner here                                        | State                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------- |
| `CallableArea`: search, then kwargs controls, then the param group                      | `@setta/workspace` item-area presentation         | done in Phase A         |
| `Search`: value is `draftCallableName ?? codeInfoName` — canonical text, no placeholder | Go bootstrap + Python Canvas `callableDraft`      | this batch              |
| `Search`: `keyComboActions.Enter` commits; `onTab` accepts completion or commits        | package `textValueExtensions` keymap              | this batch              |
| `Search`: `onEscape` resets the draft to the canonical name unless a popup is open      | package Escape seam + Python Canvas revert        | this batch              |
| `Search`: the pill's radius, padding, margin, type, and focus border                    | package `styles/sectionField.css`                 | done earlier in Phase B |
| `Search`: spinner and callable-error right indicator                                    | Python Canvas end adornment and failure blocks    | done in Phase A         |
| `Search`: LSP waiting state, style themes, edge-handle measurement                      | not ported — donor global state this plan refuses | out of scope            |
| `Search`: `tooltipParentDivId` → `Viewport` host → `tooltips({ parent })`               | host tooltip parent + package editor wiring       | this correction         |
| `ParamTextLabel`: the row shows the display name and nothing else                       | Python Canvas `ParameterItemRow` label            | this batch              |
| `ParamUI` text branch: value editor whose placeholder is the parameter's `defaultVal`   | Python Canvas row placeholder                     | this batch              |
| `ParamUI` text branch: the row control's own surface classes                            | package `item-row` presentation                   | done in Phase A         |
| `TextInputCodeMirror`: idle highlighted layer swapped for a live editor on activation   | package `TextValueEditor`                         | done                    |
| `getExtensions`: app bindings ahead of `completionKeymap` inside `Prec.highest`         | package `textValueExtensions` keymap              | this batch              |
| `getOnCreateEditor`: focus, caret at the pressed point, and its zoomed-caret fix        | package `onCreateEditor`                          | open (sixth item)       |
| `useCodeMirrorStyle`: GitHub light/dark themes over a transparent background            | package `textValueTheme`                          | done                    |

Nothing in that mapping moves main's project store, OpenAPI transport, share/deployment state, or
LSP hooks into either package.

**Canonical startup and parameter-row record.** This correction's first, second, and fourth items
are implemented; its third, fifth, and sixth remain open.

The demo's `math.sqrt` is now a real commit rather than sample copy. `Store.BootstrapShippedExample`
commits the shipped expression through `CommitCallable` — the same provider-backed transaction every
later edit uses — and `serve` runs it after the store is built and before `ServeLoopback` accepts a
request. The first GET therefore returns revision 2 with the committed callable, the real
provider-derived `x` parameter, and `state.Square_Root = math.sqrt()`, measured live at 0.52 s to
first response, so neither the wrapper's readiness window nor the browser harness's has to move. No
HTTP route, generated contract, code-generation algorithm, or LSP provider changed, and the frontend
still hard-codes no value, parameter, signature, diagnostic, or generated source. An unavailable
provider fails the bootstrap rather than serving an empty demo, which is what makes the state real.

With the value canonical, the callable field's `math.sqrt` placeholder is gone: the idle layer
renders a placeholder inside the same accessible text box as a value, which is exactly how sample
copy passed for committed state. The local draft is unchanged and still separate for ordinary
edit behavior.

The parameter row is main's ordinary text parameter. `ParamTextLabel` shows the display name alone,
so the row's `passing style · type · default` line is gone, and `ParameterItemData` no longer
carries `passingStyle` or `typeAnnotation` at all — the canonical `ParameterV1` still does, where
code generation and diagnostics read them. The invented `Python expression` placeholder is replaced
by main's `defaultVal`, so a parameter with a default offers it and `math.sqrt`'s `x`, which has
none, offers nothing. The label stylesheet collapses to main's one truncating semibold line at its
`font-semibold` weight, inheriting the package's own section text colour. The retained Args filter
now searches the row's visible name, which is all the row shows.

The capture harness no longer prepares its own subject. `commitOrdinarySectionState` — which
selected the completion, committed it, and typed a parameter value before recording — is deleted;
the harness waits for the canonical first render instead. That silent setup is why the rejected
bundle certified a state the shipped application never booted into.

Proofs: two `project` cases prove the bootstrap commits through the provider path with the ordinary
single signature request and that a provider failure leaves the store untouched rather than serving
an empty demo. Two `CallableSection` cases prove the row renders main's name-only label with no
analyzer vocabulary and no placeholder on either editor, and that a real default becomes the value
editor's placeholder. The projection and registry cases pin the narrowed item data and the
name-only searchable text. In the production walkthrough a new raw-first-render assertion runs
before any mutation and compares the rendered surface against the canonical response rather than a
remembered string: the callable field, the `x` value editor, and the generated reader must each
show the project's own text, the row must be labelled with the canonical name, and the section must
not spell `positional`, `keyword only`, or `_SupportsFloat`. Because the field is never empty now,
the walkthrough's two field-parity passes both compare text colour and the split
`fieldValueTypeProperties` list is gone.

Verification for this batch: `code-policy check` over the twelve changed files reports only the
`quality.deadCode` finding on `apps/python-canvas/vitest.setup.ts` this plan already reports, over a
file this batch does not touch. `code-policy test --changed --base addbd01be` passes, and the
authorized `code-policy test --recommended --base addbd01be` passes all three suites it selects —
the Python Canvas backend focused suite, the frontend focused suite (40 tests), and the production
browser walkthrough against the production builds, the real Go service, pinned Basedpyright, and
headless Chrome at 1440x900 device scale 1. The Python Canvas TypeScript project is clean. Two
negative controls bind the walkthrough to this fix: removing the bootstrap call fails it with _the
first canonical response committed `{"callable":"","generatesItsCall":false,"parameterNames":[]}`_,
and restoring the invented parameter placeholder fails it with _the x value editor rendered "Python
expression" while the canonical project holds ""_. The callable field's own removed placeholder is
bound by the component case instead, because a placeholder cannot render over a value.

What remains in this correction: main's commit-key behavior with its Escape revert, the removal of
the package's persistent per-section compositor promotion, and the focused field's inner horizontal
line at enlarged zoom; then the raw-startup and settled-zoom captures, the read-only review, the
supervisor's inspection, and developer visual acceptance. The bundle currently checked in at
`docs/evidence/python-canvas-callable-presentation` was rendered from the rejected workflow and is
superseded working evidence; the recapture this correction requires replaces it.

**Commit-key and Escape-revert record.** This correction's third item is implemented, together with
the two repository-contract defects the independent audit of the preceding batch reported. Its
fifth and sixth items remain open.

The field's keys are main's. `getTextValueExtensions` now binds Tab to `acceptCompletion` while a
popup is open — the reference's `tabToAutocomplete`, which every one of its text controls carries —
and gives an unmodified Enter to a declared `onCommit` whether or not the popup is showing: the
popup is closed and the ordinary commit path sends the draft the field is displaying. A control
that declares no commit keeps CodeMirror's Enter-accepts binding, which is exactly what the
reference's ordinary parameter rows have, so item-row completion behavior is unchanged. Escape was
already the reference's: the popup takes the first one, and the one that reaches the editor now
reports to an optional public `onEscape` before the package returns focus to the section. Python
Canvas's controller answers it by restoring `snapshot.callables[0].authoredExpression`, which is
the only value an abandoned local draft can go back to.

One deliberate departure from a literal transcription. The reference's Enter combo action returns
`void`, so its binding falls through to `completionKeymap` and `acceptCompletion` runs _after_ the
commit — the field ends up displaying a name it never committed. The plan's own acceptance text
asks for the commit and for the popup not to consume that Enter, so the popup is closed instead.
Nothing else about the reference's Tab is ported: Tab outside an open popup stays the browser's own
focus move rather than the reference's `moveFocus` manager and its no-completion commit, which the
section's keyboard-order proof depends on.

The audit's first finding is fixed by making the walkthrough's key steps discriminating rather than
by weakening the boot state. Because the demo now boots committed, a sequence that begins and ends
on `math.sqrt` cannot detect a commit at all: `CommitCallable` returns early on the expression it
already holds, and the committed-projection wait is satisfied before the key is pressed. Every step
therefore drives a second real callable, `math.floor`. Escape abandons its draft and the canonical
project is unchanged; Tab accepts `floor` into the draft and the canonical project is still
unchanged, which is now a real claim because committing that name would move every field the
assertion reads; one Enter commits `math.floor` and the store and the generated reader both move to
it; and one more Enter, pressed over an open popup, commits `math.sqrt` back. The rejected
`replaceDraftWithSqrtCompletion` helper, whose `selectAll` the audit correctly read as a symptom, is
replaced by draft/completion/idle-value primitives that leave every key to the walkthrough.

The audit's second finding is fixed in the app's README, which described the pre-bootstrap startup
and the rejected two-Enter commit. It now records that the service commits the shipped example
before it accepts a request, that the field shows that committed value rather than a placeholder,
and what Tab, Enter, and Escape do; its walkthrough paragraph describes the `math.floor` round trip
and why the proof needs it. The package README states the same key contract beside the placements
it already documents.

Proofs: two `TextValueEditor` cases — one per placement — pin Tab accepting without committing,
Escape belonging to the popup first, IME-composing Enter being ignored, and one unmodified Enter
committing the shown draft over an open popup; a third pins that a control with no declared commit
still leaves Enter to the popup; a fourth proves the public `onEscape` fires only for the Escape the
popup did not take. The public-root proof carries the new prop, a `CallableSection` case pins that
the field wires commit and revert and that a parameter row declares no revert, and a
`PythonCanvasApp` case drives the app's own context: a draft of `math.floor` returns to the
canonical `math.sqrt` on Escape. In the production walkthrough the four key steps above replace the
insensitive pair.

Two of the audit's four recommendations are answered here. Its fourth is settled by the donor rather
than by code: main's Args filter is `matchSorter(..., { keys: ["name"] })` in `GetParamSwitch.tsx`,
so matching the visible parameter name alone is main's behavior, not a narrowing of it. Its third is
answered by replacing the two string assertions it named — which `requireExactFields` had already
made unfailable — with the reader rejecting a row payload that carries `passingStyle` or
`typeAnnotation`. Its second is a stated limit rather than a change: the mocked item label is the
leaf element this app styles, so that suite judges what the app renders and not the package
wrapper's layout, and the comment now says so. Its first — an ordering proof that `serve` bootstraps
before `ServeLoopback` accepts a request — is not folded in here, because binding that order needs a
seam in `serve` that this key-behavior batch has no other reason to open.

Verification for this batch: `code-policy check` over the thirteen changed files reports only the
`quality.deadCode` finding on `apps/python-canvas/vitest.setup.ts` this plan already reports, over a
file this batch does not touch; a `quality.complexity` finding on the new completion keydown branch
and two `quality.format` findings on files this batch edits were fixed rather than reported.
`code-policy test --changed --base c45139527` passes, and the authorized
`code-policy test --recommended --base c45139527` passes all six suites: workspace focused and
component (1183 tests across 142 files), playground focused and component (43), Python Canvas
frontend (42), and the production browser walkthrough against the production builds, the real Go
service, pinned Basedpyright, and headless Chrome at 1440x900 device scale 1. The workspace,
playground, and Python Canvas TypeScript projects are clean. Two negative controls bind this fix:
giving the open popup the commit Enter again fails the walkthrough with _the math.sqrt call in
generated Python did not occur within 30 seconds_ and fails both new key cases, and removing the
field's `onEscape` wiring fails the walkthrough with _the idle callable field showing "math.sqrt"
did not occur within 30 seconds_ and fails the two revert cases.

**Focused-field tooltip clipping correction.** This supersedes the sixth correction item's premise
that the inner horizontal line is a stray focus outline or a leftover border, and it supersedes the
donor-mapping row that placed `Search`'s tooltips out of scope.

A headless reproduction settled the diagnosis. The line is absent from a focused idle field. It
appears only while a completion popup is open and vanishes the moment completion closes, with no
change to the focus ring, the caret, or the pill's own border between the two states. It is the top
border of the CodeMirror completion tooltip, rendered inside the section's own clipped subtree, so
the callable pill crops the tooltip down to that single visible horizontal edge. The fix is
therefore structural rather than cosmetic: the tooltip must render outside the clipping ancestor,
which is what main already does and what the donor mapping wrongly refused.

Main's shape, read at the donor commit: the canvas `Viewport` renders a tooltip host element beside
the transformed scene content; the callable field names that host when it builds its editor;
`getExtensions` turns the resolved element into `tooltips({ parent })`. The tooltip therefore lives
under the canvas transform, so it scales and pans with the scene, but outside every section's
clipped box. Main's own end-to-end proof asserts exactly that: the tooltip is found under the
tooltip host, its rectangle overflows the section's resizable container, and that container does
not contain it.

Port that shape under this plan's boundary:

- `@setta/workspace` owns the tooltip parent. The canvas host renders it, scoped to the host
  instance rather than to a module-global document id, so two hosts on one page cannot share or
  steal one parent. It sits in the same transformed coordinate space as section content and outside
  every section's clipping and overflow ancestor.
- The package's own editor assembly resolves that parent and configures CodeMirror's tooltips to
  use it, as main does. Consumers neither pass it, name it, nor see it.
- The public surface stays consumer-neutral: no Python, callable, Basedpyright, LSP, application
  error, or generated-contract vocabulary, and no private CodeMirror API — no `EditorView`,
  extension array, tooltip option, or raw element handle — in any exported signature.
- No compatibility or transitional path: no flag, no per-control opt-in, no fallback to the
  in-section parent, and no second rendering path kept alive for the old placement.

Proofs. Focused package tests must pin that the host renders exactly one tooltip parent, that it is
outside the clipped section subtree, that an editor's completion tooltip is parented to it, and that
the exported surface still carries no editor or tooltip vocabulary. The production browser proof
must open completion in the callable field at enlarged settled zoom and assert two things the
rejected placement cannot satisfy: the tooltip is visibly outside the clipped field and section —
its rectangle overflows the section container and that container does not contain the tooltip
element — and no horizontal tooltip border remains inside the pill, measured against the field's own
box rather than judged by eye.

Bound the zoom harness. Run the zoom steps early, in a fresh production scene, rather than after the
walkthrough's mutations. Use one real canvas zoom mechanism — the product's own — and prove it took
effect by measuring the section card's enlargement instead of trusting the gesture. Do not build a
matrix of CDP acknowledgement probes to decide whether an input was delivered, and do not check in
debug or exploration scripts; the harness that ships is the one that asserts.

The blur fix requirement is unchanged. The package's persistent per-section compositor promotion is
removed, and any interaction marker that remains is transient — cleared after the gesture, with
settled screenshots crisp.

The next implementation batch is restricted to transient-only compositor promotion, this
tooltip-parent fix, their focused package tests and production browser proof, and the evidence
recapture the preceding batches already owe. Nothing else: no edge case audit, no further donor
items, no unrelated cleanup.

**Transient compositor and canvas tooltip-parent record.** This correction's fifth and sixth items
are implemented, which closes its repository work.

The package's persistent per-section promotion is deleted rather than narrowed. `workspace.css` no
longer promotes a leaf shell because the canvas is hovered, and its `@media (hover: none)` block —
which promoted every section of a hoverless canvas continuously — is gone with it. What remains is
the marker `ZoomPane` already owns: a leaf takes `will-change: transform`, `translateZ(0)`, hidden
backface, and its own stacking context only while
`data-viewport-interaction-active="true"`, and that attribute is set on the gesture and cleared when
pan and wheel-zoom both fall idle. A settled section therefore owns no layer, so the browser
rasterizes its text, icons, and borders at the zoom it displays them at instead of scaling the
picture the gesture left behind. No component, store field, or render path changed: the promotion
was always a stylesheet rule keyed on a canvas-owned attribute, and only the two rules that outlived
a gesture were removed.

The focused field's inner horizontal line is the completion tooltip, and it is fixed structurally.
`@setta/workspace` now owns the reference's canvas tooltip parent. `canvas/codeMirrorTooltipParent.ts`
holds a host-scoped store behind the same `WeakMap` the canvas store already uses, `Viewport`
renders one zero-area anchor as a sibling of the scene content and publishes it in layout, and
`getTextValueExtensions` turns the resolved element into `tooltips({ parent })`. The anchor lives
inside the transformed viewport, so a popup pans and scales with the scene it annotates, and outside
every section, so no section's clipping and overflow box can crop it down to the top border that
crossed the pill. Binding it to the host rather than to a document id is what keeps two canvases on
one page from resolving, sharing, or stealing one parent. Both editor placements resolve it the same
way — the reference names it from its own name input too, and a name editor sits in the same clipped
box a field does — and nothing consumer-facing grows: no prop, option, flag, per-control opt-in, or
CodeMirror object crosses the package root, and an editor rendered with no canvas simply installs no
tooltip extension, which is also a tree with no section to clip a popup.

The production proof runs the zoom states first, in the scene the service boots, and then reloads so
everything after it still measures the shipped 1x composition. It pinch-zooms the canvas with the
product's own ctrl-wheel gesture, proves the gesture arrived by the card's own measured enlargement
rather than by asking whether an input was delivered, leaves the pointer resting on the card the way
a hand does, and waits past the marker's own idle window before reading anything.

Proofs: three `codeMirrorTooltipParent` cases pin one parent per canvas, its placement inside the
transformed viewport and outside the section subtree, a real field's completion popup parented to it
rather than to the section or the editor, and two canvases owning two parents; a
`getTextValueExtensions` case pins the two shapes a control can get, since it never opts in; the
public-root proof carries a `@ts-expect-error` for a consumer-passed parent beside a runtime check
that no export names CodeMirror, an editor view, a tooltip parent, or an extension; and the adaptive
stylesheet contract now fails on a returning `:hover` or `hover: none` promotion and on any second
`will-change: transform` owner. In the walkthrough the settled zoomed card must report the
unpromoted computed values, and the popup opened at that zoom must be outside both the section and
the field, reach past the field's own bottom edge, and be what the page hit-tests at two points
below it — the sliver a cropped popup leaves cannot satisfy the last two.

Verification for this batch: `code-policy check` over the worktree reports only the
`quality.deadCode` finding on `apps/python-canvas/vitest.setup.ts` this plan already reports, over a
file this batch does not touch. `code-policy test --changed --base b1aa97c08` passes over its three
focused suites, and the authorized `code-policy test --recommended --base b1aa97c08` passes all six:
workspace focused and component (1188 tests across 143 files), playground focused and component
(43), Python Canvas frontend (42), and the production browser walkthrough against the production
builds, the real Go service, pinned Basedpyright, and headless Chrome at 1440x900 device scale 1.
The workspace, playground, and Python Canvas TypeScript projects are clean. Two negative controls
bind this fix: restoring the hover promotion fails the walkthrough with _The zoomed settled Square
Root card kept backfaceVisibility "hidden" instead of "visible", so its content is scaled from a
stale layer_, and leaving the editor's tooltips unparented fails it with _The zoomed completion
popup is still inside the callable field, which clips it_ as well as failing the parenting case.

What remains in this phase: the recapture this correction owes, rendered from this batch's immutable
source candidate and committed separately as decision 15 requires; the fresh read-only review; the
supervisor's inspection of the raw-startup and settled-zoom images at full resolution; developer
visual acceptance with its accepted-candidate record; and this phase's closing
`test --changed --base <trusted-base>` and `test-levels --base <trusted-base>` steps against the
accepted candidate.

**Raw-startup and settled-zoom capture record.** The bundle at
`docs/evidence/python-canvas-callable-presentation` is replaced, rendered from the immutable source
candidate `682e30b648e5e6237fe4d4ab3ae3fc08b99cb195` and committed separately from it, as decision 15
requires. It is fourteen captures rather than eight: the complete Square Root card idle and focused,
the Generated Python reader idle and clicked, and the settled 2x-zoomed card idle, focused, and with
its completion popup open, in both appearances, with eight CSS px of surrounding surface. The
harness records the state the service boots into — it waits for the canonical first render and
performs no setup mutation of its own — and it asserts every donor value while it records, so it
cannot file a capture of a drifted surface.

`computed/presentation-metrics.json` carries each crop's clip rectangle, SHA-256, computed geometry,
and computed typography or paint beside the donor values it was asserted against, and the
hand-written README is rewritten for this design. In the light idle card the header's bottom and the
field's top are the same 233.39 CSS px and the field's bottom and the Args toolbar's top are the same
259.39, so both donor steps measure zero; the first parameter row follows the toolbar by the item
list's own 8.5 CSS px, and the app's content root and the package's content slot both report `0px`
padding. In the light idle generated capture the block is one run of `start`, three `middle`, and
`end` marks over the five lines between the authored prefix and suffix, ending 276.9 CSS px above
the fixed 390px section's own bottom while the wrapper's own `background-image` is `none`.

The zoomed captures are the two rejected defects at the zoom they were found at. The gesture leaves
the scene at exactly 2x with the pointer on the card, and the settled card reports
`will-change: auto`, `transform: none`, `backface-visibility: visible`, and `isolation: auto` in
every zoomed state, so nothing is scaled from a stale layer. The completion popup is 500 CSS px wide
and reaches 60.4 CSS px past the field's own bottom edge, is inside neither the field nor the
section, and is what the page hit-tests at both recorded points — where the rejected placement left
only the horizontal line the developer saw across the pill. The zoomed crops are clamped to the
1440x900 viewport, because a doubled card no longer fits inside it. This is unaccepted working
evidence, not a regression lock.

**Supervisor full-resolution rejection of the zoom capture.** Evidence commit
`3424cec4e77791700499c198b5150f3a872e1e68` is rejected before developer handoff. Its ordinary
1x Callable and Generated Python images, and its enlarged completion-popup placement, show the
intended corrected surfaces. Its enlarged card images do not show the complete card: the harness
pinch-zooms around the section's centre, which moves the header above the canvas and beneath the
application status strip, and `captureCrop` silently truncates that missing area at the viewport
edge. The record's claim that a doubled card cannot fit is false. In the same production scene the
2x card is about 724 by 564 CSS px while the canvas is about 1400 by 630 CSS px; anchoring the real
gesture on the callable field keeps the complete header-to-parameter composition inside the canvas.
This is a capture/walkthrough defect, not permission to reopen the accepted product architecture or
invent another visual treatment.

Replace the rejected evidence in one bounded correction:

- `zoomCanvasOnCallableCard` must use the centre of the documented section-field surface as the
  ctrl-wheel gesture point. It may move the pointer over the settled card afterward for the existing
  hovered compositing assertion, but it must not change how the product itself zooms.
- After the gesture settles, the production walkthrough and capture harness must assert that the
  complete Square Root section rectangle is inside the workspace canvas rectangle. A small
  tolerance may cover the section's selection stroke; clipping the header or parameter area is a
  failure. Continue proving the measured 2x growth and settled unpromoted compositor values.
- Immediately before each appearance's enlarged-state sequence, reload the production page and
  wait for the shipped canonical `math.sqrt` scene. Capture the whole section plus the existing
  margin; do not clamp an out-of-bounds element into a plausible partial image.
- Render all fourteen images from the resulting immutable implementation commit, commit the
  evidence separately, and replace the README's clamping claim with the full-card invariant. The
  light and dark enlarged idle and focused images must contain the section header, full
  syntax-highlighted canonical `math.sqrt`, complete Args row, and complete `x` row. The completion
  images must contain the section header, the syntax-highlighted `math.sq` draft used by this
  workflow, the visible Args label, the complete `x` row, and the unclipped popup; the popup may
  cover the Filter control it geometrically overlaps.

No other donor audit, product behavior, package API, CSS treatment, backend path, dependency, debug
script, compatibility path, migration, or transitional code belongs in this correction. Run the
production walkthrough and the frozen recommended profile, then start a fresh read-only Opus review
against the exact corrected candidate. The supervisor must inspect the replacement images at full
resolution before presenting them for developer acceptance.

**Zoom-evidence correction record.** The rejected defect is in the harness and it is fixed there.
`zoomCanvasOnCallableCard` anchors its ctrl-wheel gesture on the centre of the documented
`data-workspace-section-field` surface rather than on the section's own centre. The scene zoom holds
the point under the cursor fixed, so the anchor is what decides where the enlarged card lands; the
field is the card's primary control and sits near its top, so the doubled composition stays inside
the canvas instead of riding up under the application's status strip. How the product zooms is
untouched — the same real ctrl-wheel event at the same delta, with the pointer still left resting on
the settled card for the existing hovered compositing assertion.

Containment is asserted now rather than assumed. The settled-state read carries the workspace
canvas's own accessible region box beside the card's, and `assertSettledCardIsInsideCanvas` fails
when the card reaches outside it by more than the 2 CSS px its selection stroke needs. The production
walkthrough asserts it on the settled zoomed card and again after the zoomed edit round trip; the
capture harness asserts it on the idle and focused zoomed states before it photographs either. The
measured 2x growth and the settled unpromoted compositor values are unchanged and still proved.

The capture harness can no longer file a plausible partial image. `captureCrop` takes the elements a
state has to show, unions their boxes with the existing 8 CSS px margin, and refuses — naming each
edge and its overflow — when that box reaches outside the 1440x900 viewport, where it previously
clamped the crop to the viewport edge and recorded whatever was left. The completion state passes the
popup beside the card, so that image holds the whole list rather than the part of it the card's own
box happens to cover. Each appearance's enlarged sequence starts from a fresh production page load
and the shipped canonical `math.sqrt` scene, because where the gesture lands depends on where the
card is when it arrives.

Verification for this batch: `code-policy check` over the changed files reports only the
`quality.deadCode` finding on `apps/python-canvas/vitest.setup.ts` this plan already reports, over a
file this batch does not touch; the `quality.format` finding on the harness file this batch edits was
cleared with the policy-owned formatter. This task worktree started without installed dependencies,
and a `check` run in that state also reports the `name` class members of
`apps/python-canvas/src/backend/client.ts` and `runtimeContract.ts` as dead; those two are artefacts
of Knip resolving an uninstalled tree and are gone once `pnpm install --frozen-lockfile` has run.
`code-policy test --changed --base c5c494fba`
passes, and the authorized `code-policy test --recommended --base c5c494fba` passes both suites it
selects: the Python Canvas frontend focused suite (42 tests) and the production browser walkthrough
against the production builds, the real Go service, pinned Basedpyright, and headless Chrome at
1440x900 device scale 1. One negative control binds this fix: restoring the section-centre anchor
fails the walkthrough with _The zoomed Square Root card reaches outside the workspace canvas by 37
CSS px at its top, so the complete card is not on screen to capture_ — the exact clipping the
supervisor rejected the images for.

**Unclipped enlarged capture record.** All fourteen captures are committed at
`docs/evidence/python-canvas-callable-presentation`, rendered from immutable source candidate
`e4108da66b80b98ac21d17fcfaca32fa7f8a83e6` and committed separately as decision 15 requires. The
bundle contains the Square Root card idle and focused, the Generated Python reader idle and
clicked, and the settled 2x card idle, focused, and with completion showing, in both appearances.

The supervisor corrects the evidence requirement above to distinguish canonical and completion
states. Idle and focused captures show the full syntax-highlighted canonical `math.sqrt` and the
complete Args row. Completion captures show the actual recorded workflow after entering
`math.sq`: the syntax-highlighted draft, visible `ARGS` label, complete `x` row, and whole two-option
popup. That popup overlaps the Filter control in this geometry. This is the expected captured state,
not a waiver or an unproved claim about every possible completion state.

The doubled card measures 724 by 564 CSS px and the canvas 1400 by 630 CSS px. Its header is 64.4
CSS px below the canvas top, and no header, field, toolbar, or parameter content is clipped. The
card's left border overhangs the canvas by the allowed 2 CSS px; each 740 by 580 crop remains wholly
inside the 1440x900 viewport and is not clamped. The completion popup is 500 CSS px wide and extends
58.4 CSS px past the field in dark appearance and 60.4 CSS px in light appearance. It is inside
neither the field nor the section. The settled card reports `will-change: auto`, `transform: none`,
`backface-visibility: visible`, and `isolation: auto` in every enlarged state.

The four Generated Python images and two dark 1x card images are byte-identical to the rejected
bundle. The light idle card differs in 28 sub-perceptual antialiasing pixels at a maximum
one-channel delta of 6: 24 on the callable pill's rounded border and 4 in the header. The light
focused card differs in 46 header pixels at a one-channel delta of 1. Recorded geometry,
typography, paint values, and composition are unchanged. The images and metrics still name the
immutable source candidate above; the record corrections require no recapture.

The supervisor inspected those fourteen images and a real main-branch scene at full resolution.
The developer then compared the live candidates directly. Candidate
`e5cb62bd8aa79c6fc77b59c4d685602089619615` is close in field and region paint, but it is rejected
as a product handoff: its filter-only toolbar omits main's working parameter authoring controls and
active shortcut label, and its generated document prevents every outer edit. Those are exactly the
two former exclusions this revision withdraws. The prior images remain historical rejected evidence
and must be recaptured after the behavior correction; they are not accepted regression locks.

What remains in this phase: implement the generic shortcut and protected-range semantics, the two
canonical Go mutation paths, and the Python Canvas item/editor reconciliation; run focused and
authorized recommended verification; recapture the affected complete states from an immutable
source commit; obtain a fresh read-only review; have the supervisor inspect the results and compare
the real interactions with main; obtain developer acceptance; and run the closing
`test --changed --base <trusted-base>` and `test-levels --base <trusted-base>` steps.

**Item-filter focus binding record.** The package half of this phase's fourth correction is
implemented: the generic shortcut exists, and the filter that answers to it advertises it. Nothing
in Python Canvas changed, because the app's move to `authoring-and-filter` needs the canonical
parameter-list mutation behind those actions and travels with it.

The donor was read at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` before editing, and each behavior
maps to one owner here. `focusOnSearch` (`state/actions/sections/sectionParamFilter.ts`) focuses
the Args filter of the sole active section, by `getActiveSectionUIIds().length === 1` and a
`document.getElementById` over that section's generated `-args-filter` id, with
`{ preventScroll: true }`; the built-in
`workspace.focus-item-filter` operation does exactly that, except that the mounted filter publishes
its own focus target instead of the dispatcher rebuilding a generated element id.
`items/itemFilterFocusRegistry.ts` holds those targets behind the same host-scoped `WeakMap` the
item list views already use, `WorkspaceItemFilterProvider` registers and withdraws one per section
while it is mounted, and a second owner for one section fails rather than silently deciding which
filter the chord reaches. `KwargsControls` (`useIsSolelySectionUIActive` plus
`shortcutPrettified(x.shortcuts.searchShortcut)`) gives the empty filter its own shortcut text;
`WorkspaceItemFilterControls` resolves the same string from the binding registry through the new
package-internal `getWorkspaceKeyBindingChordLabel`, so display and dispatch answer from one
registry and no literal chord exists in either package or app. Reading it at render is the pattern
the playground's own shortcut list already uses.

Two donor facts settle details this plan glossed. The reference's shipped `searchShortcut` really
is `"Mod + K"`, and its own `shortcutPrettified` writes that as **`⌘ + K`** on macOS — spaces and
all — which is byte-identical to what `formatWorkspaceChord` produces for the same parse. The
plan's `⌘K` spelling was therefore an approximation of the donor rather than the donor, and every
acceptance bullet above now names the donor's string. Second, the reference's `Mod + K` is one
shortcut with two jobs: the sole active section's Args filter, or, failing that, its application
header's project search. Only the first is a workspace surface, so the binding does that job and
otherwise declines, leaving the chord to the browser; the built-in binding list's comment records
that departure beside the reference chords it already names.

Nothing consumer-facing grows. `WorkspaceItemToolbarMode`, the registered `itemArea` shape, and
the package's exported key-binding surface are untouched — a host still rebinds or unbinds this
operation through the existing `registerWorkspaceKeyBindings`, and doing so moves the placeholder
as well as the chord. The filter's accessible name stays **Filter parameters**; the shortcut is a
placeholder, which is not a name. The package README carries the reciprocal paragraph where it
already documents that the filter follows the declared toolbar mode.

Proofs: a registry case pins the shipped `Mod + K` default, its `Ctrl + K` and `⌘ + K` labels, and
that the shipped defaults still carry no chord conflict; a second pins the one-binding label
resolver over bound, unbound, and unknown ids. Four `WorkspaceItemFilter` cases drive the real
dispatcher over a real keydown: the sole active section's empty filter reads `Ctrl + K` and reverts
to `Filter` while a query is present or its section is not solely active, a host rebinding and then
unbinding moves that text, the chord focuses the mounted filter and is declined — left to the
browser — both without exactly one active section and where the declared item area renders no
toolbar, and a second filter owner for one section is refused. The `filter-only` toolbar case
proves the same advertising filter surfaces in both rendering modes.
`WorkspaceItemFilterControls`'s four tone ternaries moved into a helper in the same edit, because
the added placeholder rule pushed the component past `quality.complexity`; the extraction is
behaviour-preserving.

Verification for this batch: the locked release's `code-policy` CLI ran `check` over the changed
files; its only finding is the `quality.deadCode` on `apps/python-canvas/vitest.setup.ts` this plan
already reports, over a file this batch does not touch. `code-policy test --changed --base a68d67851`
passes over its three focused suites, and the authorized
`code-policy test --recommended --base a68d67851` passes all five: workspace focused and component
(1193 tests across 143 files), playground focused and component (43), and Python Canvas frontend
(42). The workspace and playground TypeScript projects are clean and the packaged boundary check
passes over source and built artifacts. Two negative controls bind this fix: restoring the literal
`placeholder="Filter"` fails the two placeholder cases and the `filter-only` toolbar case with
_expected 'Ctrl + K' to be 'Filter'_, and dropping the provider's registration call fails the focus
case — the chord is declined and the filter never takes focus — as well as the second-owner case.

What this leaves in this phase, unchanged except for the shortcut half: Python Canvas's move to
`authoring-and-filter` with the canonical parameter-list mutation behind it, the protected-range
semantics with the canonical Python-target mutation, and then the recapture, read-only review,
supervisor inspection, developer acceptance, and closing Code Policy steps.

**Canonical parameter-list mutation record.** This phase's fifth correction is implemented for the
parameter list, and the app half of its fourth correction travels with it. The protected-range
semantics and the canonical Python-target mutation remain open: the target mutation has no reachable
caller until the generated document accepts an outer edit, so it belongs to that batch rather than
to this one.

The Go store no longer holds one fixed parameter pointer. `canonicalState` carries the callable's
complete ordered `[]parameterState`, the callable's own `ParameterIDs` and the
`nextParameterOrdinal` counter are gone, and a provider-derived record takes one stable slot ID, so
recommitting a callable replaces what that slot holds rather than making the row a different row. A
`ParameterV1` now says `nameEditable` outright, because only the app's own records may be renamed
and the client may not infer that from an ID, a blank name, or a list position. The narrow
`/api/v1/project/parameters/{id}` route is replaced — not supplemented — by `SetCallableParameters`
on `/api/v1/project/parameters`: one revision-bound request carrying the whole proposed list, so a
reorder, rename, value edit, insertion and deletion are the same transaction. The store validates
the entire candidate before any of it applies, keeps backend-owned metadata for a retained ID,
creates a new record's defaults for an unknown one, and refuses a stale revision with
`revision_conflict`. A blank authored name is legal at both boundaries, exactly as main's new kwarg
is, and the renderer omits an unnamed record from the generated call while the store keeps it, so
the row a person is filling in survives the round trip.

Python Canvas cuts over in the same batch. The workspace item tree **is** the canonical parameter
list — same IDs, same order — so `authoring-and-filter` gives the section main's real Add, Remove
Last, and Delete Selected, and the app's subscription proposes whatever list the package's own
funnels leave in the document. The card is no longer position-locked, because the package refuses
structural item authoring on a locked section. An authored row renders the package's own
`ItemNameEditor`; a signature-derived row keeps its static label. Ordinary edits write only item
data; a response that reshapes the list — a new signature, or a restore after a rejected proposal —
is rebuilt through the package's insertion and deletion funnels rather than by reloading the host.

Three defects were found by running the production walkthrough rather than by reading the diff, and
all three are fixed at their cause.

The first is a product defect this batch introduced. A structural action runs inside the package the
moment it is clicked, so a response could arrive for a list the document had already moved past, and
the reconcile then rebuilt the canonical list over it — a row added or deleted while Basedpyright
was checking simply vanished. `applyProjectSnapshotKeepingParameterList` is the answer: when the
document no longer holds the list a proposal was made from, the project's own data lands on the rows
that survive, the list itself is left alone, and the newer list is proposed in turn. The bulk
deletion in the walkthrough failed intermittently on exactly this, and a focused projection case now
pins it beside the existing rebuild case that proves the ordinary path still reconciles.

The second is in the shared browser harness. CodeMirror mounts a completion tooltip parked far above
the document and positions it on its next measure pass, so an offered completion is not evidence
that the popup has a place yet; at 2x zoom the park reads as a popup 19,998 CSS px above the field.
`readPlacedCallableCompletionPopup` waits for the popup to leave the park before the placement is
judged, and both the walkthrough and the capture harness read through it. A popup a section crops is
placed and then clipped, so it never parks, and this wait cannot hide the defect the assertion is
about.

The third is in this batch's own new assertion. `[aria-label$="selected"]` also matches
`not selected`, and the companion clause required no row in the document to be unselected, which the
signature-derived row can never satisfy. The claim is now read where the package states it — each
selectable row's own accessible name — as exactly two selected authored rows beside one unselected
provider row. The gesture also had to learn what the package does: inserting a row makes it the
section's selection, so the chord reaches the rows that still report themselves unselected, and it
fails rather than passing vacuously if there are none.

Two file extractions are forced by `quality.fileLength` and are behaviour-preserving. The
walkthrough reached 1089 lines against the shared 1000-line limit, so the argument-authoring proofs
moved to `browser-parameters.mjs` beside the existing `browser-page.mjs` and `browser-processes.mjs`,
leaving the walkthrough at 893. `.code-policy.json` is untouched. `parseApiErrorCode` was pushed
past `quality.complexity` by the two new codes and now decides membership from one declared list
instead of one branch per code, and `SetCallableParameters` was pushed past `quality.goComplexity`
and now judges the whole request through `resolveProposedParametersLocked`, the same shape
`CommitCallable` already uses.

Verification for this batch: `code-policy check` over the worktree reports only the
`quality.deadCode` finding on `apps/python-canvas/vitest.setup.ts` this plan already reports, over a
file this batch does not touch; the `quality.complexity`, `quality.goComplexity`, and
`quality.format` findings on files this batch edits were fixed rather than reported.
`code-policy test --changed --base 1c5d84bbb` passes, `test-levels` reports a five-suite recommended
and an eleven-suite full ordinary choice, and the authorized
`code-policy test --recommended --base 1c5d84bbb` passes all five: the Python Canvas backend focused
suite, the frontend focused suite (50 tests), contract drift, the cross-language boundary (10), and
the production browser walkthrough against the production builds, the real Go service, pinned
Basedpyright, and headless Chrome at 1440x900 device scale 1. The walkthrough passed three
consecutive times after the in-flight fix, and the Python Canvas TypeScript project is clean. Two
negative controls bind this batch: restoring the `filter-only` toolbar fails the walkthrough with
_The Args toolbar rendered in "filter-only" instead of authoring-and-filter_, and restoring the
section's position lock fails it with _Tab from the callable editor reached "Filter parameters"
instead of the Args toolbar's Remove last parameter_ — the package withholds every structural
control from a locked card.

What remains in this phase: the generated document's protected-range semantics with the canonical
Python-target mutation; then the recapture from an immutable source candidate, the read-only review,
the supervisor's inspection, developer visual acceptance with its accepted-candidate record, and the
closing `test --changed --base <trusted-base>` and `test-levels --base <trusted-base>` steps.

**Parameter-name rule record.** The independent review of the preceding batch found that neither
boundary carried main's parameter-name uniqueness rule, and that the app answered an unusable name
by proposing it and then restoring the whole list over what someone was still typing. Both are
corrected where they belong, and main's own rule is what each boundary applies.

The store no longer accepts a candidate that names one argument twice. `buildProposedParameters`
judges the complete list once every record is resolved, and two records claiming one non-empty name
are `ErrParameterNameInvalid` — the same typed refusal an unusable name already receives. That
covers the quiet half of the defect as well as the loud one: two rows named `scale` rendered
`math.sqrt(..., scale=..., scale=...)`, which Python refuses to parse, so the whole generated
document and every mapped diagnostic went with it; an authored row named `x` instead rendered one
generated path for two records, so one assignment silently overwrote the other and the call passed
multiple values for `x`. Two adjacent gaps in the same validator close with it. The proposed list is
now bounded like every other input this store accepts rather than by the transport that happens to
carry it, and a retained record's `Default` pointer is copied out of live canonical state, so a
candidate never shares it with the state it may replace.

The client applies that rule before it proposes anything, which is what main's `ParamNameInput`
does. `sections/parameterNames.ts` owns it once: an authored record may stay blank, a present name
must be a non-keyword Python identifier, and no two records under this callable may claim one name
— the reference's `validateParamNameInput` and `getParamNameDuplicateError` with its own message
strings. The row shows its own message through the package's existing `ItemNameEditor`
`errorMessage`, which is where the reference's bubble reports it, and `proposedParameterList`
proposes nothing at all while any row's name is blocking, so the typed text stays in the document
instead of being answered by a 422 and a rebuild. One consequence follows from this plan's own
one-atomic-mutation contract and is deliberate: the mutation is the whole ordered candidate, so an
unusable name holds the whole list back, including another row's value edit, until it is usable.
The rows say which name that is; the reference's per-parameter route has nothing equivalent to say.

The keyword list is generated rather than copied. `codegen.PythonKeywords` is the one owner of that
lexical rule and the contract generator renders it into `generatedContract.ts` as
`PYTHON_KEYWORDS_V1`, so the client cannot drift from the store about which names exist; the
identifier rule itself is one expression on each side over the same Unicode letter and decimal-digit
categories. It joins the existing client contract, so no new generated artifact and no
`.code-policy.json` change belongs to this batch.

Every one of the review's recommendations is applied; the two the paragraph above already names are
the store's list bound and its retained-record pointer copy. Three more belong to the frontend and
the walkthrough. `acceptParameterListResponse` compared the response against what the document would
_propose_, and
every row this response answers for is still disabled at that point, so its `moved` test could never
be false: the keeping projection was the only reachable path and every successful mutation armed one
more debounce cycle that resolved to nothing. It now compares against the document's own list, and
the discriminator means what it says. The walkthrough's nameless-record guard asserted on a string
the renderer cannot produce; it now asserts that the module the added blank record produced is
byte-identical to the one before it. And the reprojection queue no longer falls through to
fabricating a fresh `parameter:authored:<uuid>` row that the subscription would then propose as a
new parameter: an entry exists for exactly as long as one reprojection is inserting, and a factory
call the reprojection did not queue fails loudly. That guard is unreachable from outside the module,
so it is deliberately left without a case of its own rather than reached by breaking the
projection's encapsulation. The last recommendation is a record correction: the earlier extraction
left `vertical-slice.browser.mjs` at 893 lines, not the 897 the record claimed, and that record now
says so.

Proofs: eight `parameterNames` cases pin the blank record, the accepted names, a name that is not an
identifier, every word the generated keyword list carries, a repeated authored name, an authored
name the resolved signature already claims, the store's own trimming, and the reference's ordering
of the name's problem before the list's. Two `CallableSection` cases prove an unusable name is
reported on its own row through the package's name editor while the row keeps what was typed and the
section raises no alert, and that a duplicate is reported on the row that can change it rather than
on the signature-derived one. A `PythonCanvasApp` case drives the controller's own coalescing window
over three complete lists: a keyword name proposes nothing, a signature collision proposes nothing,
and the same list with a usable name is proposed whole. Three store cases join the existing
invalid-list table. In the production walkthrough the authored row is renamed to the signature's own
`x`: the row reports `Param name "x" already exists under this parent.` through its accessible
`aria-invalid`/`aria-describedby` wiring, the canonical revision and generated module are unchanged
well past the window every other step here completes inside, the row still holds the refused name,
and writing a usable name again releases the same list.

Verification for this batch: `code-policy check` over the fourteen changed files reports only the
`quality.deadCode` finding on `apps/python-canvas/vitest.setup.ts` this plan already reports, over a
file this batch does not touch; a `quality.deadCode` finding on this batch's own new module and
three `quality.format` findings on files it edits were fixed rather than reported.
`code-policy test --changed --base 28492989d` passes, `test-levels` reports a five-suite recommended
and an eleven-suite full ordinary choice, and the authorized
`code-policy test --recommended --base 28492989d` passes all five: the Python Canvas backend focused
suite, the frontend focused suite (61 tests across 8 files), contract drift, the cross-language
boundary (10), and the production browser walkthrough against the production builds, the real Go
service, pinned Basedpyright, and headless Chrome at 1440x900 device scale 1. The Python Canvas
TypeScript project is clean. Four negative controls bind this batch: removing the store's uniqueness
rule publishes the duplicate candidate rather than refusing it and fails both new store cases;
removing the store's list bound fails the third; removing the client's guard fails the controller
case with _expected "vi.fn()" to not be called at all, but actually been called 1 times_; and
removing that same guard
fails the production walkthrough with _the authored row still holding the refused name did not occur
within 30 seconds_ — the store refuses the proposal, and the restore answering it takes the typed
name out of the row, which is the exact defect the review reported.

What remains in this phase is unchanged: the generated document's protected-range semantics with the
canonical Python-target mutation; then the recapture from an immutable source candidate, the
read-only review, the supervisor's inspection, developer visual acceptance with its
accepted-candidate record, and the closing `test --changed --base <trusted-base>` and
`test-levels --base <trusted-base>` steps.

**Protected generated-document and Python-target record.** The remaining repository cutover is
implemented directly. The package's sole `generated-document` presentation now carries one required
protected region inside an otherwise editable CodeMirror document. One transaction filter rejects
changes that touch the region, maps the region through accepted prefix and suffix edits, and reports
the next text and mapped region together. Undo and redo use that same mapping. A locked section
remains completely read-only. The existing line-scoped rail, blue block, partial separator
boundaries, and centered badge paint only the protected region; authored lines and unused section
height stay on the ordinary editor surface.

The Go project now owns a canonical Python target with prefix and suffix around its generated body.
`/api/v1/project/target` accepts one complete revision-bound target mutation, validates the whole
candidate before publishing it, and never accepts generated bytes from the client. The generated
TypeScript contract, frontend client, workspace projection, and controller cut over together. A
response always supplies the latest canonical generated body while preserving only authored
prefix/suffix that moved beyond the request it answers, so concurrent parameter and target responses
cannot restore stale generated code.

The production walkthrough proves whole-document replacement, forward deletion at the prefix
boundary, and backward deletion at the suffix boundary are refused without a backend revision. It
then authors `import os` above and `print(state.Square_Root)` below the protected body, proves the
canonical composition and persistence, drives undo and redo, reloads the production page, and finds
both authored regions around the same protected body. That reload exposed a package startup defect:
the canvas relied on ResizeObserver's initial notification and could remain at 0 by 0 even though
its mounted wrapper was already measurable. The canvas now measures once in a layout effect before
observing later resizes; a focused package test proves layout without any observer callback.

Verification after that correction: the focused canvas test passes (4 cases), the controller,
projection, and client tests pass (27 cases), the production headless-Chrome walkthrough passes
against fresh package/application builds and the real Go service, and
`code-policy test --changed --base 7a60d5c79` passes all four impacted focused suites. The policy
check's only remaining finding is the already-recorded Knip entry-point false positive for the live
`apps/python-canvas/vitest.setup.ts`; format and type findings in the new canvas regression were
fixed. Temporary browser and runtime probes used to isolate the reload defect were removed.

**Authoring-toolbar and protected-document capture record.** The capture this phase owed is taken.
All fourteen images at `docs/evidence/python-canvas-callable-presentation` are rerun from the
immutable source candidate `be6632ea5f7554e4e9e8051bf0def6985cfb92c6` and committed separately from
it, as decision 15 requires. The set is the one the supervisor's corrections fixed — the complete
Square Root card idle and focused, the Generated Python reader idle and clicked, and the settled 2x
card idle, focused, and with completion showing, in both appearances, each with eight CSS px of
surrounding surface — and the harness again asserted every donor geometry, typography,
generated-region, and interaction value it owns while it recorded, so a capture of a surface that
has drifted in one of those values cannot be filed. Which values those are, and which belong to the
production walkthrough instead, is stated in the record below. It still waits for the canonical
first render and performs no setup mutation of its own.

These images show the two behaviors the developer rejected candidate
`e5cb62bd8aa79c6fc77b59c4d685602089619615` for. The Args
surface is the package's `authoring-and-filter` toolbar, so the card carries main's remove-last,
add, and delete-selected controls beside the `ARGS` label rather than a filter alone; the idle card
reads `Filter` and the focused card, where entering the callable field makes Square Root the sole
active section, reads the resolved `⌘ + K` of the built-in `workspace.focus-item-filter` binding.
The generated document reports `contenteditable="true"` with no `aria-readonly`, and the clicked
captures land the caret and active line at the end of the authored suffix on line 7 while the block
above keeps its region, rail, badge, and bytes unchanged from the idle capture. The two values the
rejected bundle recorded for a whole-document reader — `hasCaretLayer` and `hasActiveLine` — are
replaced by `caretInsideBlock`, which is `false` in every generated capture, because the question is
no longer whether the surface has a caret but whether one can rest inside the protected range.

Every donor value the bundle is judged on is unchanged. In the light idle card the header's bottom
and the field's top are the same 234.39 CSS px and the field's bottom and the Args toolbar's top are
the same 260.39, so both donor steps measure zero; the first parameter row follows the toolbar by
the item list's own 8.5 CSS px, and the app's content root and the package's content slot both
report `0px` padding. In the light idle generated capture the block is one run of `start`, three
`middle`, and `end` marks over the five lines between the authored prefix and suffix, its text
claims neither `import math` nor `state = SettaState()`, and it ends 276.9 CSS px above the fixed
390px section's own bottom while the wrapper's own `background-image` is `none`. The doubled card
measures 724 by 564 CSS px in a 1400 by 630 CSS px canvas, clears the canvas top by 65.4 CSS px with
nothing clipped, and reports `will-change: auto`, `transform: none`, `backface-visibility: visible`,
and `isolation: auto` in every enlarged state; the completion popup is 500 CSS px wide, reaches 60.4
CSS px past the field in light appearance and 58.4 in dark, is inside neither the field nor the
section, and is what the page hit-tests at both recorded points.

One recorded difference is not a presentation change and is stated rather than glossed: every scene
rectangle sits exactly one CSS px further right and down than in the superseded bundle rendered from
`e4108da66b80b98ac21d17fcfaca32fa7f8a83e6`, while the workspace canvas's own rectangle is identical. The initial fit's inputs are the section bounds,
which this candidate does not move, and the canvas size at the moment it runs, which this candidate
now takes from a layout-effect measurement instead of the ResizeObserver's first delivery — the
canvas-startup fix the preceding batch made for the reload defect. Every donor value above is a
relationship between recorded rectangles, so the one-pixel translation leaves all of them
unchanged, and the card's own left border consequently overhangs the canvas by 1 CSS px rather than
2, still inside the harness's selection-stroke tolerance. The evidence README is rewritten for this
bundle: the Args row it describes now includes the authoring controls and the advertised binding,
the generated paragraph describes an authored document around a protected block instead of a
non-editable reader, and the two enlarged measurements above replace their stale values. This is
unaccepted working evidence, not a regression lock.

Verification for this batch: the production browser walkthrough passes against the production
builds, the real Go service, pinned Basedpyright, and headless Chrome at 1440x900 device scale 1, so
the source candidate these images name is green before it is photographed. The capture itself is the
batch's other proof: it asserts all fourteen states' donor values as it records them, and it refuses
to run at all against a modified tracked tree, so the recorded `sourceCommit` is checkable.
`code-policy check` over this batch's seventeen changed files completes without findings; the
`quality.deadCode` finding on `apps/python-canvas/vitest.setup.ts` this plan already reports is not
raised here because no file this batch touches reaches it. Run against the same base,
`code-policy test --changed` matches no suite, which is the honest result for a batch that changes
only recorded evidence and this plan: no source, test, dependency, or Code Policy configuration file
is in it.

**Bundle prose coherence record.** The hand-written README the supervisor judges these images
against is corrected where it still spoke for an older rejection, and the README stops restating
the numbers the metrics file already owns.

`docs/evidence/python-canvas-callable-presentation/README.md` used "the previous candidate" for the
blurred settled zoom and the section-clipped completion popup. Those are the defects candidate
`838ad70b9116e0e9bb54993836cd4a38401f4773` was rejected for and candidate
`e5cb62bd8aa79c6fc77b59c4d685602089619615` already corrected, while the record above used the same
phrase for `e5cb62bd8`'s own rejection — the filter-only toolbar and the wholly non-editable
generated document. Read together, the bundle offered its enlarged crops as the answer to the most
recent rejection, which this plan's history contradicts. The enlarged paragraph now names the older
rejection it answers and says the source candidate already corrects both of those defects, and it
points at the authoring-toolbar and generated-document paragraphs as the behaviors this bundle
exists to show. The record above names `e5cb62bd8` outright instead of "the previous candidate", so
one rejection history is stated across both documents.

The README also restated measurements the metrics file records, and the two transcriptions had
already drifted in form: the enlarged card's clearance read "65 CSS px" there against "65.4" here,
and the popup's overhang "roughly 60 CSS px" against "60.4 in light and 58.4 in dark". Both were
within rounding of `computed/presentation-metrics.json`, and both had to be re-transcribed in two
prose documents after every rerun. The README now names the metric and leaves the number in the
JSON: the enlarged paragraph points at each capture's recorded zoom factor, card box, and canvas
box; the completion paragraph at the popup's own box against the field's and the two options it
offers; and the generated paragraph at the block's bottom against the document's content bottom.
What each image has to show is stated as a relationship a reader can see in it. Donor targets the
harness asserts against — the zero-pixel composition steps, the item list's own step, the pill's
radius and margins, the fixed 390px section — stay written out, because those are the contract
rather than one run's observation. This is what replaces the enlarged measurements the preceding
batch wrote into that prose.

One sentence was wrong rather than stale: the completion paragraph said the popup "geometrically
covers the filter", and in the recorded 07 and 14 crops it covers the three authoring controls
beside it as well. It now says so. Every state those two images are required to show — the header,
the `math.sq` draft, the `ARGS` label, the complete `x` row, and the unclipped popup — is present.

What the capture asserts is stated more exactly than "every donor value". While it records, it
asserts the callable field's donor surface and its idle-to-focused type and box parity, the card's
four composition steps with the field's symmetric inset and the app's zero content padding, the
generated region's paint, badge placement, per-line marks, bounds against the authored prefix and
suffix, and editable-document reads, the settled card's compositing and its place inside the canvas,
the completion popup's escape from the field and the section with its hit tests, and the rule that
no crop is ever clamped. It does not assert the Args toolbar's mode, its three authoring controls,
or the placeholder its filter advertises; only the toolbar's box reaches the metrics file. The
production walkthrough owns those: it requires `authoring-and-filter`, the `ARGS` label, the
remove-last, add, and delete-selected control set with no pin or edge control beside them, the empty
filter of the sole active section advertising this platform's chord without replacing its
`Filter parameters` accessible name, and that chord moving focus into it. A regression to the
rejected filter-only toolbar therefore fails the walkthrough rather than the capture, and the record
above is narrowed to say so instead of implying the images are themselves that guard.

The capture intentionally does not duplicate the production walkthrough's interaction assertions.
The metrics file owns visual geometry and paint; the walkthrough owns the toolbar mode, its exact
control set, the advertised shortcut, and the shortcut's focus behavior. Recording those same
interaction facts in both places would create two acceptance owners without proving a new product
behavior, so that proposed harness expansion is dropped from this plan and is not a Phase B
completion requirement.

Three stale source comments identified during review are also dropped from this plan: one describes
the former caret probe, and two use an ambiguous "previous candidate" phrase. They do not affect
runtime behavior, the public contract, the recorded metrics, or the screenshots. Changing the
immutable source candidate solely to rewrite those comments would force a no-value recapture.
Comment cleanup can be considered with a later substantive source change; it is not scheduled work
or a completion gate here. This batch touches no tracked source file, so the bundle still names a
commit whose source tree the working tree matches.

Verification for this batch: `code-policy check --git-changes` over the two changed documents
completes without findings, and `code-policy test --changed --base e739b8fda` matches no suite,
which is the honest result for a batch that changes only the evidence bundle's prose and this plan.
The images, the metrics file, and the source candidate they name are untouched, so this batch owes
no recapture.

**Settled-field harness and generated-document history record.** Two corrections the final review of
the source candidate produced, in the order they were made.

The production walkthrough failed intermittently at `enterCallableField` with "the idle callable
field has no visible box on the page", always on the draft replacement that follows the
keyboard-order and generated-document steps. Instrumenting the page showed the idle layer was absent
rather than unsized: leaving a live editor swaps the idle layer back from a zero-delay timer instead
of during the blur, which is main's own `TextInputCodeMirror` lifecycle at `043d3b2e9`, and that
teardown landed 2 ms after the blur on passing runs and 42 ms after it on the failing one, so the
click arrived while the blurred live layer was the only layer mounted. The lifecycle is main's and
stays; what was wrong was the harness's model of an enterable field, which waited for either layer
to be enabled and then required the idle one. `waitForEnabledCallableField` therefore became
`waitForIdleCallableField` and waits for the surface its callers name — every caller already demanded
that layer in its next statement — which also sharpens the keyboard-order proof, since it now tabs
into a genuinely idle field. `elementCenter` now reports a selector that matches nothing separately
from an element the page paints no box for, because reading the first as the second is what made a
settling field read as a paint defect. Commit `2ce28a317`.

The second correction is a defect in the package's generated document, found by tracing the
controlled seam rather than by a failing run. `@uiw/react-codemirror` replaces the whole document
whenever the value it renders with stops matching the doc, which is how every canonical regeneration
arrives, and that replacement was recorded in CodeMirror's undo history like any authored edit.
History pops its own transactions with `filter: false` — its deliberate exemption from
`transactionFilter`, since a recorded event has to be replayable — so `readOnlyGeneratedRange`'s
refusal never saw it. One Undo therefore put the superseded generated body straight back over the
protected bytes; the region field, which maps user transactions, mapped the range through a
replacement of the entire document and came out inverted, at the document's end and 0, which
silently disabled the block's paint, its cursor skip, and its refusal together; and the write-back
that followed was rejected by the section's own region parser, so the project kept the canonical
module while the editor showed a superseded one. History also joins adjacent changes into one event,
so a prefix edit made just before a regeneration was not even a separate undo step: taking the
authored line back took the generated body with it.

The fix is one transaction contract in `sectionEditorExtensions.ts`: an `EditorState.transactionExtender`
annotates every document change carrying no `Transaction.userEvent` with `addToHistory: false`. That
is the same user/host distinction the protected range already refuses and maps by, so the editor has
one answer to who made a change rather than two, and it is what CodeMirror already defines for a
change the editor did not originate — history maps whatever prior events remain meaningful through
the host's write instead of recording it, and stays active for edits authored afterward. A complete
host replacement is the boundary for older events it makes obsolete; it cannot itself become an
Undo step that replaces canonical bytes. Nothing identifies the generated body by substring, no
Python or application vocabulary enters the package, and no history is reset.

Three cases in `WorkspaceCodeSectionBody.test.tsx` hold it, all against the section body rather than
the extension in isolation: a host regeneration followed by Undo leaves the regenerated document,
the declared region, the block's per-line marks, and the range's refusal intact; an authored prefix
edit made immediately before a regeneration cannot take the generated body back with it; and the
control, which proves those two are a statement about whose changes enter history rather than an
editor whose history stopped working — the same keypress still undoes and redoes an edit authored
after the regeneration, with the region mapping both ways. All three fail on the pre-fix editor with
the document reverting to the superseded body, and the control fails as well against a candidate
that switched history off, reset it, or refused Undo outright.

`apps/python-canvas/README.md` still described the whole Generated Python section as read-only and
listed editable prefix/suffix and mixed editable/protected regions among the capabilities this slice
deliberately does not provide, which the shipped one-document contract contradicts on both counts.
It now states that contract — app-authored Python before and after one declared protected region,
authored edits reaching Go as one complete revision-bound target, each response writing the
generated body back between the regions being authored — and its walkthrough paragraph gains the
authoring step the walkthrough ends with. Prefix/suffix completion, parameter completion, and
broader semantic-editor services stay deferred, and no unimplemented capability is promised.

Verification for this batch: the focused package suite passes (20 cases, including the three new
ones), the complete `@setta/workspace` suite passes (1201 cases across 143 files), and
`code-policy test --changed --base 2ce28a317` passes its three impacted suites without findings.
`code-policy format --git-changes` passes and the package TypeScript project is clean.
`code-policy check --git-changes` raises only the Knip entry-point false positive for the live
`apps/python-canvas/vitest.setup.ts` that this plan already records. The production browser suite
also passes through the locked Code Policy release against fresh production builds, its bundled Go
toolchain, the real service, pinned Basedpyright, and headless Chrome. Its undo and redo over the
authored suffix retain the protected body and its canonical persistence.

This batch changes tracked source, so the capture bundle no longer names the commit its working
tree matches and the fourteen images owe a rerun from the final source candidate, as decision 15
requires. Nothing here changes what they have to show: the generated block's geometry, paint,
badge, marks, and editable-document reads are untouched, and the corrected behavior is one that
only a keypress reaches.

**Final source-candidate capture and supervisor inspection.** The complete fourteen-image bundle is
recaptured from immutable source candidate `97828f51fa7836146df821e18291f19db1a4e1f3` and its metrics
name that exact commit. Ten images are byte-identical to the preceding bundle. Four PNGs differ only
in settled browser rasterization: the light and dark 1x idle cards and the dark 2x focused and
completion cards. Every recorded geometry, typography, paint, composition, zoom, containment, and
compositing value is unchanged.

The supervisor inspected all fourteen replacements at original resolution and compared the current
main reference captures again. The Callable card keeps the donor's continuous header, field, Args,
and parameter composition; idle and focused field geometry and type stay fixed; Python highlighting,
the three authoring controls, and the resolved `⌘ + K` label are present; the enlarged text, icons,
and borders are crisp; and the completion popup is whole and outside the section. Generated Python
keeps authored lines 1 and 7 on the ordinary editor surface, paints only the separator-bounded body
region with its rail and centered badge, and places the clicked caret on editable line 7 without an
inner outline or a full-height black line. There are no actionable visual-polish or layout findings.
This is supervisor approval of the evidence for developer review, not developer acceptance.

**Final read-only review correction.** The immutable exact-range review found no source defect and
confirmed the previous undo-history and evidence findings are resolved. It caught one stale phrase
in `apps/python-canvas/README.md`: the deferred list still named arbitrary statement insertion even
though authored Python before and after the protected body is now part of the shipped contract. The
phrase is removed. The review's other observations are non-blocking recommendations outside this
plan and are not expanded into new work.

**Final read-only re-review.** A fresh Opus 5 xhigh reviewer inspected only the correction and its
record, made no repository-contract or requested-outcome finding, and approved it. Its sole
non-blocking observation was that the later documentation commits do not change what the capture
bundle shows; the bundle remains deliberately bound to immutable source candidate
`97828f51fa7836146df821e18291f19db1a4e1f3`.

**Developer live-review correction — pending-state ownership.** Live comparison exposed the app's
gray pending dot inside the callable field whenever _any_ project mutation reached Go, including a
parameter or authored-Python update. That custom cue was not main's field-specific right indicator:
main reserves that surface for a local callable draft, callable failure, or that field's own LSP
wait. Python Canvas had projected one app-global mutation state into every section control and then
decorated the callable field alone.

The direct correction removes the callable adornment and its animation/forced-colour CSS, replaces
the section context's descriptive string with the boolean its controls actually need while a
canonical mutation is in flight, and makes the existing app-level live status display the precise
pending description. There is one status owner and no duplicate hidden announcement. The running
backend's Basedpyright provider remains `available` and `ready`; callable completion, signature
projection, generated-source diagnostics, and all backend/LSP contracts are unchanged. This
supersedes the earlier forced-colour treatment of the dot because that field cue no longer exists.

**Developer acceptance.** On 2026-08-20 the developer exercised Python Canvas and main side by side,
reported that the corrected callable workflow looked and functioned well, and identified the gray
pending dot as the sole remaining defect. After the direct pending-owner correction above was live,
the developer accepted the slice and asked for both applications to stop. Python Canvas and main
then shut down cleanly; their frontend and backend ports are no longer listening.

**Accepted-candidate closeout.** `code-policy test --changed --base
a68d678515b11bbdca6badc3c9fe7a511cb2b124` passed the four changed suites: workspace focused,
playground focused, Python Canvas backend focused, and Python Canvas frontend focused. The nine-suite
recommended profile had passed before the final pending-owner correction, and Code Policy then
selected and passed both suites affected by that correction: Python Canvas frontend focused and the
production browser walkthrough. `code-policy test-levels` recommends the full eleven-suite profile
because the complete plan spans 71 governed paths; that broader optional pre-merge run was not
authorized and is not part of this plan's closing requirement.

A fresh read-only Opus 5 xhigh review inspected the exact source range
`d66531562be50703e6606a321ad4a32286a63586..c18baf47bb6333fe3a06712a5469958612e1e726`
plus the developer-acceptance record. It approved with empty repository-contract and
requested-outcome finding sets. Its non-blocking observations do not reopen this accepted slice.

## Stop conditions

Stop and request a scope decision if:

- a faithful callable-first order requires selecting a package-private class, reparenting private
  DOM, or duplicating the item filter/provider outside `@setta/workspace`;
- the section-field surface cannot reuse the sole existing editor lifecycle and completion adapter;
- a public workspace type would need Python, callable, Basedpyright, LSP, HTTP, application error,
  or generated-contract vocabulary;
- real Add/Remove/Delete, rename/value, reorder, or outer-code editing cannot be represented as one
  validated backend candidate without frontend-only semantic state;
- the correction expands beyond the closed leading-content and toolbar-mode seams into a general
  layout/plugin framework;
- the real completion, commit, parameter, code-generation, or diagnostics walkthrough regresses;
- protecting the one generated range requires multiple/arbitrary region infrastructure or
  Python/code-generation vocabulary in the package;
- matching the requested toolbar requires adding pin, edge, port, or graph semantics to this slice
  rather than using the existing generic item actions;
- live developer evidence rejects the corrected states and fixing them would materially change the
  agreed generic boundary; or
- Code Policy cannot own or verify the exact files without a protected configuration change.

The plan is complete when both phase markers are checked, the direct public cutovers contain no
legacy or transitional surface, the established production walkthrough remains green, headless
evidence proves the exact idle/focused/clicked states, the supervisor has inspected the captures,
and the developer accepts the donor-matched complete Callable composition, working authoring/filter
toolbar, and one protected generated region surrounded by persistently editable Python.

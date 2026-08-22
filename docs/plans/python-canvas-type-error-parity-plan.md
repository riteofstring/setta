# Python Canvas Type-Error Parity Plan

## Status and purpose

**Status: Implemented and verified.**

Complete the narrow type-error workflow in Python Canvas. Basedpyright already runs in the Go
backend, diagnostics already travel in the canonical project snapshot, and parameter-expression
errors already reach workspace item rows. This plan closes the visible gaps without expanding the
first vertical slice into a general semantic-editor platform.

Current main at `043d3b2e9c69caf99d1246f1408b3ad7194b7864` is the behavior and visual
reference. The required donor sources are:

- `internal/codegen/python_diagnostics.go` and its tests for semantic diagnostic classification;
- `frontend/src/state/actions/typeCheck.ts` and `lspDiagnostics.ts` for replacement and clearing;
- `frontend/src/components/Section/SectionParts/Search.tsx` for callable-field error treatment;
- `frontend/src/components/Params/ParamSwitch.tsx` and `ParamContainer.tsx` for parameter errors;
- `frontend/src/components/Utils/CodeMirror/lspDiagnostics.ts` and the generated-Python branch of
  `CodeArea.tsx` for unmatched document diagnostics.

Use those checked-in contracts, not remembered behavior and not the rejected early Python Canvas
UI. Main is a donor rather than a module to import.

## Fixed scope

This plan implements exactly these outcomes:

1. A missing required provider-derived argument is shown on that parameter row. The initial
   committed `math.sqrt` example therefore marks `x` as missing instead of blaming the callable or
   silently dropping Basedpyright's call issue.
2. A diagnostic mapped to the callable is shown on the callable field with main's red error
   treatment and a compact field-local error indicator that exposes the complete message.
3. A diagnostic that cannot be mapped to the callable or a parameter remains attached to its exact
   Generated Python document range and is rendered by the built-in workspace Code section. This is
   how authored prefix and suffix errors remain visible.
4. A mapped diagnostic appears in its semantic control only. It is not duplicated as an inline
   generated-document diagnostic.
5. Every new canonical snapshot replaces the preceding diagnostic set. Accepted local outer-code
   edits and a stale canonical response clear diagnostics whose ranges no longer describe the
   displayed document; no code guesses how to shift a provider range across different text.

The following remain out of scope:

- prefix, suffix, parameter, or additional callable completion;
- references between sections or variables, dependency ordering, rename refactors, or graph UI;
- diagnostic suppression, ignore menus, muting, persistence, or manual type-check commands;
- hover, code actions, quick fixes, semantic tokens, or a general LSP service abstraction;
- more section types, multiple generated regions, ports, edges, MCP, or CLI surfaces; and
- backward compatibility, legacy shapes, migrations, aliases, dual readers, feature flags, or
  transitional code.

Do not turn those exclusions into edge-case audits. Implement and prove the concrete workflows in
this plan, then stop.

## Ownership and design

### Go and transport own diagnostic truth

The Basedpyright session remains the only provider. Extend its parsed diagnostic boundary to retain
the provider's diagnostic code in addition to the already normalized byte range, severity, and
message. Parse that external value once; project code receives a validated internal value and does
not inspect raw JSON.

Replace the current target-only `DiagnosticV1` shape directly. One diagnostic record must carry:

- a stable ID;
- severity and nonblank message;
- its exact half-open UTF-8 byte range in `generatedCode.code`; and
- either one canonical semantic `targetId` or `null` when it is a document diagnostic.

The backend contract and generated TypeScript contract remain the single cross-language authority.
Update the one checked-in fixture and regenerate the TypeScript surface with the existing generator.
Do not introduce V1/V2 readers, optional legacy fields, or adapters; this unreleased vertical slice
cuts over as one closed shape.

Semantic classification is backend work. Preserve the existing narrowest-source-range mapping for
ordinary expression diagnostics. For an exact Basedpyright `reportCallIssue` on the callable call,
map the diagnostic to each empty required provider-derived parameter. Required means a
signature-owned parameter with no default whose passing style is not variadic. App-authored blank
parameters are optional authoring records and must not acquire an invented missing-value error.
If no missing required parameter explains the call issue, keep the callable as its semantic target.
Do not classify by loose message keywords.

A diagnostic outside every generated semantic source range has `targetId: null`; it is not dropped.
Invalid ranges, unsupported severities, blank messages, and malformed provider codes fail or are
discarded at the provider boundary according to the existing explicit normalization policy. Stable
ordering and IDs are deterministic for one exact document revision.

### The frontend projects; it does not re-diagnose

The runtime contract validates every diagnostic range against the UTF-8 byte length of the exact
generated document, validates byte boundaries, and accepts `targetId` only when it is `null` or a
known canonical target. Convert a validated UTF-8 byte range to CodeMirror's UTF-16 offsets exactly
once at the Python Canvas projection boundary.

Partition the snapshot's diagnostics into:

- callable diagnostics for the one callable field;
- parameter diagnostics for the existing workspace item registry; and
- targetless document diagnostics for Generated Python.

The app may join messages for the callable field's presentation, but it must not infer targets,
severity, missing parameters, or new diagnostics. A snapshot replaces the prior partition
atomically.

When Python Canvas deliberately retains newer authored prefix or suffix text while applying an
older canonical response, the older document diagnostics no longer describe the displayed code and
must be cleared. The subsequent response for the retained authoring repopulates them. Cover this one
concurrency rule; do not expand into an audit of every possible request ordering.

### `@setta/workspace` owns generic presentation only

Add the smallest reusable surfaces needed by this consumer:

1. The existing `TextValueEditor` `section-field` presentation accepts a controlled diagnostic
   message/state. The package owns its error color, `aria-invalid`/description wiring, and compact
   indicator layout; the consumer owns the diagnostic content. The existing end-adornment seam may
   be used for this genuine field-local state. Item-row diagnostic behavior stays in the existing
   item registry.
2. The built-in Code section data carries a validated list of document diagnostics using UTF-16
   `from`/`to` offsets, severity, and message. The package renders them through CodeMirror's normal
   lint presentation and tooltip. This vocabulary is provider- and language-neutral.

Code-section diagnostics belong to the exact `code` string in the same parsed data value. Any
accepted local code edit clears them until the host supplies diagnostics for the new text. A host
write validates the complete data before publishing it.

Use the standard pinned `@codemirror/lint` package rather than recreating lint markers and tooltips.
Declare the exact direct dependency in `packages/workspace/package.json`. Generate the candidate
lockfile without lifecycle scripts and run
`code-policy dependency-review --base <trusted-plan-loop-base>` before installing or keeping the
change. The existing lock already resolves the package transitively, but the direct importer must
still be declared. Do not update unrelated dependencies.

Do not put Basedpyright, LSP, Python, callable IDs, HTTP, or project-revision concepts in
`@setta/workspace`.

## Acceptance behavior

Run the production app from a fresh store and prove these exact flows:

1. The initial `math.sqrt` snapshot is provider `available` and `ready`. Its empty required `x` row
   has the same main-style error row/marker behavior and exposes the provider message. The callable
   field is not marked for that missing argument.
2. Enter `missing_value` for `x`. Generated Python contains the expression, the `x` row exposes the
   undefined-name message, and Generated Python does not duplicate it as an inline lint marker.
3. Replace it with `3`. The parameter diagnostic and its accessible announcement clear without
   replacing focus or disabling the row.
4. With `x` valid, add an app-authored argument that `math.sqrt` does not accept and give it a value.
   The resulting call issue appears on the callable field with stable idle/live typography and a
   compact error indicator whose tooltip or accessible description contains the full message. No
   application-wide pending dot reappears.
5. Remove the unsupported argument. The callable field returns to its ordinary syntax-highlighted
   state and the error message disappears.
6. Add an undefined name in the editable prefix or suffix. Only that authored range receives the
   normal CodeMirror diagnostic underline/tooltip. The generated protected region remains
   selectable and read-only, and its blue paint, rail, badge, caret behavior, and dimensions do not
   change. Correct the authored code and observe the inline diagnostic clear.
7. A response for an older authored prefix/suffix never paints its diagnostic at a shifted or
   unrelated location in the newer displayed document.

Capture the callable-error and targetless document-error states in headless Chrome during
supervision and compare them at original resolution with main. This is review evidence, not a new
checked-in visual-regression system. The production browser suite must assert the observable
behavior and accessible messages rather than private CSS class names.

## Tests and proof

Add focused tests at the boundaries that own behavior:

- Go LSP decoding retains string diagnostic codes and rejects malformed values without leaking raw
  JSON farther into the app.
- Go diagnostic mapping covers a missing required provider parameter, an undefined parameter
  expression, a callable-targeted call issue, a targetless prefix/suffix diagnostic, stable ordering
  and IDs, and replacement/clearing.
- The Go/TypeScript contract generator and drift tests prove the one closed diagnostic shape,
  nullable target, byte range, and malformed/dangling rejection.
- Frontend runtime/projection tests prove UTF-8-byte to UTF-16 conversion with one non-ASCII case,
  the three-way partition, no mapped/unmapped duplication, and the one retained-authoring stale
  response rule.
- Workspace tests prove section-field error semantics in idle and live layers, parsed Code-section
  diagnostic validation, CodeMirror rendering/tooltip, clearing on local edits, and unchanged
  generated-region protection.
- Python Canvas component tests prove callable and parameter presentation and diagnostic clearing.
- Extend the existing production browser walkthrough with the acceptance flows above. Reuse its real
  Go service, pinned Basedpyright, and headless Chrome; do not add a fake browser-only provider.

During implementation, run exact focused tests as useful. The Code Policy supervisor owns the
frozen recommended verification for the final candidate. Do not run full, supplemental, mutation,
`verify`, or `gate` inside this plan loop.

## Plan-loop execution

### Phase 1 — end-to-end type-error parity

- [x] Implementation, production proof, review, and closeout complete

Implementation record — backend/contract batch: the Basedpyright boundary now retains validated
string diagnostic codes; the canonical record carries UTF-8 byte ranges and a nullable semantic
target; targetless diagnostics survive as document diagnostics; and exact `reportCallIssue`
diagnostics on the callable call map to empty required provider-derived parameters. The workspace
presentation, Canvas projection, production walkthrough, and phase closeout remain incomplete.

Implementation record — workspace/frontend batch: `TextValueEditor` now owns the callable
field's controlled error surface, compact indicator, and idle/live `aria-invalid` description;
the generic Code-section contract now validates UTF-16 document diagnostics and renders them with
the direct, exact `@codemirror/lint` dependency; and Python Canvas partitions canonical snapshots
into callable, parameter, and targetless document diagnostics. Targetless UTF-8 byte ranges are
converted once at the projection boundary, while accepted local outer-code edits and retained
newer authored code clear old document diagnostics. The locked Code Policy release passed
`test --changed --base 9dbdf9dffd09d74ddbda856ddea03c9ea957441b`; focused Go, workspace,
playground, and Canvas checks passed, as did the recommended workspace suite (143 files / 1,205
tests), playground suite (8 files / 43 tests), contract-drift and cross-language boundary suites,
workspace build, Canvas TypeScript/Vite build, and browser-script syntax checks.

Implementation record — browser acceptance correction: the raw-first-render assertion now removes
the package's parameter-diagnostic live announcement and screen-reader description before checking
that the visible parameter card does not print analyzer metadata. The initial
missing-required-argument message legitimately used `positional`, so checking all card text treated
required provider feedback as forbidden row metadata. The check still verifies the canonical static
parameter label and rejects those terms from the remaining card content.

Implementation record — mapped-parameter browser correction: `math.sqrt()` already has the
initial missing-required-argument diagnostic, so replacing it with `missing_value` correctly
announces a diagnostic update rather than a second availability event. The walkthrough now waits
for the `x` row's error state, compact marker, accessible description, and live announcement to
expose `missing_value`, then proves those row semantics clear while the field remains enabled after
entering `3`. This asserts the mapped provider feedback instead of depending on one announcement
lifecycle prefix. The focused Python Canvas suite (8 files / 68 tests), its TypeScript/Vite build,
and browser-script syntax check passed for this correction.

Implementation record — browser authoring sequencing correction: the walkthrough now waits for
the locally rendered `scale=2` parameter list to reach the canonical project before it begins the
duplicate-name and removal checks. Those later actions are independent mutations; beginning them
from merely local generated output allowed a delayed value write to overlap the removal assertion.
The focused Python Canvas suite (8 files / 68 tests) and browser-script syntax check passed.

Implementation record — browser authoring completion correction: restoring the refused duplicate
name to the already-canonical `scale=2` list is deliberately a no-op, so the store correctly
preserves its revision rather than publishing an invented replacement. The walkthrough now proves
the duplicate error clears and the restored `scale expression` row is editable before its next
genuine structural mutation. The focused Python Canvas Code Policy suite (8 files / 68 tests) and
browser-script syntax check passed.

Implementation record — backend parameter-removal correction: the supervisor trace proved that the
ordinary pointer sequence reached the enabled Remove Last control and submitted one valid complete
deletion at revision 5, so the toolbar focus override and its test were removed to preserve normal
pointer-focus behavior. The 500 came from a mutation candidate copying diagnostics tied to the prior
generated document: the provider's `scale` diagnostic survived into a candidate whose list no
longer contained `scale`, and preliminary snapshot validation correctly rejected that dangling
target. Candidate clones now start with no diagnostics; the provider replaces them only after the
new generated Python is materialized. The project regression covers an authored `scale` parameter,
its mapped diagnostic, and its one-revision deletion. The focused backend suite
(including its pinned Basedpyright integration), focused Python Canvas suite (8 files / 68 tests),
workspace component suite (143 files / 1,205 tests), and browser-script syntax checks passed.

Implementation record — callable keyword-diagnostic correction: Basedpyright reports an unexpected
keyword on the keyword-name range inside the generated call, not on the narrower callable-expression
range. The renderer now retains its private end-of-call byte bound, and the project maps an exact
`reportCallIssue` wholly within that generated call to the callable before applying the existing
missing-required-provider-parameter rule. Ordinary source-range mapping and targetless document
diagnostics remain unchanged. Focused backend tests now reproduce the `scale` keyword span, and the
pinned Basedpyright integration asserts a real `scale=2` call issue targets the callable. The focused
backend suite and `code-policy test --changed --base 9dbdf9dffd09d74ddbda856ddea03c9ea957441b`
passed (workspace, playground, backend, and Python Canvas focused suites).

Implementation record — targetless diagnostic browser timing correction: `@codemirror/lint`
publishes a reconfigured source on its next task, so the production walkthrough had been treating
the first rendered copy of the newly diagnosed text as though it already carried lint ink. It now
waits for the range's visible decoration before moving the pointer for its tooltip assertion. The
workspace regression publishes a document diagnostic to an already-mounted Code section, then
proves the normal underline, tooltip, and local-edit clearing behavior; the focused regression
and `code-policy test --changed --base 9dbdf9dffd09d74ddbda856ddea03c9ea957441b` pass. This
preserves the production proof's class-independent visual assertion and verifies the same late
canonical publication the walkthrough exercises.

Implementation record — targetless diagnostic clearing correction: the production walkthrough now
binds its post-edit assertion to the exact provider message for the removed prefix name, rather
than treating an independent document diagnostic as that stale range. The pinned Basedpyright
integration now drives the same prefix add-and-correct sequence and requires its targetless
provider message to clear from the canonical snapshot while retaining unrelated document feedback.

Implementation record — atomic snapshot publication correction: Python Canvas now prepares its
callable data, canonical-or-retained parameter tree, and Generated Python data before one public
workspace document commit. That generic package boundary validates the complete document before
writing, atomically publishes its document/node/selection stores, and notifies subscribers once,
so the three diagnostic partitions cannot expose a mixed revision and an invalid projection leaves
the prior workspace intact. Regressions prove one three-way diagnostic publication and no write on
an invalid generated document; the workspace root ratifies the new commit entry and its Text
section keeps a stable empty diagnostic value. The focused projection test (13 tests), Python
Canvas suite (8 files / 70 tests), workspace component suite (143 files / 1,206 tests), workspace
build, and Canvas TypeScript/Vite build passed. The locked `code-policy test --changed --base
9dbdf9dffd09d74ddbda856ddea03c9ea957441b` then passed its workspace, playground, backend, and
Python Canvas focused suites.

Implementation record — browser acceptance audit correction: the raw first-render walkthrough now
waits for the committed Basedpyright provider to be `available` and `ready`, then proves the empty
required provider-derived `x` has one mapped error with the package row marker and accessible
provider message while the callable field remains unmarked. The mapped `missing_value` path now
also rejects a range-local Generated Python lint decoration below the expected protected-region
paint. For targetless diagnostics, the walkthrough starts an invalid prefix request, waits until it
is in flight, inserts a comment before that diagnostic's byte range while the request remains
pending, observes the older canonical response, and proves no authored-prefix lint or stale message
is painted before the newer canonical response correctly underlines and explains the shifted
identifier. It then removes that authored identifier and requires the exact provider message to
clear. The first-render helper is now a focused browser module so the walkthrough stays within the
repository size and complexity limits. Code Policy formatting, browser-script syntax checks, and
`code-policy test --changed --base 9dbdf9dffd09d74ddbda856ddea03c9ea957441b` passed (workspace,
playground, backend, and Python Canvas focused suites). The authorized recommended ordinary run was
also run: its other eight suites passed, but its production browser suite remains unable to bind
`127.0.0.1` in Agent 1's sandbox (`EPERM`), before the application can start; the direct production
walkthrough reports the same environment limitation.

Implementation record — browser canonical comparison correction: the raw-first-render helper now
compares the parsed shipped snapshot structurally rather than comparing its JSON serialization.
The API's provider-status member order is not observable behavior; the check continues to require
the exact callable, generated call, provider-derived `x` parameter, and ready Basedpyright status.
Its syntax checks and the selected `test --changed --base
9dbdf9dffd09d74ddbda856ddea03c9ea957441b` passed. The selected recommended ordinary run passed
its other eight suites; its browser suite stopped at the sandbox's `127.0.0.1` `EPERM` before the
application started, so the supervisor environment must supply that production-browser evidence.

Implementation record — targetless browser diagnostic selection correction: Basedpyright also
emits an independent unused-expression warning on the authored undefined-name span. The production
walkthrough now requires exactly one targetless error at that span and uses its complete provider
message, rather than treating the co-located warning as a duplicate error. It still proves the
same rendered range, hover message, stale-response clearing, and corrected-prefix clearing. The
browser-script syntax check and selected `test --changed --base
9dbdf9dffd09d74ddbda856ddea03c9ea957441b` passed (workspace, playground, backend, and Python
Canvas focused suites).

Closeout record: the supervisor completed the no-script dependency review with no vulnerabilities,
then ran the frozen recommended acceptance against implementation commit
`56bcc4f46c95f695e373f792af7fdeebe4b482c8`. All nine selected suites passed, including the real
Go service, pinned Basedpyright, contract-drift and cross-language checks, workspace and Canvas
tests, and the headless production-browser walkthrough. That walkthrough proved the parameter,
callable, and targetless document diagnostic destinations, their accessible messages and clearing,
the absence of mapped/generated duplication, and stale-response protection on the fixed production
viewport. A fresh immutable read-only phase review of the same trusted-base-to-candidate range
inspected the named main donor files, accepted the recorded intentional differences, and reported no
repository-contract finding, requested-outcome finding, or recommendation. No developer evidence or
approval gate remains.

Follow-up correction record — normal callable commit parity: commit `71102041e` is superseded as
proof of this interaction. Hiding its provider-failure card did not match main because ordinary
Enter still combined expression persistence with signature resolution, briefly projected a locked
section, and rejected an unresolved expression. A direct headless reproduction on the named main
donor confirmed that ordinary Enter persists the expression and publishes its Basedpyright
diagnostics while Alt-Enter is the separate parameter-refresh gesture. Python Canvas now uses the
same split: the ordinary backend commit never resolves a signature and preserves the current
parameter list; the explicit refresh endpoint owns provider resolution and replaces the list only
after the expression commit has succeeded. The callable editor remains enabled while only parameter
authoring receives main's transparent pending overlay, and callable-targeted diagnostics continue
through the existing field-local error projection. The production browser acceptance enters
`math.sqrt` without importing `math`, gates the commit response to inspect the pending frame, and
proves persistence, a callable Basedpyright error, no section lock, no refresh request, and no large
error panel. The same headless run also completes the existing explicit-refresh, parameter,
diagnostic, restart, and responsive-layout walkthrough.

Follow-up correction record — parameter pending ownership: the preceding record's pending wording
was too broad, and the implementation exposed the same broadness as a generic `callablePending`
signal. Main's centered parameter-area overlay belongs to its callable `parametersRequest` channel;
an ordinary parameter value mutation does not enter that channel. Python Canvas now publishes a
separate parameter-authoring-pending signal only for callable expression commit and explicit
signature refresh. Debounced parameter value and name persistence continues to use the off-layout
status announcement without disabling the row, making the parameter area inert, or rendering the
centered spinner. The headless browser walkthrough gates an `x` value response and proves that
distinction while the request is in flight.

Intentional donor differences, recorded after reading every named main donor: main's historical
generated-Python mapper used `reportCallIssue` message wording to choose parameters, whereas this
slice uses the exact provider code plus canonical signature metadata, so wording cannot create a
semantic target. Main also retained formatter diagnostics while merging publications; this slice
atomically replaces each canonical snapshot because every diagnostic range belongs to one exact
generated document revision.

Implement the direct contract cutover and the two generic workspace presentation seams as coherent
private batches. It is acceptable to commit backend/contract, workspace, and consumer work
separately while the branch is private, but the phase is not complete until the public contract,
generated TypeScript, package API, consumer, and tests agree. Never commit an alternative legacy
reader or a fake success path.

Before returning the phase for review:

1. Read the named main donor files and record any intentional behavior difference in this plan.
2. Run the dependency review before keeping the direct lint dependency declaration.
3. Run the focused backend, workspace, and Python Canvas tests plus relevant TypeScript/build
   checks.
4. Run the real production browser walkthrough and inspect the diagnostic states at full
   resolution.
5. Run `code-policy test --changed --base <trusted-plan-loop-base>`.
6. Commit every coherent batch and leave the worktree clean.

The read-only reviewer must bind findings to this plan or `AGENTS.md`, inspect the exact trusted-base
to candidate range, and avoid unrelated parity, generalized LSP, suppression, or edge-case audits.
Recommendations outside the fixed scope are non-blocking.

## Stop conditions

Return a concise blocker instead of widening scope if:

- Basedpyright does not publish stable diagnostic codes needed to distinguish the required call
  issue, and matching main would require message heuristics;
- the locked dependency policy rejects the exact direct `@codemirror/lint` declaration and there is
  no already-approved exact release;
- a correct generic workspace seam would require provider- or Python-specific vocabulary;
- exact document diagnostics cannot stay bound to the canonical generated-code revision without a
  new project transaction model; or
- the real main behavior contradicts a fixed decision above in a way that materially changes the
  user-visible result.

The plan is complete when the phase marker is checked, recommended verification passes against the
exact final candidate, the final read-only review has no actionable repository-contract or
requested-outcome finding, and the headless production walkthrough proves the three diagnostic
destinations and their clearing behavior.

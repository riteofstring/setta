# Python Canvas Prefix/Suffix Completion Parity Plan

## Status and purpose

**Status: Approved for implementation.**

Implement the next narrow Python Canvas slice: Basedpyright completion in the editable Python
before and after the Generated Python protected region. User-visible behavior is defined by the
`main` reference at commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864`, especially its
Generated Python code-area completion flow. Implementation starts from
`python-canvas-main-parity` commit `3ffb86491a8980031bf674608223c26c2ac65f35`.

This is not a general semantic-editor initiative. It adds the one consumer-neutral Code-section
hook that `@setta/workspace` needs and the one Python Canvas read-only query that uses it. The
existing complete, revision-bound Python-target mutation remains the only write path.

There is no backward compatibility, legacy support, migration, alias, deprecated export,
transitional endpoint, dual reader, or fallback implementation. Make one direct contract cutover
where a shared name must change.

## Authoritative reference behavior

Before editing, read these `main` files in full for the named behavior:

- `frontend/src/components/Section/Layouts/CodeArea.tsx`, including
  `GenPythonCodeAreaContent`, `splitGenPythonDoc`, and
  `getGenPythonCodeAreaCompletionsFn`;
- `frontend/src/components/Utils/CodeMirror/getOnCreateEditor.ts`, including the completion
  source and replacement-range behavior;
- `internal/lspcompletion/python_snapshot_builders.go` and
  `internal/lspcompletion/service.go`;
- `internal/httpapi/lsp_routes.go`;
- `internal/lspcompletion/python_snapshot_builders_test.go` and the relevant LSP route tests.

The resulting Python Canvas behavior must match the reference:

1. Typing in the editable prefix asks Basedpyright for completion against a complete Python module
   containing that current prefix and the generated body.
2. Typing in the editable suffix asks Basedpyright against the same complete-module context, with
   the cursor placed in that current suffix.
3. No completion query is made while the cursor is inside the generated protected region.
4. The popup is not clipped by the section. Arrow keys navigate it, `Tab` and ordinary `Enter`
   accept the selected item, and `Escape` closes the popup before a later `Escape` returns focus
   to the section wrapper. Outside an active popup, `Tab` keeps the code editor's indentation
   behavior.
5. Accepting a completion edits only the active authored region. The existing target debounce
   then sends the complete prefix and suffix through the existing revision-bound mutation. A
   popup or abandoned suggestion does not mutate the project, its revision, or the canonical
   generated file.
6. The generated block retains its exact read-only behavior, paint, selection, cursor skipping,
   dimensions, diagnostics, undo/redo behavior, and source boundary.

Record any intentional behavior difference from these donor paths in this plan before closeout.
Architecture may differ where the monorepo boundary requires it; visible behavior may not be
silently reduced.

## Fixed scope

### `@setta/workspace`

Add one consumer-neutral completion provider to the built-in Code-section registration. It is
application service injection, not document data:

- the provider is supplied through `createWorkspaceCodeSection(...)`;
- the parsed Code-section document remains serializable and carries no function, HTTP, Python,
  LSP, project, or provider state;
- one request exposes the section ID, exact current editor text, current UTF-16 cursor offset,
  explicit-versus-typing trigger, cancellation signal, language, and the live mapped generated
  region when the presentation has one;
- one result exposes a validated UTF-16 replacement range and completion choices with labels and
  insertion text;
- the package adapts that vocabulary to CodeMirror internally.

Use the existing controlled editor and completion behavior as the implementation reference.
Share a small package-internal CodeMirror adapter or request-lifecycle helper with
`TextValueEditor` when that removes real duplication. Do not create a public editor-services
registry, semantic-service host, schema system, diagnostic service, or general LSP abstraction.
Do not retain renamed public types as aliases.

The Code-section editor must:

- abort an older in-flight request on a document change, provider reconfiguration, unmount, or
  replacement request;
- ignore a late or malformed result;
- mount its tooltip under the workspace canvas so the popup is not clipped by a card;
- never invoke the provider for a cursor in `[generatedRegion.from, generatedRegion.to)`;
- reject a completion replacement range that is outside the current document or crosses the
  protected generated region;
- let the existing generated-region transaction filter provide the final atomic refusal;
- preserve the editor instance, focus, selection, history, scroll, and live mapped region while
  completions arrive.

The provider and all completion state are optional. A Code section without one behaves exactly as
it does now.

### Python Canvas frontend

Register a Python-target completion provider only for the generated Python Code section. Build it
after the initial response has been strictly parsed, so it captures the validated project identity
without a global or a guessed constant.

For each request:

- split the exact current document only at the package-supplied live generated region;
- classify a cursor before the region as `prefix`, at or after the region end as `suffix`, and
  return `null` inside the region;
- send the complete current prefix and suffix, the active region, and the active-region-local
  UTF-16 cursor offset;
- map the active Python identifier segment's replacement bounds back to full-document UTF-16
  offsets exactly once;
- pass the request cancellation signal through `fetch`;
- return no result after cancellation or a stale response;
- report a real query failure through the existing application error/status treatment without
  marking the callable field or changing canonical project data.

Do not infer the generated body by searching for text or separators. The live mapped region is the
one authority. Do not add a second target mutation or special completion-accept commit path.

### Go backend and cross-language contract

Add one exact read-only V1 endpoint:

`POST /api/v1/project/python-target/completions`

Its closed request contains:

- `projectId`;
- `region`, exactly `prefix` or `suffix`;
- the complete current `prefix`;
- the complete current `suffix`;
- `cursorOffsetUtf16`, relative to the selected region.

Its closed response contains normalized completion items with a nonblank label and insertion text.
Use one authoritative completion-item contract where callable and Python-target completion items
are genuinely identical. If the existing callable-specific response names are replaced, cut every
Go and generated TypeScript consumer over in the same implementation; do not keep compatibility
aliases or duplicate wire shapes.

The contract generator remains the sole owner of the TypeScript surface. Runtime parsing rejects
unknown, missing, malformed, blank, or impossible fields before a result reaches the editor.

The project query must:

1. validate the project, region, both complete authored regions, and the active-region UTF-16
   cursor before work begins;
2. capture or clone the immutable canonical callable/parameter context while holding the store
   lock, then release the lock before waiting on Basedpyright;
3. render one complete temporary module using the request's current prefix and suffix around the
   canonical generated body;
4. compute the LSP cursor from renderer-owned boundaries and the validated local cursor, never by
   searching for authored or generated text;
5. ask the store-owned pinned Basedpyright provider through a temporary `.py` snapshot;
6. always close the LSP document and remove the temporary file on success, failure, or
   cancellation;
7. leave the canonical state, revision, diagnostics, generated file, and open canonical LSP
   document unchanged.

Factor the existing temporary-snapshot completion lifecycle only as far as needed for callable and
target completion to share one correct implementation. Do not add a second language server,
provider fallback, completion cache, background indexer, or process abstraction.

Use Basedpyright's returned insertion text when present and its label otherwise, matching the
existing callable completion normalization. Completion resolve, snippets, additional text edits,
documentation, hover, and ranking changes are outside this slice.

## Acceptance behavior

Extend the existing production walkthrough, using its real Go service, pinned Basedpyright, built
frontend, and headless Chrome. Start from a fresh store and prove:

1. In the initial `import math` prefix, change the final identifier to a stable partial value
   verified against the pinned Basedpyright release. The expected module completion appears outside
   the card bounds. `Tab` accepts it, only the prefix changes, the generated block is byte-for-byte
   unchanged, the normal target mutation reaches one canonical response, and reload retains it.
2. In the initial `state = SettaState()` suffix, change the class name to a stable partial value
   verified against the pinned Basedpyright release. `SettaState` is offered from the generated
   class in the same temporary module. Ordinary `Enter` accepts it; only the suffix changes; the
   canonical response and reload retain the completed suffix.
3. Open a prefix or suffix popup and press `Escape`. The first press closes the popup without
   changing the authored text or project revision; the next press returns focus to the section
   wrapper.
4. No popup opens and no endpoint request occurs for a cursor in the generated protected region.
   The block remains selectable/copyable and refuses typing, paste, cut, deletion, replacement,
   undo, and redo exactly as before.
5. A request made obsolete by another authored edit cannot insert a late result or publish an
   error for the newer document.

Choose stable partial values with one focused real-provider probe if necessary; do not turn this
into a survey of Basedpyright completion edge cases. Keep existing first-render, callable,
parameter, diagnostic, protected-region, and target-authoring assertions intact.

Capture the two open popup states at the production viewport and inspect them at original
resolution against `main`. This is supervisor evidence, not a new screenshot framework.

## Tests and proof

Add focused tests at the owners of behavior:

- workspace public API and Code-section component tests cover optional registration, the exact
  consumer-neutral request, UTF-16 result validation, cancellation, popup key ownership and
  placement, generated-region suppression, protected-range crossing rejection, acceptance outside
  the region, and unchanged no-provider behavior;
- Go project tests cover complete request validation, prefix and suffix candidate rendering,
  renderer-owned cursor placement, immutable snapshot capture, lock release while the provider
  waits, cancellation, provider failure, and no canonical state/revision/file mutation;
- Go LSP tests cover the shared temporary open/completion/close/remove lifecycle and normalized
  results for both regions without duplicating callable coverage;
- HTTP, generated-contract, runtime-parser, and client tests cover the one exact route, strict
  closed shapes, error mapping, signal propagation, and contract drift;
- one pinned Basedpyright integration test proves a stable prefix completion and a generated-class
  suffix completion against the complete temporary module;
- Python Canvas projection/provider/component tests cover region splitting, local-to-document
  UTF-16 mapping including one non-ASCII prefix case, no protected-region request, stale/cancelled
  response handling, and the existing target mutation remaining the sole write path;
- the production browser walkthrough covers the five acceptance flows above.

Tests must assert observable behavior rather than copy implementation logic. Use temporary state.
Do not add no-op provider fakes as acceptance proof.

During implementation, run exact focused tests as useful. Near closeout run
`code-policy test --changed --base <trusted-plan-loop-base>`. The Code Policy supervisor owns the
frozen recommended verification for the exact final candidate. Do not run full, supplemental,
mutation, `verify`, or `gate` inside this plan loop.

## Explicitly deferred

This plan does not implement:

- parameter-expression completion;
- section/variable references, dependency edges, or rename propagation;
- hover, documentation, signature popovers, completion resolve, snippets, or additional text
  edits;
- MCP, CLI, persistence, filesystem watching, Python execution, alternate LSPs, or source-root
  discovery;
- multiple generated regions or arbitrary language-specific behavior in `@setta/workspace`;
- a general semantic-editor service registry, ports/edges, schemas, testing APIs, or the broader
  workspace roadmap;
- wholesale copying of `main`, unrelated parity audits, or speculative edge-case hardening.

Update `apps/python-canvas/README.md` so prefix/suffix completion is described as supported and is
removed from the deferred line. Do not convert the remaining deferred list into a roadmap.

## Plan-loop execution

### Phase 1 — prefix/suffix completion parity

- [ ] Repository implementation, focused proof, and clean coherent commits are ready for
      supervisor verification and immutable review

Implementation record (2026-08-20): the single-cutover implementation is present, and no
intentional difference from the named `main` completion behavior was identified. Focused workspace,
playground, Python Canvas backend (including pinned Basedpyright), Python Canvas frontend,
contract, and build checks passed. The repository verification blockers recorded by the original
implementation turn were resolved separately in `8b5de94fb`: the exact expired policy exceptions
were renewed for seven days and the playground suite now builds its workspace dependency.

Browser closeout (2026-08-20): the initial production walkthrough confirmed the recorded driver
failure: it looked for the generated Code section's wrapper label directly on its nested CodeMirror
textbox. The page abstraction now resolves the labeled section and enters its nested editable
textbox through the wrapper's public Enter handoff; both prefix and suffix completion flows use
that abstraction, with the production accessible markup unchanged. The repeated production
walkthrough passed, including its two
1440-by-900, device-scale-one popup captures and checks that each popup is mounted outside the
section, visible in the viewport, and not clipped. `code-policy test --changed --base
9c3ee63dd8220a5e44e58d6b2d8305f8b7c80b5d` also passed all four selected focused suites
(workspace, playground, Python Canvas backend, and Python Canvas frontend). No intentional
behavior difference from the named `main` completion behavior was identified.

Follow-up (2026-08-20): exact-candidate recommended verification at
`08818ac16b472107b8a1c1b39d588dcaf4682498` timed out while the Escape flow started completion
after directly focusing the nested editor. The browser driver now uses the section's wrapper and
its public Enter handoff.

Supervisor restart (2026-08-20): the full walkthrough exposed a browser-harness fault rather than
a product geometry fault. The CDP helper creates a second tab while Chrome's initial blank tab can
remain foregrounded, suspending animation frames in the tested page. Foreground the tested target
with `Page.bringToFront`; remove the temporary popup/geometry diagnostics and the forced absolute
tooltip positioning. Once frames run normally, make both existing stale-response proofs
deterministic by pausing each real HTTP response at the CDP boundary until after the newer edit:
the completion response in `browser-target-completion.mjs` and the older target-diagnostic response
in `browser-generated-python.mjs`. Keep the real production endpoint and provider in both flows;
do not add product delays, test-only product hooks, provider fakes, or timing sleeps as proof.

The checkbox records repository work, not supervisor-owned acceptance receipts. Agent 1 checks it
once the implementation and in-repository proof are complete and the worktree is clean. Code Policy
then owns exact-candidate verification and read-only review; no status-only repair commit should be
needed after those receipts pass.

Before returning the phase, treat the recorded donor review, runtime implementation, focused tests,
and non-browser recommended tests as complete; do not reread or re-audit them in this closeout turn.

1. Run the production-browser walkthrough first and repair only the labeled-section editor
   activation described in the supervisor handoff.
2. Inspect the prefix and suffix popup states headlessly at original resolution.
3. Rerun the production-browser walkthrough after the repair.
4. Run `code-policy test --changed --base <trusted-plan-loop-base>`.
5. Check the phase marker, commit the browser repair and plan record, and leave the worktree clean.

The read-only reviewer must bind findings to this plan or `AGENTS.md`, inspect the exact
trusted-base-to-candidate range, and use the named `main` donor as the behavior reference. Avoid
parameter/reference work, general editor architecture, unrelated parity auditing, and pathological
completion edge-case audits. Recommendations outside the fixed scope are non-blocking.

## Stop conditions

Return a concise blocker instead of widening scope if:

- the pinned Basedpyright release cannot produce a stable completion in either authored region
  when given the complete generated module;
- correct cursor placement would require searching generated text instead of using renderer-owned
  boundaries;
- the workspace hook would require Python, HTTP, LSP, project, or provider vocabulary;
- the completion query cannot be made read-only without changing the project transaction model;
- the locked policy or dependencies prevent the existing CodeMirror completion facilities from
  being used; or
- the observed `main` behavior materially contradicts a fixed decision above.

The plan is complete when the phase marker is checked, frozen recommended verification passes
against the exact candidate, a fresh immutable read-only review reports no actionable
repository-contract or requested-outcome finding, and the headless production walkthrough proves
both authored-region completion flows without weakening the generated region.

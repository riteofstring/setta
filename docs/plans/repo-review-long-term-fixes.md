# Repository Review Long-Term Fix Plan

Date: 2026-06-03

This plan addresses the repository review findings with durable fixes rather
than local patches. The goal is to remove the classes of failure that produced
the issues: UI behavior that changes at scale, UI-only state that is not backed
by product semantics, Codex compatibility fallbacks, brittle generator
discovery, implementation-coupled tests, and large modules with unclear
responsibilities.

## Principles

- Treat active projects, recent projects, and conversations as one explicit
  navigation model instead of separate UI branches with different behavior.
- Put chat state semantics in the backend or in explicit store reducers, not in
  ad hoc component flags.
- Fail loudly for unsupported Codex protocol capabilities. Do not add or keep
  backward-compatibility shims unless that exact compatibility work is
  requested.
- Generate protocol and TypeScript surfaces from owner-defined contracts and
  checked inputs. Do not infer product protocol support from comments, tests, or
  incidental string literals.
- Test user-visible behavior through production paths for chat, Codex, queueing,
  approvals, event streaming, preload, renderer state, and persistence.
- Refactor by responsibility boundaries. Avoid generic dumping grounds such as
  broad `utils`, `helpers`, or cross-domain constants files.

## 1. Sidebar Navigation Model

### Problems

- Recent project rows look interactive but cannot open a workspace.
- When active workspace count exceeds `directProjectRenderLimit`, selected
  project conversations disappear because virtualized rows are rendered with
  project chats disabled.

### Long-Term Fix

Replace the current threshold-based sidebar behavior with a single typed
navigation model.

The renderer should derive a flat list of sidebar items from store state:

- active workspace rows
- visible conversation rows for the selected and expanded workspace
- recent workspace rows
- section headers or separators, if needed

The virtualizer should render that single list regardless of count. Rendering
3,000 workspaces should change only how many DOM nodes are mounted, not what
actions or nested data are available.

Recent workspace rows should have a clear primary action: open or select the
workspace. Removing the recent entry should remain a secondary icon action and
must not swallow the row click.

### Implementation Steps

1. Introduce a pure sidebar selector that converts store state into typed
   sidebar items with stable ids, row kinds, labels, selection state, and
   commands.
2. Replace the active workspace `directProjectRenderLimit` branch with one
   virtualized list that can render workspace and conversation rows.
3. Wire recent workspace rows to the same open/select workspace command used by
   normal workspace opening.
4. Preserve the existing DOM performance budget by keeping only visible rows
   mounted and using stable row heights or measured row groups.
5. Add keyboard and accessibility semantics: workspace and conversation rows
   should be buttons or tree items with correct labels, disabled state, focus
   handling, and secondary actions.

### Verification

- Renderer selector tests should cover active projects, recent projects,
  selected workspace expansion, empty states, and row command mapping.
- Deterministic Electron E2E tests should use temporary app data with thousands
  of active and recent workspaces, open a recent workspace, select a large-list
  workspace, and verify its conversations remain visible.
- Performance verification should re-measure mounted row count and total DOM
  elements, appending results to `docs/performance/workspace-list-rendering.md`.

## 2. Durable Unread Conversation State

### Problem

The sidebar renders unread indicators, but `unreadConversationIds` is never set
or cleared. The UI advertises state that has no durable semantics.

### Long-Term Fix

Define unread state in terms of durable chat data:

- A conversation is unread when it has an assistant response, run completion, or
  approval-relevant update newer than the user's read marker for that
  conversation.
- The read marker should be persisted per conversation, using a message ordinal,
  event sequence, or other monotonic backend-owned value.
- Selecting or viewing a conversation should issue an explicit "mark read"
  action rather than mutating transient UI-only ids.

The backend should expose enough conversation summary metadata for the renderer
to derive unread state deterministically. The renderer should not guess from
text, timestamps alone, or local component lifecycle.

### Implementation Steps

1. Pick the read marker representation and add it to the backend-owned
   conversation or workspace state.
2. Extend conversation list summaries with the latest assistant/read-relevant
   marker.
3. Add an HTTP command to mark a conversation read, or include the action in the
   existing conversation selection flow if that remains the owner of the
   behavior.
4. Replace `unreadConversationIds` with derived unread status from conversation
   summaries and read markers.
5. Ensure event streaming updates conversation summaries when inactive
   conversations receive assistant output or run status changes.

### Verification

- Deterministic Electron E2E tests should open a workspace, create at least two
  conversations, stream assistant output into an inactive conversation, verify
  the unread indicator appears, select the conversation, verify it clears, then
  restart or reload and verify persistence.
- Store and backend tests should cover marker ordering and idempotent mark-read
  behavior.

## 3. Codex Protocol Capability Policy

### Problem

`thread/settings/update` has an explicit downgrade path. Unsupported protocol
errors are swallowed, future attempts are disabled, and command execution
continues with a diagnostic. That is a backward-compatibility shim.

### Long-Term Fix

Make Codex capability support an explicit contract:

- Define the minimum supported Codex protocol snapshot and required
  capabilities.
- If `thread/settings/update` is required, require it at session initialization
  or fail the specific command loudly when the method is unavailable.
- If the method remains experimental and cannot be required, remove live thread
  settings updates from the product path until the protocol is stable.
- Do not keep global "disable future attempts" fallback state for unsupported
  protocol methods.
- Do not support deprecated Codex server request methods in the harness
  registry. Generated upstream constants may exist, but product support must be
  gated by the explicit registry.

### Implementation Steps

1. Remove `codexThreadSettingsUpdateDowngraded`,
   `codexThreadSettingsUpdateDowngradeDiagnostic`,
   `disableThreadSettingsUpdate`, and
   `isThreadSettingsUpdateUnsupported`.
2. Replace downgrade behavior with a specific command error that identifies the
   unsupported Codex method or missing capability.
3. Remove tests that expect downgrade success.
4. Add tests that verify unsupported required capabilities fail loudly and do
   not mutate selected model state as if the command succeeded.
5. Audit the Codex server request registry for deprecated protocol methods and
   keep only current, intentionally supported request kinds.

### Verification

- Focused Go harness tests should cover supported update, unsupported update,
  and unrelated RPC errors.
- Deterministic app workflow tests are required because this touches Codex
  harness behavior and chat command lifecycle.
- Live Codex E2E tests should run when `OPENAI_API_KEY` is present in `.env`;
  skip narrowly and report absence without printing the key.

## 4. Codex Protocol Generation

### Problem

The Codex protocol generator regex-parses Rust source and discovers used
protocol surface by scanning Go text for string literals and constant names.
Formatting changes, comments, tests, or incidental strings can affect generated
output.

### Long-Term Fix

Replace implicit discovery with explicit supported protocol registration backed
by checked protocol inputs.

The generator should:

- consume an upstream protocol JSON/schema snapshot, or another structured
  upstream artifact;
- consume one Go-owned supported-protocol registration input that lists the
  product-supported methods, notifications, requests, and schema names;
- verify every registered item exists in the upstream artifact;
- fail with a specific error when a registered item is missing or has an
  unsupported schema shape;
- avoid parsing Rust source for product behavior;
- avoid scanning `_test.go`, comments, or string literals to infer support.

If upstream does not expose structured schema for an experimental method, the
principled options are to remove that product feature until upstream does, or
check in a clearly named protocol input file with upstream provenance and fail
when it diverges. Do not synthesize long-term protocol contracts from regexes.

### Implementation Steps

1. Define the supported-protocol registration input and make it the only source
   of product support decisions.
2. Change the generator to validate that registration against structured
   upstream protocol data.
3. Remove usage scanning and Rust source regex parsing.
4. Keep generated outputs generated only; do not manually edit them.
5. Update generator tests to exercise semantic model validation rather than
   generated output formatting.

### Verification

- Generator tests should use small structured protocol fixtures and assert
  semantic outcomes: included method, missing method failure, unsupported schema
  failure, and deprecated method exclusion.
- Run the generator and then the narrow Go checks covering Codex harness
  protocol handling.
- Because generated protocol output affects Codex harness behavior, run the
  deterministic app workflow tests before finishing an implementation change.

## 5. Test Strategy Cleanup

### Problem

Some tests assert generated string snippets or exact IPC call order. Those tests
lock implementation shape rather than user-visible behavior.

### Long-Term Fix

Separate contract correctness from code-generation formatting.

Contract generator tests should focus on:

- endpoint registry ownership and duplicate route detection;
- type-shape semantics such as required fields, nullable fields, literal
  unions, and records;
- runtime decoder behavior in the generated TypeScript client;
- request construction behavior through the backend client.

Preload and IPC tests should focus on:

- whether exposed methods call the correct channels with the correct arguments;
- whether errors and malformed responses are surfaced correctly;
- whether the public API shape remains coherent.

They should not depend on large blocks of generated text, helper names, or
incidental nth-call ordering unless the order itself is the behavior being
tested.

### Implementation Steps

1. Replace generated TypeScript substring tests with semantic tests for
   `contractSpecs`, generated runtime decoders, and backend client behavior.
2. Keep at most one narrow smoke test that generated output is non-empty and
   parseable, if useful.
3. Collapse repetitive preload call-order assertions into table-driven behavior
   cases that assert method, channel, arguments, and result.
4. Delete tautological tests that only rerun a generator or formatter and
   compare checked-in artifacts to current output.

### Verification

- Run focused generator, backend client, preload, and renderer tests.
- After implementation stabilizes, run `./scripts/format.sh` and
  `./check_quality.sh --all` before committing source or test changes.

## 6. Module Boundaries And Maintainability

### Problem

Several core backend, store, component, and test files sit near the repository's
current line-count limits. The quality script currently defaults to 1,200 lines
for normal files and 1,500 lines for test files. The intended policy is 1,000
lines for regular files and 1,500 lines for test files, so the automation is
looser than the codebase standard for regular files and should be corrected.

The size makes behavior review harder, especially around chat lifecycle,
queueing, transcript rendering, and renderer state.

### Long-Term Fix

Split by domain responsibility while preserving production behavior.

Recommended backend boundaries:

- service orchestration
- run lifecycle
- queueing and promotion
- conversation persistence
- event publication and replay
- harness command handling
- Codex protocol/session handling
- approvals

Recommended renderer store boundaries:

- normalized chat state
- user operations and backend calls
- event reducer
- selectors
- persistence/reload handling
- error and operation-state handling

Recommended component boundaries:

- sidebar data model and row views
- chat composer
- model/settings controls
- transcript virtualization
- run activity timeline
- approval UI

Extraction should move cohesive behavior into named modules with narrow public
APIs. Avoid creating generic helper files that merely relocate complexity.

### Implementation Steps

1. Add module-level ownership comments only where names are not enough to make
   boundaries obvious.
2. Extract pure selectors and reducers before extracting side-effect-heavy
   code.
3. Move persistence and event serialization code behind small typed interfaces.
4. Split large tests by behavior area, not by implementation file.
5. Update the quality script defaults and help text to enforce 1,000 lines for
   regular files and 1,500 lines for test files.
6. Ratchet line-count limits downward only after the first successful splits, so
   the quality gate enforces the new shape without blocking unrelated work.

### Verification

- Run narrow tests after each extraction to prove behavior is unchanged.
- For any extraction touching chat behavior, Codex harness behavior, run
  lifecycle, queueing, approvals, event streaming, preload contracts, renderer
  chat state, or transcript UI, run deterministic Electron E2E tests through
  production paths.
- Finish broad implementation commits with `./scripts/format.sh` and
  `./check_quality.sh --all`.

## Suggested Sequence

1. Replace the sidebar navigation model. This fixes the recent-project UX bug
   and the large-workspace conversation disappearance while preserving the
   performance work.
2. Implement durable unread state. This touches chat event semantics and should
   be validated with deterministic E2E coverage.
3. Remove the Codex downgrade shim and make unsupported capabilities fail
   loudly.
4. Replace Codex protocol discovery with explicit registration and structured
   input validation.
5. Clean up implementation-coupled tests after the contract and protocol models
   are clearer.
6. Split large modules incrementally along the boundaries above, starting with
   the areas changed by the preceding fixes.
7. Align the quality script line-count defaults with the intended repository
   policy once the first split has landed, or immediately if the 1,000-line
   regular-file cap is already meant to be enforced.

## Acceptance Checklist

- Recent projects can be opened, removed, keyboard-selected, and tested through
  production app paths.
- Selected workspace conversations remain visible and usable with thousands of
  active workspaces.
- Unread indicators are driven by durable conversation semantics and survive
  reload.
- Unsupported Codex protocol capabilities fail specifically instead of silently
  downgrading.
- Deprecated Codex protocol methods are not registered as supported harness
  behavior.
- Protocol generation no longer infers support from Rust regex parsing or Go
  text scanning.
- Generator and preload tests assert behavior rather than formatting or
  incidental call order.
- Large chat/backend/renderer modules are split by responsibility, with tests
  organized around behavior.
- Quality scripts enforce the intended line-count policy.

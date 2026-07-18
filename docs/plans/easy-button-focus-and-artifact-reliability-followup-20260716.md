# Easy Button Focus And Artifact Reliability Follow-Up

**Date:** 2026-07-16

**Status:** Implemented; ready for final audit.

**Scope:** Remove the redundant Easy Button working presentation and make typed artifact delivery
reliable when an agent selects an artifact.

## Implementation Status

- [x] Solution 1: Remove the Easy Button `Working` presentation. Implemented and verified.
- [x] Solution 2: Present requested status above NOW. Implemented and verified.
- [x] Solution 3: Make the artifact tool contract hard to misuse. Implemented and verified.
- [x] Solution 4: Preserve actionable tool failures end to end. Implemented and verified.
- [x] Solution 5: Treat failed artifact attempts as unresolved delivery. Implemented and verified.

## Evidence

The latest production recording is `.recordings/20260716T155100Z`.

The Easy Button center displayed all of the following at once:

- `CURRENT FOCUS`: the stable conversation objective
- `Working`: a generic activity label
- a detailed working sentence
- `NOW`: a milestone describing substantially the same activity

The center therefore had a second progress channel competing with both Current Focus and NOW.

The same recording also proves that the missing table was not caused by artifact rendering:

1. The topic agent received the `setta.emit_artifact` tool and the task-agnostic artifact
   instructions.
2. It produced a naturally tabular result.
3. It called the artifact tool with only `{"kind":"table"}`.
4. The call failed because a table also requires a title, columns, and rows.
5. The agent-visible tool wrapper produced blank output, so the agent did not receive an actionable
   validation error.
6. The agent completed the turn with a Markdown table in prose.
7. The durable conversation store contains zero artifacts for the turn.

This is an artifact-call recovery failure, not an artifact-suitability decision.

## Principles

### One presentation owner per concept

The center owns intent and stable focus. NOW owns sparse progress. A requested status reply owns an
explicit answer to a status question through a temporary STATUS card above NOW. The same progress
sentence must not appear in multiple places under different labels.

### Typed failures must remain typed and visible

If a tool rejects input, the agent must receive a structured, actionable error that identifies the
invalid fields and whether correction is possible. A failed tool call must never collapse into
blank output.

### Artifact policy follows deliverable shape

Production prompts may describe durable narrative, tabular, quantitative, and file deliverables.
They must not mention repository line counting or any other acceptance-test task. The service must
not infer artifact suitability by scanning user text or assistant Markdown.

### No silent success after a known delivery failure

Once an agent attempts an artifact, failure is authoritative state. The system must either obtain a
successful corrected call or expose a specific artifact-delivery failure. It must not quietly
present prose as though the requested durable output succeeded.

### Clean replacement

Make no backward-compatibility shim, migration, legacy presentation path, field alias, dual
read/write path, or transitional fallback. Delete superseded UI and contract paths as their
replacements land.

## Solution 1: Remove The Easy Button `Working` Presentation

Remove the center `Working` label and its detailed working text. Do not rename or restyle it.

The central intent slot has only these user-facing states:

```text
idle before first focus       -> Conversation ready
topic capture                 -> Live transcription
accepted input pending        -> Exact accepted words
stable                        -> Narrator-owned Current Focus
explicit status interaction   -> Stable focus returns; reply appears in the STATUS card
terminal                      -> Stable focus remains; concise completion presentation is separate
```

Conversation status such as `working` remains valid domain state for controls, cancellation,
queueing, approvals, pane titles, and accessibility. It no longer generates a second center
progress sentence.

Working narrator projections may still update stable focus when the typed focus contract permits
it and may emit sparse milestones. They do not own an additional Easy Button body channel.

NOW remains the only passive progress presentation. It shows a bounded, fading milestone window
and never duplicates the stable focus merely to indicate that work continues.

## Solution 2: Present Requested Status Above NOW

When the user asks an explicit status question, the interaction follows this sequence:

```text
capture active       -> Live status question temporarily occupies the central intent slot
input accepted       -> Exact accepted question remains there while routing is pending
status route resolved -> Previous stable Current Focus returns unchanged
reply committed      -> One temporary STATUS card appears above the NOW milestone window
```

The STATUS card:

- is labeled `STATUS`;
- contains only the concise narrator status reply;
- is rendered at the top of the left rail, immediately above NOW;
- is visually distinct from NOW but remains part of the same non-scrolling rail;
- may be narrated once as the direct response to the user's question;
- is replaced in place by a newer status reply rather than accumulated;
- fades after a short presentation lifetime or when a meaningful work change makes it stale;
- does not enter the NOW milestone collection, create a history list, or add a scroll owner;
- does not modify Current Focus.

The status reply remains a typed narrator event rather than a renderer interpretation of arbitrary
assistant text. Its presentation lifetime is UI state derived from the event timestamp and
authoritative conversation changes; do not add polling.

If status routing or generation fails, restore the previous stable focus and show the existing
concise error presentation. Do not leave the question stranded in the central slot or manufacture
a status answer from milestones.

## Solution 3: Make The Artifact Tool Contract Hard To Misuse

Represent `setta.emit_artifact` as a strict discriminated union whose individual branches each
declare their complete required shape:

```text
markdown  -> kind, title, markdown
table     -> kind, title, columns, rows
bar_chart -> kind, title, items
file      -> kind, title, path, optional description
```

Keep the schema owned by the Go conversation domain and generate or derive provider-facing
surfaces from that owner. Do not maintain a second handwritten mirror.

Each branch must reject missing, mixed, unknown, or oversized fields specifically. The service
must not invent missing columns, convert prose into rows, or downgrade a malformed typed artifact
to Markdown.

The agent instructions remain short and general:

- use artifacts for durable user-facing deliverables
- choose the branch from the shape of the deliverable
- correct and retry a retryable artifact validation failure before completing the turn
- final prose summarizes a durable deliverable but does not replace it

## Solution 4: Preserve Actionable Tool Failures End To End

Define a typed dynamic-tool failure result with at least:

```text
code
message
retryable
fieldErrors[]
diagnosticReference
```

The conversation artifact handler returns stable error codes such as missing required fields,
row-width mismatch, invalid branch, payload limit exceeded, stale turn, or persistence failure.

The agent/provider bridge must:

1. return the failure through the provider's dynamic-tool response contract;
2. ensure the model-visible tool output contains the concise error message and field errors;
3. preserve the unsuccessful tool status rather than reporting an empty successful command;
4. record the tool name, error code, retryability, and diagnostic reference in trajectory and
   desktop recording data;
5. keep sensitive payload values out of diagnostics by default.

The JavaScript tool-call wrapper and the app-server response shape must agree on the content field.
Add a production-protocol test that fails if either successful or failed tool output becomes blank.

## Solution 5: Treat Failed Artifact Attempts As Unresolved Delivery

Track artifact attempts within the active conversation turn:

```text
not_attempted -> failed_retryable -> emitted
                            \-----> failed_terminal
```

After `failed_retryable`, the same agent turn remains responsible for correcting the call. A later
successful emission resolves the state.

If the provider completes the turn while its latest artifact attempt is still failed:

- preserve the agent's prose for diagnosis;
- do not publish an artifact-created event;
- expose a concise artifact-delivery failure and retry action;
- do not classify the turn as having successfully delivered its durable result.

This rule is deterministic because it responds to an actual typed tool attempt. It does not guess
whether arbitrary prose should have been an artifact.

## Verification

### Easy Button presentation

- During a running turn, the center contains the central intent slot and no `Working` body label or
  working-detail sentence.
- Stable focus does not change when ordinary commands start or complete.
- Sparse milestones appear only in NOW.
- While an explicit status question is captured and routed, its live and accepted text uses the
  central intent slot.
- Resolving a status route restores the exact prior stable focus and renders one temporary STATUS
  card above NOW.
- A newer status reply replaces the prior card, and expiry or meaningful progress removes it
  without creating history or scrolling.
- Status narration occurs at most once and the reply never enters the NOW milestone collection.
- Status-route failure restores stable focus and uses the existing concise error presentation.
- Queueing, approval, cancellation, failure, and stop controls still use authoritative working
  domain state.

### Artifact protocol

- A deterministic fake provider submits an incomplete table call, receives a non-empty structured
  validation failure, corrects it in the same turn, and emits exactly one table artifact.
- A provider that completes after a failed artifact attempt produces an explicit unresolved
  delivery failure rather than silent success.
- Successful and failed dynamic-tool responses both survive the production app-server protocol
  and are visible in recorded trajectory diagnostics.
- Restart/reload preserves successful artifacts and the terminal state of unresolved failures.

### General artifact policy

Use fast, small supplied-data scenarios unrelated to repository analysis:

- a naturally tabular durable result creates a table artifact on the first turn;
- a magnitude-oriented comparison creates a bar chart;
- a durable narrative creates Markdown;
- a generated file creates a file artifact;
- a short conversational answer creates no artifact.

The live ChatGPT-authenticated test must require the expected first-turn outcome. It must not hide a
first-turn failure by issuing a second prompt that explicitly dictates every tool argument. Tool
repair is tested separately by intentionally causing a malformed call through a deterministic
provider fixture.

Run the required deterministic Electron workflow through the production
Electron/main/preload/renderer/HTTP/store path, then the live Codex gates when ChatGPT auth is
available. Record before/after Easy Button presentation evidence under `docs/reports/performance/`.

## Definition Of Done

- The Easy Button center no longer displays `Working` or a duplicate working-detail channel.
- Current Focus is the single stable center concept; NOW is the single passive progress concept.
- Explicit status questions temporarily use the central intent slot, then restore stable focus and
  produce one replaceable, expiring, non-scrolling STATUS card above NOW.
- A malformed artifact call produces a non-empty, actionable agent-visible error.
- A retryable artifact failure can be corrected within the same turn.
- A turn cannot silently claim durable-delivery success while its latest artifact attempt failed.
- Natural structured deliverables reliably produce typed artifacts without task-specific
  production prompts or keyword heuristics.
- No compatibility, legacy, migration, transitional, alias, dual-path, or silent fallback code is
  introduced.

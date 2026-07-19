# Topic Conversation Narrator Current Commentary Plan

**Date:** 2026-07-20

**Status:** In Progress

**Scope:** Topic conversation narrator highlights, final summaries, narrator scheduling, narrator context, and automatic narrator speech. This plan addresses the latest recording where the artifact and work completion were visible long before the final summary was generated.

## ADHD quick read

The narrator is currently acting like a system that must read every little event in order before it talks. That includes low-level streamed text fragments.

That is the wrong shape for the product.

The narrator should act like live commentary:

- Work starts: it can describe the task.
- Work changes meaningfully: it can make a useful AI-generated highlight.
- Work finishes: it immediately gives an AI-generated final summary.
- Old highlight work must not delay or appear after the final summary.
- Startup must not speak old work.

This plan is judged by tests. If the tests fail, the design failed.

## Clean-cutover policy

This is a current-product architecture correction, not a compatibility project.

- Do not add migrations, compatibility shims, legacy readers, feature flags, dual paths, old-field aliases, or transitional adapters.
- Do not keep the old raw-event narrator projection path as a fallback.
- Do not hide stale narration with timing filters.
- Do not solve this by muting speech after startup or after completion.
- Remove replaced code and replaced tests in the same implementation.
- Keep AI-generated highlights.
- Keep AI-generated final summaries.

## What the latest recording proved

In `.recordings/20260720T180604Z`:

- Artifact emitted: `18:08:47.688`
- Agent turn completed: `18:08:56.984`
- Final summary narrator event created: `18:09:40.429`
- Final summary speech synthesis started immediately after creation: `18:09:40.440`

The summary was not late because of TTS playback. It was late because narrator generation did not start until much later.

The durable narrator state shows the cause. After the turn completed, the narrator advanced and checkpointed old trajectory chunks before it generated the terminal summary:

```text
observed 120, checkpoint 96
checkpoint 120
observed 170
checkpoint 170
observed 221
checkpoint 221
observed 272
checkpoint 272
observed 277, final summary emitted
```

Plain meaning: the narrator was catching up on old low-level history instead of immediately summarizing the finished work.

## Product contract

Setta should feel like it just works.

For narration, that means:

> Narration is live commentary over the current task. It should be timely, relevant, and disposable. Durable storage may remember narration, but user-facing narration must not behave like historical database cleanup.

The AI still decides the words. Product code decides the lifecycle rules:

- what kind of event can trigger narration;
- when stale narrator work is canceled or ignored;
- what current context the AI receives;
- which narration is eligible for automatic speech.

## Current architectural problem

The current narrator is coupled to a durable ordered projection over raw conversation trajectory.

That creates repeated UX failures:

- **Too much input noise:** token deltas and tiny transport events become narrator workload.
- **Backlog before relevance:** final summary waits for catch-up and checkpointing.
- **Wrong priority:** stale progress generation can delay terminal summary generation.
- **Wrong durability model:** missing narration is treated like state to repair later.
- **Speech confusion:** narration created late can sound like current work even when the user has moved on.

The fix is not another prompt tweak. Prompt changes help with wording. They do not guarantee timing.

## Target model

Introduce a narrator-facing semantic event feed.

The topic conversation system may still store detailed trajectory for debugging, replay, and app state. The narrator should not consume that raw stream directly for user-facing output.

The narrator consumes these semantic inputs instead:

- `task_started`
- `meaningful_progress`
- `approval_needed`
- `artifact_or_result_emitted`
- `task_completed`
- `task_failed`
- `task_canceled`

Each semantic input is created from authoritative product state, not from keyword guessing.

Examples:

- Many streamed text deltas plus one `agent_message_completed` become one semantic assistant-message event.
- An artifact emission becomes one semantic result event with artifact metadata.
- A terminal turn becomes one semantic terminal event with final status, final assistant message, emitted artifacts, failures, and objective.

## Hard invariants

These are the rules the implementation must satisfy.

1. **Terminal summary is immediate.**
   When a turn reaches `completed`, `failed`, or `canceled`, the terminal narrator request is submitted from the terminal snapshot without waiting for narrator checkpoint catch-up.

2. **Terminal summary wins.**
   When a turn reaches a terminal state, in-flight non-terminal narrator work for that same turn is canceled or made unable to commit visible narration.

3. **No stale highlight after terminal.**
   A progress highlight generated from pre-terminal context must not appear or speak after the turn has completed.

4. **No raw-delta requirement.**
   Final summary generation must not require the narrator to process every `agent_public_text_delta`.

5. **AI still writes the content.**
   Product code may assemble the semantic context, but the highlight text and final summary text are generated by the narrator model.

6. **Automatic narration is live-only.**
   Startup does not generate or speak missing narration for old completed turns.

7. **Speech follows current narration.**
   Automatic speech is eligible only for narration created by current live work. Voice capture or new user input drops pending automatic narrator speech.

8. **Internal narrator errors are not user tasks.**
   Invalid narrator model output is repaired, retried, or silently degraded. The user is not asked to retry schema, routing, or narrator formatting work.

## Non-goals

- Do not remove narrator AI.
- Do not make highlights non-AI.
- Do not make final summaries non-AI.
- Do not add a fixed rule like "only one highlight per turn."
- Do not use focus, pane visibility, event age, or speech mute windows as the core fix.
- Do not infer completion from artifact text or UI layout.
- Do not introduce a product mode that keeps the old projection behavior.

## Proposed architecture

### 1. Semantic narration feed

Add a small domain layer that converts committed topic-conversation state into narrator semantic events.

The feed should be explicit and typed. It should not be a string-based heuristic layer.

Suggested semantic event shape:

```text
NarratorSemanticEvent
  conversationID
  turnID
  semanticSequence
  kind
  sourceTrajectoryRange
  createdAt
  payload
```

Payload examples:

- `task_started`: objective, role profile, accepted steering
- `meaningful_progress`: completed command/activity summaries, plan changes, approvals
- `artifact_or_result_emitted`: artifact id, title, type, short structured description
- `task_completed`: objective, terminal status, final assistant message, artifacts, caveats
- `task_failed`: objective, failure type, visible failure message, partial artifacts

The semantic feed should be derived when live trajectory is committed. It should not run a startup scan to backfill old semantic events.

### 2. Narrator requests use semantic context

Change narrator projection requests to use semantic events plus the current authoritative snapshot.

Working highlight request:

- receives new semantic progress since the last committed narrator semantic cursor;
- receives current objective and current task state;
- asks the AI for zero or more timely highlights, capped by existing output limits.

Terminal summary request:

- receives the terminal snapshot;
- receives final assistant message;
- receives emitted artifacts;
- receives failures/caveats if any;
- asks the AI for a concise final summary.

The terminal request must not depend on checkpointing raw history.

### 3. Priority and cancellation

Change narrator scheduling rules:

- Terminal narration preempts working narration for the same turn.
- Preempted working narration cannot commit milestones.
- Checkpoint and history compaction cannot block terminal narration.
- Status replies requested by the user can remain high priority, but they should not turn stale automatic narration into visible output.

This can be implemented by generation tokens, turn terminal epochs, or actor-level cancellation. The chosen mechanism must be typed and deterministic.

### 4. Checkpointing becomes maintenance

If narrator context still needs compaction, keep checkpointing as internal maintenance.

But checkpointing must not be on the critical path for:

- terminal summary generation;
- speech playback eligibility;
- UI readiness;
- startup recovery.

If a terminal summary can be generated from the terminal snapshot, it should happen immediately even if narrator checkpoints are behind.

### 5. Speech eligibility stays simple

Automatic speech should play all live AI-generated highlights and final summaries when narrator voice is enabled.

Speech should not decide whether narration is semantically stale. The backend should avoid creating stale narrator events in the first place.

Renderer speech still enforces ownership:

- event belongs to this conversation;
- narrator speech is enabled;
- event is newly created from live work;
- event has not been dropped by capture/new-input preemption.

## Implementation phases

### Phase 1: Document and test the failure

Status: Complete.

Repository progress:

- Backend projector regression added for terminal summary bypass of raw-delta/checkpoint backlog.
- Direct `topic-conversation-pane-projection` Electron workflow coverage verifies terminal final summaries without raw checkpoint catch-up.

Add a deterministic workflow that reproduces the latest failure:

1. Start a topic conversation with narrator enabled.
2. Stream many assistant text deltas.
3. Emit an artifact.
4. Complete the turn.
5. Assert terminal summary request is submitted immediately after terminal completion.
6. Assert no checkpoint catch-up blocks terminal summary creation.

This test should fail on the current architecture before the fix.

### Phase 2: Introduce semantic narrator events

Status: Complete.

Repository progress:

- Added typed narrator semantic event contracts and live-commit derivation at the topic conversation boundary.
- The semantic feed ignores raw text deltas, emits completed assistant-message progress, surfaces approvals and artifacts, and emits terminal task events with committed turn/artifact state.
- Existing narration observer handoff now carries semantic events while keeping generation migration scoped to later phases.

Add typed semantic narrator events at the conversation boundary.

Convert raw trajectory into semantic events only for current live commits:

- collapse streamed text deltas into completed assistant messages;
- surface artifacts as result events;
- surface approvals as approval events;
- surface terminal state as terminal events.

Do not add compatibility readers for old data.

### Phase 3: Move narrator generation to semantic context

Make working highlights and terminal summaries consume semantic events and authoritative snapshots.

Remove the requirement that narrator observed cursor must advance through every raw trajectory event before terminal summary generation.

Delete tests that require terminal catch-up through raw deltas.

### Phase 4: Add terminal preemption

When terminal semantic event arrives:

- cancel active automatic working narrator generation for that turn;
- prevent late working narrator commits for that turn;
- submit terminal summary immediately;
- allow already committed highlights to remain, but do not allow new stale highlights after terminal.

### Phase 5: Keep checkpointing out of the user path

Retain checkpointing only if it is still needed for narrator context size.

Run it after user-facing narration, never before terminal summary.

If semantic context makes checkpointing unnecessary for narration, remove narrator checkpointing entirely.

### Phase 6: Tighten speech preemption

On voice capture start or new user input:

- drop queued automatic narrator speech;
- abort active automatic synthesis;
- stop active automatic playback;
- do not resume dropped automatic speech later.

This is not the core fix for stale narration. It is the user-input boundary that prevents old automatic speech from interrupting new work.

## Required tests

These tests are the trust contract for this plan.

1. **Terminal summary bypasses raw-delta backlog**
   A fake provider emits many text deltas, an artifact, and terminal completion. The final summary narrator request is submitted immediately after `turn_completed`, before any raw-trajectory checkpoint catch-up.

2. **Terminal preempts active highlight**
   A working highlight request is in flight when the turn completes. The terminal summary commits. The stale highlight does not commit or speak afterward.

3. **Multiple meaningful highlights still work**
   A long task emits multiple semantic progress events before terminal completion. The narrator may create multiple AI-generated highlights, and each committed highlight is eligible for automatic speech.

4. **No startup narration**
   Seed old completed turns with missing summaries and narration enabled. Start the app. Assert no new narrator events and no automatic speech.

5. **New input drops automatic speech**
   Queue or start automatic narrator speech. Submit new input or start capture. Assert pending automatic speech is dropped and does not resume.

6. **Invalid narrator output self-corrects**
   Provider returns invalid narrator output. Assert the app retries or repairs according to typed policy, and no user-facing "model returned invalid decision" style error appears.

7. **Artifact result summary stays timely**
   Emit a result artifact shortly before terminal completion. Assert the final summary references the final result and appears promptly after terminal completion.

## Verification commands

Start narrow:

```text
./scripts/go.sh test ./internal/conversation ./internal/narration
pnpm -C desktop exec vitest run src/renderer/src/features/global-speech/app-shell-speech-playback-controller.test.ts src/renderer/src/stores/conversation-projection-runtime.test.ts
```

Then run the required deterministic Electron workflow through production paths with temporary app data.

Before committing implementation work:

```text
./scripts/format.sh
./check_quality.sh --git-changes
```

For changes touching live Codex provider behavior, run live Codex E2E only when local ChatGPT auth is available. Do not use `OPENAI_API_KEY`.

## Success criteria

The plan succeeds only if these are all true:

- Final summary generation is tied to terminal task state, not raw narrator catch-up.
- Raw streamed deltas can no longer delay terminal summary.
- Stale highlights cannot appear after final summary.
- Startup cannot generate or speak old narrator output.
- AI still writes every highlight and final summary.
- The regression tests fail on the old behavior and pass on the new behavior.

# Topic Conversation Live Narration Lifecycle Plan

**Date:** 2026-07-20

**Status:** Proposed

**Scope:** Topic conversation provider-thread lifecycle, narrator projection lifecycle, and automatic narrator speech playback. This plan addresses the latest recording where a blank-looking conversation failed with `provider_thread_missing` and a voice summary for unrelated old work played immediately after app startup.

## Clean-cutover policy

This is a current-product lifecycle correction, not a compatibility project.

- Do not add backward-compatibility shims, migrations, legacy parsers, old-field aliases, feature flags, dual read/write, transitional adapters, or hidden fallback paths.
- Do not preserve startup narrator backfill as a disabled mode, hidden option, or speech-muted variant.
- Remove replaced recovery paths, tests, fixtures, and contract branches in the same implementation.
- Tests should prove only the new behavior. Delete tests that assert retroactive narrator recovery for already committed old work.
- If a persisted or provider contract prevents a clean replacement, stop and revise this plan instead of adding compatibility code.

## Product contract

Setta should feel like it just works.

The product contract after this work is:

> A blank conversation is provider-independent until the user sends work. If the app finds orphan provider-thread state on a no-history conversation, it repairs that internal state and starts the user's request on a fresh provider thread. Narrator highlights and final summaries are live experience, not database cleanup. They are generated only for current committed trajectory observed by the running app, and automatic speech only plays narration that belongs to current live work.

## Current-state diagnosis

The latest recording exposed two separate lifecycle bugs.

| Symptom | Current behavior | Root cause |
| --- | --- | --- |
| A blank-looking **New conversation** failed | The conversation was restored from durable app data with an old linked provider thread. The first user request routed correctly, then the provider reported that the thread was missing. | Conversation state and provider-thread state are not reconciled before starting work. A no-history conversation can still carry provider state that the runtime trusts. |
| A voice summary played for unrelated old work after startup | Startup narrator recovery generated a new final summary for an old terminal turn. The renderer treated the newly created narration event as automatic speech-worthy, then resumed it after voice capture. | Narrator backfill and live narration share the same event path, and speech playback treats creation time as relevance. |

The architectural issue is not that the app needs more filters. The app is missing two ownership boundaries:

1. Provider threads belong to the primary-agent turn lifecycle and must be reconciled before a turn can depend on them.
2. Narration belongs to the live user experience and must not be generated later as historical cleanup.

## Non-goals

- Do not mute the first few seconds after app startup.
- Do not filter by conversation title, event age, or the text of a narrator summary.
- Do not make `provider_thread_missing` a generic retry for every conversation.
- Do not silently create a fresh provider thread for a conversation that already has durable provider history.
- Do not keep narrator backfill and merely mark it as non-speech.
- Do not remove AI-generated highlights or AI-generated final summaries from live runs.

## Target invariants

1. **No-history conversations do not depend on provider state.**
   A conversation with no durable provider-backed turn history is allowed to have no provider thread. If stale provider-thread state exists there, it is an internal orphan and must be cleared or replaced before the user's turn starts.

2. **First-turn provider-thread loss self-repairs.**
   If the provider reports a missing thread before any durable provider turn has been committed for the conversation, Setta clears the orphan binding, creates a fresh provider thread, and retries the same turn once without surfacing a failure.

3. **Provider history is not silently forked.**
   If a conversation has durable provider history and its provider thread is missing, Setta must not pretend continuity exists on a new thread. That path needs a specific repair policy or a specific user-visible failure, but not an automatic fork.

4. **Automatic narrator generation is live-only.**
   The narrator service generates highlights, focus text, and final summaries only from `ObserveCommittedTrajectory` events emitted by the current running app process. It does not scan old trajectory rows at startup to fill missing narration.

5. **Restart does not retroactively narrate terminal work.**
   If a turn reached a terminal state before the narrator generated a final summary, that missing final summary stays missing. Reopening the app does not create it.

6. **Active recovered work can still be narrated from new live events.**
   If primary-agent work is genuinely still running after restart and emits new trajectory after recovery, that new trajectory may be narrated. Previously committed trajectory is not backfilled.

7. **Speech capture cancels unrelated automatic speech.**
   Starting voice capture or submitting input drops pending automatic speech. It must not pause an unrelated automatic summary and resume it after capture.

## Implementation plan

### Phase 1: Provider-thread lifecycle repair

Add one explicit provider-thread reconciliation step before a topic turn can start or resume a provider thread.

The reconciliation should classify the snapshot into current states:

- `no_provider_history`: no prior turn has a provider turn id and the binding has not been attached to a durable provider turn.
- `linked_provider_history`: the binding corresponds to durable provider-backed conversation history.
- `broken_provider_history`: durable provider history exists, but the binding is missing, unavailable, or inconsistent.

For `no_provider_history`:

- If there is no binding, start a fresh provider thread as today.
- If there is an orphan binding, remove or replace it in the same turn-start flow and start a fresh provider thread.
- If `provider_thread_missing` still occurs before any provider turn is committed, clear the orphan binding and retry the same user turn once.

For `linked_provider_history`:

- Resume the linked provider thread as today.
- If the provider reports it missing, mark the binding missing and fail specifically. Do not fork the conversation onto a fresh thread.

For `broken_provider_history`:

- Fail loudly with a specific internal state error until a real reconstruction policy exists.
- Do not guess, search by title, or create a new provider thread as if continuity were intact.

Expected touch points:

- `internal/conversation/service_thread_binding.go`
- `internal/conversation/service_agent_failures.go`
- `internal/conversation/service_turns.go`
- store methods for clearing or replacing orphan thread bindings, if needed
- generated contracts only if the event stream needs to represent a cleared binding explicitly

### Phase 2: Delete narrator startup backfill

Remove narrator recovery as a startup behavior.

Delete or replace these concepts:

- `RecoverCommittedTrajectory`
- `ListNarratorRecoveryTargets`
- terminal narrator recovery target queries
- working narrator recovery target queries that re-admit already committed trajectory
- `recoverTerminalTrajectory`
- runtime startup calls that invoke narrator recovery

Keep the live push boundary:

```text
conversation lifecycle commits trajectory
  -> observeCommittedTrajectory
  -> narration service ObserveCommittedTrajectory
  -> AI-generated focus/highlight/final summary for that live observation
```

Do not replace recovery with an age check or startup session filter. The simpler rule is that automatic narrator projection is not a historical repair job.

Checkpointing may remain only for live narrator context management. It must not trigger terminal catch-up or summary generation for old committed terminal turns.

Expected touch points:

- `internal/narration/service_projector.go`
- `internal/narration/service.go`
- `internal/conversation/store_narrator_recovery.go`
- `internal/runtime/base_services.go`
- narrator recovery tests that currently expect startup backfill

### Phase 3: Make renderer subscriptions stop waiting for old final summaries

Remove the renderer rule that keeps released terminal conversations subscribed solely because a final summary has not arrived.

The current `conversationProjectionNeedsKeepAlive` behavior makes terminal missing narration look like pending live work. After this plan:

- keep alive while a retained or recently released conversation is still actually `working` or `waiting_for_approval`, when that is needed for live speech continuity;
- do not keep a terminal stream alive to wait for missing final narration;
- do not treat missing terminal narration as recoverable renderer state.

Expected touch points:

- `desktop/src/renderer/src/stores/conversation-projection-runtime.ts`
- `desktop/src/main/conversation-event-registry.ts`
- related renderer and IPC tests

### Phase 4: Make capture preemption discard automatic speech

Change speech playback preemption semantics so capture is an interruption boundary for automatic narration.

When voice capture starts:

- drop queued automatic narrator speech from every conversation;
- abort active automatic synthesis;
- stop active automatic playback;
- preserve only explicit replay or other user-requested speech, if such a path still exists;
- do not resume dropped automatic speech after capture ends.

This keeps the app from talking over the user's new request with older narration.

Expected touch points:

- `desktop/src/renderer/src/features/global-speech/app-shell-speech-playback-controller.ts`
- `desktop/src/renderer/src/features/global-speech/app-shell-speech-playback.tsx`
- speech playback controller tests

### Phase 5: Tighten live speech eligibility

Keep automatic narrator speech tied to live narrator events rather than to durable narration records in general.

The renderer should continue to build speech intents from `conversation.narration.created` events, but those events should now only be produced by live narrator projection. The playback layer should still enforce basic ownership:

- the conversation projection is hydrated;
- narrator speech is enabled for that conversation;
- the narration event belongs to that conversation's presentation profile;
- final summaries have an authoritative turn status;
- topic descriptors remain visual-only.

Do not add broad heuristics such as "only focused pane may speak" unless product behavior explicitly changes. The immediate bug is not that visible live narrator speech exists. The bug is that old work can generate fresh narrator events and be spoken out of context.

## Verification plan

Add deterministic production-path Electron workflows using temporary app data.

Required cases:

1. **Stale blank binding self-repair**
   Seed or create a blank topic conversation with an orphan linked provider thread whose provider returns missing. Submit first input through the real renderer, preload, IPC, HTTP, store, and fake Codex provider path. Assert that the user turn completes on a fresh provider thread and no `provider_thread_missing` failure appears in the UI.

2. **Provider history does not fork silently**
   Seed a conversation with durable provider-backed history and a missing provider thread. Submit continuation input. Assert that Setta marks the binding missing and fails specifically, without creating a fresh provider thread.

3. **No narrator startup backfill**
   Seed an old completed turn with no final summary and narrator speech enabled. Start the app. Assert that no new `final_summary` narration event is created and no speech synthesis or playback starts.

4. **Live terminal summary still works**
   Run a current live conversation to completion with narrator speech enabled. Assert that the AI-generated final summary is created for the live terminal event and can be spoken automatically.

5. **Capture drops unrelated automatic speech**
   Queue or start automatic narrator speech, then start voice capture. Assert that the speech item is dropped with capture reason and is not synthesized or played after capture ends.

Focused checks:

```text
./scripts/go.sh test ./internal/conversation ./internal/narration ./internal/runtime
pnpm -C desktop exec vitest run src/renderer/src/features/global-speech/app-shell-speech-playback-controller.test.ts src/renderer/src/features/global-speech/app-shell-speech-playback.test.ts src/renderer/src/stores/conversation-projection-runtime.test.ts
```

Broader required checks for implementation:

```text
node desktop/tests/electron/run-workflows.mjs --workflow topic-conversation-provider-thread-lifecycle
node desktop/tests/electron/run-workflows.mjs --workflow topic-conversation-speech-arbitration
./scripts/format.sh
./check_quality.sh --git-changes
```

The implementation should also add and register a focused Electron workflow for the narrator startup and capture-drop cases above if they do not fit cleanly into an existing workflow without making that workflow too broad.

Run the live Codex E2E tests when the local Codex CLI is signed in with ChatGPT auth. Do not use `OPENAI_API_KEY` for live Codex coverage. If ChatGPT auth is unavailable, record that the live-provider tests were skipped and do not treat the skip as provider proof.

## Expected result

After this work:

- opening the app does not generate or speak summaries for old terminal work;
- a blank conversation cannot fail first input because of orphan provider-thread state;
- a conversation with real provider history does not silently lose continuity;
- narrator highlights and summaries remain AI-generated for live work;
- starting a new voice request stops unrelated automatic speech instead of resuming it later.

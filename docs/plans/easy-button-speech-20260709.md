# Easy Button Speech Input And Output Plan

**Date:** 2026-07-09
**Updated:** 2026-07-10
**Status:** Implementation in progress — Phase 1 items 1-3 audited complete
**Extends:** `docs/plans/easy-button-pane-20260708.md`

## Outcome

Add real voice input and output to the Easy Button pane without changing the
hidden orchestrator or narrator architecture:

- the user can tap the center control, speak a new request, and tap again to
  submit the final transcript through the existing `EasyRun.Start` path;
- while an easy run is working, the same recorder sends completed speech
  through the existing `EasyRun.Steer` path;
- typed and spoken requests enter the same lossless chat/run record used by the
  regular chat UI, without narrator rewriting or Easy Button-specific
  condensation before the working agent receives them;
- the narrator maintains a persisted `Current focus` in the center as a concise
  projection of the active objective and constraints, while the left `NOW`
  rail remains narrator highlights only;
- the pane can speak the exact persisted terminal summary;
- an explicit opt-in mode can also speak newly arriving narrator highlights;
- typed input, the secondary run-stop control, artifacts, narrator highlights,
  and the narrator continue to work as they do now.

This plan deliberately uses two task-specific OpenAI products:

- `gpt-realtime-whisper` in a Realtime **transcription** session for live
  microphone-to-text;
- `gpt-4o-mini-tts` through `/v1/audio/speech` for text-to-speech.

`gpt-realtime-2.1` is not part of this implementation. It remains a candidate
for a later, separately designed conversational voice mode.

## Clean-Break Implementation Requirement

Implement this plan only as the new target architecture. Do not add any
backward compatibility, legacy support, data migration, transitional adapter,
dual read/write path, old-field alias, fallback for an earlier persisted shape,
or temporary feature-flagged implementation.

Concretely:

- bump the Easy Run persisted schema from version 1 to version 2 and bump the
  owning backend protocol version when the Go contracts change;
- write and accept only the version-2 shape. Earlier Easy Run records and
  missing required version-2 fields fail loudly as unsupported state; they are
  not upgraded, inferred, rewritten, silently ignored, or automatically
  deleted;
- make Current focus required on every newly created Easy Run, including its
  explicit revision-zero value. Do not derive it at read time to accommodate a
  record that lacks the field;
- remove replaced fields, events, renderer state, fixtures, and mockup behavior
  in the same implementation that introduces their replacements;
- regenerate the current TypeScript surface from Go and update consumers
  directly. Do not retain deprecated generated types or accept both protocol
  shapes;
- rebuild test fixtures and use fresh temporary app data. If a developer has
  pre-version-2 Easy Run presentation data, clearing that disposable data is an
  external development operation, not code this implementation performs.

This schema break applies to Easy Run presentation state. It does not authorize
deleting or rewriting the independently owned full-fidelity chat conversation
record.

## Settled Product Decisions

1. **Keep and extend the current narrator.** The existing Easy Button narrator
   remains the sole model author of current-focus revisions, highlight text,
   and the narrative part of the terminal summary. Speech output renders
   authoritative persisted highlight and summary strings; it does not ask a
   second model to rewrite them.
2. **Use one short-lived transcription session per utterance.** Do not keep a
   Realtime conversation alive across requests, steering turns, pane changes,
   or reloads. Each recording has an independently clean lifecycle and no
   provider-side conversational state to recover.
3. **Use tap-to-toggle recording.** Tap starts microphone capture. Tap again
   commits the utterance. `Escape` cancels without submitting. This works on
   desktop, touch devices, and keyboards without a press-and-hold-only path.
4. **Automatically submit a successful final transcript.** A final transcript
   starts a new easy run or steers the active run. If submission fails, preserve
   the transcript in the footer input so the user can edit or retry it.
5. **Text remains authoritative.** Partial transcript deltas are presentation
   state. Only the provider's completed transcript is eligible for submission
   and persistence through the existing Easy Button command path.
6. **Keep the execution record lossless.** The hidden Easy Button conversation
   is the same authoritative user/agent interaction record the regular chat UI
   would show. Initial requests and accepted steering messages use the existing
   chat input, message persistence, provider delivery, transcript, and run
   lifecycle paths. The narrator observes those facts after submission; it
   never edits, replaces, summarizes, or sits between user input and the working
   agent. Speech origin changes only how a `ChatInput` is produced.
7. **Replace the standing initial request with `Current focus`.** The center
   starts with the shared-normalized initial request and may be revised by the
   narrator as accepted steering or meaningful objective progress changes the
   active goal. It describes the current objective and still-active constraints,
   not recent activity. It is visibly narrator-derived, never presented as a
   verbatim user quotation, and cannot mutate the underlying conversation.
8. **Keep `NOW` narrator-only.** The left rail remains the existing sparse,
   chronological list of narrator highlights. Raw typed or spoken steering does
   not appear there, does not count against highlight caps, and is never spoken.
   A user-facing request-history surface is deferred; full-fidelity source
   messages already remain in the hidden chat record.
9. **TTS uses persisted source IDs, not renderer-supplied prose.** The renderer
   requests speech for an easy-run summary or highlight by ID. The backend
   resolves the exact stored text and sends that text to OpenAI.
10. **Speech output is opt-in and terminal-status-aware.** The initial
   device-local output mode is `off`. A live `completed` or `failed` terminal
   transition may speak automatically when final speech is enabled. A
   `stopped` run never speaks automatically: speaking immediately after the
   user presses Stop would contradict that instruction. Manual replay remains
   available for completed, failed, and stopped summaries whenever speech is
   configured.
11. **Voice output controls live in the pane top bar.** Users may choose
   `final` or `highlights_and_final` from the top-bar audio menu. The same
   control shows synthesizing, speaking, stopped, and failed playback states;
   when speech is unconfigured it is replaced by the top-bar `Voice off`
   explanation. This keeps playback controls out of the height-budgeted center
   composition.
12. **Playback points at its persisted source.** While a highlight is being
   spoken, that highlight's dot becomes a small equalizer and its text lifts to
   full foreground. While the terminal summary is spoken, the summary gets the
   same inline equalizer and foreground lift. Output mode decides whether
   speech occurs; run state and the source ID decide what is visibly speaking.
13. **Make model-authored presentation text work for both eye and ear.** The
   existing narrator remains the sole author, but its prompt must require short,
   grammatical, pronounceable highlights and summaries. Avoid paths, terse
   identifiers, unexplained abbreviations, symbolic duration formats, and
   visual-only fragments. Do not add a second rewriting model before TTS.
14. **Persist a human-readable mechanical summary.** Replace compact mechanical
   tails such as `Done in 2m14s - 3 artifacts` with backend-owned natural text
   such as `Done in 2 minutes 14 seconds with 3 artifacts.` Apply correct
   singular/plural forms to completed, failed, and stopped summaries. The
   displayed and spoken `EasyRun.Summary` remain the same exact persisted
   string, including when narrator degradation leaves only mechanical facts.
   Do not parse or rewrite the tail in the renderer or speech service.
15. **Use equal rail tracks.** Adopt the updated mockup's equal
   `minmax(260px, 340px)` left and right tracks so the center stage is actually
   centered. This deliberately fixes the existing 40px offset in the shipped
   pane and must update the pixel-match baselines and probes.
16. **Speech output modes remain device-local.** Users may choose `final` or
   `highlights_and_final`. A terminal replay button remains available when
   speech is configured, even when automatic playback is off.
17. **Use the built-in `marin` voice initially.** Voice selection and custom
   voices are deferred. OpenAI currently recommends `marin` or `cedar` for best
   quality; one fixed voice keeps the first contract and evaluation surface
   small.
18. **Use bounded WAV responses for v1 TTS.** The backend requests `wav`, caps
   the upstream response, returns it as generated-contract base64, and the
   renderer plays a Blob. This is appropriate for the existing short highlight
   and 1-2 sentence summary contracts and crosses Electron IPC and the PWA API
   uniformly. Raw chunked TTS proxying is deferred unless measurement shows
   whole-response latency is unacceptable.
19. **No model or browser fallbacks.** If OpenAI speech is unavailable, fail
   visibly and keep typed Easy Button operation available. Do not silently
   fall back to browser speech recognition, browser `speechSynthesis`, another
   OpenAI model, a local Whisper process, or a heuristic transcript.

## Authentication And Billing Boundary

OpenAI speech calls use an OpenAI Platform API key and usage-based API billing.
They do not reuse Codex's ChatGPT subscription authentication.

For this first implementation, the runtime reads the key from:

```text
SETTA_OPENAI_SPEECH_API_KEY
```

Use this Setta-specific variable rather than `OPENAI_API_KEY`. The backend
currently spawns Codex processes from its own environment; a generic
`OPENAI_API_KEY` could unintentionally change Codex from ChatGPT authentication
to API-key authentication. The speech key must be copied into the speech
client's configuration only and must never be exported to a Codex child.

The v1 credential rules are:

- the key lives only in the Setta runtime process environment;
- it is never returned by an endpoint, sent through IPC, written under the app
  data directory, included in diagnostics, or recorded in test artifacts;
- the renderer receives only a short-lived Realtime client secret attached to
  a transcription-only session;
- the backend supplies a stable, privacy-preserving
  `OpenAI-Safety-Identifier` when minting that client secret, derived from the
  authenticated device principal rather than a workspace name, path, or raw
  user identifier;
- `setta serve` and the Electron-spawned `setta-backend` both map the
  Setta-specific environment value into `runtime.Config`;
- a runtime without the key starts normally and reports speech as
  `not_configured`; text-only Easy Button behavior remains fully functional;
- API-key entry, keychain persistence, and account-management UI are deferred.
  A later credential design must work for headless remote runtimes, not only an
  Electron-local OS keychain.

## Existing Boundaries To Preserve

- `internal/chat` continues to own the full-fidelity conversation, including the
  initial user message, steering messages, assistant output, provider events,
  transcript blocks, and run lifecycle. Easy Button must not create a second
  conversation record or a reduced execution prompt.
- `internal/easyrun` owns derived easy-run presentation state: current focus,
  narrator highlights, artifacts, narrator health, and terminal summaries.
- The narrator continues to observe typed chat/easy-run events and make sparse
  structured Codex calls. It is not replaced or fed audio.
- The renderer continues to consume typed Easy Run contracts and events; it
  never reads the hidden transcript.
- Voice input calls the existing generated `StartEasyRun` or `SteerEasyRun`
  endpoint only after transcription completes. Typed and spoken input converge
  on the same Go-owned chat input and regular-chat persistence/delivery path;
  the renderer never asks the narrator to rewrite input before submission.
- The center control is the recorder/steering affordance. The secondary Stop
  button remains the only control that cancels the active agent run.
- The center control remains a microphone whenever speech is configured,
  including terminal states. Run outcome is communicated by border/rail tone,
  the summary check mark, and the completion pulse rather than changing the
  recorder into a status glyph. Only `completed` receives the check mark and
  confirmation pulse; `failed` receives alarm tone; `stopped` rests neutrally.
- Endpoint request and response types remain Go-owned in the
  `internal/httpapi` endpoint registry and are regenerated into TypeScript.
- No capture or playback state is added to the persisted EasyRun schema.
  Recording, provider-session, queue, playback, and device-preference state are
  client state. Current focus is persisted presentation state. Accepted
  steering remains chat history regardless of whether it originated from text
  or voice.

## Architecture

### Speech to text

```text
Easy Button renderer
  -> authenticated Setta endpoint: create transcription session
  -> runtime uses permanent API key with /v1/realtime/client_secrets
  <- short-lived client secret + fixed WebRTC endpoint/session metadata
  -> renderer sends microphone audio directly to OpenAI over WebRTC
  <- gpt-realtime-whisper transcript delta/completed events
  -> completed text enters existing EasyRun start-or-steer path
```

The runtime never proxies or stores microphone audio. This matters for remote
runtimes and the Android PWA: the microphone stays on the device where it was
captured, while the permanent API key stays on the user-owned runtime.

The backend attaches this backend-selected session configuration to the client
secret:

- `session.type = "transcription"`;
- `audio.input.transcription.model = "gpt-realtime-whisper"`;
- `audio.input.transcription.delay = "medium"` initially;
- `audio.input.turn_detection = null`, because the center control supplies an
  explicit push-to-commit boundary;
- no prompt, tools, assistant response, or output audio.

The renderer does not override that configuration when opening the WebRTC
connection. The backend owns the model, delay, client-secret TTL, endpoint, and
recording limits. Return those effective values in the generated session
contract rather than mirroring constants in TypeScript.

### Lossless execution and narrator-derived presentation

```text
Typed footer text ───────┐
Completed voice STT ─────┴─> EasyRun Start/Steer
  -> shared regular-chat ChatInput validation and normalization
  -> full user message persisted in the hidden conversation
  -> exact same prepared input delivered to the working agent
  -> normal assistant/provider interaction remains in the chat record
                              │
                              └─> narrator observes accepted facts
                                    -> persisted Current focus
                                    -> persisted NOW highlights
                                    -> persisted terminal summary
```

The first branch is the execution plane and is authoritative. `EasyRun.Start`
and `EasyRun.Steer` must delegate to the existing chat APIs, which already
persist steering as user-authored chat messages and deliver it through the
provider steering path. Do not add `EasySteeringEntry`, `steering.json`, a
parallel Easy Run transcript, or Easy Button-specific prompt rewriting. If the
regular chat UI later opens the hidden conversation, it must be able to render
the same lossless user/agent interaction.

"Exact" means the working agent receives the same prepared `ChatInput` that the
regular chat path would send after its shared validation and normalization. The
Easy Button layer must not perform an additional paraphrase, summary, keyword
extraction, punctuation pass, or narrator transformation. For voice, the
provider's completed transcript becomes that input; partial transcripts and raw
audio are not conversation messages.

After a steering call succeeds, use the returned persisted chat user message as
the narrator's authoritative `user_steer` input. Do not reconstruct it from the
renderer request. The Easy Run service marks focus as updating, appends the
exact accepted message text to the narrator's typed digest, and requests an
immediate narrator projection. This happens after the working-agent delivery
path succeeds, so a rejected or failed steering attempt changes neither focus
nor NOW.

The presentation plane is deliberately lossy:

- `Current focus` expresses the active objective and still-applicable
  constraints. It starts as the shared-normalized initial request, is visibly
  narrator-derived after revision, and is never sent back to the working agent.
- `NOW` remains `Highlights []EasyHighlight`: sparse narrator-authored phase
  changes in their existing backend order. Steering does not render in the
  rail, and a focus revision is not itself a highlight.
- the terminal summary remains the narrator's concise answer plus backend-owned
  mechanical facts.

Extend narrator state with a focus-dirty flag and digest watermark. Accepted
steering bypasses the normal eight-entry/15-second threshold. If a narrator call
is already in flight, queue one immediate follow-up after it finishes. Saving an
older result must not clear `updating` while a newer accepted steer remains
unconsumed. Narrator calls remain serialized; do not add polling or concurrent
focus-specific model calls.

On ordinary cadence calls, the narrator may revise focus only when evidence
shows that a requested subgoal completed and another requested subgoal became
active. It must otherwise return the previous focus verbatim. Progress text may
change which requested subgoal is current, but it may never invent a new user
requirement. Uncertainty means retaining the previous focus.

### Text to speech

```text
Live narrator-highlight or terminal run event
  -> renderer creates a playback intent containing persisted IDs only
  -> authenticated Setta synthesis endpoint
  -> runtime resolves exact text from the latest EasyRun snapshot
  -> runtime calls /v1/audio/speech with gpt-4o-mini-tts + marin + wav
  <- bounded WAV bytes
  <- generated SpeechAudio JSON with base64 payload
  -> renderer Blob URL -> HTMLAudioElement playback
```

The synthesis endpoints do not accept arbitrary text, chat-message IDs, or the
current-focus projection. This makes the stored narrator highlight or summary
the single source of truth, prevents a renderer bug from synthesizing text
different from what the pane displays, and guarantees user steering and focus
copy are never spoken as narration.

## Go-Owned Contracts

Add an `internal/speech` package that owns provider constants, public types,
provider calls, validation, and error classification. Suggested types and
endpoint registry entries follow; names may change during implementation, but
the ownership and separation may not.

### Easy Run current-focus contracts

These contracts remain owned by `internal/easyrun`, not `internal/speech`:

- `EasyRunFocusStatus`: `current | updating | stale`;
- `EasyCurrentFocus { revision, text, updatedAt, status }`;
- required `EasyRun.CurrentFocus EasyCurrentFocus`.

Persist Current focus directly in the version-2 `run.json` record. Revision zero
is written when the run is created with `text = EasyRun.RequestText`,
`updatedAt = EasyRun.StartedAt`, and `status = current`. A version-2 run without
Current focus is corrupt state and must fail validation. Do not add
`focus.json`, a missing-field fallback, or a separate focus-history collection.
Publish focus changes through the existing `easyrun.run.updated` event, whose
payload already carries the complete Easy Run.

On an accepted steer, persist/publish `status = updating` without changing the
last text. After the narrator evaluates every accepted steer through the saved
digest watermark, persist/publish the revised text with `status = current` and
an incremented revision. If narration fails, preserve the last good text and
publish `status = stale` alongside the existing typed
`NarratorStatus = degraded`; the pane must say that the instruction was sent
but the displayed focus may be outdated.

If working-agent delivery succeeds but updating the focus projection fails,
return a specific partial-outcome error such as `steering accepted but focus
update failed`. Never retry the steer automatically. The UI must not place the
text back into a composer in a way that implies it was rejected or encourages a
duplicate instruction.

The focus string is presentation prose, not an execution prompt. Require
non-empty text and valid timestamp/revision/status, and enforce a narrator
output length bound in the JSON schema without truncating. The initial
request-derived revision may be longer and remains visually clamped by the
existing center-copy budget. `EasyRunSnapshot.Highlights` and
`easyrun.highlight.created` remain unchanged, and the accessible rail name
remains `Highlights` while the visible label remains `NOW`.

Adding the generated focus contract changes the backend protocol surface. Bump
its owning protocol version when regenerating, and bump the Easy
Run store to schema version 2. Version 1 is unsupported; do not add an old-field
alias, dual read/write path, data migration, or renderer compatibility shim.

### Capability contract

- `SpeechProviderStatus`: `configured | not_configured`.
- `SpeechCapabilities`:
  - provider status;
  - transcription model;
  - synthesis model and voice;
  - maximum recording seconds;
  - maximum accepted transcript characters;
  - maximum synthesis input characters;
  - the required AI-voice disclosure text.
- `GET /speech/capabilities` as `ReadSpeechCapabilities`.

Capabilities are configuration facts, not a provider health estimate. Do not
poll OpenAI or report a guessed availability status. Authentication, quota,
network, and model-access errors surface when a real operation is attempted.

### Realtime transcription contract

- `CreateSpeechTranscriptionSessionRequest { workspaceId }`.
- `SpeechTranscriptionSession`:
  - short-lived `clientSecret`;
  - RFC3339 `expiresAt`;
  - `webRTCURL`;
  - effective model and delay;
  - maximum recording seconds and transcript characters.
- `POST /speech/transcription/sessions` as
  `CreateSpeechTranscriptionSession`.

The workspace ID scopes the operation to the active Easy Button surface and
gives errors useful context; it does not cause audio or partial transcripts to
be stored in that workspace.

### Easy Run synthesis contracts

Use separate endpoints instead of an optional-field union with invalid
combinations:

- `SynthesizeEasyRunSummaryRequest { workspaceId, easyRunId }`;
- `SynthesizeEasyRunHighlightRequest { workspaceId, easyRunId, highlightId }`;
- `SpeechAudio { audioBase64, mediaType, format, sourceId }`;
- `POST /speech/easy-runs/summary` as `SynthesizeEasyRunSummary`;
- `POST /speech/easy-runs/highlight` as `SynthesizeEasyRunHighlight`.

The speech service can depend on the existing `EasyRunService.ReadSnapshot`
shape through a narrow interface. It must require the requested run to be the
latest visible run, require summaries to be terminal and non-empty, and require
highlight ownership to match both run and workspace.

Register all four endpoints in `internal/httpapi/endpoints.go`; do not maintain
a second endpoint/type list in the generator. Run
`./scripts/go.sh run ./cmd/generate-contracts` whenever these Go-owned inputs
change, and never hand-edit `desktop/src/generated/backend.ts`.

## Backend Provider Implementation

Implement a small OpenAI client with `net/http` unless an SDK materially reduces
protocol risk. Avoiding a new dependency is preferable for the small number of
bounded upstream request shapes in scope. If an SDK is added, pin it exactly, use
`./update_dependencies.sh`, and run the supply-chain gate.

The client must:

- use a fixed production base URL and accept an injected transport/base URL for
  tests; any environment override must be named for E2E and rejected unless
  `SETTA_E2E=1`;
- set the bearer API key only on OpenAI requests;
- set the backend-owned `OpenAI-Safety-Identifier` on Realtime client-secret
  requests; never ask the renderer to provide or forward it;
- set explicit request and response deadlines;
- validate success content types and required JSON fields;
- read TTS through an `io.LimitReader`-style hard cap (initially 8 MiB plus one
  detection byte) and fail specifically on overflow;
- request `gpt-4o-mini-tts`, voice `marin`, and `response_format: "wav"`;
- reject synthesis source text over the documented 4096-character Speech API
  request limit rather than truncating it;
- never retry a synthesis request automatically, because an ambiguous retry can
  duplicate billable work;
- never log authorization headers, client-secret values, audio base64, full
  provider bodies, or complete user transcript text;
- close upstream response bodies and propagate cancellation from the Setta
  request context.

Classify provider failures into specific user-facing errors:

- speech is not configured;
- OpenAI rejected the credential or model access;
- rate limit or quota was reached;
- provider/network unavailable;
- provider response malformed;
- generated audio exceeded the local bound;
- requested easy-run speech source was missing or stale.

Do not expose raw upstream bodies, and do not convert failures into empty audio
or empty transcripts.

Wire the speech service in `internal/runtime` next to the existing base
services, pass it through `internal/httpapi.Services`, and add configuration
coverage for both `cmd/setta-backend` and `cmd/setta serve`.

## Voice-Ready Narrator Text And Mechanical Summaries

Update `productionNarratorPrompt()` and its strict output contract at the
narrator's owning boundary. Preserve all existing selectivity and safety rules.
Add `previousCurrentFocus` to the input and require `currentFocus` in every
working and terminal output alongside `highlights` and `summary`.

Current-focus rules are distinct from highlight rules:

- write one concise description of the active objective and still-applicable
  constraints, not a status update, activity log, quotation, or completion
  answer;
- incorporate every supplied accepted `user_steer` without losing constraints
  that it did not supersede;
- do not claim the current focus is the user's exact wording;
- revise it on ordinary progress only when a previously requested subgoal is
  demonstrably complete and another requested subgoal becomes active;
- when the objective has not materially changed, return
  `previousCurrentFocus` exactly;
- never invent a requirement from assistant output, tool activity, or a guess
  about user intent.

Every accepted highlight and terminal narrative must also work when read aloud
verbatim:

- use a short grammatical phrase or sentence rather than a label fragment;
- prefer common spoken wording over symbols or terse UI notation;
- do not include file paths, command names, opaque identifiers, raw status
  codes, or unexplained abbreviations;
- do not invent or repeat duration, artifact count, or failure facts owned by
  the service;
- keep highlights sparse; voice readiness is not permission to emit more of
  them.

Add `user_steer` as a typed narrator digest source, populated from the
successful regular-chat `SteerMessageResult.UserMessage`, not from the renderer
request. Preserve its complete shared-normalized text rather than applying the
digest's first-line condensation. It may change `currentFocus`, but the
narrator must not quote it back into the rail or treat the steering event itself
as a phase highlight.

At the backend-owned `mechanicalTerminalEasyRunSummary` boundary, replace
`time.Duration.String()` and hyphen-separated fragments with deterministic,
human-readable formatting. Examples define the intended shape:

```text
Done in 2 minutes 14 seconds with 3 artifacts.
Stopped after 1 minute 12 seconds with 2 artifacts.
Failed after 1 minute 47 seconds: benchmark harness exited with status 1. 2 artifacts were preserved.
```

The formatter owns zero/one/many artifact grammar and day/hour/minute/second
grammar, omits zero-valued leading units, and rounds only according to an
explicit backend rule covered by tests. It does not ask a model to paraphrase a
failure reason and does not maintain separate written and spoken tails.

`terminalSummaryWithNarration` continues to persist one exact visible string:
the narrator sentence(s), when healthy, followed by the human-readable
mechanical sentence(s). On narrator degradation, the same speakable mechanical
text stands alone. TTS reads that exact persisted string. Version-2 runs always
write this new form. Version-1 runs are unsupported and are neither read nor
migrated. Restored version-2 snapshots never auto-speak their summaries.

## Renderer Transcription State Machine

Keep provider/capture state separate from persisted run state. Use an exhaustive
TypeScript discriminated union with these conceptual states:

- `idle`;
- `requesting_permission`;
- `connecting`;
- `listening`;
- `committing`;
- `failed`.

The Easy Button visual state derives `listening` from active capture, but the
underlying easy run may simultaneously remain `working`. This distinction is
required for voice steering: listening must not hide, stop, or replace the
active run.

### Start and commit

1. Stop any currently playing TTS before opening the microphone, preventing
   feedback into transcription.
2. Confirm speech is runtime-configured and the client supports
   `navigator.mediaDevices.getUserMedia`, `RTCPeerConnection`, and a secure
   context.
3. Preserve any existing typed footer draft until speech succeeds.
4. Request an audio-only microphone stream.
5. Request an ephemeral transcription session from the active runtime.
6. Open the WebRTC connection and data channel; enter `listening` only after the
   microphone track and provider connection are ready.
7. Render transcript deltas into one bounded text node in the center. Track the
   current provider item/session ID and reject stale or cross-session events.
8. On the second tap, disable the outgoing audio track, send
   `input_audio_buffer.commit`, and enter `committing`.
9. Replace all partial text with the authoritative
   `conversation.item.input_audio_transcription.completed` transcript.
10. Treat the provider's completed transcript as the candidate `ChatInput` and
    pass it through the same shared validation/normalization used by regular
    chat. If that path rejects it as empty, return to the prior run view with a
    specific `No speech detected` message and do not call start or steer.
11. If an easy run is active, call the existing `steer`; otherwise call the
    existing `start`. Do not paraphrase, punctuate, summarize, or otherwise
    transform the completed transcript in the Easy Button layer.
12. On accepted steering, apply the backend's `CurrentFocus.status = updating`
    event and keep the last good focus visible. Do not show a timer-based
    `Steering: …` confirmation or create a renderer-authored rail row.
13. On success, clear the preserved footer draft. On an ordinary start/steer
    failure, put the final transcript in the footer input and focus it. If the
    steering message reached the working agent but the focus projection failed,
    surface that partial outcome, do not repopulate the input as though it were
    rejected, and do not encourage an automatic retry.

Do not infer completion from silence, delta timing, keywords, or punctuation.
Only the typed provider completion event commits text.

### Cancellation and teardown

- `Escape` cancels recording without committing and restores the footer draft.
- Closing the pane, changing runtime/workspace, reloading, losing the provider
  connection, stopping the active easy run, or starting a new capture closes
  the peer connection and data channel and stops every media track.
- A hard recording-duration limit is permitted as a resource/safety bound, not
  as voice-activity guessing. Reaching it must visibly stop capture and require
  the user to retry; do not silently auto-submit a partial transcript.
- Provider errors return to the prior run state, keep typed input intact, and
  expose a specific retryable message.
- No client secret, raw audio, partial transcript, peer state, or audio Blob URL
  survives reload.

## Easy Button UI

Implement the real voice surface that the original pane plan deferred:

- add `Mic`/active-recorder glyphs and accurate accessible labels; when speech
  is configured, keep the mic as the center glyph in idle, working, completed,
  failed, and stopped states because the control remains a recorder;
- restore the mockup's `listening` rings and listening transcript presentation
  only after recording works end to end;
- implement the updated soft inward-converging rings: they begin wide and are
  absorbed at the button rim, and appear only in true `listening`, never while
  permission or connection is pending;
- use helper copy for requesting permission, connecting, listening, and
  committing rather than showing a false listening state;
- render the live utterance in a dedicated bright `capture-line`, separate from
  the dimmed current focus. This is essential during `working + listening`,
  when the new user-authored transcript and narrator-derived working brief must
  both be visible without conflating them;
- keep the existing secondary Stop button visible when an agent run is working,
  including while recording steering;
- the center button's active action finishes the recording—it never cancels the
  agent run;
- replace the center's standing initial request with `Current focus`. Use the
  initial request as revision zero, then render persisted narrator revisions in
  the same bounded center-copy region. Add a quiet `Current focus` label or
  other unambiguous narrator-derived treatment so revised prose is never
  mistaken for a verbatim quotation from the user;
- while focus status is `updating`, keep the last text stable and show a small
  `Updating focus…` state. On `stale`, keep that text and change the existing
  narrator-degraded copy to say that the focus may be outdated. Do not render a
  transient `Steering: …` row;
- keep the left `NOW` rail highlight-only, using the existing
  `EasyRunSnapshot.Highlights` and narrator-highlight styling. Do not add user
  steering rows, a mixed timeline union, or request-history controls;
- use equal left/right rail tracks (`minmax(260px, 340px)`) so the stage is
  centered. Update the pixel-match driver/probe component map for the reserved
  action slot, Stop button, and new current-focus/capture elements;
- communicate terminal outcome independently from capture: completed gets the
  green/check/pulse treatment in the summary and rail, failed gets alarm tone,
  and stopped remains neutral. Do not replace the configured mic with the
  shipped terminal Check/X glyphs;
- when speech is unconfigured or unsupported, retain the current Sparkles/text
  focus behavior and do not display a fake microphone affordance;
- expose a concise setup explanation naming
  `SETTA_OPENAI_SPEECH_API_KEY` without ever displaying its value;
- preserve the footer as the editing/recovery path for permission, provider,
  empty-transcript, and submission failures;
- honor `prefers-reduced-motion`: listening rings become static while state,
  color, copy, and glyph continue to communicate recording;
- do not make every partial delta an assertive screen-reader announcement.
  Announce capture-state changes politely and keep the evolving transcript
  inspectable without reading the whole string on every delta.

For the PWA, microphone capture requires a secure context. Localhost and
Electron are valid targets; remote phone use must go through the HTTPS path
already described by the remote-runtime plan (for example Tailscale Serve).
Plain remote HTTP must fail with an explicit secure-context explanation.

## Visual Fidelity And Motion Matching

Treat `docs/mockups/easy_button_pane_mockup.html` as the canonical desktop
visual reference for the states and components placed in the comparison matrix.
Extend the existing Easy Button pixel-match harness rather than creating a
second screenshot system.

This supersedes the earlier decision in
`docs/plans/easy-button-pixel-match-20260709.md` that declined an image-diff
gate. Keep its useful component metrics and deterministic animation pinning,
but add actual mockup-versus-production pixel assertions for the states in this
plan.

- `desktop/tests/electron/easy-button-pixel-match-probe.js` remains the shared
  production/mockup component and computed-style probe;
- `easy-button-pixel-match.mjs` drives production through the real Electron,
  preload, HTTP, store, event, and renderer paths;
- `easy-button-mockup-render.mjs` drives the mockup in the same Electron/
  Chromium version;
- the mockup itself is the baseline rendered on each run. Do not check in a
  second set of golden PNGs that can drift independently.

The mockup's artifact content remains illustrative rather than contractual.
Keep its SVG `.a-plate` diagram, table `winner` row, and their demo styling in
the mockup, but exclude those mockup-only details from the pixel-match component
map and image-diff crops. They do not add a diagram/SVG artifact kind or winner
metadata to production. Continue comparing the shared artifact card, kicker,
title, table, bar-chart, and inset-surface styling already supported by the
production artifact contracts.

### Still-state fidelity

Build a curated state matrix, not the Cartesian product of every state axis. It
must cover the visually distinct combinations introduced or changed here:

- speech-unconfigured and configured idle;
- requesting permission, connecting, listening, committing, and capture
  failure;
- working, `working + listening`, current-focus updating, revised, and stale;
- a newly arrived highlight, synthesizing/speaking highlight, and playback
  failure;
- completed, failed, and stopped terminal summaries, including summary
  synthesis/speaking and replay;
- the output-mode menu and `Voice off` explanation;
- the desktop reference viewport and reduced-motion variants for motion-bearing
  states.

The standalone mockup remains a fixed desktop reference; do not retrofit a
compact design into it merely to create a comparison target. Compact production
layout is verified separately through production-path screenshots and strict
assertions for host containment, rail collapse, readable Current focus and
capture text, reachable controls, and absence of overlap or horizontal overflow.
Those compact screenshots are review artifacts, not mockup pixel-diff inputs.

Give the production fixture and mockup driver the same visible copy, in-scope
item counts, status, focus revision, playback source, and desktop viewport
before comparing them. Capture a whole-pane image when both surfaces have
identical containment; otherwise use the existing component crops with
integer-snapped bounds. Update the shared component map for Current focus,
capture line, rings, action slot, Stop, top-bar audio controls/menu, summary
replay/equalizer, and speaking highlight indicator.

For every pair, assert both:

1. the existing measured token, font, rectangle, and curated computed-style
   deltas; and
2. a real pixel-image diff between the mockup and production crops, with a
   generated side-by-side and heatmap artifact on failure.

Baseline repeated runs on the same pinned Electron build before choosing any
image tolerance. Prefer fixing nondeterministic fonts, transitions, fractional
crop origins, or fixture data over widening the threshold. Keep any remaining
threshold narrow, explicit, and adjacent to the compared component. Intentional
production-only differences require a named allowlist entry with a rationale;
no whole-region masks or broad percentage exception may hide an unknown delta.

### Animation fidelity through deterministic frames

Do not use a free-running video or wall-clock screenshot as a correctness gate.
Extend the existing Web Animations API pinning so each motion family can be
paused at named, normalized phases and rendered as deterministic stills:

- listening rings and control glow;
- working swirl and its crossfade while listening;
- transcript caret;
- committing and completion pulses;
- highlight arrival/latest-dot motion;
- top-bar, highlight, and summary equalizers;
- synthesizing and failure feedback;
- focus/caption transitions that remain after reduced-motion handling.

Capture at least start, quarter, midpoint, three-quarter, and end/resting frames
for finite motion, and representative phases across one full cycle for perpetual
motion. One-shot animations must be paused at the requested phase instead of
being force-finished by the generic probe. Compare the mockup and production
pixels at each named phase, and continue to compare the static motion contract:
keyframes, duration, delay, easing, direction, iteration count, fill mode,
filter/blend stack, and state-to-animation mapping.

Reduced motion has its own deterministic stills and must show the same state
without active animation. Performance measurement remains a separate gate:
pixel equality proves appearance, while the performance workflow proves that
blurred rings, equalizers, transcript updates, and audio controls do not create
unacceptable rendering or DOM cost.

Write comparison PNGs, heatmaps, metrics, and reports to the workflow artifact
directory under `.recordings/`. The implementation is not visually accepted
until the targeted state/phase matrix has no unexplained metric or image delta.

## Electron Microphone Permission

Add an Electron session permission request/check handler that:

- permits audio capture only for the main Setta renderer origin/webContents;
- denies video capture and capture requests from workspace browser views,
  arbitrary external origins, or unrecognized webContents;
- keeps Chromium/macOS permission prompts honest rather than bypassing OS
  consent;
- adds `NSMicrophoneUsageDescription` to packaging metadata when the packaging
  configuration is introduced or updated.

The PWA relies on the browser's normal per-origin permission flow.

## Speech Playback Controller

Add a renderer-local controller with an exhaustive state and an explicit FIFO
queue. It owns synthesis requests, the current `HTMLAudioElement`, Blob URLs,
abort controllers, and device-local output preferences.

### Source and event rules

- A hydrated snapshot never auto-speaks old highlights or a restored
  terminal summary.
- Automatic highlight speech is enqueued only from a live typed
  `easyrun.highlight.created` event.
- Chat messages and current-focus projections are never eligible for synthesis
  or playback, regardless of whether their input modality was text or voice.
- Automatic final speech is enqueued only from the live working-to-terminal
  `easyrun.run.updated` transition. Enqueue it for `completed` and `failed`, but
  not `stopped`. The completion pulse remains completed-only.
- Do not infer new speech by diffing arrays after snapshot hydration. Carry a
  live playback intent from the Easy Run event application path.
- Deduplicate by easy-run ID plus highlight ID or terminal-summary source ID.
- A new run, runtime/workspace switch, pane teardown, explicit mute, or voice
  recording aborts playback, synthesis requests, and pending queue entries.
- When a terminal summary arrives, discard queued-but-unspoken highlights,
  allow the currently spoken highlight to finish, then speak the final summary.
- Never overlap two audio elements.
- Drive the visible speaking source from the active persisted source ID, not
  from output mode: mark the exact highlight row while a highlight plays and
  the summary while a terminal source plays. Clear the marker on completion,
  abort, failure, run switch, or teardown.

### Preferences and controls

Store only the device-local enum `off | final | highlights_and_final` in a
versioned renderer local-storage key. Do not sync it through the runtime, since
desktop and phone audio expectations differ.

Place the following UI in the pane top bar, separated from the window chrome:

- an output-mode control with `off` as the initial value and menu choices
  `Speak the summary` and `Speak highlights and summary`;
- a visible disclosure that the enabled voice is AI-generated, as required by
  OpenAI policy, inside the menu where voice can be enabled;
- a synthesizing pulse, speaking equalizer, failure tone, and click-to-stop
  behavior on the same compact audio control;
- a `Voice off` top-bar chip/popover naming the runtime configuration variable
  when speech is unconfigured, instead of rendering the mode menu.

The terminal summary itself must include:

- replay for completed, failed, and stopped runs whenever speech is configured,
  including when automatic output mode is off;
- an inline equalizer/foreground lift while that summary is speaking;
- visible playback/synthesis failure that does not mark the Easy Run narrator
  degraded and does not alter run success.

Spoken narrator highlights similarly replace their own fixed-size dot with a
small equalizer and lift only the active row to full foreground. Keep the
indicator inside the dot's existing layout box so playback never reflows or
re-centers the rail.

Cache the returned Blob only for the lifetime of the mounted source so replay
does not immediately create another billable request. Revoke every Blob URL on
replacement or teardown. Do not add persistent audio caching in v1.

## Desktop/Main/Preload/Web Surfaces

Extend `SettaAPI` with a `speech` namespace, using generated backend types:

- read capabilities;
- create a transcription session;
- synthesize the latest easy-run summary;
- synthesize a latest-run highlight.

Add the matching IPC contract and main-process handlers for Electron, expose
them through preload, and implement the same calls in
`desktop/src/renderer/src/web/setta-web-api.ts`. The permanent credential never
crosses these surfaces.

The WebRTC/media transport itself belongs in renderer source shared by Electron
and web. Do not put browser media objects into Zustand, generated contracts, or
IPC. Keep the transport behind a small interface so protocol event parsing and
lifecycle rules can be unit tested without a real microphone.

## Failure Semantics

Speech is an optional interaction adapter and must never corrupt the execution
plane:

- STT failure before submission creates no easy run and no steering message;
- STT failure while an easy run works leaves that run working;
- failed or cancelled typed/voice steering follows regular-chat message status
  semantics and does not change current focus or NOW;
- successful working-agent delivery followed by focus-projection failure
  reports the partial outcome explicitly, preserves the authoritative chat
  message, and never retries that instruction;
- narrator failure preserves the last good current focus as `stale`; it never
  changes or rolls back the underlying conversation;
- TTS failure leaves the persisted summary/highlight visible and unchanged;
- narrator degradation and speech-output degradation remain separate concepts;
- permission denial is not provider failure;
- unconfigured, insecure-context, unsupported-browser, authentication, quota,
  network, malformed-event, disconnect, and empty-transcript cases have
  distinct messages;
- no failure fabricates text, uses partial text as final, silently retries with
  another model, or silently switches to typed submission.

## Privacy And Security

- Microphone audio flows directly from the renderer device to OpenAI over the
  ephemeral WebRTC session and is not persisted by Setta.
- A completed transcript enters conversation persistence only through the
  existing start/steer path; regular-chat pending/complete/error semantics own
  the resulting user message. Partial transcripts never enter persistence.
- Every submitted request and steering message uses the existing full-fidelity
  chat record regardless of whether it came from text or voice. Easy Run does
  not persist a duplicate request-history collection.
- Current focus, NOW highlights, and the summary are derived presentation. They
  may be intentionally lossy, but they can never replace or modify chat data.
- TTS sends only the exact selected visible summary/highlight text to OpenAI.
- Synthesized audio is held in memory/Blob storage only and is never written to
  workspace or app data.
- Standard API keys are runtime-only. Realtime client secrets are short-lived,
  single-operation credentials and must not be logged or persisted.
- All Setta speech endpoints remain protected by the existing device-session
  authentication boundary. Any paired full-scope device can incur the user's
  speech API usage, consistent with the current one-runtime/one-human model.
- Add request limits before decoding, output limits before allocation, and
  cancellation on client disconnect.
- Session recordings and E2E artifacts must redact client secrets and exclude
  audio/base64 payloads.

## Implementation Phases

### Phase 1 — Lossless execution and narrator-maintained current focus

1. Add the required Go-owned current-focus value/status directly to the
   version-2 Easy Run record, reuse `easyrun.run.updated` for push updates, and
   bump the backend protocol without a compatibility path.
2. Initialize revision zero from the initial request while preserving
   `EasyRun.RequestText` as immutable source context.
3. Keep `EasyRun.Start` and `EasyRun.Steer` on the existing regular-chat paths.
   Capture the successful `SteerMessageResult.UserMessage`; do not add an Easy
   Run steering store, mixed timeline, or parallel execution prompt.
4. Add exact accepted steering as the narrator's `user_steer` source, immediate
   focus-dirty triggering, digest-watermark ordering, and stale-focus failure
   semantics.
5. Extend the narrator input/output schema and prompt for current focus plus
   pronounceable highlights and summaries. Persist focus revisions without
   changing highlight selectivity or ordering.
6. Replace the center's standing request with current focus and its
   updating/stale states. Keep NOW highlight-only and remove transient steer
   confirmation from the target UI.
7. Replace compact mechanical terminal tails with deterministic human-readable
   duration/artifact prose.
8. Regenerate contracts and the checked-in PWA bundle before cleanup, then
   update focused chat/easy-run store, event, renderer, deterministic Electron,
   and live Codex coverage.

This phase applies equally to typed and future voice steering and should land
first. It establishes lossless execution and the authoritative presentation
sources before microphone or audio UI depends on them.

### Phase 2 — Backend speech provider and generated contracts

1. Add `internal/speech` types, validation, OpenAI client, and fake-transport
   unit tests.
2. Add optional runtime speech configuration and read
   `SETTA_OPENAI_SPEECH_API_KEY` in both launch paths.
3. Add capability, transcription-session, summary-synthesis, and
   highlight-synthesis services/handlers/endpoints.
4. Wire the service into `internal/runtime` and `internal/httpapi`.
5. Regenerate TypeScript contracts before cleanup.
6. Confirm the key, client secret, provider body, and audio do not appear in
   logs or persisted app data.

Do not add a microphone glyph or listening state in this phase; the pane must
not promise voice before the complete provider path exists.

### Phase 3 — Realtime transcription and voice start/steer

1. Add the speech namespace across generated client, IPC, preload, and web API
   implementations.
2. Add the renderer WebRTC transcription transport and strict event decoder.
3. Add Electron microphone permission handling.
4. Implement the capture state machine, separate live capture line, updated
   inward listening visuals, final commit, cancellation, teardown, and error
   recovery.
5. Route the completed transcript through existing start/steer actions without
   Easy Button-specific rewriting; consume current-focus status/revision changes
   from `easyrun.run.updated` after successful steering.
6. Keep Stop reachable through `working + listening`; preserve the last current
   focus while capture or focus revision is active and never render a transient
   steer transcript.
7. Extend deterministic Electron E2E through the real
   renderer/main/preload/HTTP/store path with a scripted media/Realtime boundary.
8. Cover remote-runtime/PWA capability and secure-context behavior.

### Phase 4 — Terminal summary TTS

1. Add the playback controller and source-ID synthesis calls.
2. Put output mode, AI-voice disclosure, playback state, stop-audio behavior,
   and unconfigured explanation in the pane top bar.
3. Add summary source indication and replay for every terminal status.
4. Auto-speak only live `completed` and `failed` terminal transitions when
   `final` or `highlights_and_final` is enabled; never auto-speak `stopped`.
5. Prove restored terminal runs do not auto-play and manual replay reuses the
   mounted Blob.
6. Prove recording preempts playback and TTS failure leaves the run untouched.

### Phase 5 — Optional highlight narration and UI hardening

1. Enqueue only live typed narrator-highlight events when
   `highlights_and_final` is enabled; reject chat-message and current-focus
   sources.
2. Add exact highlight source indication without rail reflow.
3. Implement deduplication, terminal priority, run/workspace switching, queue
   cancellation, and stale response rejection.
4. Square the rail tracks and extend the existing shared mockup/production
   pixel-match harness across the Visual Fidelity And Motion Matching matrix.
   Add synchronized fixture content, current component mappings, real crop image
   diffs, failure heatmaps, and deterministic named animation-phase captures.
5. Baseline repeat-run image noise before setting narrow component tolerances;
   eliminate every unexplained still, motion-frame, metric, and style delta.
6. Extend the Easy Button performance workflow with inward listening rings,
   rapid transcript deltas, equalizer states, and audio controls; baseline first
   and append the before/after report under `docs/reports/performance/`.
7. Complete reduced-motion, compact-layout, keyboard, screen-reader, PWA, and
   failure-state audits.
8. Run deterministic and live provider acceptance gates.

## Progress Log

### 2026-07-10 — Phase 1 current-focus schema slice complete

Implemented Phase 1 items 1-2 as one schema-coherent slice. Easy Run schema
version 2 now requires the Go-owned `EasyCurrentFocus` value and its exhaustive
`current | updating | stale` status. New runs persist revision zero with the
shared-normalized immutable request text, the run start timestamp, and
`status = current`; the same complete run is published through
`easyrun.run.updated`. Version-1 run records and version-2 records missing
Current focus fail as corrupt unsupported state. The backend protocol is now
version 11, and the generated TypeScript contract, decoder, value set, and
schema snapshot were regenerated from the Go endpoint registry.

Verification completed for this slice:

- `./scripts/go.sh test ./internal/easyrun ./internal/httpapi ./cmd/generate-contracts`;
- focused main/event/store Vitest coverage, including rejection of an old run
  payload without `currentFocus`, plus backend-supervisor protocol-version
  coverage;
- `pnpm -C desktop build` and `pnpm -C desktop build:web`;
- deterministic production-path Electron Easy Button coverage at
  `.recordings/easy-button-speech-phase1-current-focus`, including revision-zero
  focus through backend persistence, HTTP, main, preload, generated decoding,
  renderer access, live events, and reload;
- `./scripts/format.sh`.

ChatGPT authentication was available, so the required live Codex gate was run
with `OPENAI_API_KEY` removed. `live-codex-electron`, `easy-button-live`, and
`live-codex-backend` were all blocked before a run could start because the
current signed-in Codex `model/list` response advertises reasoning effort
`max`, while Setta's existing provider decoder rejects that value. This is an
external provider-protocol blocker outside this current-focus schema slice; the
live failure is not counted as provider validation. Deterministic production
coverage passed.

The broad `./check_quality.sh --all` run exposed one slice-owned test fixture
that still embedded protocol version 10. The fixture now receives
`backendProtocolVersion` from the generated contract through its test
environment instead of maintaining another mirror, and its focused 11-test
Vitest suite passes. The broad run's unrelated Codex-protocol notification
timeout passed on the prescribed narrow retry. The broad gate cannot complete
cleanly while its live runtime tests encounter the same `max` provider drift
described above.

`./scripts/check_supply_chain.sh` is also blocked repository-wide: the pinned
Go 1.26.4 standard library is affected by GO-2026-5856 in `crypto/tls`, fixed in
Go 1.26.5. Updating the pinned toolchain is separate dependency/tooling work
and is not folded into this current-focus schema commit.

Remaining work starts with Phase 1 item 3: retain the successful regular-chat
`SteerMessageResult.UserMessage` as the authoritative accepted steering fact.
Items 4-8 then add narrator focus-dirty/watermark behavior, the focus-aware
narrator contract, renderer Current focus states, speakable mechanical
summaries, and the corresponding broader coverage. No blocker was found for
the next Phase 1 implementation work itself.

### 2026-07-10 — Phase 1 current-focus audit complete

Audited commit `5599e05dc` against this plan, `AGENTS.md`, its parent, the clean
worktree, the Go-owned contracts, generated TypeScript, persistence validation,
renderer consumers, and production-path tests. The source slice correctly
writes only schema version 2, rejects version 1 and missing Current focus,
initializes revision zero from the same shared-normalized text delivered through
the regular chat path, publishes the complete run, and keeps steering on the
existing full-fidelity chat path. No compatibility path or parallel execution
record was found.

The audit found one practical generated-artifact gap: the checked-in PWA bundle
still contained backend protocol version 10 even though the source contract had
moved to version 11. A served web client would reject the new backend before it
could decode Current focus. `pnpm -C desktop build:web` regenerated
`internal/webapp/static` from the current generated client; the embedded bundle
now carries protocol version 11 and the required Current focus decoder. Future
generated-client changes must rebuild and commit this checked-in bundle as well
as `desktop/src/generated/backend.ts`.

Audit verification completed:

- contract regeneration was idempotent, and focused Easy Run, HTTP API,
  generator, embedded-webapp, main/event, and renderer-store tests passed;
- Electron and web typechecks/builds passed;
- the deterministic production Easy Button workflow passed at
  `desktop/.recordings/easy-button-speech-audit-current-focus`, including
  schema-version-2 focus through start, terminal state, stop, reload,
  compact/reduced-motion cases, and the existing pixel-match companion;
- `./scripts/format.sh` and the non-live portions of
  `./check_quality.sh --all`, including the full required deterministic Electron
  manifest, passed.

ChatGPT authentication remains available. With `OPENAI_API_KEY` removed, the
live Electron chat, live Easy Button, and all four backend live Codex probes
again failed before run creation because `model/list` advertises reasoning
effort `max` and the existing Setta provider decoder rejects it. The broad
quality gate therefore remains non-zero and this is still not live-provider
validation for the current-focus slice. The supply-chain gate also remains
blocked by GO-2026-5856 in the pinned Go 1.26.4 standard library, fixed in Go
1.26.5. Neither blocker prevents Phase 1 item 3; resolving them remains separate
provider-contract and pinned-toolchain work.

### 2026-07-10 — Phase 1 accepted-steering fact complete

Implemented Phase 1 item 3 without pulling narrator focus mutation forward.
`EasyRun.Steer` still sends the shared-normalized text through the existing
regular-chat `SteerActiveRunInputByID` path. It now captures that call's complete
`SteerMessageResult` as an explicit accepted-steering value, validates the
returned conversation/run ownership and user/steering message shape, and
retains the exact persisted plain text with the returned `UserMessage`. There is
no Easy Run steering store, second transcript, renderer-authored history row,
parallel execution prompt, Current focus change, or NOW entry in this slice.

Focused verification completed:

- regular-chat steering and Easy Run/HTTP Go tests passed, including multiline
  shared normalization, exact provider input, the persisted steering message,
  and its committed transcript block;
- the full `internal/chat` package encountered one unrelated scripted
  goal-operation app-server exit; the exact failing test passed immediately on
  the prescribed narrow retry;
- the deterministic production Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase1-accepted-steering-final`,
  including the existing start, stream, steering, terminal, stop, restart,
  compact/reduced-motion, and pixel-match paths plus new assertions that the
  hidden conversation retains the exact trigger and steering message before
  and after reload while Current focus remains revision zero and NOW remains
  narrator-only;
- Electron/web source typecheck, the complete desktop Vitest suite, the
  production Electron build, `./scripts/format.sh`, and
  `./check_quality.sh --git-changes` passed.

ChatGPT authentication was available, so all prescribed live Codex gates were
attempted with `OPENAI_API_KEY` removed. Live Electron chat, live Easy Button,
and all four backend probes remain blocked before run creation by the existing
provider drift: `model/list` advertises reasoning effort `max`, which Setta's
current decoder rejects. These failures are not live-provider validation for
this slice. The supply-chain gate was not required because this narrow slice
does not change dependencies, manifests, package-manager configuration, Go
modules, generated contracts, or supply-chain tooling.

Remaining Phase 1 work starts with item 4: append the exact retained
`UserMessage` text as the typed narrator `user_steer` source, mark Current focus
updating only after working-agent delivery succeeds, trigger narration
immediately, and add digest-watermark ordering plus stale-focus failure
semantics. The `max` provider drift blocks live validation but does not block
that deterministic implementation work.

### 2026-07-10 — Phase 1 accepted-steering audit complete

Audited commit `0be8e7238` against this plan, `AGENTS.md`, its parent, the clean
worktree, generated contracts and embedded PWA bundle, the regular-chat
steering path, Easy Run ownership boundaries, and deterministic coverage. The
slice remains correctly limited to Phase 1 item 3: it sends one
shared-normalized plain-text `ChatInput` through the existing backing run,
retains the returned persisted `UserMessage` as the authoritative accepted
fact, and does not mutate Current focus, add a NOW row, or create a second
execution record.

The audit fixed two practical boundary and coverage gaps:

- accepted steering now also requires the returned internal conversation to be
  owned by the same Easy Run, rejecting a public conversation, workflow-owned
  conversation, or mismatched Easy Run owner even when workspace and
  conversation IDs happen to match;
- the deterministic Electron assertion now requires exactly one complete,
  plain-text part for both the trigger and steering messages and their
  committed transcript blocks. Extra parts can no longer pass a check that
  claims the hidden chat record is exact.

Contract regeneration was idempotent. The generated TypeScript protocol and
checked-in PWA bundle remain on backend protocol version 11 with required
Current focus decoding; no generated files or dependency inputs changed.
Focused Easy Run, chat, and HTTP API Go suites passed. The production Electron
Easy Button workflow passed at
`desktop/.recordings/easy-button-speech-phase1-accepted-steering-audit`,
including exact trigger/steering persistence before and after reload plus the
existing stream, terminal, stop, compact/reduced-motion, and pixel-match paths.
Electron and web builds and typechecks passed, and `./scripts/format.sh` plus
`./check_quality.sh --git-changes` passed before the audit commit.

ChatGPT authentication was available, so the live Electron chat, live Easy
Button, and all four backend Codex probes were rerun with `OPENAI_API_KEY`
removed. They remain blocked before run creation by the existing provider
drift: `model/list` advertises reasoning effort `max`, which Setta's current
decoder rejects. These failures are not live-provider validation for this
slice. Supply-chain verification was not required because the audit changes no
dependency, manifest, package-manager, Go module, generated contract, or
supply-chain input.

The implementation plan is not complete. The next iteration remains Phase 1
item 4: consume the retained accepted message as a typed `user_steer` narrator
digest entry, publish Current focus as updating only after working-agent
delivery succeeds, trigger the serialized narrator immediately, and implement
digest-watermark ordering plus stale-focus partial-outcome semantics. The live
`max` provider drift does not block that deterministic work.

## Verification Plan

### Backend unit and HTTP tests

- Typed Easy Run start/steer and completed voice-transcript start/steer produce
  the same prepared `ChatInput`, persisted user-message shape, provider request,
  and transcript semantics as regular chat; no narrator/current-focus text is
  ever sent to the working agent.
- Revision-zero focus is stored explicitly with the immutable initial request;
  accepted steering uses the persisted `SteerMessageResult.UserMessage` as
  exact narrator input, publishes `updating`, and triggers immediately.
- Schema-version-1 records, version-2 records missing Current focus, and old
  generated protocol shapes are rejected. Tests must not exercise a migration,
  dual-read, alias, or inferred default path.
- Serialized narrator calls use digest watermarks: a steer accepted during an
  in-flight call causes one immediate follow-up, and the older result cannot
  clear `updating` or overwrite a newer revision.
- Valid focus output persists and publishes; unchanged output may complete an
  update without inventing a highlight; invalid/oversized output fails loudly;
  narrator failure preserves the prior text as `stale` without altering chat.
- NOW remains the existing highlight collection and event stream. Focus changes
  and steering never add highlights or affect highlight caps.
- The human-readable mechanical terminal formatter covers sub-second through
  multi-day durations, zero/one/many artifacts, all terminal statuses, and
  exact displayed/spoken summary identity.
- Missing speech key reports `not_configured` and every operation fails with a
  specific configuration error without affecting runtime startup.
- The Realtime client-secret request contains the exact transcription-only
  session type, model, delay, manual turn boundary, and privacy-preserving
  `OpenAI-Safety-Identifier`.
- Provider credentials are sent to OpenAI and never returned by Setta.
- Expiry and required fields are decoded strictly; unknown/malformed provider
  responses fail loudly.
- 401/403, 429, 5xx, transport cancellation, wrong content type, truncated
  audio, and oversized audio map to distinct errors.
- Summary synthesis rejects working/missing/stale runs and uses the exact
  persisted terminal summary.
- Highlight synthesis rejects unknown/mismatched IDs and uses the exact
  persisted highlight text.
- TTS sends the exact model, voice, WAV format, and text; it never accepts
  arbitrary renderer text or silently truncates.
- Endpoint authentication and request-size limits remain enforced.
- Both command launch paths map only `SETTA_OPENAI_SPEECH_API_KEY` into speech
  configuration.

### Renderer and desktop tests

- Exhaustive capture transitions for permission, connect, delta, completed,
  commit, cancel, disconnect, provider error, timeout, and teardown.
- Only the current item/session can change the transcript.
- Partial text is never submitted; empty completed text is never submitted.
- Idle/terminal voice input starts; working voice input steers the same run.
- Submission failure preserves completed speech in the footer.
- Existing typed start, typed steering, and secondary run stop remain intact.
- The center starts with initial focus, remains stable during capture, shows
  `Updating focus…` after accepted typed or spoken steering, then applies the
  persisted narrator revision. A stale focus remains visible with a specific
  narrator-degraded explanation.
- NOW renders narrator highlights only; it never shows raw typed/voice steering,
  focus revisions, or a timer-based steer acknowledgement.
- Electron grants audio only to the trusted main renderer and denies video,
  external origins, and workspace browser views.
- Hydration produces no playback intents; live typed events do.
- Output modes, deduplication, queue ordering, final priority, mute, replay,
  abort, Blob revocation, and stale synthesis responses are deterministic.
- Runtime/workspace switches close peer connections, stop media tracks, abort
  synthesis, clear queues, and never cross-submit text.
- The shared mockup/production probe finds every required component, reports no
  unexplained token/style/geometry delta, and produces repeatable pixel diffs at
  every required still state and named animation phase. A deliberately changed
  mockup property must make the focused visual test fail.

### Deterministic production-path Electron E2E

Extend the existing Easy Button workflow or add a focused companion workflow.
Use temporary app data, the scripted Codex harness, a fake OpenAI HTTP server,
and a deterministic browser media/Realtime boundary. The fake boundary may
replace external browser/provider objects, but the production Easy Button,
main, preload, generated client, HTTP handlers, speech service, Easy Run store,
and event paths must remain in use.

Cover at least:

1. open workspace and Easy Button pane;
2. configured capability reveals the real mic affordance;
3. tap -> permission/connection -> listening;
4. scripted deltas update the center without adding DOM nodes per token;
5. second tap -> commit -> completed transcript -> real Easy Run start, with the
   same persisted chat message/provider input as the regular chat path;
6. revision-zero Current focus, streamed hidden run output, narrator highlight,
   artifact, and terminal summary still arrive through production paths;
7. enabled final mode requests the persisted summary, receives valid WAV, and
   plays it;
8. typed and spoken steering each reach the same backing run at full fidelity,
   set focus to updating, and produce narrator focus revisions without adding a
   NOW row; a steer accepted during in-flight narration cannot be overwritten
   by the older result;
9. reload restores the latest persisted focus, highlights, artifacts, and
   summary while the authoritative chat record retains the original request,
   every steer, and agent output;
10. highlight mode speaks only live highlights and gives the terminal summary
   priority;
11. completed and failed live transitions auto-speak when enabled; stopped does
    not, while manual replay remains available for all terminal statuses;
12. permission denial, cancel, empty transcript, provider disconnect,
    unconfigured runtime, TTS failure, and start/steer failure preserve the
    correct text/run state;
13. accepted steering followed by narrator/focus persistence failure clearly
    says the instruction was sent, keeps the input cleared, leaves focus stale,
    and never resubmits it;
14. reload and runtime/workspace switching do not replay or leak ephemeral
    speech state;
15. stopping a run while recording aborts recording and stops the run through
    the existing secondary control.

The fake OpenAI server must validate request authorization and payload shape,
return fixed client-secret metadata, and return a small valid WAV fixture. Test
recordings/logs must redact the secret and omit audio base64.

Run the Visual Fidelity And Motion Matching matrix as a deterministic companion
to this workflow. Its production side must reuse these production paths and
scripted boundaries; do not mount a component-only or test-only Easy Button
surface to manufacture screenshots.

### Live OpenAI speech test

Add a narrow, opt-in live workflow using
`SETTA_OPENAI_SPEECH_API_KEY`. It should use a short, consented checked-in audio
fixture through Chromium's fake microphone support and exercise a real
`gpt-realtime-whisper` session plus real `gpt-4o-mini-tts` synthesis. Record the
recognized transcript and deterministic word-error-rate result; validate TTS
by its WAV structure and successful playback rather than subjective voice
quality.

If the speech key is unavailable, skip this live speech test loudly and do not
treat deterministic fake-provider coverage as proof of OpenAI integration.

This work also touches Easy Button chat/run and steering behavior. Run the
existing live Codex Electron/backend gates when ChatGPT authentication is
available. Those Codex tests must continue without `OPENAI_API_KEY`; the
Setta-specific speech key is not Codex authentication and must never be passed
to Codex as one.

### Final gates

After the implementation is stable and generated outputs are current:

- run the narrow speech/easy-run Go tests first;
- run focused main/preload/renderer tests;
- run TypeScript typecheck and both Electron/web builds;
- run the deterministic Easy Button speech workflow;
- run the complete Easy Button mockup/production still and pinned-animation
  pixel-match matrix and inspect its generated diff report;
- run the Easy Button performance workflow and append its report;
- run the live OpenAI speech workflow when configured;
- run required live Codex workflows with ChatGPT auth when available;
- run `./scripts/format.sh`;
- run `./check_quality.sh --all` because this is a broad implementation with
  generated contract changes;
- run `./scripts/check_supply_chain.sh` for the broad implementation and
  obligatorily if any dependency or manifest changes.

After a broad failure, fix it and rerun the narrowest relevant check before
rerunning the broad gate. Tests use temporary directories and disposable
fixtures only.

## Acceptance Criteria

- A configured user can speak a new Easy Button request and see live transcript
  deltas followed by the authoritative completed transcript.
- Only the completed transcript starts the hidden easy run.
- The same voice control steers an active easy run without creating a second
  run or exposing transcript events.
- Typed and spoken input use the same full-fidelity conversation path as regular
  chat. The working agent never receives Current focus, highlights, a summary,
  or any other narrator rewrite in place of user input.
- The center initially shows the request as Current focus and later shows only
  persisted narrator revisions of the active objective and constraints.
- Accepted steering causes an explicit updating state and a narrator focus
  revision; it does not alter the immutable initial request or underlying chat
  message.
- NOW remains narrator highlights only. It contains no typed/voice steering,
  focus revisions, or request-history UI.
- Narrator failure preserves the last good focus, marks it as potentially
  outdated, and never affects working-agent delivery.
- Cancel, permission denial, provider failure, empty speech, and teardown never
  submit partial text.
- Typed start/steer and the secondary Stop control retain their current
  behavior.
- Completed and failed live terminal transitions may auto-speak when enabled;
  stopped never auto-speaks, and all terminal statuses can be replayed manually.
- The top-bar output control and exact highlight/summary equalizers identify the
  active spoken source without reflow.
- Model-authored focus/highlights/summaries follow the voice-ready narrator
  contract, and the persisted mechanical summary uses human-readable duration
  and artifact grammar.
- Equal rail tracks keep the center stage geometrically centered, and the full
  still/pinned-animation visual matrix has no unexplained pixel, geometry,
  token, font, computed-style, or motion-contract delta from the mockup.
- The implementation reads and writes only Easy Run schema version 2 and the
  new generated protocol shape. It contains no migration, legacy loader,
  missing-field fallback, alias, dual path, or transitional code.
- The persisted terminal summary can be spoken exactly with
  `gpt-4o-mini-tts`; replay does not rewrite it.
- Optional highlight speech uses only persisted narrator highlight IDs and only
  live highlight-created events.
- Restored snapshots never auto-speak historical content.
- Speech failures never change Easy Run or narrator success/degraded state.
- The permanent API key never reaches renderer, IPC, storage, logs, recordings,
  Codex, or generated responses.
- Raw microphone audio and generated audio are not persisted by Setta.
- Remote PWA voice works over a secure context and fails specifically over
  unsupported plain HTTP.
- Reduced-motion, compact layout, long transcript, queue, and performance gates
  pass.
- Deterministic production-path E2E passes, and live OpenAI proof passes when a
  speech API key is available.

## Explicitly Deferred

- `gpt-realtime-2.1` conversational/special mode;
- replacing the Easy Button narrator;
- voice chat outside the Easy Button pane;
- agent-initiated spoken questions or approvals;
- server VAD, wake words, always-listening sessions, and background recording;
- local/offline Whisper or browser-native fallback providers;
- custom voices, voice cloning, per-language voice selection, and voice-style
  prompting;
- API-key entry/account UI and durable keychain/secret-store design;
- persistent generated-audio cache;
- raw/chunked TTS streaming across the Setta backend and Electron IPC;
- a user-facing request-history or full-transcript surface inside the Easy
  Button pane. The underlying hidden chat conversation remains full fidelity
  and may be exposed by a separately designed feature later;
- speaking Current focus or user steering.

## Official OpenAI References Used

- Realtime and audio selection:
  https://developers.openai.com/api/docs/guides/realtime
- Realtime transcription and `gpt-realtime-whisper`:
  https://developers.openai.com/api/docs/guides/realtime-transcription
- WebRTC and ephemeral client secrets:
  https://developers.openai.com/api/docs/guides/realtime-webrtc
- Text-to-speech and the AI-voice disclosure requirement:
  https://developers.openai.com/api/docs/guides/text-to-speech
- `gpt-4o-mini-tts` model:
  https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
- Codex ChatGPT-vs-API authentication boundary:
  https://learn.chatgpt.com/docs/auth#openai-authentication

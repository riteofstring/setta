# Easy Button Speech Input And Output Plan

**Date:** 2026-07-09
**Updated:** 2026-07-10
**Status:** Implementation in progress — Phases 1-2, Phase 3 items 1-7, and the item-8 remote/PWA boundary complete
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
OPENAI_API_KEY
```

`OPENAI_API_KEY` is the sole speech credential. Do not add a Setta-specific
alias, fallback, dual-read path, or transitional variable. The backend copies
the value into the speech client's configuration and immediately removes it
from the process environment before launching Codex or any other helper.
Codex continues to use ChatGPT subscription authentication and must never
inherit `OPENAI_API_KEY`.

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
- `setta serve` and the Electron-spawned `setta-backend` both map
  `OPENAI_API_KEY` into `runtime.Config`, then remove it from their process
  environments before spawning children;
- a runtime without the key starts normally and reports speech as
  `not_configured`; text-only Easy Button behavior remains fully functional;
- API-key entry, keychain persistence, and account-management UI are deferred.
  A later credential design must work for headless remote runtimes, not only an
  Electron-local OS keychain.

## Codex Protocol Compatibility Prerequisite

Refresh `internal/codexapp/protocolschema` from the pinned current Codex source
before relying on the live Codex gates. The upstream `ReasoningEffort` wire
schema is intentionally a non-empty string because Codex supports custom future
values, so schema refresh alone does not extend Setta's stricter chat-domain
contract. Add the currently defined `max` and `ultra` levels to the Go-owned
`internal/chat` reasoning values, update every exhaustive display/validation
site and focused protocol test, then regenerate the TypeScript contracts. Do
not add a decoder fallback for arbitrary unknown values.

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
- expose a concise setup explanation naming `OPENAI_API_KEY` without ever
  displaying its value;
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
2. Add optional runtime speech configuration and read `OPENAI_API_KEY` in both
   launch paths. Copy it into speech configuration, remove it from the process
   environment, and exclude it from Codex children.
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

### 2026-07-10 — Phase 1 narrator-maintained focus complete

Implemented Phase 1 items 4-5 as one coherent projection slice. After the
regular-chat steering call succeeds, Easy Run now appends the exact retained
plain-text `UserMessage` as a typed `user_steer` digest entry, persists and
publishes the last good Current focus with `status = updating`, and immediately
triggers the existing serialized narrator. The narrator input includes
`previousCurrentFocus`; every working and terminal output must include a
strict, non-empty Current focus of at most 320 Unicode characters. Revised text
increments the persisted revision and timestamp, while an unchanged result may
return the same revision to `current` without creating a highlight.

The narrator state now carries a focus-dirty watermark. A steer accepted during
an in-flight working or terminal call queues one follow-up, and the older result
cannot clear `updating`. Terminal projection retries through the newer digest
before finalizing the run. Narrator, output-validation, highlight-persistence,
or focus-persistence failures preserve the last good text as `stale`, mark the
narrator degraded, never retry the instruction, and leave the authoritative
chat message untouched. A synchronous projection setup/publish failure returns
the distinct `steer_easy_run_focus_update_failed` partial outcome so later UI
work can say the instruction was sent without repopulating it as rejected.

The narrator prompt now separates objective/constraint-focused Current focus
from sparse NOW highlights and requires highlights and terminal summaries to be
grammatical and pronounceable. Revision-zero requests may exceed the narrator
output limit; their first projection must condense them within the strict bound
without dropping the objective or constraints. The scripted production harness
provides deterministic focus revisions for the steering and long-request
workflows. No steering store, mixed timeline, renderer-authored row, execution
prompt rewrite, generated contract change, or compatibility path was added.

Verification completed for this slice:

- focused Easy Run, chat, and HTTP API Go suites passed, including exact
  multiline `user_steer` input, immediate updating state, unchanged and revised
  focus output, two-steer in-flight ordering, a terminal-call watermark race,
  strict missing/whitespace/oversized output rejection, stale degradation, and
  typed HTTP partial-outcome classification;
- desktop typecheck/production build, web typecheck/build, and all 990 desktop
  Vitest tests passed;
- the deterministic production Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase1-focus-projection-final-r4`,
  including ordered `updating -> current` events, persisted revision one before
  and after reload, exact hidden-chat steering, narrator-only NOW, terminal and
  stop behavior, restart recovery, compact/reduced-motion coverage, and the
  existing pixel-match companion;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed.

ChatGPT authentication was available, so the live gate was attempted with
`OPENAI_API_KEY` removed. Live Electron chat and all four backend probes again
failed before conversation creation because `model/list` advertises reasoning
effort `max`, which the existing Setta provider decoder rejects. Live Easy
Button remained idle after submission through the same backend creation
boundary. These failures are not live-provider validation for this slice. The
known provider drift remains separate work and does not block deterministic
Phase 1 progress. Supply-chain verification was not required because this slice
changes no dependencies, manifests, package-manager configuration, Go modules,
generated contracts, or supply-chain tooling.

Remaining Phase 1 work starts with item 6: render persisted Current focus in the
center, expose updating/stale language, and remove the transient steering
confirmation while keeping NOW highlight-only. Items 7-8 then add the
human-readable terminal mechanics and finish the phase-wide generated-bundle,
renderer, deterministic, and live coverage. No implementation blocker was
found for item 6; only its live-provider proof is currently blocked by the
unrelated `max` drift.

### 2026-07-10 — Phase 1 narrator-maintained focus audit complete

Audited commit `f00bb0d31` and the preceding Phase 1 commits against this plan,
`AGENTS.md`, the clean starting worktree, generated contracts and the checked-in
PWA bundle, the Easy Run/chat ownership boundary, narrator runtime ordering,
failure semantics, fixtures, and deterministic production-path coverage. The
slice correctly keeps accepted steering on the regular-chat path, uses the
persisted user message as the typed narrator fact, serializes narrator calls,
and leaves Current focus, NOW, and the hidden conversation in their owning
domains. Contract regeneration and the web build were idempotent; protocol 11,
required version-2 Current focus decoding, and the checked-in PWA bundle remain
current.

The audit fixed three practical ordering and strictness gaps:

- an older in-flight narrator result is now held only as an internal provisional
  input while a newer accepted steer remains beyond its digest watermark. The
  persisted last-good focus stays textually and revision-stable with
  `status = updating`; the complete projection is persisted once, only after
  every accepted steer has been evaluated;
- bounded digest eviction now protects pending `user_steer` entries from heavy
  ordinary event traffic. Pending accepted steering that cannot fit by itself
  fails explicitly through the existing partial-outcome path and marks the last
  focus stale instead of silently losing an instruction;
- a stale/degraded projection can no longer be healed by an older working or
  terminal narrator result, and non-terminal narrator output is rejected if it
  contains a summary. The scripted harness now obeys that strict working-output
  contract. The persisted chat message remains authoritative in every failure
  case.

Audit verification completed:

- focused watermark, digest-bound, stale-result, strict-output, and terminal
  race regressions passed repeatedly, followed by the complete `internal/easyrun`,
  `internal/httpapi`, and `internal/chat` suites and the Easy Run race detector;
- `./scripts/go.sh run ./cmd/generate-contracts` produced no generated changes;
- all 990 desktop Vitest tests, Electron typecheck/build, and web typecheck/build
  passed, with no PWA artifact drift;
- the deterministic production Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase1-focus-audit-20260710`, including
  start, stream, accepted steering, exact hidden-chat persistence, focus events,
  terminal/stop, reload/restart, compact/reduced-motion, and pixel-match paths;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed before the
  audit commit.

ChatGPT authentication was available, so the live Electron chat, live Easy
Button, and all four backend Codex probes were rerun with `OPENAI_API_KEY`
removed. They remain blocked before conversation creation by the existing
provider drift: `model/list` advertises reasoning effort `max`, which Setta's
current decoder rejects. These failures are not live-provider validation for
this slice. Supply-chain verification was not required because the audit
changes no dependency, manifest, package-manager configuration, Go module,
generated contract, or supply-chain input.

The implementation plan is not complete. The next iteration is Phase 1 item 6:
render persisted Current focus in the center, expose updating and stale copy,
and remove the transient steering presentation while keeping NOW narrator-only.
Phase 1 items 7-8 then add speakable mechanical terminal summaries and finish
the phase-wide renderer/generated/E2E coverage. No implementation blocker was
found for item 6; only live-provider proof remains blocked by the unrelated
`max` drift.

### 2026-07-10 — Phase 1 Current focus UI complete

Implemented Phase 1 item 6 as a renderer-coherent slice. The center now renders
only the required persisted `EasyRun.CurrentFocus` instead of the immutable
`RequestText`. Its standing `Current focus` label makes the projection's
narrator ownership explicit; `updating` changes that label to
`Updating focus…` while preserving the last good text, and `stale` preserves
the text while saying `Narration degraded — current focus may be outdated.`
The old request-text DOM/test surface is removed. NOW still renders only typed
`EasyRunSnapshot.Highlights`; accepted steering and focus revisions create no
renderer-authored row or transient steering echo.

The shared production/mockup pixel probe now maps its existing `requestText`
comparison role to the mockup and production Current focus nodes and measures
the new focus block and label. The production-path driver separately exposes
the immutable run request for run identity and the rendered focus text/status
for presentation assertions. Its scripted provider keeps the accepted-steer
narrator turn open for a bounded deterministic window so the real
HTTP/event/store/React `updating` state is observable, and adds a dedicated
narrator-failure run that proves a stale projection does not stop execution.
The checked-in PWA bundle was rebuilt from the same renderer source.

Verification completed for this slice:

- focused scripted-narrator tests and the complete `internal/chat`,
  `internal/easyrun`, and `internal/httpapi` suites passed. The first combined
  Go run encountered an unrelated goal-operation ordering flake; its exact
  test passed on the required narrow retry and the complete `internal/chat`
  package then passed cleanly;
- Electron typecheck/build, web typecheck/build, and all 990 desktop Vitest
  tests passed;
- the deterministic production Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase1-current-focus-ui-20260710-r3`,
  including revision-zero rendering, visible `updating` with stable text,
  narrator-only NOW, the persisted revision after completion and reload, a
  working stale-focus failure, stop behavior, long/compact layouts,
  reduced-motion coverage, restart recovery, and the existing pixel-match
  companion. The new updating and stale screenshots were inspected;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  source, tests, plan, and checked-in web bundle were final.

ChatGPT authentication was available, so the live Electron chat, live Easy
Button, and all four backend Codex probes were attempted with `OPENAI_API_KEY`
removed. They remain blocked before conversation creation by the existing
provider drift: `model/list` advertises reasoning effort `max`, which Setta's
current decoder rejects. These failures are not live-provider validation for
this slice. Supply-chain verification was not required because the slice
changes no dependency, manifest, package-manager configuration, Go module, or
supply-chain tooling.

The next implementation work is Phase 1 item 7: replace compact mechanical
terminal tails with deterministic human-readable duration and artifact prose.
Item 8 then finishes phase-wide generated-bundle, renderer, deterministic,
partial-outcome, and live coverage. No implementation blocker was found for
item 7; only live-provider proof remains blocked by the unrelated `max` drift.

### 2026-07-10 — Phase 1 Current focus UI audit complete

Audited commit `83660fb91` and the cumulative Phase 1 branch against this plan,
`AGENTS.md`, the clean starting worktree, generated contracts and checked-in
PWA bundle, persisted Easy Run state, renderer focus ownership, the canonical
mockup, deterministic artifacts, and live-provider coverage. The implemented
slice correctly renders only persisted Current focus, preserves the last good
text through `updating` and `stale`, keeps NOW narrator-only, and leaves the
immutable request and full-fidelity steering messages in their owning chat/run
records.

The audit fixed one practical renderer edge case. A new request enters the
pending working layout before the new Easy Run replaces an empty or terminal
snapshot. The new focus block used that layout state alone and could therefore
show an empty `Current focus` heading or briefly present the preceding terminal
run as the active objective. Focus visibility now requires a current Easy Run
owned by the displayed state; the `none` state carries no visible or announced
label. The production-path assertions also verify the focus block's actual
display state and require a stale narrator projection to leave the run visibly
working with its Stop control available.

Audit verification completed:

- focused TypeScript checks and the complete `internal/chat`,
  `internal/easyrun`, and `internal/httpapi` suites passed;
- contract regeneration was idempotent, and the generator plus embedded-webapp
  tests passed;
- all 990 desktop Vitest tests, Electron typecheck/build, and web
  typecheck/build passed; the checked-in PWA bundle was regenerated from the
  corrected renderer source;
- the deterministic production Electron workflow passed at
  `desktop/.recordings/easy-button-speech-audit-current-focus-20260710`,
  including start, streaming, exact accepted steering, visible focus updating,
  a stale narrator projection with the run still working, terminal/stop,
  reload/restart, compact/reduced-motion, and pixel-match paths;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  final source, tests, plan, and generated web bundle.

ChatGPT authentication remains available. The live Electron chat and Easy
Button workflows plus all four backend Codex probes were rerun with
`OPENAI_API_KEY` removed. Every surface remains blocked before conversation
creation because `model/list` advertises reasoning effort `max`, which Setta's
current provider decoder rejects. The Easy Button retained the submitted text,
remained idle, and kept the nonexistent focus hidden, but this failure is not
live-provider validation for the slice. Supply-chain verification was not
required because this audit changes no dependency, manifest, package-manager,
Go module, generated contract, or supply-chain input.

The implementation plan is not complete. The next iteration remains Phase 1
item 7: replace compact mechanical terminal tails with deterministic
human-readable duration and artifact prose. Item 8 then completes the
phase-wide partial-outcome and acceptance coverage before backend speech work
begins. No implementation blocker was found for item 7; only live-provider
proof remains blocked by the separate `max` provider drift.

### 2026-07-10 — Phase 1 human-readable terminal summaries complete

Implemented Phase 1 item 7 as one backend-owned terminal-summary slice. Normal
completed, stopped, and failed chat-run projections, prepared-run start
failures, and backend-restart recovery now use the same deterministic formatter.
Elapsed time rounds to the nearest whole second with half-seconds rounding up;
a smaller result reads `less than 1 second`, and longer results spell only their
nonzero day, hour, minute, and second units with correct singular/plural forms.

Completed and stopped runs now persist natural `with no artifacts`,
`with 1 artifact`, or `with N artifacts` sentences. Failed runs retain the exact
trimmed failure reason after a colon and add `No artifacts were preserved.`,
`1 artifact was preserved.`, or `N artifacts were preserved.` The narrator
sentence, when healthy, still precedes that mechanical prose in the one exact
persisted `EasyRun.Summary`; degraded narration leaves the same mechanical text
standing alone. Existing version-2 renderer fixtures no longer encode compact
duration symbols or hyphen-separated tails.

Verification completed for this slice:

- focused formatter tests cover sub-second rounding boundaries through
  multi-day durations, negative elapsed time, every completed/stopped/failed
  zero/one/many-artifact combination, exact narrated-summary persistence, and
  the prepared-run start-failure path;
- the complete `internal/chat`, `internal/easyrun`, and `internal/httpapi`
  suites passed;
- all 990 desktop Vitest tests, Electron typecheck, and the production Electron
  build passed;
- the deterministic production Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase1-human-summary-20260710`. Its
  production-path semantic assertion rejects compact duration syntax and checks
  duration-unit and artifact inflection for completed, stopped, failed,
  narrated, degraded, artifact-bearing, and restart-recovered runs. The
  completion, 20-preserved-artifact failure, and restart-recovery screenshots
  were inspected; the longer text remained contained and readable, and the
  existing pixel-match companion also passed;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  source, fixtures, deterministic assertion, and this plan were final.

ChatGPT authentication was available, so the live Electron chat and Easy
Button workflows plus all four backend Codex probes were attempted with
`OPENAI_API_KEY` removed. Every surface remains blocked before conversation
creation because `model/list` advertises reasoning effort `max`, which Setta's
current provider decoder rejects. These failures are not live-provider proof
for this slice. Supply-chain verification was not required because no
dependency, manifest, package-manager configuration, Go module, generated
contract, or supply-chain input changed.

The implementation plan is not complete. The next iteration is Phase 1 item 8:
regenerate contracts and the checked-in PWA bundle before cleanup, then finish
the phase-wide focused chat/Easy Run store, event, renderer, deterministic,
partial-outcome, and live Codex acceptance coverage. No deterministic blocker
was found for item 8; live-provider proof remains blocked by the separate
`max` provider drift.

### 2026-07-10 — Phase 1 human-readable terminal summaries audit complete

Audited commit `7f2ab69d2` and the cumulative Phase 1 branch against this plan,
`AGENTS.md`, the clean starting worktree, commit history, Go-owned persistence
and contracts, generated TypeScript, the checked-in PWA bundle, every Easy Run
terminal projection path, renderer fixtures, deterministic workflow artifacts,
and live-provider coverage. The duration and zero/one/many-artifact formatter
correctly owns completed, stopped, failed, prepared-start-failure, and
restart-recovery prose, and the exact persisted summary remains the renderer's
single visible source. Contract regeneration and the Electron/web builds were
idempotent; no generated artifact drift or executable compact-summary fixture
remained.

The audit fixed two practical boundary gaps:

- prepared-run start failures now trim the provider error once before storing
  `EasyRun.Error` and constructing the summary, matching normal failed chat
  runs so persisted failure state and the visible/future-spoken reason cannot
  disagree;
- the first deterministic workflow rerun exposed a real new-run persistence
  race: `saveNewRun` made the final run directory visible before `run.json` was
  installed, so a concurrent event-driven snapshot could report a valid new
  run as missing/corrupt state. New runs are now written as complete staging
  directories outside `easy-runs` and atomically renamed into the collection.
  A repeated concurrency regression asserts that readers never observe a
  partial run directory.

Audit verification completed:

- the focused summary/start-failure and atomic-publication regressions passed,
  including ten repeated concurrency runs, followed by the complete
  `internal/easyrun`, `internal/chat`, `internal/httpapi`, and contract-generator
  suites;
- contract generation produced no changes, all 990 desktop Vitest tests
  passed, and Electron plus web typechecks/builds passed without generated PWA
  drift;
- after the prescribed narrow fix for the first workflow failure, the complete
  deterministic production Easy Button workflow passed at
  `desktop/.recordings/easy-button-speech-audit-human-summary-20260710-r2`,
  including exact hidden-chat steering, focus events, human-readable terminal
  variants, artifacts, stop/failure behavior, reload/restart, compact and
  reduced-motion coverage, and the pixel-match companion. Completed,
  20-artifact failure, and restart-recovery screenshots were inspected and the
  summary prose remained contained and readable;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  final source, regression, plan, and generated-artifact checks.

ChatGPT authentication was available, so the live Electron chat, Easy Button,
and all four backend Codex probes were rerun with `OPENAI_API_KEY` removed. They
remain blocked before conversation creation because `model/list` advertises
reasoning effort `max`, which Setta's existing provider decoder rejects. These
failures are not live-provider validation for this slice. Supply-chain
verification was not required because the audit changes no dependency,
manifest, package-manager configuration, Go module, generated contract, or
supply-chain input.

The implementation plan is not complete. The next iteration remains Phase 1
item 8: finish the phase-wide generated-bundle, store/event/renderer,
partial-outcome, deterministic, and acceptance coverage before beginning the
backend speech provider. The atomic-publication regression is now part of that
store baseline. No deterministic blocker remains; live-provider proof is still
blocked by the separate `max` provider drift.

### 2026-07-10 — Phase 1 closure complete

Implemented Phase 1 item 8 and closed the lossless-execution/current-focus
phase before beginning speech-provider work. The audit confirmed that the
generated contract and checked-in PWA bundle were current, then completed the
remaining accepted-steering partial-outcome boundary. `APIError` now carries a
required Go-owned `operationApplied` fact, the backend protocol is version 12,
and the generated client preserves error code, message, and application state
without renderer message parsing. Ordinary rejected operations remain
`operationApplied = false`; only steering that reached the working agent before
Current focus projection failed is true.

Electron main converts decoded backend steering results into an explicit typed
IPC result, preload preserves it, and the web adapter implements the same
contract. The Easy Run store treats only an applied failure as accepted: it
keeps the run ready and working, shows `Instruction sent, but Current focus
could not be updated.`, clears and blurs the composer, and relies on the
persisted stale/degraded run event for presentation. A normal rejected steer
still preserves and focuses the input. This uses structured backend facts, not
error-message keywords or cross-language constant mirrors.

The deterministic production harness now commits an exact steer after the
existing narrator-failure scenario has made Current focus stale. The workflow
proves through the production Electron, preload, generated HTTP client, chat,
Easy Run store, event, and renderer paths that the instruction is persisted and
committed exactly once, no NOW row is added, the stale focus remains visible,
the input is empty and no longer retry-focused, and Stop remains available. The
new partial-outcome screenshot was inspected and the complete state remained
contained and readable.

Verification completed for this slice:

- complete `internal/httpapi`, `internal/easyrun`, `internal/chat`, and
  contract-generator suites passed; contract regeneration was idempotent;
- focused generated-client, main IPC, preload, web adapter, renderer store, and
  shared transport coverage passed, including applied and rejected steering
  errors across both Electron and web boundaries;
- all 995 desktop Vitest tests, Electron/web typechecks, and Electron/web
  production builds passed; the checked-in PWA bundle was regenerated from the
  protocol-12 generated client;
- the deterministic production Easy Button workflow passed at
  `desktop/.recordings/easy-button-speech-phase1-closure-20260710-r2`, including
  exact hidden-chat start/steer persistence, Current focus current/updating/
  stale states, the accepted partial outcome, human-readable terminal variants,
  stop/failure behavior, reload/restart, compact and reduced-motion coverage,
  and the pixel-match companion;
- `./scripts/format.sh` passed. The first `./check_quality.sh --all` pass exposed
  slice-owned line-count and callback-complexity issues; the new preload, web,
  submit, and Electron assertions were split at their owning boundaries, and
  their prescribed focused lint, tests, and typecheck passed before the broad
  gate was rerun. The rerun passed file-length, template, shell, Python, Go vet,
  non-live Go, dead-code, formatting, TypeScript lint/complexity, typecheck, all
  995 Vitest tests, and the production Electron build checks.

ChatGPT authentication was available, so the live Electron chat, live Easy
Button, and all four backend Codex probes were attempted with
`OPENAI_API_KEY` removed. All remain blocked before conversation creation
because `model/list` advertises reasoning effort `max`, which Setta's existing
provider decoder rejects. These failures are not live-provider validation for
Phase 1. `./scripts/check_supply_chain.sh` also remains blocked repository-wide
by GO-2026-5856 in the pinned Go 1.26.4 standard library, fixed in Go 1.26.5;
this slice changes no dependency or toolchain input.

The broad gate remains nonzero for those live `internal/runtime` failures and
for a separate deterministic Codex-protocol notification timeout: its backend
run reaches `completed`, but `coverage complete` does not enter the visible
transcript before the workflow deadline. The prescribed focused
`--codex-protocol-only` check reproduced the same timeout twice, so it is a real
current blocker rather than claimed passing coverage. It does not occur in the
changed Easy Run path: the complete production Easy Button workflow and its
pixel-match companion pass after the final refactor. No later required-manifest
result is claimed after the chat workflow stops the manifest.

Phase 1 is complete. The next coherent work is Phase 2 item 1: add the
`internal/speech` package's Go-owned types, validation, bounded OpenAI client,
failure classification, and fake-transport unit tests. No deterministic blocker
was found for that work; the live Codex `max` drift and pinned-toolchain advisory
remain separate repository issues.

### 2026-07-10 — Phase 1 final audit complete

Audited all eleven Phase 1 implementation and audit commits against this plan,
`AGENTS.md`, the clean starting worktree, Go-owned contracts, generated
TypeScript and PWA artifacts, persistence, narrator ordering, renderer state,
and production-path coverage. The version-2-only Easy Run shape, immutable
lossless chat record, persisted Current focus, narrator-only NOW rail,
human-readable terminal summary, and structured accepted-steering partial
outcome remain correctly separated at their owning boundaries. Contract
regeneration and the checked-in protocol-12 generated client were idempotent.

The audit found one practical Phase 1 gap: production still used the old
asymmetric `minmax(240px, 300px)` / `minmax(280px, 380px)` rail grid even though
the settled plan and canonical mockup require equal `minmax(260px, 340px)`
tracks. Production now uses the equal tracks, the stale pixel-harness comments
describe that contract, and the production Electron driver asserts both equal
rendered rail widths and alignment of the center-stage and surface midpoints at
desktop widths. The checked-in PWA bundle was rebuilt from the corrected source.

Audit verification completed:

- focused `internal/easyrun`, `internal/httpapi`, `internal/chat`, generator,
  backend-transport, IPC, preload, web-adapter, and renderer-store tests passed;
- all 995 desktop Vitest tests, Electron/web typechecks, and Electron/web
  production builds passed;
- the production Easy Button workflow passed at
  `desktop/.recordings/easy-button-speech-phase1-rail-audit-20260710`, including
  lossless start/steer persistence, current/updating/stale focus, the accepted
  partial outcome, summaries, restart/reload, compact/reduced-motion cases, and
  its pixel-match companion. The focused production/mockup metrics both report
  340-pixel left and right rails, and the updated screenshots were inspected;
- `./scripts/format.sh` passed. `./check_quality.sh --all` passed file length,
  syntax, Go vet, all non-live Go tests, dead-code, formatting, TypeScript lint
  and complexity, typecheck, all 995 Vitest tests, the Electron build, and the
  complete required Electron manifest. The previously reported deterministic
  Codex-protocol notification timeout passed in this audit run.

The broad gate remains nonzero only because all four live backend Codex probes
still reject the provider's newly advertised `max` reasoning effort before
conversation creation. Direct live Electron chat and Easy Button attempts with
`OPENAI_API_KEY` removed reach the same provider-drift boundary, so they are not
live validation for Phase 1. Supply-chain verification remains blocked by
GO-2026-5856 in the pinned Go 1.26.4 standard library, fixed in Go 1.26.5.
Neither blocker prevents Phase 2 implementation. The next iteration remains
Phase 2 item 1; the complete speech-specific still/pinned-animation matrix and
performance acceptance remain later work after the speech states exist.

### 2026-07-10 — Phase 2 speech provider foundation complete

Implemented Phase 2 item 1 as an isolated `internal/speech` provider slice.
The package now owns the generated-contract-facing `SpeechProviderStatus`,
`SpeechCapabilities`, `SpeechTranscriptionSession`, and `SpeechAudio` types and
their strict validators, along with the fixed OpenAI model, delay, voice, WAV,
WebRTC, disclosure, credential-variable, and resource-limit constants. The
initial backend-owned limits are 120 recording seconds, 8,000 completed
transcript characters, 4,096 synthesis characters, and 8 MiB of WAV audio.
They are not mirrored into TypeScript in this phase.

The dependency-free OpenAI client now mints a 10-minute Realtime client secret
with the exact transcription-only session configuration, a null manual turn
boundary, and the backend-supplied `OpenAI-Safety-Identifier`. It strictly
validates the returned ephemeral value, Unix expiry, and effective session.
The synthesis path sends exact caller-owned text with `gpt-4o-mini-tts`,
`marin`, and `response_format: wav`; it rejects empty, whitespace-mutated, or
over-limit input instead of trimming or truncating it. Successful audio must
have an allowed response content type and a structurally complete RIFF/WAVE
body within the 8 MiB plus one-byte detection bound.

Both operations have request deadlines, propagate cancellation, close response
bodies, make exactly one billable request, refuse redirects, cap JSON before
decoding, and never include the permanent key or provider body in an error.
Typed errors distinguish unconfigured speech, rejected credential/model
access, rate/quota exhaustion, provider unavailability, malformed responses,
oversized audio, and the later service-owned missing/stale source case. An
empty API key is valid client configuration so runtime startup can remain
text-only; operations then fail before transport with the specific
`speech_not_configured` classification. A non-production base URL requires an
explicit test-only authorization flag. The environment-facing E2E override
gate remains Phase 2 item 2 work and was not added early.

Verification completed for this slice:

- `./scripts/go.sh test ./internal/speech`,
  `./scripts/go.sh test -race ./internal/speech`, and
  `./scripts/go.sh vet ./internal/speech` passed;
- fake-transport tests cover exact authorization, safety identifier, Realtime
  and TTS payloads, expiry/session decoding, invalid input, 401/403, 429, 408,
  5xx, unexpected statuses, redirect refusal, cancellation, deadline and
  transport failure, wrong content types, malformed/truncated WAV, read
  failure, both declared and chunked overflow, response closure, and one-call
  behavior;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  package, tests, and this progress entry were final.

No production runtime, HTTP endpoint, generated contract, IPC, renderer,
Easy Run, chat, dependency, or manifest surface changed, so production-path
Electron/live-provider workflows, contract regeneration, and supply-chain
verification were not required for this slice. The known live Codex `max`
provider drift and pinned Go 1.26.4 advisory remain real repository-wide
blockers for their respective gates but do not block the next ordered work.
Phase 2 item 2 is next: add optional runtime speech configuration, read only
`OPENAI_API_KEY` in both launch paths, and enforce the E2E-only
provider-base override boundary before adding services and endpoints in item 3.

### 2026-07-10 — Phase 2 speech provider foundation audit complete

Audited commit `3e62b2ce6` against this plan, `AGENTS.md`, its parent, the clean
starting worktree, the current official OpenAI Realtime transcription,
client-secret, safety-identifier, and Speech API contracts, generated artifacts,
and repository tests. The isolated provider slice uses the planned endpoints,
models, `medium` delay, manual turn boundary, safety header, `marin` voice,
4,096-character input limit, bounded WAV response, one-call behavior, deadlines,
and typed failures. It remains intentionally disconnected from runtime, HTTP,
generated TypeScript, IPC, and renderer surfaces until the later Phase 2 items,
so it does not expose a premature microphone or speech capability.

The audit fixed four practical boundary gaps:

- exact-limit 8 MiB WAV payloads now pass generated-contract validation instead
  of being rejected because padded base64's decoded size was overestimated;
- decoded audio still receives an exact post-decode size check, so the corrected
  boundary does not permit oversized payloads;
- RIFF/WAVE validation now requires the padding byte after an odd-length chunk
  rather than accepting a structurally truncated file;
- non-empty API keys must contain only non-whitespace visible ASCII, and injected
  provider URLs must use HTTP or HTTPS, so malformed configuration fails during
  construction instead of being misclassified later as provider unavailability.

Audit verification completed:

- contract regeneration was idempotent; the generated TypeScript client and
  checked-in PWA bundle remain on protocol 12 because this slice registers no
  endpoint or generated surface yet;
- `./scripts/go.sh test ./internal/speech`, the race-enabled package suite,
  focused vet, and focused complexity checks passed, including new exact-limit,
  odd-chunk-padding, invalid-key, and invalid-scheme regressions;
- the production Easy Button workflow passed at
  `.recordings/easy-button-speech-phase2-provider-audit-20260710`, including the
  existing start, stream, steering, terminal, stop, persistence/reload,
  compact/reduced-motion, and pixel-match paths. This is regression coverage;
  the speech provider cannot traverse an app path until Phase 2 items 2-4 wire
  it, and its present wire behavior is covered by the fake-transport suite;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed. The first
  quality pass found the URL validator at the Go complexity threshold; the
  scheme predicate was split at its owning boundary and the focused complexity
  check passed before the final clean gate.

ChatGPT authentication was available, so the live Electron chat, live Easy
Button, and all four backend Codex probes were rerun with `OPENAI_API_KEY`
removed. They still fail before conversation creation because the provider's
`model/list` advertises reasoning effort `max`, which Setta's existing decoder
rejects. These failures are not live validation for this provider slice.
`OPENAI_API_KEY` was not present in the loop process, and no live speech
workflow is implemented before the later acceptance phase, so no live OpenAI
speech result is claimed. Supply-chain verification was not required because
the audit changes no dependency, manifest, module, package-manager, toolchain,
or generated input.

The implementation plan is not complete. Phase 2 item 2 remains next: add the
optional runtime speech configuration to both launch paths, read only
`OPENAI_API_KEY`, and enforce the environment-facing E2E-only base
URL override before the service and endpoint wiring in items 3-4.

### 2026-07-10 — Phase 2 optional runtime speech configuration complete

Implemented Phase 2 item 2 as a launch/configuration slice. `internal/speech`
now owns one validated environment loader that reads only `OPENAI_API_KEY`; no
alternate credential name or alias is accepted, and a missing speech key
remains a valid text-only configuration. The test-provider
override is explicitly named `SETTA_E2E_OPENAI_SPEECH_BASE_URL`, requires
`SETTA_E2E=1` whenever it is present, and passes through the existing strict
provider URL validation before startup.

`runtime.Config` now carries the exact `speech.OpenAIClientConfig` that the
later service wiring will consume and validates it before binding the runtime
listener. Both the Electron-spawned `setta-backend` path and `setta serve` map
the same Go-owned environment configuration into that runtime field. No flag,
persisted credential, speech service, HTTP endpoint, generated contract, IPC,
or renderer capability was added early.

The configuration audit also closed the Codex subprocess boundary. The generic
Codex process launcher can now exclude named inherited and override variables,
and the production runtime excludes the Setta speech credential from every
Codex app-server child. This keeps the permanent speech key in the speech
client configuration even though the runtime process itself necessarily reads
it from its launch environment.

Verification completed for this slice:

- the complete `internal/speech`, `internal/codexapp`, `cmd/setta-backend`, and
  `cmd/setta` suites passed, along with the non-live `internal/runtime` suite;
- focused tests prove missing-key startup, configured-key startup, rejection of
  malformed keys and unguarded provider URLs, exact `OPENAI_API_KEY` mapping
  through both launch paths, and removal of the speech credential from both
  inherited and override Codex environments;
- the speech race suite, focused vet, static/complexity checks, and
  `./scripts/format.sh` passed;
- the deterministic production Easy Button Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase2-runtime-config-20260710`,
  covering local backend launch plus the existing start, stream, steering,
  terminal, stop, reload/restart, compact/reduced-motion, and pixel-match paths;
- ChatGPT authentication was available, so the live Electron chat, live Easy
  Button, and all four backend Codex probes were attempted with
  `OPENAI_API_KEY` removed. Every surface still failed before conversation
  creation because `model/list` advertises reasoning effort `max`, which the
  existing provider decoder rejects. This is not live-provider validation for
  the subprocess change;
- `./check_quality.sh --git-changes` reached the same four live runtime
  failures. Its first pass also found two slice-owned complexity thresholds;
  those functions were split at their owning validation boundaries and the
  prescribed focused package, vet, and complexity checks passed before the
  final gate rerun. Supply-chain verification was not required because no
  dependency, module, manifest, package-manager, toolchain, or supply-chain
  input changed.

The implementation plan is not complete. Phase 2 item 3 is next: add the
capability, transcription-session, summary-synthesis, and highlight-synthesis
services, authenticated handlers, and endpoint-registry entries. Items 4-6 then
wire those services into runtime/HTTP, regenerate the TypeScript and PWA
surfaces, and finish the credential/log/persistence audit. The existing live
Codex `max` drift blocks live proof but does not block that deterministic work.

### 2026-07-10 — Phase 2 runtime speech configuration audit complete

Audited commit `4b18d80d7` against this plan, `AGENTS.md`, its parent, the clean
starting worktree, both command launch paths, runtime and Codex process
construction, generated contracts, the checked-in PWA bundle, tests, and the
recorded production Electron workflow. The optional configuration, strict
E2E-only provider URL, runtime validation, exact `OPENAI_API_KEY`
loading/removal, and defense-in-depth Codex exclusion remain correctly owned
and scoped to Phase 2 item 2.

The audit fixed one practical credential-boundary gap. Both launch paths copied
the speech key into `runtime.Config`, but left the source variable in the Go
process environment. Later terminal shells and helper processes could therefore
inherit it, making the key observable outside the runtime and potentially in
terminal output or recordings. The one Go-owned speech environment loader now
copies and validates the value, immediately removes exactly
`OPENAI_API_KEY`, and fails startup if removal is impossible. The
runtime retains the copied client configuration, while later children inherit
no speech key; the explicit Codex exclusion remains defense in depth. A
`setta serve --tailnet` regression proves the key is gone before the Tailscale
helper runs.

Audit verification completed:

- complete `internal/speech`, `internal/codexapp`, `cmd/setta-backend`, and
  `cmd/setta` suites passed, along with the complete non-live `internal/runtime`
  suite; focused tests cover both launch paths, exact key removal, removal
  failure, retained copied configuration, and pre-helper ordering;
- race-enabled speech and command suites plus focused Go vet passed;
- contract regeneration was idempotent, and the generated TypeScript client
  and checked-in PWA bundle remain unchanged on protocol 12;
- the deterministic production Easy Button Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase2-runtime-config-audit-20260710`,
  including start, stream, steering, focus, terminal, stop, reload/restart,
  compact/reduced-motion, and pixel-match paths. Its fresh artifacts contain no
  speech credential, client-secret, or audio/base64 markers;
- ChatGPT authentication was available, so live Electron chat, live Easy
  Button, and all four backend Codex probes were rerun with `OPENAI_API_KEY`
  removed. Every surface still fails before conversation creation because
  `model/list` advertises reasoning effort `max`, which the existing decoder
  rejects. These failures are not live-provider validation for this slice;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed. Supply
  chain verification was not required because the audit changes no dependency,
  module, manifest, package-manager, toolchain, generated input, or
  supply-chain configuration.

The implementation plan is not complete. Phase 2 item 3 remains next: add the
capability, transcription-session, summary-synthesis, and highlight-synthesis
services, authenticated handlers, and endpoint-registry entries. Items 4-6
then wire those services into runtime/HTTP, regenerate the TypeScript and PWA
surfaces, and complete the credential/log/persistence audit. The existing live
Codex `max` drift does not block that deterministic work.

### 2026-07-10 — Phase 2 speech service and endpoint contracts complete

Implemented Phase 2 item 3 as a service/HTTP-contract slice without pulling
production runtime wiring or renderer speech controls forward. `internal/speech`
now owns a narrow application service over the existing OpenAI client, Easy Run
snapshot reader, and workspace resolver. Capabilities report configuration facts
without probing OpenAI. Transcription sessions first require a real open
workspace, derive a stable SHA-256 safety identifier from the authenticated
device principal without sending the raw device ID, and return only the
ephemeral secret plus backend-owned effective model, delay, WebRTC URL, and
limits.

Summary and highlight synthesis accept persisted IDs only. Both require the
requested Easy Run to be the latest visible run in the workspace. Summary
synthesis accepts only completed, failed, or stopped runs with an exact bounded
persisted summary; highlight synthesis requires exact highlight ownership by the
same latest run. Neither path accepts arbitrary renderer text, rewrites a
source, truncates it, or calls OpenAI after an unconfigured, stale, mismatched,
missing, invalid, or oversized source is detected. Successful provider bytes
are revalidated and returned as bounded generated-contract base64 with the
persisted source ID.

The four authenticated HTTP endpoints are now registered at
`/speech/capabilities`, `/speech/transcription/sessions`,
`/speech/easy-runs/summary`, and `/speech/easy-runs/highlight`. POST requests
have a 16 KiB pre-decode limit, the transcription handler obtains the device ID
only from authenticated request context, and typed speech failures preserve
their specific safe codes and HTTP classifications. The backend protocol is now
version 13. The TypeScript client, strict `SpeechProviderStatus` decoder,
contract snapshot, and checked-in PWA bundle were generated from the endpoint
registry; no generated output was edited manually.

Verification completed for this slice:

- complete `internal/speech`, `internal/httpapi`, contract-generator,
  embedded-webapp, and non-live `internal/runtime` Go suites passed, along with
  focused Go vet;
- race-enabled `internal/speech` and speech-only HTTP tests passed. A broader
  `internal/httpapi` race run exposed existing chat response/event races in
  composer-history, chat-event-stream, and workflow-steering tests; none enters
  the new speech service or handlers, so unrelated chat concurrency work was
  not folded into this slice;
- all 995 desktop Vitest tests, Electron/web typechecks, and Electron/web
  production builds passed. The generated contract and checked-in PWA bundle
  carry protocol 13 and all four speech operations;
- the deterministic production Easy Button workflow passed at
  `desktop/.recordings/easy-button-speech-phase2-services-20260710`, including
  the existing start, streaming, exact steering, Current focus, terminal,
  stop, reload/restart, compact/reduced-motion, and pixel-match paths. Its fresh
  artifacts contain no speech credential, client-secret, or audio/base64
  markers;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed. The
  non-live portions of `./check_quality.sh --all` also passed, including all
  repository static/complexity checks, non-live Go packages, all 995 Vitest
  tests, the Electron build, and every workflow in the complete required
  Electron manifest. Its first pass found only unformatted JSON in the fresh
  ignored recording directory; the prescribed formatter and focused Prettier
  check passed after correcting those artifacts. The broad command remains
  nonzero for the four live runtime failures described below.

ChatGPT authentication remains available. A direct complete runtime test run
again reached all four live Codex probes, which remain blocked before
conversation creation because `model/list` advertises reasoning effort `max`
and the existing Setta decoder rejects it. These failures are not live-provider
validation for this slice. `OPENAI_API_KEY` was not present in the loop process,
and the live OpenAI speech workflow is intentionally not present before the
later acceptance phase, so no live speech-provider result is claimed.

The required supply-chain audit remains blocked by GO-2026-5856 in the pinned
Go 1.26.4 standard library, fixed in Go 1.26.5. This slice changes no dependency,
module, manifest, package-manager, or toolchain input. Phase 2 item 4 is next:
construct the speech client/service in `internal/runtime`, pass it through
`internal/httpapi.Services`, and make configured and text-only production
runtimes serve these endpoints. Generated artifacts are current for item 3 and
must be regenerated again if item 4 changes any owner-defined contract. Phase 2
item 6 then completes the broader credential/log/persistence audit. No
deterministic implementation blocker was found for item 4.

### 2026-07-10 — Phase 2 speech service and endpoint audit complete

Audited commit `a550ade21`, the cumulative speech-provider work, the clean
starting worktree, generated contracts and embedded PWA bundle, the claimed
production recording, and the current OpenAI Realtime client-secret,
transcription, and Text-to-Speech documentation. The fixed
transcription-only session request, manual turn boundary, safety-identifier
header, `gpt-realtime-whisper` model and `medium` delay remain current. The
bounded `gpt-4o-mini-tts` request with built-in `marin`, WAV output, and the
AI-voice disclosure also remains current. Regenerating the endpoint-registry
surface and rebuilding the PWA produced no tracked drift.

The audit found one practical service-boundary gap. Speech operations claimed
to require an open workspace, but the general `ResolveWorkspace` path also
accepts a closed workspace retained in Recents. `workspacesession.Service` now
owns an atomic `ResolveActiveWorkspace` operation without changing the general
resolver's existing semantics, and the speech service requires that narrower
active-workspace contract before minting a client secret, reading an Easy Run
snapshot, or calling TTS. Focused service and workspace-session coverage proves
that active workspaces resolve while closed recent workspaces fail. This also
gives Phase 2 item 4 a production resolver with the exact required semantics.

Verification completed for the audited slice:

- complete focused speech, workspace-session, HTTP, command-launch,
  contract-generator, embedded-webapp, and non-live runtime Go tests passed,
  along with focused vet; race-enabled speech/workspace-session tests and the
  speech-only HTTP tests also passed;
- all 995 desktop Vitest tests, Electron/web typechecks, and both production
  builds passed. Regeneration and the web build left the protocol-13 generated
  TypeScript, contract snapshot, and checked-in PWA bundle unchanged;
- the deterministic production Easy Button workflow passed at
  `desktop/.recordings/easy-button-speech-phase2-services-audit-20260710`.
  Its 131 fresh artifacts contain no speech-key, client-secret,
  authorization, or audio/base64 markers;
- the non-live Go, static-analysis, desktop lint/typecheck/test/build, and
  dead-code portions of `./check_quality.sh --all` passed. Its required
  Electron manifest reached a chat protocol-notification timeout after 29
  earlier chat cases; the exact isolated `codex-protocol-notifications`
  workflow then passed. The focused Easy Button production workflow also
  passed independently, so no reproducible failure intersects this slice;
- ChatGPT authentication remains available. With `OPENAI_API_KEY` absent, all
  four live backend Codex probes plus the live Electron chat and Easy Button
  surfaces still fail before conversation creation because `model/list`
  advertises unsupported reasoning effort `max`. These are not provider proof
  for the speech work;
- `OPENAI_API_KEY` was not present in the loop process, and the opt-in live
  speech workflow is intentionally deferred until the later acceptance phase,
  so no live OpenAI speech result is claimed;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed for the
  audit changes;
- the supply-chain gate remains blocked only by GO-2026-5856 in pinned Go
  1.26.4, fixed in Go 1.26.5. This audit changes no dependency, module,
  manifest, package-manager, toolchain, generated input, or supply-chain
  configuration.

Phase 2 items 1-3 remain complete. Item 4 is next: construct the OpenAI client
and speech service in `internal/runtime`, pass it through
`internal/httpapi.Services`, and prove both configured and text-only production
runtimes serve the endpoints using the new active-workspace resolver. Then
regenerate if any Go-owned contract changes and complete item 6's broader
credential/log/persistence audit. No deterministic blocker was found for that
work.

### 2026-07-10 — Phase 2 production speech runtime wiring complete

Implemented Phase 2 item 4 and confirmed item 5 remains current. Production
runtime composition now constructs one validated OpenAI speech client from the
copied `runtime.Config.Speech`, builds the speech service over the production
Easy Run snapshot reader and active-workspace resolver, retains it with the
other base services, and passes it into `httpapi.HandlerConfig`. Configured and
text-only runtimes therefore serve the four authenticated speech endpoints
instead of returning `speech_service_unavailable`; no renderer, IPC, microphone,
playback, endpoint, or generated contract surface was pulled forward.

Runtime-level integration coverage starts a real Setta server with temporary
app data and authentication. The configured case opens a real workspace, uses
the scripted production chat/Easy Run paths to persist a terminal summary and
narrator highlight, mints a transcription client secret, and synthesizes both
persisted sources through an injected fake OpenAI HTTP server. The fake server
requires the configured bearer key, validates the privacy-preserving safety
identifier and provider operation shapes, returns strict session metadata and
a valid WAV, and proves the two exact stored strings are the only synthesis
inputs. The text-only case validates `not_configured` capabilities and the
typed `speech_not_configured` operation failure, proving optional speech does
not prevent runtime startup.

Verification completed for this slice:

- complete `internal/speech` and `internal/httpapi` suites passed; the focused
  configured/text-only runtime integration passed normally and under the race
  detector, and focused Go vet passed;
- the complete `internal/runtime` suite passed with an isolated unsigned Codex
  home, so all deterministic runtime tests and the new production speech path
  are clean independently of live-provider authentication;
- contract regeneration was idempotent. The protocol-13 generated TypeScript,
  schema snapshot, and checked-in PWA bundle did not change because item 4
  changes no Go-owned contract;
- the deterministic production Easy Button Electron workflow passed at
  `desktop/.recordings/easy-button-speech-phase2-runtime-wiring-20260710`,
  including start, stream, exact steering, Current focus, terminal, stop,
  reload/restart, compact/reduced-motion, and pixel-match paths. Its 131 fresh
  artifacts contain no speech-key, client-secret, authorization, or
  audio/base64 markers;
- `./scripts/format.sh` passed. `./check_quality.sh --git-changes` passed in
  full with the isolated unsigned Codex home; with the normal signed-in
  environment it passed file length, vet, dead-code, and complexity checks but
  remained nonzero only for the four live runtime failures described below.

ChatGPT authentication remains available, and every required live Codex gate
was attempted with `OPENAI_API_KEY` absent. The four backend probes and both
live Electron chat and Easy Button surfaces still fail before conversation
creation because `model/list` advertises unsupported reasoning effort `max`.
The Easy Button remains idle, preserves the submitted text, and surfaces the
typed provider-drift error. These failures are not live-provider validation for
this slice. `OPENAI_API_KEY` was not present in the loop process, and the
opt-in live speech workflow remains intentionally deferred until the later
acceptance phase, so no live OpenAI speech result is claimed.

The supply-chain gate remains blocked by GO-2026-5856 in the pinned Go 1.26.4
standard library, fixed in Go 1.26.5. This slice changes no dependency, module,
manifest, package-manager, toolchain, or supply-chain input. Phase 2 items 1-5
are complete. Item 6 is next: complete the broader credential, client-secret,
provider-body, audio, logging, diagnostics, and persisted-app-data audit across
both production launch paths and their failure cases before beginning Phase 3
IPC/preload/web client work. No deterministic implementation blocker was found
for that audit.

### 2026-07-10 — Phase 2 production speech runtime audit complete

Audited commit `f16a2b909` and the cumulative Phase 2 implementation against
this plan, `AGENTS.md`, the clean starting worktree, both command launch paths,
the OpenAI client and speech-service boundaries, authenticated HTTP endpoints,
runtime composition and cleanup, generated contracts, the checked-in PWA
bundle, provider failure handling, runtime output, recordings, diagnostics, and
persisted app/workspace data. Configured and text-only production runtimes serve
the intended four operations, the renderer receives only the expected generated
contracts, provider response bodies are discarded, and no speech operation
writes credentials, ephemeral metadata, or generated audio.

The audit found a practical verification gap rather than a production logic
defect. The runtime integration proved successful client-secret and WAV
responses but did not prove the privacy boundary after those values crossed the
real authenticated server, and it did not exercise a raw provider failure body.
A new configured-runtime regression now mints a sentinel client secret,
synthesizes valid WAV audio, forces a provider 500 response containing a
sentinel body, shuts the runtime down, and scans stdout, stderr, the safe HTTP
failure, the full temporary app-data tree, and the opened workspace tree. It
rejects the permanent key, client secret, provider body, raw WAV, and base64 WAV
in every forbidden location. Focused production-launch regressions also prove
that invalid speech credentials are not printed by either `setta-backend` or
`setta serve` while their specific startup errors remain visible.

Audit verification completed:

- complete focused speech, HTTP, runtime, and both command-package suites
  passed; the deterministic runtime suite also passed with an isolated unsigned
  Codex home, and the configured/text-only/privacy runtime cases passed under
  the race detector;
- contract regeneration was idempotent. Electron and web typechecks/builds
  passed, and the protocol-13 generated TypeScript, contract snapshot, and
  checked-in PWA bundle remained unchanged;
- the deterministic production Easy Button workflow passed at
  `.recordings/easy-button-speech-phase2-runtime-audit-20260710`, including the
  existing start, stream, exact steering, Current focus, terminal, stop,
  reload/restart, compact/reduced-motion, and pixel-match paths. Its fresh
  artifacts contain no speech credential, client-secret, authorization,
  provider-body, or audio/base64 markers;
- the signed-in live Easy Button workflow and all four live backend Codex probes
  were rerun with `OPENAI_API_KEY` absent. They remain blocked before
  conversation creation because `model/list` advertises unsupported reasoning
  effort `max`; the submitted Easy Button text is preserved and the typed drift
  error is visible, but these failures are not live-provider validation;
- `OPENAI_API_KEY` was not present in the loop process, and the opt-in live
  speech workflow remains a later acceptance-phase item, so no live OpenAI
  speech proof is claimed;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed, with the
  latter using an isolated unsigned Codex home after the separate signed-in live
  attempts above;
- the supply-chain gate still fails only on GO-2026-5856 in the pinned Go 1.26.4
  standard library, fixed in Go 1.26.5. The audit changes no dependency, module,
  manifest, package-manager, toolchain, generated input, or supply-chain
  configuration.

Phase 2 is complete. The next coherent work is Phase 3 item 1: expose the
generated speech operations through the Electron main IPC, preload `SettaAPI`,
and web `SettaAPI` surfaces without recording client secrets or audio payloads.
Then add the renderer-owned Realtime transport, microphone permission boundary,
and exhaustive capture state machine in items 2-8. The live Codex `max` drift
and pinned-toolchain advisory do not block that deterministic implementation
work.

### 2026-07-10 — Phase 3 speech API surfaces complete

Implemented Phase 3 item 1 without pulling WebRTC, microphone permission,
capture state, or voice UI forward. The shared `SettaAPI` now has a required
speech namespace for capabilities, transcription-session creation, persisted
summary synthesis, and persisted highlight synthesis. Electron main registers
typed handlers over the generated backend client, preload exposes the same
typed calls, and the paired web client maps them through its authenticated
generated client. Speech IPC channel values and argument/result contracts live
at the speech boundary; the existing Easy Run channel values were moved to
their corresponding owner while keeping the aggregate typed IPC surface.

The Electron session recorder now observes speech calls without persisting
sensitive results. Capability results remain inspectable, while Realtime
session and synthesized-audio results are replaced in recorder events with
typed redaction metadata. The renderer still receives the complete generated
response needed by later transport and playback work. Focused coverage proves
that the real client secret and WAV base64 cross the requested IPC call but are
absent from observed results.

A new required deterministic Electron workflow exercises all four operations
through the production renderer global, preload, main, authenticated generated
HTTP client, runtime speech service, Easy Run store, and a fake OpenAI server.
It opens a temporary workspace, mints a transcription session, completes a
scripted Easy Run with two narrator highlights, synthesizes the exact persisted
summary and highlight, validates provider authorization and request shapes, and
scans every text recording artifact for the permanent key, client secret, and
audio base64. The checked-in PWA bundle was regenerated from the web adapter.

Verification completed for this slice:

- focused main IPC, preload, web adapter, and shared IPC Vitest coverage passed;
- all 998 desktop Vitest tests, Electron/web typechecks, and both production
  builds passed;
- contract regeneration was idempotent, and the contract-generator and
  embedded-webapp Go suites passed;
- the focused production speech API workflow passed at
  `.recordings/easy-button-speech-phase3-api-20260710`; its terminal screenshot
  was inspected, its fake provider received exactly one Realtime request and
  two exact-source TTS requests, and its recordings contain none of the three
  sensitive sentinels;
- the complete existing production Easy Button workflow passed at
  `.recordings/easy-button-speech-phase3-api-regression-20260710`, preserving
  start, streaming, typed steering, Current focus, narrator-only NOW, terminal,
  stop, reload/restart, compact/reduced-motion, and pixel-match behavior;
- `./scripts/format.sh` and the final `./check_quality.sh --git-changes`
  passed. The first quality pass found only slice-owned complexity thresholds
  in the web and fake-provider test fixtures; those validations were split at
  their owning boundaries, and focused complexity plus adapter tests passed
  before the complete gate rerun.

`OPENAI_API_KEY` was not present in the loop process, and the opt-in live OpenAI
speech workflow remains intentionally deferred to the later acceptance phase,
so no live OpenAI speech proof is claimed. This adapter-only slice did not
change chat delivery, Codex protocol handling, run lifecycle, or provider
steering; the signed-in `max` reasoning-effort drift remained separate at the
time and is resolved by the compatibility update below. No dependency, module,
manifest, package-manager, or toolchain input changed.

The broad supply-chain audit was nevertheless rerun. Its release-age and module
tidy checks passed, but vulnerability scanning remains blocked by
GO-2026-5856 in the pinned Go 1.26.4 standard library, fixed in Go 1.26.5.
Updating the pinned toolchain remains separate dependency work and does not
block Phase 3 item 2.

Phase 3 item 2 is next: add the renderer-owned WebRTC transcription transport
and strict Realtime event decoder, including stale session/item rejection and
deterministic protocol tests. Electron microphone permissions and the complete
capture/UI workflow remain ordered items 3-8. No deterministic blocker was
found for item 2.

### 2026-07-10 — Standard OpenAI credential and Codex protocol compatibility complete

The product decision now uses only the conventional `OPENAI_API_KEY` for OpenAI
speech. The old Setta-specific variable is removed outright: there is no alias,
fallback, dual read, migration, or transitional path. Both runtime launch paths
copy `OPENAI_API_KEY` into the validated speech client configuration, remove it
from the process environment before launching helpers, and explicitly exclude
it from inherited and override Codex app-server environments. Codex therefore
continues using ChatGPT authentication and never receives the Platform key.
The mockup, deterministic speech fixture, tests, and all normative and progress
language in this plan use the standard name.

Setta's pinned Codex protocol snapshot was refreshed from upstream commit
`2b9c05046038c038ec6bddb9db7d11394995372d`. The latest stable and experimental
schemas introduced compatible stable/experimental `Thread` definitions where
the experimental object adds optional fields. The generator now accepts only a
deterministic compatible object superset, selects the richer definition, and
continues to reject changed required fields, changed common properties, and
all other incompatible same-name schemas. The refresh is idempotent and the
generated Go protocol surface was not edited manually.

Upstream intentionally models reasoning effort as a non-empty wire string to
allow custom future values, so Setta's stricter Go-owned chat contract was also
extended explicitly with the current `max` and `ultra` values. Display names,
workflow-agent validation, fake provider catalogs, focused protocol tests, the
generated TypeScript union/decoder/value set, and the checked-in PWA bundle are
updated together. Unknown future values still fail loudly; no permissive
decoder fallback was added.

Verification completed for this compatibility update:

- the complete Codex generator, Codex app, chat, orchestrator, speech, runtime,
  and both command-package Go suites passed. The first combined run exposed one
  upstream-permitted additional-field assertion and one unrelated chat timing
  failure; the assertion was updated to the new schema, and the chat test passed
  immediately in isolation before the complete clean rerun;
- all 998 desktop Vitest tests, Electron/web typechecks, and both production
  builds passed;
- the production speech API Electron workflow passed with `OPENAI_API_KEY` and
  retained its key/client-secret/audio redaction assertions;
- the deterministic Electron chat gate passed every chat case plus corrupt
  state recovery;
- with `OPENAI_API_KEY` removed, the ChatGPT-authenticated live Electron chat,
  live Easy Button, and supplemental backend Codex workflows all passed. This
  clears the previous `model/list` `max` blocker;
- `./scripts/format.sh` and the final `./check_quality.sh --git-changes` passed.
  Repeated exploratory `./check_quality.sh --all` runs also cleared all static,
  desktop, and generated-contract checks, but did not produce a clean aggregate
  exit: two different fake app-server Go tests exited intermittently and each
  passed immediately in isolation, while a later protocol-notification Electron
  rerun timed out after that same workflow had passed twice. These are recorded
  as existing full-suite process/timeout instability, not claimed as successful
  broad-gate evidence;
- the supply-chain release-age and module checks passed. Vulnerability scanning
  remains blocked only by GO-2026-5856 in the pinned Go 1.26.4 standard library,
  fixed in Go 1.26.5; this update changes no dependency or toolchain input.

The live OpenAI speech workflow remains a later acceptance-phase item, so the
available local `.env` Platform key has not yet been used as live speech proof.
Phase 3 item 2 remains next.

### 2026-07-10 — Phase 3 Realtime transcription transport complete

Implemented Phase 3 item 2 without pulling Electron microphone permission,
capture state, submission, or voice UI work forward. The renderer now owns a
small injectable WebRTC transport over the generated
`SpeechTranscriptionSession`. It attaches one live audio-only track, creates the
`oai-events` data channel, posts only the browser SDP offer to the backend-owned
WebRTC URL with the ephemeral bearer credential, requires the documented
`201 application/sdp` answer, and never sends a renderer-authored
`session.update` or otherwise overrides the backend-selected transcription
configuration.

The strict Realtime decoder accepts only the transcription session/item
lifecycle needed by this product: `session.created`, the committed user item,
append-only transcript deltas, the authoritative completed transcript, typed
transcription/provider failures, and rate-limit metadata. The transport waits
for the transcription-typed provider session as well as the open data channel
and applied remote description before becoming ready. Manual commit disables
the outgoing track and sends only `input_audio_buffer.commit`. Deltas and the
final transcript must match the one acknowledged provider item and content
part; duplicate sessions, mismatched items, events after teardown, malformed or
unknown event types, and oversized transcripts fail specifically instead of
cross-submitting stale text.

The generated maximum transcript count is enforced by Unicode character, while
the provider's completed string remains authoritative even when it differs from
the accumulated partial presentation. SDP responses are content-type/status
checked and read through a 64 KiB streaming bound. HTTP/provider bodies and
Realtime error prose are not surfaced, and connection failure, rejection,
quota, malformed response/event, stale item, transcription failure, transcript
overflow, and cancellation remain typed renderer errors. Completion, explicit
cancel, disconnect, malformed input, and setup failure all close the data
channel and peer connection, abort in-flight SDP exchange, detach listeners,
and stop every media track.

Verification completed for this slice:

- 32 focused Vitest cases cover every accepted event shape, malformed and
  unknown events, SDP request/response shape, readiness ordering, exact manual
  commit, authoritative completion, Unicode limits, provider status mapping,
  bounded declared and chunked SDP, stale session/item rejection, disconnect,
  abort, invalid media/session input, failed commit delivery, and
  partial-construction cleanup;
- all 1,030 desktop Vitest tests, Electron/web typechecks, dead-code analysis,
  focused lint/complexity checks, and both production builds passed. The web
  build produced no checked-in PWA drift because this transport remains behind
  the later capture controller;
- the authenticated production speech API workflow passed at
  `.recordings/easy-button-speech-phase3-transport-api-20260710`, and the
  complete production Easy Button regression passed at
  `.recordings/easy-button-speech-phase3-transport-regression-20260710`,
  including its current chat/run, persistence, compact/reduced-motion, and
  pixel-match paths. The 145 fresh recording artifacts contain none of the
  scanned credential, authorization, provider-prose, or test-secret markers;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  source, tests, and this plan entry were final.

ChatGPT authentication was available, so the live Codex safety gates were run
with `OPENAI_API_KEY` removed. The focused live Easy Button workflow and all
four supplemental backend live Codex probes passed. The broader live Electron
chat workflow reached the real provider but timed out waiting for an unrelated
semantic-cartographer state after its underlying live run had completed; that
aggregate result is not claimed as passing coverage for this slice. The failure
does not enter the new, currently unmounted Realtime transport and does not
block Phase 3 item 3.

The focused transport uses an injected browser boundary because no microphone
or capture state is mounted in production until ordered Phase 3 items 3-4. The
production Electron workflows above are therefore regression and existing
speech-path coverage, not a claim that voice capture is already reachable.
The opt-in live OpenAI speech workflow remains ordered for the later integrated
acceptance phase, and no live speech result is claimed here. No generated Go
contract, dependency, manifest, module, package-manager, or supply-chain input
changed. Phase 3 item 3 is next: add the trusted-main-renderer Electron audio
permission request/check boundary while denying video, workspace browser views,
external origins, and unknown webContents. No implementation blocker was found.

### 2026-07-10 — Phase 3 Electron microphone permission boundary complete

Implemented Phase 3 item 3 without pulling the capture controller, microphone
glyph, listening state, or transcript submission forward. Every production
Electron main window now installs both session permission handlers before its
renderer loads. Media checks and requests grant only audio capture from the
exact configured Setta renderer document, its main frame, and that window's
exact `webContents`. Video, audio-plus-video, unknown media, non-media
permissions, subframes, workspace browser views, external documents and
origins, malformed origins, and unknown `webContents` fail closed.

The policy handles the production file renderer's opaque origin only in
combination with exact document and `webContents` identity; development HTTP or
HTTPS renderers require their exact configured origin and document. No fake
media switch, OS-permission bypass, or automatic system grant was added, so
Chromium's approved request still reaches the platform's normal microphone
consent boundary. The repository does not yet have packaging configuration;
the planned `NSMicrophoneUsageDescription` remains required when that
configuration is introduced or updated rather than creating an unrelated
packaging system in this slice.

Verification completed for this slice:

- 10 focused main-process Vitest cases cover both installed handler paths, the
  trusted HTTP and file renderer cases, and every denied caller/media/origin
  category above;
- all 1,040 desktop Vitest tests, TypeScript typecheck, and the production
  Electron build passed;
- the authenticated production speech API workflow passed at
  `.recordings/easy-button-speech-phase3-microphone-permissions-api-20260710`,
  and the complete production Easy Button regression passed at
  `.recordings/easy-button-speech-phase3-microphone-permissions-regression-20260710`,
  including the existing start, streaming, exact steering, Current focus,
  terminal, stop, persistence/reload, compact/reduced-motion, and pixel-match
  paths;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  source, tests, and this plan entry were final.

ChatGPT authentication was available, so the live Codex safety gates were run
with `OPENAI_API_KEY` removed. The focused live Easy Button workflow and all
four supplemental backend live probes passed. The broader live Electron chat
workflow again reached the real provider, but its semantic-cartographer check
timed out after a generated patch used a colon-bearing chat event ID where that
separate schema accepts only letters, numbers, underscores, or hyphens. This is
not passing aggregate coverage, does not enter the microphone boundary, and
does not block the capture-state implementation.

No live OpenAI speech result is claimed because microphone capture remains
unmounted until Phase 3 item 4. No Go-owned contract, generated artifact,
checked-in PWA source, dependency, manifest, module, package-manager,
packaging, or supply-chain input changed, so contract regeneration, the web
build, and supply-chain verification were not required. Phase 3 item 4 is next:
mount the exhaustive capture state machine and transport, preserve the footer
draft, add the separate bounded live capture line and inward listening visuals,
and implement commit, cancellation, teardown, duration limits, and typed error
recovery. Items 5-8 then connect successful completion to the existing
start/steer path and finish deterministic Electron and secure-context/PWA
coverage. No implementation blocker was found for item 4.

### 2026-07-10 — Phase 3 Electron microphone permission audit complete

Audited commit `f52b8c95b`, its clean starting worktree, the pinned Electron
permission types, production main-window construction, shared-session workspace
browser views, generated artifacts, focused tests, and claimed workflow
recordings. The production policy is correctly installed before the renderer
loads, grants only main-frame audio for the exact trusted renderer document and
`webContents`, and fails closed for every other caller or permission. No
generated input, generated output, package, or packaging configuration changed
in the slice, and the still-deferred macOS usage-description requirement is
accurately recorded.

The audit found one practical verification gap: mocked session callbacks did
not prove that the pinned Chromium/Electron build supplies permission details
accepted by the production policy. A new required production Electron workflow
now launches with a synthetic media device only in the test process, calls the
real main renderer's `navigator.mediaDevices.getUserMedia`, stops the returned
track, and proves that audio succeeds while video and combined audio/video fail
with `NotAllowedError`. The shared CDP harness accepts explicit per-workflow
Electron arguments so this test-only device switch does not enter production
startup or bypass the application permission handlers.

Verification completed for the audited slice:

- all 10 focused permission-policy Vitest cases passed;
- the new production Electron microphone-permission workflow passed at
  `.recordings/easy-button-speech-phase3-microphone-permissions-audit-20260710`
  with one granted audio track, no video track, and denied video and combined
  requests;
- the original speech API and complete Easy Button production recordings were
  inspected and still report success; neither is misrepresented as a media
  capture test;
- contract generation was idempotent, and no generated TypeScript or checked-in
  web artifact changed;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  audit test and this plan entry were final.

Phase 3 items 1-3 remain complete. Item 4 is next: mount the capture state
machine and existing Realtime transport, preserve the footer draft, add the
separate bounded live capture line and inward listening visuals, and implement
commit, cancellation, teardown, duration limits, and typed error recovery. Do
not start item 5's completed-transcript submission wiring until that state
machine is complete. No implementation blocker was found.

### 2026-07-10 — Phase 3 capture state machine complete

Implemented Phase 3 item 4 without pulling completed-transcript start/steer
submission forward. The renderer now owns an exhaustive local
`idle | requesting_permission | connecting | listening | committing | failed`
capture controller over the existing strict Realtime transport. It checks the
runtime capability and browser secure-media boundary, requests one audio-only
stream, mints one workspace-scoped transcription session, waits for the actual
provider session/data channel/peer readiness boundary, commits only on the
second tap, accepts deltas only for the current capture, and hands off only the
provider's exact non-empty completed transcript. The backend-owned recording
and transcript limits are enforced without silence, punctuation, or timing
heuristics.

Typed failures now distinguish permission denial, missing microphone, insecure
context, unsupported browser, session creation, provider rejection/quota/
unavailability, malformed/stale events, transcript overflow, disconnect,
empty speech, duration exhaustion, and completion handoff. Escape, workspace or
runtime change, pane teardown, an active steering run ending, the secondary
Stop action, timeout, transport failure, and a replacement capture all close
the data channel and peer, clear the duration timer, and stop every media track.
The footer draft remains untouched through permission, connection, listening,
cancel, timeout, and provider failure. In this ordered item-4 slice, a successful
authoritative completion is staged exactly into that existing footer rather
than submitted; Phase 3 item 5 will attach the existing start/steer action to
the same completion callback and retain the footer staging only for ordinary
submission failure.

Configured runtimes now render the microphone as the center control regardless
of idle, working, or terminal run state. The run and capture axes remain
independent, so capture does not hide the working swirl, Current focus, or Stop
control. Permission and connection use truthful wait copy without rings; only
true listening renders the soft inward-converging rings and live microphone
tone. The bounded bright capture line is a separate text node from the dimmed
narrator-owned Current focus, its changing deltas are not live-announced, and
capture-state helper changes use a polite status. Committing has its own inward
pulse, reduced motion retains one static listening halo, and unconfigured
runtimes retain the shipped typed/Sparkles path. The existing rail and artifact
rendering was moved unchanged to its own component boundary to keep the growing
surface below repository file-length limits.

Verification completed for this slice:

- 26 focused capture-controller cases cover the complete state lifecycle,
  permission and support failures, exact media/session calls, current-session
  delta and completed handling, empty final rejection, every typed Realtime
  failure, duration limits, cancellation at each async boundary, exact final
  handoff, retry, teardown, and late-callback rejection. Together with the
  strict decoder and transport suites, all 58 focused speech tests passed;
- all 1,066 desktop Vitest tests, Electron/web typechecks, the Electron build,
  and the web build passed. `./scripts/go.sh test ./internal/webapp` passed, and
  the checked-in PWA bundle was rebuilt from the mounted capture source;
- the required configured production Electron workflow passed at
  `.recordings/easy-button-speech-phase3-capture-20260710-r4`. It uses a real
  temporary workspace, main/preload/generated HTTP speech path, active-workspace
  resolver, speech service, and fake OpenAI client-secret server with only the
  browser media/Realtime peer boundary scripted. It proves permission wait,
  connection, true listening, one bounded capture node, exact commit/delta/final
  handling, no Easy Run before item 5, footer-draft preservation, Escape,
  disconnect recovery, complete media/peer teardown, and key/client-secret/
  audio redaction. The listening and disconnect screenshots from the equivalent
  first clean run were inspected and remained contained and readable;
- the complete existing production Easy Button workflow passed at
  `.recordings/easy-button-speech-phase3-capture-regression-20260710-r1`,
  preserving typed start/steer, lossless chat persistence, Current focus,
  narrator-only NOW, artifacts, terminal/Stop behavior, reload/restart,
  compact/reduced-motion, and the existing pixel-match companion;
- ChatGPT authentication was available, so the focused live Easy Button
  workflow passed at
  `.recordings/easy-button-speech-phase3-capture-live-20260710-r1` and all four
  supplemental live backend Codex probes passed with `OPENAI_API_KEY` explicitly
  removed;
- `./scripts/format.sh` and the final `./check_quality.sh --git-changes` passed.
  The first quality attempt found only slice-owned browser-template,
  callback-complexity, and unused-export issues; the browser program moved to
  the normal fixture source and the owning functions were split before the
  focused checks and clean complete rerun.

The supply-chain release-age and module checks passed. Vulnerability scanning
remains blocked repository-wide by GO-2026-5856 in the pinned Go 1.26.4
standard library, fixed in Go 1.26.5; this slice changes no dependency,
manifest, module, package-manager, toolchain, or supply-chain input. No live
OpenAI speech result is claimed because the opt-in real-audio acceptance
workflow remains ordered for Phase 3 item 8.

Phase 3 item 5 is next: route the controller's authoritative completed
transcript through the existing Easy Run start/steer actions, clear the
preserved draft only on success, and put the final transcript in the footer on
ordinary rejection while preserving the existing structured accepted-steering
partial outcome. Items 6-8 then complete working-plus-listening Stop/focus
behavior, broader deterministic production coverage, and secure-context/PWA
and live speech acceptance. No deterministic implementation blocker was found
for item 5.

### 2026-07-10 — Phase 3 capture state machine audit complete

Audited commit `8a22d0622` against this plan, `AGENTS.md`, its parent, the clean
worktree, the checked-in web bundle, and the cumulative speech transport and
permission boundaries. The slice stays within Phase 3 item 4: configured
runtimes mount the exhaustive capture controller and truthful presentation,
but an authoritative completion is staged in the preserved footer rather than
submitted before item 5. The controller and mounted pane keep run state
independent from capture, disable the microphone track before the explicit
commit, accept only the current provider item's completed transcript, retain
the typed draft through cancellation and failure, and close the media,
Realtime, timer, and peer resources on every reviewed exit. The extracted rail
component is behaviorally unchanged, no Go-owned or generated TypeScript
contract input changed, and a clean web rebuild reproduced the committed PWA
assets without drift. No practical implementation fix was required.

Audit verification completed:

- all 58 focused Realtime decoder, transport, and capture-controller tests
  passed, including exact completion handoff, stale-event rejection, typed
  errors, duration exhaustion, retry, cancellation, and late callback safety;
- all 1,066 desktop Vitest tests, desktop and web typechecks, the Electron
  build, the web build, and `./scripts/go.sh test ./internal/webapp` passed;
- the configured production Electron capture workflow passed at
  `.recordings/easy-button-speech-phase3-capture-audit-20260710-r1`, covering
  permission wait, connection, listening, manual commit, exact delta/final
  handling, draft preservation, Escape, disconnect recovery, teardown, and
  speech-secret artifact redaction through the real
  renderer/main/preload/HTTP path;
- the full deterministic Easy Button regression workflow passed at
  `.recordings/easy-button-speech-phase3-capture-audit-regression-20260710-r1`,
  preserving typed start/steer, Current focus, narrator-only highlights,
  artifacts, Stop and terminal behavior, persistence, compact layout, and
  reduced motion;
- ChatGPT authentication was available, and the live Easy Button workflow
  passed at
  `.recordings/easy-button-speech-phase3-capture-audit-live-20260710-r1` with
  `OPENAI_API_KEY` explicitly removed.

Phase 3 items 1-4 remain complete. Phase 3 item 5 is still the next coherent
slice, with the same completion-submission, success clearing, ordinary failure
draft restoration, and accepted-steering partial-outcome boundary described
above. This audit did not start that work, and no blocker was found.

### 2026-07-10 — Phase 3 completed-transcript submission complete

Implemented Phase 3 item 5 as a renderer-to-execution slice. The capture
controller's authoritative completed transcript now enters the existing Easy
Run `start` or `steer` store action selected when capture begins. The Easy
Button layer passes the provider string unchanged; shared chat validation and
normalization remain the only boundary that trims and prepares the persisted
user message and provider input. Partial transcript deltas still remain local
presentation state and never enter an Easy Run or chat record.

Typed and spoken submissions share one action router without adding an Easy
Button transcript, narrator rewrite, or speech-specific backend path. A
successful spoken start or steer clears the preserved footer draft. An
ordinary rejected start or unapplied steer restores the exact completed
provider transcript and focuses the footer for editing. The structured
accepted-steering partial outcome remains distinct: when working-agent delivery
succeeded but Current focus projection failed, the transcript stays cleared,
the footer is blurred, and the persisted stale focus plus typed store error
communicate that the instruction was already sent. The controller reports a
submission failure only when the action actually rejects.

The required production Electron speech workflow now drives two spoken starts
and two spoken steers through the mounted renderer, preload, main, authenticated
HTTP client, Easy Run service/store, full-fidelity chat persistence, scripted
working provider, narrator, and event stream. It proves revision-zero focus,
the ordered `updating -> current` successful focus revision, exact normalized
trigger and steering chat messages and committed transcript blocks, narrator-
only NOW, the stale-focus partial outcome without duplicate retry text, and the
existing permission, Realtime, cancellation, disconnect, teardown, and secret-
redaction behavior. Only the external browser media/peer and OpenAI endpoints
remain scripted.

Verification completed for this slice:

- 33 focused submission and capture-controller Vitest cases passed, including
  exact start/steer routing, successful clearing, ordinary start/steer rejection,
  an explicit unapplied steering result, and the applied focus-projection
  failure;
- all 1,073 desktop Vitest tests, focused ESLint, Electron/web typechecks, and
  both production builds passed. The checked-in PWA bundle was regenerated
  from the mounted submission source, and
  `./scripts/go.sh test ./internal/webapp` passed;
- the configured production speech workflow passed at
  `desktop/.recordings/easy-button-speech-phase3-submission-20260710` with five
  transcription sessions and no credential, client-secret, or audio-base64
  leakage;
- the complete deterministic Easy Button regression passed at
  `desktop/.recordings/easy-button-speech-phase3-submission-regression-20260710`,
  preserving typed start/steer, stop, lossless chat, Current focus, narrator-
  only NOW, artifacts, terminal states, reload/restart, compact/reduced-motion,
  and pixel-match behavior;
- ChatGPT authentication was available. With `OPENAI_API_KEY` explicitly
  removed, `live-codex-electron`, `easy-button-live`, and all supplemental live
  backend Codex probes passed;
- `./scripts/format.sh` and the final `./check_quality.sh --git-changes` passed.

No dependency, manifest, module, package-manager, toolchain, generated Go
contract, or supply-chain input changed, so the supply-chain gate was not
required. No live OpenAI speech result is claimed; the opt-in real-audio
acceptance workflow remains ordered for Phase 3 item 8. Phase 3 item 6 is next:
finish the explicit working-plus-listening Stop/current-focus presentation
coverage and prove no transient steering transcript is rendered. No blocker
was found for that work.

### 2026-07-10 — Phase 3 completed-transcript submission audit complete

Audited commit `6f68bf315` against this plan, `AGENTS.md`, its parent, the clean
starting worktree, the regenerated web bundle, the mounted capture lifecycle,
the Easy Run store actions, and the deterministic and live production paths.
The completed provider string correctly enters the existing start/steer action
without renderer rewriting, partial deltas remain presentation-only, ordinary
failure restores the exact provider string, and the applied focus-projection
failure remains cleared and visibly distinct from rejection.

The audit found and fixed one scope race. Completion previously called the
latest render's callback without retaining the runtime and workspace where the
capture began. Although the normal selection-change effect cancels capture, a
provider completion could arrive after the selection render and before that
effect, causing the transcript to enter the newly selected surface. Capture
now owns its immutable runtime/workspace context through completion, and the
hook rejects the handoff unless both still match the active connected surface.
Focused coverage proves exact context retention plus rejection of missing,
runtime-changed, and workspace-changed contexts. The checked-in PWA bundle was
regenerated from that source fix.

Audit verification completed:

- all 52 focused Realtime transport, capture-controller, submission, and scope
  tests passed, followed by all 1,074 desktop Vitest tests, focused ESLint,
  desktop/web typechecks, both production builds, and
  `./scripts/go.sh test ./internal/webapp`;
- the configured production speech workflow passed at
  `desktop/.recordings/easy-button-speech-phase3-submission-audit-20260710`,
  and the complete deterministic Easy Button regression passed at
  `desktop/.recordings/easy-button-speech-phase3-submission-audit-regression-20260710`;
- ChatGPT authentication was available. With `OPENAI_API_KEY` removed,
  `live-codex-electron`, `easy-button-live`, and all supplemental live backend
  Codex probes passed;
- `./scripts/format.sh` and the final `./check_quality.sh --git-changes` passed.

No dependency or supply-chain input changed, so the supply-chain gate was not
required. Phase 3 items 1-5 remain complete. The plan is not complete, and the
next coherent slice remains Phase 3 item 6: finish explicit
working-plus-listening Stop/current-focus coverage and prove no transient
steering transcript is rendered. This audit did not start that work, and no
blocker was found.

### 2026-07-10 — Phase 3 working-plus-listening behavior complete

Completed Phase 3 item 6 by extending the configured production Electron
speech workflow across the already-mounted run/capture state axes. A working
spoken-steering capture now explicitly proves that true listening and
committing keep the last persisted Current focus visible, retain the working
swirl, preserve the footer draft, and leave the secondary Stop control enabled.
The live steering delta remains confined to the dedicated capture line: it is
never copied into Current focus, the narrator-only NOW rail, or a transient
`Steering:` presentation. The existing accepted completion still publishes
`updating`, preserves revision zero until narration completes, and applies the
persisted revision afterward.

The same production workflow now starts a fresh recording while a stale-focus
run is working, presses the real secondary Stop control, and verifies that the
capture channel and peer close, every microphone track stops, the capture line
clears, the preserved draft remains available, and the run reaches the neutral
stopped presentation without adding or duplicating a steering chat message.
The first focused run exposed only a test synchronization gap: capture teardown
finishes before the in-flight Stop request re-enables the footer. The final
assertion therefore waits for the authoritative stopped run before requiring
the complete resting footer state; production behavior did not require a
source change.

Verification completed for this slice:

- focused ESLint and Prettier checks passed for the changed Electron workflow;
- the configured production speech workflow passed at
  `desktop/.recordings/easy-button-speech-phase3-working-listening-final` with six
  authenticated transcription-session requests and no speech credential,
  client-secret, or audio-base64 leakage. Its working-listening screenshot was
  inspected and showed the microphone, Current focus, working state, Stop, and
  preserved draft together without overlap;
- the complete deterministic Easy Button regression passed at
  `desktop/.recordings/easy-button-speech-phase3-working-listening-regression`,
  preserving typed start/steer, lossless chat state, narrator highlights,
  artifacts, terminal and Stop behavior, persistence/restart, compact and
  reduced-motion coverage, and the existing pixel-match companion;
- ChatGPT authentication was available. With `OPENAI_API_KEY` explicitly
  removed, the complete live chat gate passed `live-codex-electron`,
  `easy-button-live`, and `live-codex-backend`.

No dependency, manifest, module, package-manager, toolchain, generated contract,
or supply-chain input changed, so the supply-chain gate is not required for
this slice. Phase 3 item 7 is next: broaden the deterministic production
workflow where needed beyond this explicit item-6 case and close the phase-wide
scripted media/Realtime coverage. Item 8 then covers remote-runtime/PWA secure
context behavior and the opt-in live OpenAI speech acceptance workflow. No
implementation blocker was found.

### 2026-07-10 — Phase 3 working-plus-listening audit complete

Audited commit `f5652487a` against this plan, `AGENTS.md`, its parent, the clean
starting worktree, the mounted capture/submission implementation, generated
contracts and checked-in PWA bundle, required workflow registration, and the
recorded configured and regression production Electron runs. The item-6 slice
correctly keeps the active-run and capture axes independent: Current focus,
the working swirl, and enabled Stop control remain visible through listening
and committing; partial steering stays in the dedicated capture line; stopping
while listening tears down media/Realtime state without submitting another
steering message.

The audit found one practical coverage gap rather than a production defect.
The progress entry claimed the preserved footer draft through both listening
and committing, but the new production assertion checked it only while
listening. The shared working-capture assertion now requires the exact draft in
current-focus listening, committing-with-delta, and stale-focus listening
states, so a commit-path draft regression cannot satisfy the item-6 gate.

Audit verification completed:

- the configured production Electron speech workflow passed at
  `desktop/.recordings/easy-button-speech-phase3-working-listening-audit-20260710`
  with six transcription sessions and the stronger draft checks;
- contract regeneration and the web production build were idempotent, and the
  Electron/web typecheck plus checked-in PWA bundle remained current;
- all 1,074 desktop Vitest tests, the Electron production build, dead-code and
  changed-test complexity checks, `./scripts/format.sh`, and
  `./check_quality.sh --git-changes` passed;
- with `OPENAI_API_KEY` removed, the focused live Easy Button workflow and all
  supplemental backend live Codex probes passed. The broader live Electron chat
  workflow reached the provider but failed an unrelated visual-model assertion
  after identifying a yellow fixture square as blue, so that aggregate is not
  claimed as passing coverage for this slice.

No dependency, manifest, module, package-manager, toolchain, generated contract,
or supply-chain input changed, so the supply-chain gate was not required.

Phase 3 items 1-6 remain complete. Phase 3 item 7 is still the next coherent
slice: broaden the deterministic production workflow where needed and close
the phase-wide scripted media/Realtime coverage. This audit did not start that
work, and no blocker was found.

### 2026-07-10 — Phase 3 deterministic transcription workflow closure complete

Completed Phase 3 item 7 by extending the required production Electron speech
workflow across the remaining renderer-owned transcription failure and teardown
boundaries. The same temporary-runtime path now covers denied microphone
permission, an empty authoritative completion, a typed provider transcription
failure, pane teardown, workspace switching, reload during commit, and an
ordinary spoken-start rejection caused by a concurrently started Easy Run.
Every case traverses the mounted pane and real main/preload/generated HTTP,
speech service, Easy Run, chat, store, and event paths; only browser media,
Realtime, and OpenAI remain deterministic fixtures.

The new assertions prove that failed or partial speech preserves the existing
footer draft, closes the data channel and peer, stops every microphone track,
does not change the latest Easy Run, and never enters the hidden chat record.
Pane close and workspace switch prove live resource teardown in the existing
document. Reload proves that the committing transcript, capture state, and
browser fixture are not restored or submitted. The unconfigured production
workflow now also explicitly requires the non-microphone `unavailable` state.
Provider failure prose joins the API key, client secret, and audio base64 in the
recording-artifact rejection scan.

The ordinary rejection case exposed one production defect. The submission
helper tried to focus the footer while capture was still `committing`, when the
input is necessarily disabled, so the exact transcript was restored but focus
was lost. Focus recovery now belongs to the mounted capture lifecycle: after
the controller publishes `completion_failed` and pending submission clears, a
React effect focuses the enabled footer. Applied steering partial outcomes
remain cleared and blurred, and non-submission capture failures do not steal
focus.

Verification completed for this slice:

- 34 focused capture-scope, controller, and submission Vitest cases passed,
  followed by all 1,074 desktop Vitest tests, focused ESLint, Electron/web
  typechecks, and both production builds;
- the checked-in PWA bundle was regenerated from the focus-recovery source, and
  `./scripts/go.sh test ./internal/webapp` passed;
- the configured production speech workflow passed at
  `desktop/.recordings/easy-button-speech-phase3-deterministic-closure-20260710`
  with 12 authenticated transcription sessions and the complete success,
  active-run, failure, cancellation, teardown, reload, and redaction matrix;
- the complete deterministic Easy Button regression passed at
  `desktop/.recordings/easy-button-speech-phase3-deterministic-closure-regression-20260710`,
  preserving typed start/steer, Current focus, narrator-only NOW, artifacts,
  terminal/Stop, persistence/restart, compact/reduced-motion, and pixel-match
  behavior;
- ChatGPT authentication was available and all four supplemental live backend
  Codex probes passed with `OPENAI_API_KEY` removed. The broader live Electron
  chat workflow again failed only because the visual model called the yellow
  fixture square blue. The live Easy Button run completed, but the model did
  not call the requested artifact tool, so those two aggregate workflows are
  not claimed as passing coverage for this slice;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  final source, tests, generated web bundle, and plan update. The quality gate
  used an isolated unsigned Codex home after the separate signed-in live
  attempts above.

No dependency, manifest, module, package-manager, toolchain, or Go-owned
contract changed. Phase 3 items 1-7 are complete. Phase 3 item 8 is next:
cover the remote-runtime/PWA secure-context boundary and add the narrow opt-in
live OpenAI speech acceptance workflow. `OPENAI_API_KEY` was absent from this
process, so no live OpenAI speech result is claimed; deterministic fixture
coverage is not treated as provider proof.

### 2026-07-10 — Phase 3 deterministic transcription closure audit complete

Audited commit `8197f22c0` against this plan, `AGENTS.md`, its parent, the clean
starting worktree, source and checked-in web artifacts, the mounted capture and
submission paths, and the retained production-workflow recordings. The capture
and submission behavior remains correct: the authoritative completed transcript
uses the existing start/steer actions, ordinary rejection restores and focuses
that exact transcript only after the footer is enabled, partial outcomes remain
cleared and unfocused, and the new failure/teardown cases keep ephemeral speech
out of Easy Run and chat persistence.

The audit found a practical workflow-integrity gap. The two-workspace fixture
called the generic open-workspace fallback before its preselected workspace had
finished mounting. It silently opened a third workspace, and the retained
recording contained an uncaught xterm renderer exception while the speech test
still reported success. The workflow now waits for the fixture's exact first
workspace, closes the unrelated default terminal through the production pane
path in each intended workspace before exercising speech teardown, and fails on
any renderer console error. The shared Easy Button driver also ignores released
presentation hosts with an empty pane ID, so a closed pane cannot be mistaken
for a live pane during teardown assertions.

Audit verification completed:

- all 34 focused capture-scope, controller, and submission Vitest cases passed,
  together with focused lint for every changed Electron workflow source;
- the configured production speech workflow passed at
  `desktop/.recordings/easy-button-speech-phase3-deterministic-closure-audit-20260710`
  with 12 authenticated transcription sessions, the intended two workspaces,
  all prior capture/failure/teardown assertions, and an empty renderer-console
  log;
- the complete deterministic Easy Button regression passed at
  `desktop/.recordings/easy-button-speech-phase3-deterministic-closure-audit-regression-20260710`.
- contract regeneration and the checked-in web build were idempotent, the
  embedded webapp test passed, and all 1,074 desktop Vitest tests plus Electron
  and web typechecks/builds passed;
- ChatGPT authentication was available. With `OPENAI_API_KEY` explicitly
  removed, `live-codex-electron`, `easy-button-live`, and all four supplemental
  live backend Codex probes passed;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  final audit source, workflow, and plan updates.

Phase 3 items 1-7 remain complete. This audit did not start Phase 3 item 8; the
next iteration remains remote-runtime/PWA secure-context coverage plus the
narrow opt-in live OpenAI speech acceptance workflow.

### 2026-07-10 — Phase 3 remote/PWA secure-context boundary complete

Completed the remote-runtime/PWA half of Phase 3 item 8. Speech availability
now evaluates the browser security boundary before runtime configuration, so a
remote plain-HTTP page always gives the specific HTTPS-or-localhost explanation
instead of potentially directing the user to configure `OPENAI_API_KEY` for an
origin that cannot capture audio. Secure Electron and localhost behavior is
unchanged, and typed Easy Button operation remains available in the unsupported
remote page.

A new required production PWA workflow starts a real configured `setta serve`
runtime with temporary app data, opens a disposable workspace, and seeds its
normal server-owned Easy Button layout through authenticated production
endpoints. It renders the checked-in web bundle in the pinned Electron Chromium
as an Android browser on two mapped remote hostnames. Plain HTTP proves
`isSecureContext = false`, no microphone or service-worker capability, the
Sparkles fallback, the exact secure-connection explanation, footer focus, and
zero OpenAI operations. An isolated HTTP/2 TLS proxy then proves the HTTPS page
is a secure context, registers the production service worker, exposes the real
microphone affordance, and completes a spoken request through the web adapter,
generated authenticated client, HTTP speech service, Easy Run/chat/store/event
paths, and scripted working provider. Only browser media/Realtime and OpenAI
remain deterministic fixtures; the completed transcript is persisted exactly
through the existing Easy Run path.

The browser fixture accepts its checked-in self-signed certificate only for the
synthetic secure test hostname. Browser profiles live in disposable OS temp
directories rather than recording artifacts and are deleted during teardown.
The retained workflow artifacts exclude browser cache/storage and reject the
permanent key, Realtime client secret, and WAV base64. The fake OpenAI server
received exactly one validated transcription-session request and no request
from the plain-HTTP page.

Verification completed for this slice:

- the focused secure-context precedence test passed, followed by all 1,075
  desktop Vitest tests, Electron/web typechecks, both production builds, and
  the embedded-webapp Go test; the checked-in PWA bundle was regenerated from
  the availability change;
- the new required PWA workflow passed at
  `desktop/.recordings/easy-button-speech-phase3-pwa-secure-context-20260710`.
  Its plain-HTTP and HTTPS Android screenshots were inspected and remained
  readable and contained;
- the configured Electron speech-capture regression passed at
  `desktop/.recordings/easy-button-speech-phase3-pwa-secure-context-electron-regression-20260710`,
  and the complete deterministic Easy Button regression passed at
  `desktop/.recordings/easy-button-speech-phase3-pwa-secure-context-regression-20260710`;
- ChatGPT authentication was available. With `OPENAI_API_KEY` explicitly
  removed, `live-codex-electron`, `easy-button-live`, and all four supplemental
  live backend Codex probes passed;
- `./scripts/format.sh` and `./check_quality.sh --git-changes` passed after the
  final source, workflow, regenerated PWA bundle, and plan update.

No dependency, manifest, module, package-manager, toolchain, or Go-owned
contract changed. Phase 3 item 8 remains partially incomplete: the next ordered
slice is the narrow opt-in live OpenAI speech workflow using a short consented
checked-in audio fixture, deterministic transcript word-error-rate scoring, and
real TTS WAV/playback validation. `OPENAI_API_KEY` was absent from this process,
so no live `gpt-realtime-whisper` or `gpt-4o-mini-tts` result is claimed, and the
passing fake-provider workflow is not treated as provider proof.

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
- Both command launch paths map only `OPENAI_API_KEY` into speech configuration,
  remove it from the runtime process environment, and exclude it from Codex
  children.

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
`OPENAI_API_KEY`. It should use a short, consented checked-in audio
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
same standard variable is the speech credential and must be removed before
Codex is launched so Codex continues using ChatGPT authentication.

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

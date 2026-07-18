# Instant Voice Capture Plan

**Date:** 2026-07-17

**Status:** Complete — all phases are implemented and verified, including the Phase 4 p95/one-frame local-readiness performance contract.

**Scope:** Every microphone entry point backed by the app-shell speech capture controller: Easy Button panes, the shell status control, the Global master overlay, and the Global master shortcut.

## Clean-cutover policy

This is a replacement, not a compatibility project.

- Do not add backward-compatibility shims, legacy support, migrations, transitional adapters, old-state or old-field aliases, feature flags, dual read/write, parallel runtime paths, or silent fallbacks.
- Remove replaced capture states, ownership paths, consumers, fixtures, and assertions in the same cutover. No production or test code may translate `recording`/`draining` back to the removed `connecting`/`listening` capture-state contract.
- Existing routing, arbitration, submission, provider-validation, and lifecycle behavior named in this plan are current product invariants. Preserve each invariant once on the new architecture; do not preserve its superseded implementation.
- If a persisted, generated, backend, or provider contract prevents a clean replacement, stop and revise this plan instead of adding compatibility code.

## Implementation status

- [x] Phase 0.1 — Deterministic Electron speech harness captures click, microphone grant, local capture-readiness proxy, transcription-session response, WebRTC readiness, finish, commit, and completed-transcript timing.
- [x] Phase 0.2 — Current click-to-`listening` baseline recorded with deterministic 0 ms, 500 ms, and 1,500 ms transcription-session delays in `docs/reports/performance/instant-voice-capture-phase0-20260717.md`.
- [x] Phase 0.3 — Disposable browser AudioWorklet-gated `MediaStreamAudioDestinationNode` feasibility harness proves retained prefix, drain tail, and RTCPeerConnection acceptance.
- [x] Phase 0.4 — Credential resolution, live processed-track result, finalized success/failure artifact privacy, and the root-`.env` provider run pass through the registered workflow.
- [x] Phase 1 — Build the buffered microphone lease.
- [x] Phase 2 — Make local capture the controller boundary.
- [x] Phase 3 — Make every mic surface honest and immediately actionable.
- [x] Phase 4 — Delayed capture, routing, cleanup, preemption, production app teardown, and the p95/one-frame local-readiness performance contract pass through the deterministic Electron workflow.

## Independent post-loop audit

The core result is sound: the root-`.env` live OpenAI workflow completed the expected transcript, current retained artifacts contain neither the API key nor the ephemeral client secret, local recording was observed around 22–35 ms with a 1,500 ms provider delay, the stale shell `listening` selector is absent from source and generated web assets, and no compatibility mechanism was found.

The production teardown correction is complete: the renderer root now uses standard page lifecycle boundaries (`beforeunload`, with non-persisted `pagehide` fallback) for Electron and web, active app-shell controllers register production teardown callbacks, the Phase 4 workflow exercises a real reload while capture is in flight, and the finalized fixture evidence asserts `commitDelta=0`, `stoppedTrackDelta=1`, and `peerCloseDelta=1`. The removed private renderer teardown route and query gate are absent from source and generated web assets.

The final performance correction is complete: the Phase 4 workflow keeps one explicit cold warm-up run, collects 20 already-authorized local-readiness samples for each of the 0 ms and 1,500 ms provider-delay cohorts, calculates nearest-rank p95 for both cohorts, enforces `100 ms` p95 and `1000 / 60 ms` p95-difference budgets, and reports the raw samples and p95 values in `docs/reports/performance/instant-voice-capture-phase0-20260717.md`.

## Completed final-audit correction

### Performance contract

- The workflow keeps one explicit cold warm-up measurement, then collects 20 already-authorized local-readiness samples in each of the 0 ms and 1,500 ms provider-delay cohorts on the pinned Electron workflow.
- It calculates and reports nearest-rank p95 for each cohort. Each p95 must be at most 100 ms, and the absolute difference between the two p95 values must be at most `1000 / 60` ms (one 60 Hz rendered frame).
- The former 50 ms spread allowance has been replaced with exact p95 and p95-difference assertions.
- The performance report includes cohort size, raw artifact-backed measurements, p95 values, and the p95 difference.

## Live OpenAI credential contract

Phase 0.4 must be completed through the current registered workflow, `instant-voice-capture-phase0-live-openai`. This is test-entrypoint work only; it must not change production credential ownership or create a second speech workflow.

1. An explicitly exported, non-empty `OPENAI_API_KEY` takes precedence.
2. When that variable is not exported, the selected live OpenAI workflow reads the ignored repository-root `.env` and extracts only `OPENAI_API_KEY` with the Node standard library's non-executing dotenv parser. Resolve the repository root from the workflow module location, not the caller's working directory; do not add a dependency for this.
3. Do not source or execute `.env`, load all of its values, mutate the generic workflow runner's environment, or expose the resolved key to unrelated workflows. Only the selected live OpenAI workflow may forward the key to the temporary production Electron/backend path that needs it.
4. Keep `run-workflows.mjs` credential-agnostic. A direct manifest invocation must work when the key exists only in the root `.env`, and an exported key must use the same single workflow path.
5. Missing, empty, or malformed credentials fail loudly with a redacted blocked artifact. Logs, summaries, screenshots, command lines, and retained artifacts must never contain the API key or the ephemeral transcription client secret.
6. Add focused tests for exported-value precedence, root-`.env` resolution, ignored unrelated values, and missing/empty/malformed input using temporary fixture files. Tests must never rename, rewrite, or delete the developer's real `.env`.
7. Update the README to name the current canonical workflow command. Remove the stale reference to the deleted `scripts/test_live_openai_speech.sh`; do not restore that legacy launcher or add a parallel wrapper.
8. Scan the complete finalized artifact tree after Electron/backend teardown on both success and failure. A pre-teardown success-only scan does not satisfy this contract.

The credential-source repair, provider transcript, finalized artifact privacy scan, and root-`.env` live smoke have passed through the registered workflow.

## Outcome

A user with microphone permission already granted can speak as soon as the microphone has opened. Creating an OpenAI transcription session and negotiating WebRTC happen behind local recording instead of in front of it.

The product contract is:

> When the UI says **Listening**, Setta is already retaining every microphone sample needed for this request. Network readiness may delay the transcript, but it must never delay or truncate what the user can say.

The first-use operating-system permission prompt remains an unavoidable exception. While that prompt is unresolved, the UI must continue to say that microphone access is being requested rather than claim to be listening.

## Decision

Keep the existing short-lived OpenAI Realtime transcription session and WebRTC media-track transport. Insert a renderer-owned, in-memory audio gate between the physical microphone and the WebRTC track:

```text
mic button
  -> getUserMedia
  -> raw microphone track
  -> AudioWorklet bounded FIFO
  -> MediaStreamAudioDestinationNode track
  -> existing OpenAI WebRTC peer connection
```

The worklet starts accepting microphone frames before the runtime creates the ephemeral transcription credential and before WebRTC connects. It emits silence toward the not-yet-ready peer while retaining real input in a bounded FIFO. When the Realtime transport is ready, it releases the oldest retained frame and then continues at normal real-time pace. This gives the provider one continuous, ordered media track with a fixed startup delay.

When the user finishes, Setta stops the physical microphone immediately, drains the retained tail and an explicit sample-counted silence post-roll through the synthetic WebRTC track, and only then sends `input_audio_buffer.commit`. The post-roll keeps the last speech samples ahead of the cross-channel commit instead of relying on an arbitrary timer. Audio is never written to disk, sent through IPC, or sent to the Setta runtime.

## Why the current UI waits

`AppShellSpeechCaptureController.start` currently serializes these milestones:

```text
click
  -> requesting_permission
  -> await getUserMedia
  -> connecting
  -> await runtime/OpenAI client-secret creation
  -> await SDP offer/answer + data-channel open + session.created
  -> listening
```

The relevant path is in:

- `desktop/src/renderer/src/features/global-speech/app-shell-speech-capture-controller.ts`: microphone acquisition is followed by session creation and `await transport.ready`; only then does capture transition to `listening`.
- `desktop/src/renderer/src/features/global-speech/realtime-transcription-transport.ts`: readiness requires the remote SDP, open data channel, and provider `session.created` event.
- `desktop/src/renderer/src/features/global-speech/global-speech-presentation.ts`, `app-shell-speech-status.tsx`, and `global-master/master-voice-controls.tsx`: `connecting` is rendered as a spinner and only `listening` exposes the finish/stop action.
- `desktop/src/renderer/src/features/easy-button/easy-button-conversation-control.ts`: the large pane control becomes a stop-listening button only for the `listening` state.

This makes at least two network round trips part of perceived microphone startup. The raw track exists during most of that delay, but Setta does not own a replayable copy of its preconnection audio. A browser WebRTC track does not give the application a guarantee that samples produced before the peer is ready will later be delivered. Merely relabeling `connecting` as `listening` would therefore risk losing the first words.

## Product and engineering invariants

1. **Listening means captured.** Transition to the listening presentation only after the local pipeline confirms that it is accepting microphone frames.
2. **The network is off the capture-readiness critical path.** Injecting delay into client-secret creation or WebRTC negotiation must not move the local capture-ready milestone.
3. **No missing prefix.** Audio produced after local capture readiness and before provider readiness reaches the provider once, in order.
4. **Finish works while connecting.** A short utterance can be started and stopped before the provider is ready; Setta connects, drains that complete utterance, commits it, and submits the final transcript.
5. **The physical microphone stops immediately.** Finish, cancel, failure, runtime switch, and disposal stop the raw microphone track without waiting for the provider.
6. **No silent loss or fallback.** Buffer overflow, worklet failure, or an ended output track is a typed visible failure. Do not drop frames, substitute browser speech recognition, or retry by reopening the microphone.
7. **One global capture lease.** Existing destination freezing, pane/master arbitration, playback preemption, and stale-lifecycle rejection remain authoritative.
8. **Memory only.** Raw samples remain inside the renderer audio pipeline and are zeroed/released on teardown. Logs and recordings may contain timings and sample counts, never audio bytes.
9. **No idle microphone or provider session.** Do not keep `getUserMedia`, an `AudioContext`, an ephemeral credential, or a WebRTC peer warm between requests.
10. **One transport.** Continue to send audio as one WebRTC media track. Do not mix RTP audio with data-channel PCM events.

## Target state model

Separate local recording from provider connection instead of using one state to represent both:

```ts
type SpeechCaptureState =
  | { type: "idle" }
  | (ActiveCapture & { type: "requesting_permission" })
  | (ActiveCapture & {
      type: "recording";
      connection: "connecting" | "ready";
    })
  | (ActiveCapture & {
      type: "draining";
      connection: "connecting" | "ready";
    })
  | (ActiveCapture & { type: "committing" })
  | SpeechCaptureFailure;
```

The exact names may change during implementation, but the two dimensions may not be collapsed again.

| State                    | Physical mic | Local FIFO                 | Provider                  | Primary action | User-facing meaning           |
| ------------------------ | ------------ | -------------------------- | ------------------------- | -------------- | ----------------------------- |
| `requesting_permission`  | Opening      | Empty                      | Not started               | Cancel         | Setta cannot capture yet      |
| `recording / connecting` | On           | Retaining                  | Starting                  | Finish         | Speak now; transcript may lag |
| `recording / ready`      | On           | Streaming with fixed delay | Ready                     | Finish         | Speak now                     |
| `draining`               | Off          | Sending retained tail      | Starting or ready         | None/cancel    | Finishing captured audio      |
| `committing`             | Off          | Empty                      | Transcribing final buffer | None/cancel    | Waiting for final transcript  |

Every microphone surface derives from this same model:

- `recording`, regardless of connection substate, renders the active microphone/stop affordance and **Listening** copy;
- a small secondary status may say **Connecting transcription** until the provider is ready, but it may not imply that the user should wait;
- `draining` uses **Finishing captured audio**;
- `committing` uses **Transcribing** or the existing finalization copy;
- pressing the same pane mic, shell mic, master mic, or master shortcut while `recording / connecting` finishes the current request rather than doing nothing;
- other panes remain disabled while the one global capture lease is active.

## Audio pipeline contract

Add a renderer-domain `BufferedMicrophoneCapture` lease with a narrow interface equivalent to:

```ts
interface BufferedMicrophoneCapture {
  readonly outboundStream: MediaStream;
  readonly ready: Promise<void>;
  releaseToTransport(): void;
  stopInputAndDrain(): Promise<void>;
  close(): void;
}
```

The implementation owns all of the following as one disposable resource graph:

- the raw `getUserMedia` stream;
- a resumed `AudioContext`;
- `MediaStreamAudioSourceNode`;
- an `AudioWorkletNode` with a bounded mono sample ring;
- `MediaStreamAudioDestinationNode` and its output stream.

The AudioWorklet processor must be a normal source module bundled by Vite, not executable source embedded in a string. Its queue semantics are deterministic:

1. Before release, enqueue real input and output silence.
2. After release, enqueue each new input quantum and output the oldest queued quantum, preserving a fixed backlog.
3. On finish, stop and disconnect the raw microphone first, reject new input, drain the remaining queue, emit the measured silence post-roll, then report `drained`.
4. On cancel/failure, discard and zero the queue immediately.
5. If capacity would be exceeded, fail before overwriting an unread sample.

Size the ring from the backend-owned `maximumRecordingSeconds` and the actual audio-context sample rate so memory is explicitly bounded by the same recording limit. Use a contiguous circular typed array, not one object allocation per audio quantum. The existing duration limit starts when the worklet acknowledges capture readiness, because that is when recording actually begins.

Phase 0 must measure and document the minimum conservative post-roll needed for the pinned WebRTC/provider path, then express it as a sample count at the audio-pipeline domain boundary. Do not implement drain as an uncorrelated `setTimeout`: completion must follow the worklet's observed emission of the queued speech and its explicit post-roll.

The browser may resample the microphone into the audio context and WebRTC may encode the destination track as it does today. Setta should not introduce a parallel PCM encoder. The Phase 0 gate below must verify transcription quality and track acceptance with the pinned Electron/Chromium version and the web build.

## Lifecycle and resource ownership

The controller owns the buffered microphone lease. The Realtime transport owns only its peer connection, data channel, and provider event session. It receives the lease's `outboundStream` but does not stop or dispose that stream.

This replaces the current shared stream teardown, where both controller and transport call `stopMediaStream`. One owner makes finish/drain/cancel ordering testable and prevents a transport close from cutting off retained tail audio.

Start proceeds as follows:

1. Validate runtime/capabilities and freeze the destination exactly as today.
2. Enter `requesting_permission` and call `getUserMedia` from the user gesture.
3. Once permission succeeds, begin building the buffered lease and requesting the ephemeral transcription session concurrently. Provider work never starts before microphone permission succeeds.
4. After the worklet acknowledges the first active processing quantum, enter `recording / connecting`, start the duration timer, and update every mic surface immediately; do not await the session request.
5. When both the processed output stream and session credential exist, create the WebRTC transport in the background.
6. When `transport.ready` resolves, mark the connection ready and release the FIFO.

Finish proceeds as follows whether or not step 6 has happened:

1. Enter `draining` and stop the raw microphone track immediately.
2. Await both transport readiness and FIFO drain. The two waits may resolve in either order.
3. Enter `committing` and send the existing provider commit event.
4. Continue accepting authoritative transcript deltas/completion under the existing capture-session correlation rules.
5. Submit the completed transcript through the unchanged master or conversation path.

Cancel, runtime disconnect, provider failure, duration expiry, and React disposal close the transport and buffered lease exactly once and reject all late callbacks using the existing lifecycle token.

## Failure contract

Extend the TypeScript-owned failure union only where a caller can take a distinct action:

- `capture_pipeline_failed`: AudioContext/worklet setup or processing failed;
- `capture_buffer_overflow`: the bounded queue could not preserve another frame;
- reuse `invalid_media` when the processed output is not one live audio-only track;
- preserve existing permission, connection, provider, duration, transcript, and submission failures.

Expand `browserSpeechCaptureSupport` to require the Web Audio pieces used by the new contract. Unsupported environments fail visibly before requesting the microphone. There is no ScriptProcessor, MediaRecorder, browser-recognition, or WebSocket fallback.

If setup is still pending when the user cancels, late streams, worklet messages, session credentials, and SDP responses must be disposed without changing the current state. If a provider connection fails after the user has spoken, discard the in-memory audio and report the connection failure; do not retain private audio for an implicit retry.

## Implementation phases

### Phase 0 — Baseline and prove the media primitive

Before changing the state model:

1. Add timing capture to the deterministic Electron speech harness for click, microphone grant, local capture readiness, transcription-session response, WebRTC readiness, first retained frame released, finish, drain, commit, and completed transcript.
2. Record the current click-to-`listening` result with deterministic 0 ms, 500 ms, and 1,500 ms provider-setup delays.
3. In a disposable browser test harness, prove that an `AudioWorklet`-gated `MediaStreamAudioDestinationNode` track:
   - is accepted by the current `RTCPeerConnection` path;
   - retains a synthetic audio marker produced before delayed WebRTC readiness;
   - stops the raw source immediately while its processed track drains without truncating a synthetic tail marker;
   - produces a valid transcript in a live OpenAI smoke test when credentials are deliberately available.
4. Append the baseline and feasibility result to a new report under `docs/reports/performance/`.

If the processed WebRTC track fails the live feasibility gate, stop and revise this plan. Do not silently switch to data-channel or WebSocket PCM; that is a different provider transport and security/contract design.

### Phase 1 — Build the buffered microphone lease

Add focused renderer sources under `desktop/src/renderer/src/features/global-speech/` for:

- the bounded sample ring and its deterministic tests;
- the AudioWorklet processor module;
- the browser-side buffered capture lease and resource teardown;
- typed worklet messages and capture metrics.

Test gate/release ordering, fixed backlog while input continues, finish-before-release, drain completion, capacity enforcement, cancellation, duplicate close, ended tracks, suspended contexts, and stale worklet messages. Tests must assert sample ordering/counts, not just mirror state transitions.

### Phase 2 — Make local capture the controller boundary

Update `app-shell-speech-capture-controller.ts` and its browser dependencies to:

- own a `BufferedMicrophoneCapture` instead of a raw stream;
- transition to recording on local readiness;
- create the transcription session without blocking the recording state;
- allow finish while provider setup is pending;
- wait for provider readiness plus local drain before commit;
- start/stop the duration timer on actual local input;
- preserve destination freezing, preemption, submission retries, runtime generations, and stale callback rejection;
- delete the raw-stream ownership path and removed capture-state variants atomically, with no aliases or parallel path.

Update `realtime-transcription-transport.ts` so media-stream lifetime is explicitly borrowed, not owned. Preserve strict session validation, provider-event decoding, and commit correlation.

No Go, HTTP endpoint, OpenAI supported-event registry, or generated TypeScript contract change is expected. Do not edit generated files. If implementation discovers that a provider or backend contract must change, update its owner and regenerate before continuing.

### Phase 3 — Make every mic surface honest and immediately actionable

Update the exhaustive presentation mappings and tests in:

- `global-speech-presentation.ts`;
- `app-shell-speech-status.tsx`;
- `global-master/master-voice-controls.tsx`;
- `easy-button-conversation-control.ts`;
- `easy-button-intent-slot.tsx` and affected Easy Button presentation tests.

The user-visible acceptance is the same at every entry point: the active/stop affordance and **Listening** state appear when local capture is ready, even while transcription says it is connecting. The UI must not flash back to a talk icon during drain or allow a second destination to steal the buffered request.

### Phase 4 — Production-path workflow coverage and performance report

Extend the scripted Realtime browser fixture so it can delay setup and observe the actual processed media track. Add a required deterministic Electron workflow that uses temporary app data and production renderer/main/preload/HTTP/store paths to cover:

1. Easy Button pane mic: speak a marker before provider readiness, stop before readiness, receive the complete transcript, and route it to the frozen conversation/pane.
2. Active-run pane mic: the same early utterance is preserved and queued/steered through the existing conversation lifecycle.
3. Shell mic and Global master overlay/shortcut: each enters the same local recording state and can finish during connection.
4. Cancellation, connection failure, duration failure, runtime switch, pane closure, and app teardown stop the raw mic, drop buffered audio, close the peer, and reject late completion.
5. Playback preemption and another-pane arbitration remain unchanged.

The workflow must vary provider setup delay and assert that local readiness does not move with it. It must validate an early synthetic audio marker at the processed-track boundary; a fixture that returns a fixed transcript regardless of audio is insufficient proof of this change.

Append after-results to the Phase 0 performance report rather than overwriting the baseline.

## Acceptance gates

### Functional

- With permission already granted, every mic entry point reaches locally backed **Listening** without waiting for runtime/OpenAI session creation or WebRTC readiness.
- Audio beginning immediately after that state is preserved when provider setup is delayed by at least 1,500 ms.
- Finishing before connection readiness submits one complete transcript and exactly one request.
- The raw microphone track is stopped synchronously on finish/cancel; only the synthetic output track remains long enough to drain.
- No audio prefix, tail, duplication, cross-pane routing, stale completion, or resource leak occurs.
- No production code, test driver, fixture, or assertion recognizes the removed capture-state variants or translates the replacement contract into them.
- App teardown cleanup is exercised through a standard production lifecycle with no E2E-only renderer flag, event, IPC, or alternate cleanup path.
- Finalized success and failure artifacts exclude the root API key and ephemeral client secret; the privacy scan runs after every artifact writer has stopped.

### Performance

- After one recorded cold warm-up, each 0 ms and 1,500 ms provider-delay cohort contains at least 20 already-authorized click-to-local-capture-ready samples.
- Nearest-rank click-to-local-capture-ready p95 is at most 100 ms in each cohort.
- The absolute p95 difference between the 0 ms and 1,500 ms provider-delay cohorts is at most `1000 / 60` ms, one 60 Hz rendered frame.
- Provider delay may move transcript deltas and final completion, but not the active microphone presentation.
- Main-thread work from the audio pipeline remains bounded and does not create per-quantum React updates. Audio movement stays in the worklet; UI receives only lifecycle and coarse diagnostic events.
- Record before/after measurements in `docs/reports/performance/` as required for a performance-relevant UI change.

### Verification sequence

During implementation, run the narrowest changed renderer tests first, then the deterministic speech workflow, then the required broader gates:

```text
pnpm -C desktop exec vitest run <changed global-speech and Easy Button tests>
node --test desktop/tests/electron/instant-voice-capture-live-openai-credentials.test.mjs <changed privacy orchestration tests>
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase4-workflow --skip-build
env -u OPENAI_API_KEY -u SETTA_E2E_OPENAI_SPEECH_BASE_URL node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-live-openai --skip-build
pnpm -C desktop build:web
./scripts/go.sh test ./internal/webapp
./scripts/test_topic_conversation_workflows.sh --deterministic-only --skip-build
./scripts/format.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

Run `./scripts/test_topic_conversation_workflows.sh --live-only --skip-build` when local Codex ChatGPT auth is available; it must run without `OPENAI_API_KEY`. If auth is unavailable, record the justified skip and do not present it as provider-integration evidence. For Phase 0.4, unset `OPENAI_API_KEY` in the invoking shell and run `node desktop/tests/electron/run-workflows.mjs --workflow instant-voice-capture-phase0-live-openai --skip-build` so the ignored root-`.env` path is exercised through the registered workflow. Use temporary app data and do not record raw audio.

## Rejected shortcuts

### Rename `connecting` to `listening`

This improves appearance while leaving early words outside an application-owned delivery guarantee. It violates the product contract.

### Only parallelize microphone and session setup

Parallelism reduces average delay but still makes correctness depend on races and still cannot guarantee the prefix spoken before WebRTC is ready. It is a useful internal optimization only after local buffering exists.

### Keep the microphone or provider session warm

This trades a one-second interaction problem for persistent privacy indicators, idle resources, credential/session expiry, reconnection logic, and possible provider cost. It also makes app startup and runtime switching part of voice correctness.

### Send buffered PCM through the data channel or switch browsers to WebSocket

OpenAI's browser guidance uses WebRTC media tracks, while explicit base64 PCM buffering is the lower-level WebSocket path. A second audio path would add resampling, encoding, backpressure, provider-event contract generation, and ordering hazards with RTP. The Web Audio gate solves the product problem while retaining one supported browser media path.

### Use `MediaRecorder` blobs and transcribe after stop

That removes live transcript deltas, introduces a second file-style transcription architecture, and weakens the current short-lived Realtime contract.

## Source evidence

- Current Setta lifecycle: `desktop/src/renderer/src/features/global-speech/app-shell-speech-capture-controller.ts` and `realtime-transcription-transport.ts`.
- Current shared presentation: `global-speech-presentation.ts`, `app-shell-speech-status.tsx`, `global-master/master-voice-controls.tsx`, and `easy-button/easy-button-conversation-control.ts`.
- OpenAI Realtime transcription guide: <https://developers.openai.com/api/docs/guides/realtime-transcription>.
- OpenAI WebRTC guide: <https://developers.openai.com/api/docs/guides/realtime-webrtc>.

The official guidance supports browser microphone audio as a WebRTC media track and manual commit for a transcription session with turn detection disabled. The proposed buffer remains entirely on the client side before that existing media track.

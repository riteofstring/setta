# Always Listening with openWakeWord

**Date:** 2026-07-21

**Status:** Plan of record for the first “Hey Setta” implementation.

**Decision:** Use openWakeWord for wake-word detection. Do not build a
Porcupine fallback, user-supplied wake-word API key path, or cloud wake-word
mode.

## Intent

Setta should support an optional always-listening mode:

```text
Settings -> Voices -> Always listening on
User says "Hey Setta"
Setta starts a new voice request
Setta automatically decides when the request is done
Setta submits the transcript through the same product path as normal voice input
```

The user should not click a button to start, click a button to finish, or say
an artificial terminator such as “end of message.”

The product promise is local-first:

- wake-word detection runs locally;
- pre-wake audio stays in a bounded in-memory ring buffer;
- speech capture audio is not written to disk;
- no always-listening audio is sent to OpenAI or any other cloud provider; and
- the feature works without a Picovoice, OpenAI, or other user-entered voice
  API key.

## Scope

This plan is macOS-first because Setta’s current local default voice provider
is local macOS voice. Cross-platform wake mode is deferred until the macOS path
is proven.

In scope:

- a Settings toggle for always listening;
- a packaged openWakeWord “Hey Setta” model;
- one local microphone owner that arbitrates manual capture and wake capture;
- deterministic wake/listen/capture/endpoint state;
- local VAD-based end-of-message detection;
- production IPC between main, renderer, and the local voice engine;
- focused deterministic tests and one production Electron workflow using fake
  wake/audio events; and
- a dogfood evaluation report for false accepts, false rejects, latency, CPU,
  and battery impact.

Out of scope:

- barge-in while Setta is speaking;
- cloud wake-word detection;
- Porcupine or any other wake-word fallback;
- user-trained wake phrases;
- multiple wake-word engines in product settings;
- background OS launch agent behavior after Setta quits;
- waking a sleeping Mac; and
- semantic turn detection with a general-purpose LLM.

## Product Behavior

Always listening is off by default. When enabled, Setta asks for microphone
permission if needed and starts the local listener while the desktop app is
running.

The first version is half-duplex:

- if Setta is speaking, wake detection is paused or detections are ignored;
- if manual voice capture is active, wake detection is paused;
- if wake capture is active, the manual mic button reflects the active capture
  instead of starting a competing microphone session.

Routing follows the same user-facing destination rules as current voice input:
submit to the focused Easy Button conversation when one exists, otherwise route
through the global master input path.

If local voice is not ready, the Settings toggle stays unavailable and routes
the user to the local voice setup/download state already used by click-to-talk.
Always listening must not introduce a second model setup flow for Whisper.

## Target Architecture

```text
Electron main process
  -> owns persisted always-listening setting
  -> starts/stops local voice engine
  -> broadcasts typed listener state/events

Local voice engine process
  -> owns the microphone stream
  -> resamples once to 16 kHz mono PCM16
  -> keeps 750-1,000 ms pre-wake ring buffer in memory
  -> runs openWakeWord on streaming frames
  -> runs VAD and endpoint state after wake
  -> transcribes finalized utterance through the existing local voice path
  -> returns final transcript/failure events

Renderer speech controller
  -> renders global/easy-button voice state
  -> submits completed wake transcript through existing voice submission logic
```

There must be one microphone owner. The first implementation should extend the
local voice engine boundary so manual click-to-talk and always listening cannot
compete for the input device.

## Engine Packaging

openWakeWord is the selected wake-word engine. The production app must not
depend on a user-installed Python runtime.

Implementation direction:

1. Use Python/openWakeWord only for model training, offline evaluation, and
   development fixtures.
2. Package a Setta-owned “Hey Setta” wake model with the desktop app after its
   license/provenance is documented.
3. Run wake inference inside the local voice engine with packaged runtime
   dependencies, not through a developer shell.
4. Prefer ONNX Runtime or TFLite integration in the helper/utility process over
   shipping a Python sidecar. If the spike shows that this is materially worse,
   document the measured reason before choosing a sidecar.

Do not ship openWakeWord bundled pretrained models as product behavior unless
their individual model licenses and training provenance have been reviewed.
Setta should ship its own “Hey Setta” model for this feature.

Any implementation phase that adds Python, ONNX Runtime, TFLite, native binary
downloads, model artifacts, or another non-Go/non-pnpm dependency surface must
update the repository supply-chain checks in the same commit sequence. The
dependency cannot land first with a promise to audit it later.

## State Machine

Use an explicit state machine:

```text
DISABLED
  -> setting enabled and local voice ready
ARMING
  -> microphone stream started, wake model loaded
ARMED
  -> "Hey Setta" crosses threshold
WAKE_DETECTED
  -> copy pre-wake ring buffer into utterance buffer
WAITING_FOR_MESSAGE_SPEECH
  -> speech debounce passes
CAPTURING
  -> trailing silence threshold passes
CANDIDATE_END
  -> endpoint accepted
FINALIZING
  -> transcription succeeds
SUBMITTING
  -> voice transcript enters existing Setta input path
ARMED
```

Additional terminal/interrupt states:

- `PAUSED_FOR_PLAYBACK`
- `PAUSED_FOR_MANUAL_CAPTURE`
- `MICROPHONE_DENIED`
- `LOCAL_VOICE_NOT_READY`
- `ENGINE_FAILED`

The state machine should be domain code with deterministic tests. It should not
be inferred from scattered timers in React components.

## Initial Audio Parameters

These are starting values, not magic constants:

| Parameter | Starting value |
| --- | ---: |
| Engine input format | 16 kHz mono PCM16 |
| Wake frame size | 80 ms |
| VAD frame size | 20-30 ms |
| Pre-wake ring buffer | 750-1,000 ms |
| Audio copied before wake | 300-500 ms |
| Speech-start debounce | 120-200 ms voiced |
| No-message timeout after wake | 4 seconds |
| Candidate endpoint | 800-1,000 ms mostly unvoiced |
| Hard trailing silence limit | 2.2 seconds |
| Trailing audio padding | 300-500 ms |
| Maximum utterance | 30-45 seconds |
| Re-arm cooldown | 250-500 ms |

Endpointing should use hysteresis: sustained voice starts a message; sustained
non-voice ends it. VAD may delay finalization, but it must not interrupt active
speech. A hard maximum utterance duration prevents the listener from staying in
capture forever.

For the MVP, do not use a chat LLM to decide when the user is done. If dogfood
shows fixed VAD endpointing cuts people off or waits too long, add a dedicated
local turn detector as a later phase.

## Wake Model Evaluation

Before exposing the setting outside development builds, create an append-only
report under `docs/reports/voice/` with:

- model artifact name, hash, runtime, and threshold;
- positive test counts for “Hey Setta” across speakers, distances, rates, and
  microphone types;
- false-reject rate on intended wakes;
- negative hours processed;
- false accepts per hour;
- near-miss phrases such as “hey Siri,” “hey setter,” “Setta,” and normal
  conversation containing similar sounds;
- app playback echo tests using Setta’s local TTS voice;
- average wake-to-recording latency;
- endpoint-to-final-transcript latency;
- CPU and memory while armed;
- CPU and memory while capturing; and
- battery impact from a representative 30-minute idle run.

The initial release bar should be product-driven, not benchmark-driven:

- false wakes must be rare enough that the feature is not embarrassing in a
  meeting;
- misses must be low enough that retrying the wake phrase does not feel broken;
  and
- endpoint latency must feel faster than click-to-talk.

## Implementation Phases

### Phase 0: Supply-Chain Baseline

- [x] Teach `./scripts/check_supply_chain.sh` to audit the existing local macOS
  voice external artifact declarations.
- [x] Cover the whisper.cpp XCFramework declaration in
  `scripts/build_local_macos_voice_helper.sh`.
- [x] Cover the default Whisper model declaration in
  `desktop/src/main/local-macos-voice-model-download.ts`.
- [x] Require pinned artifact identity, source URL, expected SHA-256, expected byte
  size when applicable, and owner file metadata.
- [x] Add focused tests for the artifact-audit parser/checker.

Exit criteria: `./scripts/check_supply_chain.sh` fails loudly if either local
voice external artifact loses its provenance or hash declaration.

### Phase 1: Engine Spike

- [ ] Train or generate the first “Hey Setta” openWakeWord model.
- [x] Build an offline evaluator that accepts WAV fixtures and reports wake
  scores, false accepts, false rejects, and timing.
- [ ] Prove wake inference can run from packaged app resources without user
  Python.
- [ ] Choose ONNX Runtime or TFLite based on measured packaging/runtime
  behavior.
- [ ] Write the first model evaluation report with artifact, runtime, threshold,
  and corpus measurements.
- [x] Record the repository-local evaluator baseline and unavailable external
  release gates in
  `docs/reports/voice/always-listening-openwakeword-phase1-evaluator-20260721.md`.

Exit criteria: a reproducible model artifact, a checked-in evaluator script or
documented command, and a clear threshold candidate.

### Phase 2: Local Voice Engine Boundary

- [x] Define a typed listener command/event protocol owned by Electron main.
- [x] Extend the local voice engine so it owns microphone capture for both manual
  capture and always listening.
- [x] Add explicit arbitration between armed wake detection, manual click-to-talk,
  active capture, and playback.
- [x] Keep pre-wake audio memory-only.
- [x] Add native/helper tests using scripted PCM fixtures instead of real microphone
  timing.

Repository note: the first Phase 2 batch added the main-process listener
protocol/state machine and focused arbitration tests. The second Phase 2 batch
wired the production helper listener lifecycle and helper-owned microphone
arbitration. The third Phase 2 batch added helper-side scripted PCM ingestion,
memory-only pre-wake buffering, endpoint finalization through the existing local
transcription boundary, and native helper coverage for the wake/capture path.

Exit criteria: fake audio can trigger wake, capture, endpoint, and transcript
events through the production engine boundary.

### Phase 3: Renderer Integration

- [x] Add the Settings toggle and readiness state in Settings -> Voices.
- [x] Add app-shell subscription to listener state/events.
- [x] Extend the speech capture controller with an external wake transcript path
  that reuses existing voice submission and routing behavior.
- [x] Render clear states for armed, wake detected, recording, finalizing, failed,
  and paused.
- [x] Ensure the manual mic button and always-listening state cannot contradict
  each other.

Implementation note (2026-07-21): the renderer now persists the Settings toggle,
subscribes to listener state/events through preload IPC, submits finalized wake
transcripts through the existing focused-conversation/global voice paths, renders
the armed/wake/recording/finalizing/paused/error states, and arbitrates manual
mic starts against active wake capture. The local macOS Electron workflow now
enables the setting with a scripted helper wake event and verifies the transcript
reaches durable voice input without clicking the mic button.

Exit criteria: a fake wake event in the running app submits a voice transcript
to the focused conversation without clicking the mic button.

### Phase 4: Endpointing and Product Hardening

- Tune VAD, silence, padding, and maximum-duration parameters.
- Strip leading wake phrase text deterministically from transcripts.
- Add half-duplex playback suppression.
- Add recovery for helper crash, model load failure, microphone denial, and
  local voice not ready.
- Add a visible path from failed listener state to Settings -> Voices.
- Record CPU/memory/battery measurements in the report.

Exit criteria: dogfood builds can stay armed for long sessions without obvious
false wakes, clipped first words, or stuck capture.

### Phase 5: Production Verification

- Add deterministic Electron workflow coverage using temporary app data and fake
  wake/audio fixtures.
- Cover app restart with always listening enabled.
- Cover Settings toggle on/off.
- Cover local voice missing model -> download -> listener becomes armable.
- Cover manual mic capture while listener is armed.
- Cover playback suppression.
- Cover helper crash and recovery.
- Run the existing local macOS voice workflow and the topic-conversation voice
  workflow gates.

Exit criteria: production Electron/main/preload/renderer/HTTP/store paths are
covered without real microphone timing or mutating real user state.

## Data and Storage

Persist only:

- always-listening enabled/disabled;
- optional internal threshold overrides if we intentionally expose them to
  development builds; and
- model metadata/version if needed for diagnostics.

Do not persist:

- raw microphone audio;
- pre-wake ring buffer audio;
- wake-score history outside explicit diagnostic sessions;
- discarded false-wake audio; or
- transcripts that are not submitted into the normal Setta conversation path.

The wake model is an app asset. The Whisper model remains in Electron
`userData` under the existing local voice model download path.

## Supply Chain and Dependency Gates

The current repository supply-chain script covers Go modules and pnpm projects.
Always-listening work expands the possible dependency surface, so the first
commit that introduces any new dependency family must also teach the tooling to
verify that family.

Required gates for new non-Go/non-TypeScript dependencies:

- direct dependency versions are pinned exactly;
- lockfiles or equivalent resolved manifests are checked in;
- `./scripts/check_supply_chain.sh` audits the new manifest type;
- vulnerability checks run for the new ecosystem where a maintained advisory
  source exists;
- release-age policy is enforced where registry metadata supports it;
- packaged native binaries and model artifacts have checked-in metadata with
  source URL, license, version or creation date, SHA-256, and reproduction or
  download instructions;
- build or startup verification checks model/binary SHA-256 before use; and
- missing supply-chain coverage fails loudly rather than becoming a manual
  checklist item.

Examples:

- If Python/openWakeWord is used for training scripts, add a pinned Python
  dependency manifest and a matching audit path.
- If ONNX Runtime or TFLite is packaged in the app, add binary provenance,
  license, hash verification, and vulnerability/release tracking appropriate to
  the distribution format.
- If a “Hey Setta” model is checked in or downloaded, record model provenance
  and hash it like an executable app asset.

Baseline follow-up from the local-first voice work:

- Teach `./scripts/check_supply_chain.sh` to inspect the existing local macOS
  voice external artifacts before adding openWakeWord dependencies.
- The check should cover the whisper.cpp XCFramework declaration in
  `scripts/build_local_macos_voice_helper.sh`.
- The check should cover the default Whisper model declaration in
  `desktop/src/main/local-macos-voice-model-download.ts`.
- The check should verify that each artifact has a pinned version or stable
  identifier, source URL, expected byte size when applicable, SHA-256, and a
  clear owner file.
- Vulnerability tooling may not exist for raw model files or GitHub release
  binaries, but the script should still enforce provenance and hash discipline
  instead of ignoring those artifacts.

## Verification Requirements

Because this touches renderer conversation state, local provider handling,
speech capture, run submission, and IPC/preload contracts, deterministic
end-to-end Electron workflow coverage is required.

Minimum checks before committing implementation:

- `./scripts/format.sh`
- `./check_quality.sh --git-changes`
- focused unit tests for listener state, endpointing, and settings;
- local voice native/helper tests;
- the new always-listening Electron workflow; and
- existing local macOS voice and topic-conversation speech workflows relevant
  to changed paths.

Live provider tests are not required for wake detection itself. If changes
touch live Codex/provider routing, run the live Codex E2E tests when ChatGPT
auth is available and report any narrow skips.

## Non-Negotiables

- No cloud wake-word path.
- No user Picovoice key.
- No Porcupine fallback.
- No hidden Python dependency on the user machine.
- No polling for listener readiness when a push event is available.
- No raw always-listening audio on disk.
- No generic LLM endpointing in the MVP.
- No compatibility shims, migrations, legacy fields, dual engine paths, or
  transitional adapters.
- No dependency, model, or native runtime surface without matching
  supply-chain/vulnerability tooling.

## Open Questions

1. Whether ONNX Runtime or TFLite is the better packaged runtime for the macOS
   helper.
2. Whether the first “Hey Setta” model is good enough with synthetic training
   only or needs real positive recordings before product exposure.
3. Whether the listener should stay armed when the app window is hidden but the
   app is still running.
4. Whether wake capture should target the focused conversation or always route
   through the global master path when multiple panes are visible.
5. What exact false-accept and false-reject bars are acceptable for the first
   dogfood release.

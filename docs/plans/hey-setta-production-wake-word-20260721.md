# Hey Setta Production Wake Word

**Date:** 2026-07-21

**Status:** Plan of record for making "Hey Setta" work in production builds.

## Current State

The first always-listening implementation added the app plumbing:

- Settings UI and persisted always-listening state.
- Main/preload/renderer IPC for listener state and wake transcripts.
- Native helper listener lifecycle commands.
- Microphone ownership between manual click-to-talk, wake capture, and playback.
- In-memory pre-wake buffering and VAD-style endpointing.
- Electron workflow coverage using fake/scripted wake events.

The production gap is specific:

```text
real microphone PCM -> wake-word model inference -> wake score
```

The helper can process listener PCM when a wake score is supplied, but production
does not yet run openWakeWord inference on live microphone audio. Therefore
`./scripts/prod_record_desktop_session.sh --build` should not be expected to
wake on "Hey Setta" yet.

## Decisions

1. Use openWakeWord as the wake-word engine/framework.
2. Use one product wake phrase for the first release: "Hey Setta".
3. Train or generate a Setta-owned "Hey Setta" openWakeWord model.
4. Package the wake model with the desktop app as a local app asset.
5. Do not add a first-run wake-model download flow.
6. Do not use Porcupine, a cloud wake-word API, a user-entered wake-word API key,
   or a generic built-in wake phrase.
7. Run wake inference locally inside the macOS local voice helper boundary.
8. Choose exactly one production runtime, ONNX Runtime or TFLite, after a short
   measured spike.
9. Do not ship dual runtime product paths, fallback engines, compatibility
   shims, migrations, legacy support, transitional adapters, or old-field aliases.
10. Keep normal-mode always-listening audio memory-only. Do not write pre-wake
    audio, false-wake audio, or wake-score history to disk.
11. Allow diagnostics only through an explicit dogfood/debug mode. Diagnostic
    artifacts must be opt-in and must not be enabled by normal app settings.
12. Keep supply-chain checks current for any non-Go, non-TypeScript, native,
    model, Python, runtime, or downloaded artifact surface.

## Product Acceptance

This plan is complete when a normal production recording launch works without
test-only environment variables:

```bash
./scripts/prod_record_desktop_session.sh --build
```

Expected behavior:

- User downloads the existing Whisper transcription model if it is missing.
- User turns on Settings -> Voices -> Always listening.
- Setta verifies the packaged "Hey Setta" wake model and runtime.
- User says "Hey Setta, summarize the current conversation."
- Setta wakes, captures the message, strips the wake phrase, transcribes locally,
  infers the end of the message, and submits through the existing voice input
  path.
- Setta pauses wake detection while speaking or while manual click-to-talk is
  active.

## Phase 1: Runtime Spike

Goal: prove real local wake inference on macOS with live or fixture PCM.

Tasks:

- Build a minimal spike that feeds 16 kHz mono PCM into openWakeWord inference.
- Test ONNX Runtime and TFLite from the native helper boundary or a tightly
  scoped helper-owned adapter.
- Measure startup cost, steady CPU, memory, binary size, packaging complexity,
  and Swift integration complexity.
- Record results in `docs/reports/voice/`.
- Choose one runtime for production.
- Remove the unchosen runtime from production code before merging the production
  implementation.

Exit criteria:

- One runtime is selected with measurements.
- The helper can emit real wake scores from PCM using a local model.
- No test-only scripted wake score path is used for production behavior.

## Phase 2: Model Creation

Goal: create the first Setta-owned "Hey Setta" model.

Tasks:

- Define the model artifact name, format, source process, expected SHA-256, and
  expected byte size.
- Generate or train the first "Hey Setta" openWakeWord model.
- Build a small evaluation set covering intended wakes, near misses, background
  speech, app playback, silence, and common false-trigger phrases.
- Evaluate false accepts, false rejects, wake latency, and first-word clipping.
- Pick the initial threshold from measured results, not from a guess.
- Write the model evaluation report under `docs/reports/voice/`.

Exit criteria:

- A reproducible model artifact exists.
- The report names the artifact, runtime, threshold, dataset shape, results, and
  known risks.
- The model is good enough to dogfood without embarrassing false wakes.

## Phase 3: Production Packaging

Goal: ship the runtime and wake model as app resources.

Tasks:

- Add the wake model to the local macOS voice resource manifest.
- Add runtime binaries/libraries as packaged app resources.
- Verify model/runtime paths resolve in development, built production, and
  packaged app layouts.
- Verify SHA-256 before enabling the always-listening toggle.
- Update build scripts so production builds include the selected runtime and
  wake model.
- Update supply-chain scripts to require pinned identity, source URL, hash, byte
  size, and vulnerability/release-age coverage where applicable.

Exit criteria:

- Production launch does not need `SETTA_LOCAL_MACOS_VOICE_WAKE_MODEL_PATH`,
  `SETTA_LOCAL_MACOS_VOICE_WAKE_MODEL_SHA256`, or
  `SETTA_LOCAL_MACOS_VOICE_WAKE_RUNTIME`.
- Missing or hash-mismatched wake resources keep the feature unavailable with a
  product-level Settings message.
- `./scripts/check_supply_chain.sh` covers the new runtime/model surfaces.

## Phase 4: Live Listener Integration

Goal: connect live microphone audio to wake inference and endpointing.

Tasks:

- Capture live microphone frames for always listening inside the helper.
- Run the selected wake runtime continuously on bounded audio windows.
- Feed measured wake scores into the existing listener audio processor.
- Keep pre-wake audio in memory only.
- Ensure manual capture and playback pause/resume still reclaim the microphone
  deterministically.
- Preserve existing wake transcript submission and routing behavior.

Exit criteria:

- "Hey Setta" wakes the app from a normal production build.
- Manual mic capture cannot race against active wake capture.
- Playback does not self-trigger the listener in normal operation.

## Phase 5: Dogfood Tuning

Goal: tune for product quality, not just technical correctness.

Tasks:

- Record dogfood measurements for false accepts, false rejects, latency,
  first-word clipping, CPU, memory, and battery impact.
- Test quiet rooms, fan noise, music, meetings, and Setta speaking.
- Tune threshold and endpoint timings based on the report.
- Keep diagnostics opt-in and explicitly separate from normal settings.

Exit criteria:

- Wake behavior is reliable enough for daily use.
- CPU/battery impact is acceptable while the app is open.
- Known limitations are documented in the report.

## Phase 6: Required Verification

Run focused checks first, then production workflow checks.

Required checks:

- openWakeWord/runtime unit or integration tests.
- Native local macOS voice helper tests.
- Listener state machine and service tests.
- Renderer wake transcript submission tests.
- Local macOS voice Electron workflow.
- Topic-conversation speech arbitration workflow.
- `./scripts/format.sh`.
- `./check_quality.sh --git-changes`.
- `./scripts/check_supply_chain.sh`.

Final manual check:

```bash
./scripts/prod_record_desktop_session.sh --build
```

The final manual check must use normal production resources, not fake helper
scripts, scripted listener events, or wake-model environment overrides.

## Non-Goals

- Cross-platform wake mode.
- Multiple wake phrases.
- User-trained wake phrases.
- Barge-in while Setta is speaking.
- Waking the Mac while Setta is not running.
- Running wake detection in the cloud.
- Letting users supply a wake-word vendor API key.

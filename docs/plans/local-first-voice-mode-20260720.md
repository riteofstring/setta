# Local-First Voice Mode Plan

Date: 2026-07-20

## Goal

Make voice mode work locally by default before building wake-word activation.

The target sequence is:

1. Create a voice provider boundary.
2. Keep the current OpenAI voice experience working as a first-class cloud provider.
3. Add local macOS click-to-talk with `whisper.cpp` transcription and Apple system TTS.
4. Make local voice the default after measured quality and latency are acceptable.

Wake word, always-listening behavior, semantic endpointing, cross-platform local TTS, and custom neural voice packs are intentionally out of scope for this plan.

## Implementation Status

- Step 1: Implementation complete; ready for phase audit. 2026-07-20 repository batch: added a renderer voice provider boundary, introduced provider-neutral capture and synthesis interfaces, moved browser microphone buffering plus OpenAI Realtime capture setup behind the OpenAI capture provider, and moved existing backend speech synthesis behind the OpenAI output provider. Repository verification completed for this batch: focused renderer speech tests, desktop typecheck, `./check_quality.sh --git-changes`, and the deterministic `global-speech-session` Electron workflow. Release/audit gate: live OpenAI voice workflow remains to run when the app-supported local live-provider setup is available.
- Step 2: Implementation complete; ready for phase audit. 2026-07-20 repository batch: made renderer voice setup availability provider-aware, centralized the OpenAI setup guidance used by shell, pane, and master voice controls, and moved OpenAI Realtime failure copy out of generic capture-failure mapping into an OpenAI provider module. 2026-07-21 repository batch: made OpenAI provider selection explicit on backend speech credential, transcription-session, and synthesis contracts; bumped the generated backend protocol to 66; scoped desktop credential IPC and settings actions to the OpenAI provider; kept generic playback synthesis provider-neutral while adding the OpenAI provider at the output boundary; and updated deterministic/live OpenAI workflow assumptions tied to the provider-scoped contract. Repository verification completed for the 2026-07-21 batch: focused Go speech/httpapi/runtime tests, focused desktop speech IPC/credential/preload/settings/playback tests, desktop typecheck, desktop production build, and the deterministic `global-speech-session` Electron workflow. Release/audit gate: live OpenAI voice workflow remains to run when the app-supported local live-provider setup is available.
- Step 3: Not started.
- Step 4: Not started.

## Non-Negotiables

- Do not add backward compatibility shims, migrations, legacy support paths, transitional adapters, dual-read/write paths, old-field aliases, or compatibility layers.
- OpenAI voice may remain, but only as a supported provider behind the new boundary. It must not remain as a special old path beside the provider system.
- When a call site moves to the provider boundary, delete the old direct call path in the same change.
- If Go-owned speech contracts or values change, update the Go owner and regenerate TypeScript. Do not manually edit generated outputs.
- Do not introduce hardcoded TypeScript mirrors of provider names, model names, endpoint contracts, voice IDs, or generated value sets.
- Do not add renderer-only local voice machinery that is expected to be replaced by a native/utility voice engine later.

## Current Shape

The current click-to-talk path is OpenAI Realtime-oriented:

- Renderer capture controller: `desktop/src/renderer/src/features/global-speech/app-shell-speech-capture-controller.ts`
- Browser microphone buffering: `desktop/src/renderer/src/features/global-speech/buffered-microphone-capture.ts`
- OpenAI Realtime transport: `desktop/src/renderer/src/features/global-speech/realtime-transcription-transport.ts`
- Main-process speech IPC: `desktop/src/main/speech-ipc.ts`
- Shared speech IPC contract: `desktop/src/shared/speech-ipc.ts`
- Go-owned speech contracts and provider values: `internal/speech/types.go`
- Go speech service: `internal/speech/service.go`

The part to preserve is the final Setta product behavior: a completed voice transcript flows into the existing global master or conversation input routing path.

The part to replace is the assumption that voice mode means browser-owned capture plus an OpenAI Realtime transcription session.

## Target Architecture

Use one engine-neutral voice boundary above STT and TTS:

```text
Renderer UI
  -> voice capture/playback controller
  -> typed IPC / provider session boundary
  -> voice provider coordinator
       -> cloud OpenAI provider
       -> local macOS provider
  -> final transcript
  -> existing Setta input routing
```

The renderer should receive state, transcript text, cancellation results, voice catalogs, and playback events. It should not receive raw microphone PCM from the local provider.

For local macOS mode, the native/utility provider owns microphone capture from day one:

```text
Local macOS voice provider
  -> AVAudioEngine microphone capture
  -> deterministic session state
  -> whisper.cpp persistent transcriber
  -> final transcript
  -> AVSpeechSynthesizer TTS helper
  -> PCM or WAV audio response
```

For OpenAI cloud mode, the existing Realtime/WebRTC mechanics can be reused internally, but only after they are moved behind the same provider-facing capture contract.

## Provider Boundary

Create a single product-level boundary that supports voice input and voice output.

Suggested shape:

```ts
type VoiceProviderID = "local_macos" | "openai";

interface VoiceInputProvider {
  readonly id: VoiceProviderID;
  readCapabilities(): Promise<VoiceInputCapabilities>;
  startCapture(request: VoiceCaptureRequest): Promise<VoiceInputSession>;
}

interface VoiceInputSession {
  readonly sessionId: string;
  cancel(): Promise<void>;
  finish(): Promise<void>;
  subscribe(listener: (event: VoiceInputEvent) => void): () => void;
}

interface VoiceOutputProvider {
  readonly id: VoiceProviderID;
  listVoices(): Promise<VoiceCatalog>;
  synthesize(request: VoiceSynthesisRequest): Promise<VoiceAudio>;
  cancel(operationId: string): Promise<void>;
}
```

This is illustrative, not a mandate to add these exact TypeScript names. The important invariant is that provider-specific concepts do not leak into global master, conversation routing, or settings UI.

Provider-specific details that must stay below the boundary:

- OpenAI client secrets, WebRTC SDP, Realtime event names, data channels, and provider credential state.
- `whisper.cpp` model paths, native helper framing, AVAudioEngine buffers, and Apple voice identifiers.
- Local model warm-up, native process restarts, and audio resampling.

Provider-neutral details that may cross the boundary:

- capture state
- partial transcript text, if available
- final transcript text
- cancellation
- maximum recording duration
- maximum transcript characters
- voice catalog entries
- audio media type and bytes

## Step 1: Create The Provider Boundary

Refactor the renderer speech controller so it no longer directly owns OpenAI-specific transport creation.

Required work:

- Introduce provider-neutral capture and synthesis interfaces in the desktop source tree.
- Move OpenAI-specific transport setup out of the global speech capture controller.
- Keep the existing capture states only if they are truly provider-neutral. Rename or reshape any state that only describes OpenAI connection behavior.
- Keep the final transcript submission path unchanged at the product boundary.
- Keep credential handling provider-specific. Do not make local voice depend on OpenAI credential status.
- Update tests that currently assume OpenAI-specific internals to assert provider-neutral behavior instead.

Done means:

- The UI can start, finish, cancel, and display a voice capture without knowing which provider is running.
- OpenAI Realtime details are contained in an OpenAI provider module.
- There is no duplicate old controller path beside the provider controller.

Verification:

- Run the narrow renderer/controller tests that cover global voice capture state.
- Run the deterministic Electron voice workflow through the production Electron/main/preload/renderer/HTTP/store paths.
- Run the existing live OpenAI voice workflow only when ChatGPT/OpenAI speech credentials are available through the approved local setup. Do not use `OPENAI_API_KEY` as proof of live app integration.

## Step 2: Keep OpenAI As A Cloud Provider

Port the existing OpenAI voice path into the new provider system.

This is not legacy compatibility. It is the supported cloud voice provider.

Required work:

- Implement an `openai` provider using the existing backend-created transcription session and Realtime transport.
- Keep OpenAI speech credential storage and validation scoped to the OpenAI provider.
- Keep OpenAI synthesis through the existing backend speech service until the local TTS provider is ready.
- Replace user-visible generic voice setup failures with provider-specific setup guidance.
- Remove OpenAI assumptions from shared speech availability and renderer state labels.
- Rename OpenAI-specific errors in generic code where the message would be wrong for local voice.

Done means:

- Existing click-to-talk behavior still works when OpenAI voice is selected and configured.
- OpenAI credential failures do not make local voice appear unavailable.
- There is one supported OpenAI provider path, not the old path plus a wrapper.

Verification:

- Run the OpenAI-provider unit tests around credential status, transcription session creation, synthesis, redaction, and failure mapping.
- Run the deterministic Electron voice workflow with the OpenAI provider selected.
- Run the live OpenAI E2E workflow if local credentials are available through the app-supported path.

## Step 3: Add Local macOS Click-To-Talk

Add a local macOS provider behind the same boundary.

Use:

- STT: `whisper.cpp`
- TTS: Apple `AVSpeechSynthesizer`
- Capture: native macOS microphone capture, not renderer-owned PCM plumbing
- Scope: click-to-talk only

Required work:

- Add a signed native or utility helper for local macOS voice.
- Keep the helper persistent while local voice is active so the Whisper model stays warm.
- Capture microphone audio with `AVAudioEngine`.
- Convert audio to the exact format accepted by the local transcriber in one place.
- Use deterministic recording limits, cancellation, and empty-transcript rejection.
- Return final transcript text through the provider boundary.
- Use `AVSpeechSynthesizer` for local assistant speech and return a provider-neutral audio response.
- Enumerate only installed system voices. Do not promise voices that require a system download unless the UI handles that exact unavailable state.
- Keep local model files outside ASAR and verify model hashes.
- Add clear provider health states for missing model, helper unavailable, microphone denied, and synthesis unavailable.

Initial model policy:

- Benchmark `base.en` and `small.en` on the minimum supported Mac.
- Choose the default model from measured latency, accuracy, memory, and CPU while Setta is also doing normal assistant work.
- Do not ship a larger optional model until the default model path is stable.

Done means:

- A user can use voice input and voice output on macOS without entering an OpenAI API key.
- Local click-to-talk submits the final transcript into the same Setta routing path as text and OpenAI voice.
- Local playback uses a system voice and can be canceled immediately.
- Local voice failures are product-level states, not raw native/helper errors.

Verification:

- Add deterministic Electron workflow coverage for local voice with a scripted native-helper fixture.
- Cover microphone permission grant, denial, revoked permission, capture cancel, finish, no speech, maximum duration, successful transcript submission, and local TTS cancellation.
- Add native-helper unit or integration tests for session framing, cancellation, bad model path, and malformed helper events.
- Run the production Electron workflow through main/preload/renderer/HTTP/store paths using temporary app data.

## Step 4: Make Local Voice The Default

Flip the product default only after local macOS click-to-talk is measured and stable.

Required gates before the default changes:

- Click-to-final-transcript latency is acceptable on the minimum supported Mac.
- False transcripts from silence/noise are rejected.
- Memory and CPU are acceptable while the app is idle and while a normal assistant response is running.
- Local TTS starts quickly enough for assistant replies.
- Cancellation works for both transcription and synthesis.
- Permission-denied and missing-model states are clear and recoverable.
- The OpenAI cloud provider remains selectable for users who prefer it or need its quality.

Default behavior:

- New installs use local voice by default on supported macOS versions.
- OpenAI voice becomes an optional cloud provider in Settings.
- If local voice is unavailable, Setta should show a concrete local provider state and an explicit provider choice. Do not silently fall back to OpenAI.
- Existing product code should ask for OpenAI credentials only when the user selects OpenAI voice.

No migration policy:

- Do not write migrations for existing voice settings.
- Prefer changing the owner-defined default and validating persisted state against the current contract.
- If a persisted setting is no longer valid under the new contract, fail specifically and guide the user to choose a current provider. Do not dual-read old fields or silently rewrite legacy values.

Done means:

- A fresh macOS install can use voice mode without any OpenAI credential setup.
- Settings presents local voice as the default provider and OpenAI as an optional cloud provider.
- The current voice button uses local voice by default.
- The implementation contains no old direct OpenAI capture path outside the OpenAI provider module.

Verification:

- Run `./scripts/format.sh`.
- Run the narrowest provider and renderer tests first.
- Run the deterministic local voice Electron workflow.
- Run the deterministic OpenAI-provider Electron workflow.
- Run `./check_quality.sh --git-changes`.
- Run live provider tests only when the local signed-in/provider setup required by the repo is available; report any skip explicitly.

## Architecture Decisions To Lock Before Implementation

1. Native helper shape: one macOS voice helper versus separate STT and TTS helpers.
2. Default Whisper model: selected by benchmark, not preference.
3. Local model packaging: bundled first-run model versus verified post-install download.
4. Provider selection storage: Go-owned contract versus desktop-only setting.
5. Whether OpenAI synthesis remains backend-owned permanently or moves into the desktop provider coordinator.

## Explicitly Not In This Plan

- "Hey Setta" wake word.
- Always-listening microphone state.
- VAD endpointing for hands-free message completion.
- Semantic turn completion.
- Cross-platform local microphone capture.
- Windows/Linux local TTS.
- Neural TTS packs such as Kokoro, Piper, Supertonic, Pocket TTS, or sherpa-onnx.
- Voice cloning.
- Browser `speechSynthesis` or Web Speech API as production providers.

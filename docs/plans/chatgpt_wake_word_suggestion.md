# Recommended architecture

For a cross-platform Electron MVP, use:

- **Wake word:** Picovoice Porcupine with a custom “Hey Setta” model.
- **Endpointing:** WebRTC VAD plus a deterministic state machine and silence timers.
- **Transcription:** `whisper.cpp` for a consistent local, cross-platform path.
- **macOS optimization:** optionally replace `whisper.cpp` with Apple `SpeechAnalyzer` on macOS 26 and newer.
- **Semantic completion:** add later as a second-stage check after VAD proposes an endpoint—not as a continuously running general-purpose LLM.
- **Execution:** isolate audio processing in an Electron `utilityProcess` or signed native helper, rather than the UI renderer.

Porcupine has supported Node bindings for macOS Intel and Apple Silicon and supports custom wake-word models. WebRTC VAD is lightweight enough to run continuously, while `whisper.cpp` supports macOS, Windows, and Linux and is optimized for Apple Silicon. Apple’s newer SpeechAnalyzer provides entirely on-device transcription with volatile and finalized results but requires the macOS 26 generation and native Swift integration. ([Picovoice][1])

```text
                    Electron main process
                           │
                    narrow, typed IPC
                           │
             Voice-engine utility/native process
                           │
                 One microphone stream owner
                           │
          resample once → 16 kHz mono PCM16 frames
                           │
             ┌─────────────┼─────────────┐
             │             │             │
       RAM ring buffer  Wake detector    VAD
        0.75–1 second    Porcupine      WebRTC
             │             │             │
             └──────── wake detected ────┘
                           │
                 Post-wake utterance buffer
                           │
             SpeechAnalyzer or whisper.cpp
                           │
                VAD candidate endpoint
                           │
          optional semantic/audio turn detector
                           │
                    final transcript
                           │
             agent/command execution layer
```

Only the wake detector and inexpensive VAD need to run while the app is armed. The larger transcription model should activate after the wake event. Before wake, audio should stay in a small in-memory circular buffer and should not be written to disk or sent over the network.

## State machine

Use an explicit state machine rather than trying to infer everything from ASR callbacks:

```text
DISABLED
   ↓ user enables setting
ARMED
   ↓ "Hey Setta"
WAKE_DETECTED
   ↓
WAITING_FOR_MESSAGE_SPEECH
   ↓ speech begins
CAPTURING
   ↓ sufficient trailing silence
CANDIDATE_END
   ├─ incomplete → CAPTURING
   └─ complete   → FINALIZING
                         ↓
                    PROCESSING
                         ↓
                      ARMED
```

Add separate `ASSISTANT_SPEAKING`, `PAUSED`, and `ERROR` states. For the MVP, use **half-duplex behavior**: suspend wake detection or reject detections while Setta is speaking. Barge-in and full duplex should come later because playback echo can trigger the wake detector, VAD, and transcription.

### Starting endpoint parameters

These are initial tuning values, not universal constants:

| Parameter                          |                              Starting value |
| ---------------------------------- | ------------------------------------------: |
| Audio format                       |                  16 kHz, mono, signed PCM16 |
| VAD frame size                     |                                       20 ms |
| Wake/audio ring buffer             |                                750–1,000 ms |
| Audio copied before wake timestamp |                                  300–500 ms |
| Speech-start debounce              | About 120–200 ms voiced in a rolling window |
| No-message timeout after wake      |                                   4 seconds |
| Candidate endpoint                 |                800–1,000 ms mostly unvoiced |
| Maximum semantic extension         |               2.0–2.5 seconds total silence |
| Trailing audio padding             |                                  300–500 ms |
| Maximum utterance                  |                               30–45 seconds |
| Re-arm cooldown                    |                                  200–500 ms |

The important pattern is **hysteresis**: require sustained voice before entering speech and sustained non-voice before leaving it. The reference `py-webrtcvad` collector uses a ring buffer, separate trigger/detrigger conditions, and front/back padding; its exact 90% thresholds are less important than the state-machine pattern. ([GitHub][2])

On wake, immediately copy part of the ring buffer into the utterance. This avoids clipping the first word when someone says, “Hey Setta, create a reminder” with almost no pause. The transcript may consequently contain part of the wake phrase; remove a leading “hey setta” or “setta” deterministically before processing.

---

# Wake-word options

| Option                  | Advantages                                                                                                                                                                                            | Disadvantages                                                                                                                                                                                                                                                                                                                                                          | Assessment                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Picovoice Porcupine** | Purpose-built always-listening keyword detector; local inference; custom wake phrase; supported Node binding for macOS x64/arm64, Windows, and Linux; tunable sensitivity; official microphone demos. | Requires a Picovoice account and AccessKey; commercial terms need review; adds native binaries and packaging considerations; sensitivity must be tuned on real Setta recordings.                                                                                                                                                                                       | **Best MVP choice.** Lowest integration risk for a custom Electron wake phrase. ([GitHub][3])                                                                |
| **openWakeWord**        | Apache-licensed code; ONNX/TFLite architecture; customizable training; accepts 16 kHz PCM; optional Silero VAD gate and speaker-specific verification; good control over model behavior.              | Primarily a Python library; no official complete JavaScript or C++ implementation; the browser example sends audio to a Python backend; production-quality custom training needs positive and large negative datasets. Bundled pretrained models are CC BY-NC-SA, which is problematic for commercial products. The latest tagged release shown is from February 2024. | **Good open-source/R&D path**, but substantially more engineering and model ownership than Porcupine. ([GitHub][4])                                          |
| **Web Speech API**      | Very small browser prototype; Chrome added on-device recognition and downloadable language resources in Chrome 139.                                                                                   | It is speech recognition, not a purpose-built custom wake-word engine. The specification allows client- or server-side implementations. Electron has had confirmed speech-recognition failures, including macOS and newer “network error” reports, even where the same code worked in Chrome. Chromium features are not automatically reliable Electron product APIs.  | **Do not use as the production wake or ASR dependency.** Keep only as an optional experimental prototype behind feature detection. ([webaudio.github.io][5]) |

## Porcupine-specific recommendation

Generate a custom model for **“Hey Setta”**, then expose sensitivity as an internal or remote-config value rather than hard-coding it permanently. Evaluate at least several values against:

- Different accents, speaking rates, distances, and microphone types.
- “Setta,” “hey setter,” “hey Siri,” and similar near-miss phrases.
- Podcasts, television, meetings, music, and the app’s own synthesized speech.
- Fans, keyboard noise, kitchen noise, and laptop speakers.

Measure both **false accepts per listening hour** and **false rejects on intended wake phrases**. Overall wake accuracy measured on generic benchmark audio will not tell you how “Hey Setta” behaves in the environments where the app is actually used.

## openWakeWord-specific recommendation

Use it when avoiding a vendor credential is more important than time-to-market and you are prepared to own:

- Synthetic and real positive examples.
- A large representative negative corpus.
- ONNX integration or a Python sidecar.
- Threshold and verifier tuning.
- Model licensing and provenance.

Its documentation explicitly recommends realistic evaluation for false rejects and hours of representative speech/noise for false accepts. ([GitHub][4])

---

# VAD and endpointing options

## WebRTC VAD

WebRTC VAD returns a binary active/non-active decision for short frames. The current C interface supports aggressiveness levels 0 through 3, 8/16/32 kHz audio, and 10/20/30 ms frames. Higher aggressiveness produces fewer speech classifications but increases missed speech. ([WebRTC][6])

**Advantages**

- Very small and inexpensive.
- Mature C implementation.
- Easy to use in real time.
- Good starting point for 20 ms PCM frames.
- Deterministic behavior and no model download.

**Disadvantages**

- It does not determine that a thought or sentence is complete.
- It cannot distinguish a thinking pause from the end of a request.
- Binary frame outputs require your own ring buffer, hysteresis, padding, timeouts, and maximum-duration logic.
- More aggressive modes can cut quiet or distant speakers.

Start around mode 1 or 2 and test rather than defaulting to mode 3.

The `serenadeai/webrtcvad` repository shows a direct Node/Electron binding and mentions `electron-rebuild`, but it has very little repository activity and no published releases. It is useful as an integration reference, not necessarily as the production dependency. A small maintained N-API wrapper or integration in the native voice helper is safer. ([GitHub][7])

## Silero VAD

Silero VAD is a small neural VAD available through PyTorch and ONNX. Its repository describes an approximately 2 MB model, 8/16 kHz support, permissive MIT licensing, and sub-millisecond processing claims for typical chunks on a CPU thread. It also includes C++, browser, and ONNX examples. ([GitHub][8])

**Advantages**

- Usually a better candidate for difficult noise, distant speech, and varied microphones.
- Produces probabilities rather than only a binary answer.
- Small enough to run continuously.
- Can be shared with `whisper.cpp`, which now has Silero-based VAD integration and options for minimum speech, minimum silence, padding, and maximum speech duration. ([GitHub][9])

**Disadvantages**

- Requires ONNX Runtime or another model runtime.
- Still needs endpointing post-processing.
- More moving parts than WebRTC VAD.
- Thresholds need environment-specific tuning.

**Recommendation:** start with WebRTC VAD. Add Silero as an alternative if internal recordings show poor endpointing in noise. Do not begin by running both and voting between them; that makes debugging and tuning harder.

---

# Transcription options

| Option                                       | Advantages                                                                                                                                                                           | Disadvantages                                                                                                                                                                                                                                      | Recommendation                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple SpeechAnalyzer / SpeechTranscriber** | Entirely on-device transcription; system-managed downloadable assets; real-time volatile results followed by finalized results; designed for live, long-form, and distant audio.     | macOS 26+; Apple-only; requires a Swift/Objective-C++ bridge or helper; model assets may need downloading and only a limited number of language assets can be allocated at once.                                                                   | **Best macOS-specific ASR** when macOS 26 is your minimum deployment target. ([Apple Developer][10])                                               |
| **Legacy SFSpeechRecognizer**                | Built into older macOS releases; can provide partial results; setting `requiresOnDeviceRecognition` prevents network use when on-device recognition is supported.                    | On-device availability is locale/device dependent and must be checked with `supportsOnDeviceRecognition`; Apple notes that forced on-device requests may be less accurate; native integration and speech authorization remain necessary.           | **Compatibility fallback only.** Never silently fall back to server recognition when the UI promises local processing. ([Apple Developer][11])     |
| **whisper.cpp**                              | Fully local; cross-platform; C API; Apple Silicon acceleration through NEON, Accelerate, Metal, and optional Core ML; CPU-only support; quantization; integrated VAD; many examples. | Model footprint and memory use; sustained ASR consumes more CPU and power than a keyword detector; rolling “live” transcription needs careful implementation; the repository’s stream example is explicitly naïve and reruns inference on windows. | **Best cross-platform local ASR choice.** Buffer-and-transcribe at endpoint for the first MVP, then add partial streaming if needed. ([GitHub][9]) |
| **Web Speech API**                           | Minimal code and current Chrome versions may support on-device language packs.                                                                                                       | Backend and availability depend on the embedding browser; Electron reliability problems; no control over model lifecycle comparable to Apple or whisper.cpp; not a custom KWS system.                                                              | **Prototype only.** ([Chrome for Developers][12])                                                                                                  |

### Choosing a Whisper model

The current `whisper.cpp` documentation lists approximate model footprints ranging from a 75 MiB tiny model using about 273 MB of memory, through a 142 MiB base model using about 388 MB, to much larger small/medium/large variants. ([GitHub][9])

For short English assistant requests:

1. Benchmark `base.en` first.
2. Compare it with `small.en` on your lowest-supported Mac and Windows hardware.
3. Select based on measured endpoint-to-final-transcript latency and error rate.
4. Consider a quantized build only after establishing an unquantized accuracy baseline.

For the simplest MVP, capture audio after wake and run one batch transcription after endpointing. This avoids unstable partial text and repeated inference. Apple SpeechAnalyzer naturally supports streaming partials; `whisper.cpp` can support them, but that should be a separate feature rather than a prerequisite for wake mode.

---

# Should an LLM decide whether the user is finished?

**Semantic turn checks are increasingly common, but a general chat LLM call after every pause is not the dominant best practice.** Current voice-agent systems typically combine:

1. VAD to detect a candidate silence.
2. A dedicated semantic or audio turn model to judge whether the utterance sounds complete.
3. Hard minimum and maximum silence limits.
4. A hard maximum utterance length.

OpenAI’s Realtime API distinguishes silence-based `server_vad` from `semantic_vad`, which ends a turn when the model believes the user has completed the utterance. LiveKit describes VAD plus heuristics as the base and recommends a turn detector that adds meaning and acoustic properties for many agents. Pipecat’s Smart Turn is a small audio-native model intended to run after VAD detects silence, rather than continuously. ([OpenAI Platform][13])

## Recommended semantic policy

The semantic detector should generally be allowed to **delay** an endpoint, but not to end a turn while VAD still reports active speech:

```text
VAD says speech is active
    → always continue recording

VAD reports ~850 ms trailing silence
    → create candidate endpoint

Turn model says complete
    → finalize

Turn model says incomplete
    → continue listening, but only until the hard silence limit

Silence reaches ~2.2 seconds
    → finalize regardless of semantic result
```

This bounds latency and protects against a semantic detector repeatedly deciding that an utterance is incomplete.

For the first MVP, use VAD-only endpointing and collect:

- How often users are cut off.
- How long the app waits after clearly complete requests.
- How often users resume after 800 ms, 1.2 seconds, or 1.8 seconds.
- Which phrases commonly contain mid-thought pauses.

Add semantic checking only when those measurements show that fixed silence is materially hurting the experience. When added, prefer a small local turn detector such as Smart Turn or another dedicated classifier. A cloud general-purpose LLM introduces additional latency, cost, nondeterminism, and transcript disclosure; it should be a fallback, not the fundamental endpoint mechanism.

---

# Electron/macOS implementation pattern

## Process isolation

Electron explicitly recommends utility processes for CPU-intensive or crash-prone components. A utility process is a Node environment with MessagePort support, so it can host Porcupine bindings, VAD wrappers, model control, and IPC without blocking the main process or renderer. ([Electron][14])

Because a utility process has no browser DOM, microphone capture there requires a native recorder/addon or a separate native helper. There are two viable approaches:

### Cross-platform MVP

```text
Electron utilityProcess
├── native microphone recorder
├── @picovoice/porcupine-node
├── WebRTC VAD native addon
├── utterance state machine
└── whisper.cpp child executable or local library binding
```

This minimizes platform-specific application code, although native modules must be rebuilt for Electron’s ABI and packaged for each architecture. Electron documents `@electron/rebuild`, and Electron Forge can perform this automatically during development and packaging. ([Electron][15])

### macOS-native version

```text
Signed Swift helper
├── AVAudioEngine microphone capture
├── Porcupine C/Swift SDK
├── WebRTC or Silero VAD
├── SpeechAnalyzer / SpeechTranscriber
└── JSON or protobuf events over stdin/socket
```

Electron’s official native-code documentation shows using Objective-C++ as a bridge between Swift and Electron. A standalone helper executable can be even easier to isolate and restart than an in-process native addon, provided it is code-signed and notarized as part of the application bundle. ([Electron][16])

## IPC surface

Expose a narrow API rather than arbitrary audio access:

```text
Commands:
  voice.enable
  voice.disable
  voice.pause
  voice.cancelUtterance
  voice.setInputDevice
  voice.setWakeSensitivity

Events:
  voice.stateChanged
  voice.wakeDetected
  voice.speechStarted
  voice.partialTranscript
  voice.finalTranscript
  voice.noSpeechTimeout
  voice.error
```

The renderer normally should not receive raw PCM. It needs state, levels suitable for a meter, and transcript events. Keeping audio out of the renderer reduces the impact of renderer compromise and accidental logging.

A hidden renderer using `getUserMedia` and an `AudioWorklet` is acceptable for a proof of concept, but it is less robust: renderer reloads, lifecycle behavior, permission handling, and transferring PCM into native models all become product concerns. Do not let the primary UI renderer be the only owner of the always-on microphone.

---

# Reference implementations

1. **`Picovoice/porcupine` and its Node microphone demo**
   Shows custom keywords, frame-based processing, supported desktop platforms, sensitivity settings, and the official Node package. ([GitHub][3])

2. **`dscripka/openWakeWord`**
   Useful for the ONNX model pipeline, 16 kHz framing, Silero gating, threshold tuning, custom-model notebooks, user-specific verifiers, and realistic false-accept testing. Its `examples/web` implementation streams browser audio to Python rather than providing a complete JavaScript implementation. ([GitHub][4])

3. **`wiseman/py-webrtcvad/example.py`**
   One of the clearest compact references for converting per-frame VAD results into padded utterance segments using a ring buffer and trigger/detrigger thresholds. ([GitHub][2])

4. **`serenadeai/webrtcvad`**
   Illustrates a Node native binding and Electron rebuild requirements. Use it as reference code and evaluate maintenance before adopting it directly. ([GitHub][7])

5. **`snakers4/silero-vad`**
   Includes ONNX, C++, browser, Rust, and other integration examples and is a useful second VAD candidate for noisy environments. ([GitHub][8])

6. **`ggml-org/whisper.cpp`**
   Relevant examples include `whisper-stream`, `whisper-command`, `whisper-server`, the SwiftUI macOS/iOS application, and the integrated Silero VAD options. The stream sample is explicitly described as naïve, so it should be a learning reference rather than the final streaming architecture. ([GitHub][9])

7. **Apple WWDC25 SpeechAnalyzer session and sample**
   Demonstrates asset checks and downloads, `AVAudioEngine`, streaming buffers, volatile results, finalized results, and entirely on-device transcription. ([Apple Developer][17])

8. **`pipecat-ai/smart-turn`**
   A reference for a small, local, audio-native completion detector that runs after a VAD silence. The repository provides CPU and GPU variants and a microphone/VAD demonstration. ([GitHub][18])

9. **LiveKit turn-detection documentation**
   Useful for the broader architecture of VAD, semantic/acoustic completion, interruption handling, and hard timing controls. ([LiveKit Docs][19])

---

# Privacy and permission UX

## User-facing setting

Do not label the toggle only “Always Listening.” A clearer treatment is:

> **Listen locally for “Hey Setta”**
> When enabled, Setta keeps the microphone active and processes audio locally only to detect the wake phrase. Audio before the wake phrase is not saved or sent from your computer. After activation, your request is transcribed [on this Mac / by the named service].

Keep it **off by default**. Ask for OS microphone access only after the user explicitly enables it, not during first launch.

Display separate persistent states:

| State                            | Suggested UI                          |
| -------------------------------- | ------------------------------------- |
| Off                              | “Wake phrase off”                     |
| Armed                            | “Listening locally for ‘Hey Setta’”   |
| Wake detected                    | Visible activation animation          |
| Capturing request                | “Listening…” with stop/cancel control |
| Cloud transfer, where applicable | “Sending request for transcription…”  |
| Assistant speaking               | “Speaking — wake detection paused”    |
| Error or permission revoked      | Clear degraded-state indicator        |

macOS shows an orange privacy indicator while the microphone is in use. Because that dot remains present during local wake listening as well as active request recording, the app should provide its own more precise state indicator. ([Apple Support][20])

## macOS permissions

Set `NSMicrophoneUsageDescription` in the application’s `Info.plist`. Electron exposes `getMediaAccessStatus` and `askForMediaAccess`; after denial, the user must change access in System Settings, and an application restart may be required. A sandboxed distribution also needs the audio-input entitlement. ([Electron][21])

When using legacy Apple Speech recognition, also implement the Speech framework’s authorization path and required purpose description. Apple documents that `requiresOnDeviceRecognition` keeps recognition audio on-device when the selected recognizer supports it. ([Apple Developer][22])

For any renderer-based microphone access, implement both Electron’s permission request and permission check handlers and validate the requesting origin and media type. Do not grant broad media access to remote or cross-origin content. ([Electron][23])

Apple’s App Review Guidelines require explicit consent and a clear visual or audible indication when an app records or otherwise captures microphone input. The Web Speech specification independently describes the same informed-consent, visible-indicator, and stop-control pattern. ([Apple Developer][24])

## Data handling

Use the following defaults:

- Keep pre-wake audio only in a fixed-size RAM ring buffer.
- Do not write raw microphone audio to disk.
- Zero or release utterance buffers after processing.
- Do not include PCM or transcripts in logs, crash reports, or analytics.
- Keep wake-detection telemetry limited to counters and timing data.
- Clearly identify whether post-wake audio, transcript text, or both leave the machine.
- Encrypt any retained transcript history and provide deletion controls.
- Never treat the wake phrase as identity verification.
- Require explicit confirmation for purchases, deletion, sending messages, security settings, or other high-impact actions.

Electron renderers should remain sandboxed with context isolation enabled, and the preload bridge should expose only the specific voice operations required by the UI. ([Electron][25])

Porcupine requires an AccessKey and tells developers to keep it secret. A credential embedded in a desktop binary cannot be made unrecoverable, so treat it as a revocable client credential, never reuse a backend secret, and review Picovoice’s production licensing and key-management expectations before launch. ([Picovoice][1])

---

# MVP plan

## Phase 1: deterministic audio harness

Before connecting the live microphone, create a file-replay harness that feeds identical PCM frames through wake detection, VAD, and transcription.

Collect consented internal recordings covering:

- Intended “Hey Setta” activations.
- Near-miss phrases.
- Immediate speech after the wake phrase.
- Long thinking pauses.
- Quiet, distant, and accented speech.
- Music, podcasts, television, meetings, fans, and keyboard noise.

Track:

- False wakes per listening hour.
- Wake-phrase false-reject rate.
- Wake-to-capture latency.
- Percentage of wakes followed by no message.
- Premature endpoint rate.
- Endpoint delay after genuinely complete speech.
- Transcription latency and real-time factor.
- Idle and active CPU, memory, and battery usage.

## Phase 2: local half-duplex alpha

Implement:

1. One voice-engine process owning the microphone.
2. Porcupine custom “Hey Setta” model.
3. WebRTC VAD with fixed timers.
4. In-memory pre-roll.
5. `whisper.cpp` batch transcription at endpoint.
6. Visible armed/capturing/processing states.
7. Immediate pause and cancel controls.
8. No raw-audio persistence.
9. Wake detection suspended during application TTS.

Do not include semantic endpointing or full duplex yet.

## Phase 3: reliability and tuning

Add:

- Input-device selection and hot switching.
- Recovery after sleep/wake.
- Recovery when headphones or USB microphones disconnect.
- Helper-process watchdog and restart.
- No-speech timeout.
- Maximum utterance duration.
- Rejection of empty or implausibly short speech segments.
- Per-install or remote-configurable wake and endpoint thresholds.
- User feedback actions such as “Setta cut me off” and “Setta waited too long.”

Test universal macOS packaging, Apple Silicon and Intel binaries where supported, code signing, notarization, and Electron upgrades that require native module rebuilding.

## Phase 4: semantic completion

After collecting endpoint metrics:

- Evaluate Silero VAD against WebRTC VAD on the same replay corpus.
- Add a local Smart Turn-style detector only at VAD candidate endpoints.
- Let semantics extend the pause but cap total silence.
- Compare completion latency, interruption rate, CPU use, and model footprint.
- Add streaming partial transcripts only when they have a clear product use, such as visible dictation or semantic endpointing.

---

# Major failure modes

| Failure                                   | Likely cause                                                   | Mitigation                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| False activation from TV or podcast       | Wake phrase or acoustic near-match in media                    | Tune sensitivity; test hours of representative media; optionally require simultaneous VAD speech; add a second-stage wake verifier only if necessary. |
| User says wake phrase but nothing happens | Accent, distance, noise, sensitivity too low                   | Test diverse speakers and microphones; expose diagnostics and sensitivity; retrain or regenerate the custom model.                                    |
| First request word is clipped             | Capture begins only after wake callback                        | Keep a short RAM ring buffer and include pre-roll.                                                                                                    |
| Wake phrase appears in command transcript | Pre-roll contains the end of “Hey Setta”                       | Strip only a leading normalized wake phrase, not arbitrary occurrences later in the message.                                                          |
| App cuts the user off mid-thought         | Fixed silence threshold is too short                           | Increase hangover; use separate candidate and hard endpoints; later add semantic completion.                                                          |
| App waits indefinitely                    | Continuous background noise or VAD false positives             | Mostly-unvoiced window rather than perfect silence; maximum silence and utterance timers.                                                             |
| App wakes from its own voice              | TTS enters microphone                                          | Half-duplex MVP; disable wake during playback; add acoustic echo cancellation before supporting barge-in.                                             |
| Background speaker issues a command       | Wake phrase is not speaker authentication                      | Require confirmation for sensitive actions; optionally investigate speaker verification, with clear privacy disclosure.                               |
| Whisper emits text from noise or silence  | Low-speech or ambiguous input                                  | Require minimum voiced duration; reject empty/low-quality segments; do not process transcripts when VAD found almost no speech.                       |
| High battery usage while idle             | ASR continuously running                                       | Run only wake word and VAD while armed; load or activate the larger ASR model after wake.                                                             |
| Native module fails after Electron update | Electron ABI changed                                           | Automate `@electron/rebuild`, test each supported architecture, or isolate models in a standalone executable. ([Electron][15])                        |
| Permission revoked while running          | User changed macOS privacy settings                            | Observe device/capture errors, transition to an explicit error state, and direct the user to System Settings.                                         |
| Model asset unavailable                   | Apple/Web Speech language pack missing or Whisper model absent | Preflight model availability, show download progress, verify checksums, and provide a retry path.                                                     |
| Helper crashes silently                   | Native model/addon failure                                     | Main-process watchdog, bounded restart policy, and a visible “wake mode unavailable” state.                                                           |
| False action after false wake             | Wake event directly triggers a command                         | Never execute from wake alone; require a nonempty post-wake utterance and confirmation for high-impact operations.                                    |

# Final stack decision

### Best practical cross-platform MVP

```text
Native microphone capture
+ Porcupine custom "Hey Setta"
+ WebRTC VAD
+ deterministic silence endpointing
+ whisper.cpp
+ Electron utilityProcess
+ half-duplex assistant playback
```

### Best macOS-focused implementation with a macOS 26 minimum

```text
Swift voice helper using AVAudioEngine
+ Porcupine
+ WebRTC VAD
+ SpeechAnalyzer / SpeechTranscriber
+ Electron IPC
```

### Best open-source-first implementation

```text
openWakeWord custom model
+ Silero VAD
+ whisper.cpp
+ Python or native ONNX helper
```

That option avoids the Porcupine vendor dependency but carries the greatest training, licensing, integration, and long-term model-maintenance burden.

The recommended product sequence is therefore: **Porcupine, WebRTC VAD, whisper.cpp, half-duplex, no semantic model in v1**. Add SpeechAnalyzer as a macOS adapter and add semantic turn detection only after measured VAD failures justify the additional complexity.

[1]: https://picovoice.ai/docs/quick-start/porcupine-nodejs/ "https://picovoice.ai/docs/quick-start/porcupine-nodejs/"
[2]: https://github.com/wiseman/py-webrtcvad/blob/master/example.py "https://github.com/wiseman/py-webrtcvad/blob/master/example.py"
[3]: https://github.com/Picovoice/porcupine "https://github.com/Picovoice/porcupine"
[4]: https://github.com/dscripka/openWakeWord "https://github.com/dscripka/openWakeWord"
[5]: https://webaudio.github.io/web-speech-api/ "https://webaudio.github.io/web-speech-api/"
[6]: https://webrtc.googlesource.com/src/%2B/refs/heads/main/common_audio/vad/include/webrtc_vad.h "https://webrtc.googlesource.com/src/%2B/refs/heads/main/common_audio/vad/include/webrtc_vad.h"
[7]: https://github.com/serenadeai/webrtcvad "https://github.com/serenadeai/webrtcvad"
[8]: https://github.com/snakers4/silero-vad "https://github.com/snakers4/silero-vad"
[9]: https://github.com/ggml-org/whisper.cpp "https://github.com/ggml-org/whisper.cpp"
[10]: https://developer.apple.com/documentation/Speech/bringing-advanced-speech-to-text-capabilities-to-your-app "https://developer.apple.com/documentation/Speech/bringing-advanced-speech-to-text-capabilities-to-your-app"
[11]: https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition "https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition"
[12]: https://developer.chrome.com/blog/new-in-chrome-139 "New in Chrome 139  |  Blog  |  Chrome for Developers"
[13]: https://platform.openai.com/docs/guides/realtime-vad "https://platform.openai.com/docs/guides/realtime-vad"
[14]: https://electronjs.org/docs/latest/api/utility-process "https://electronjs.org/docs/latest/api/utility-process"
[15]: https://electronjs.org/docs/latest/tutorial/using-native-node-modules "Native Node Modules | Electron"
[16]: https://electronjs.org/docs/latest/tutorial/native-code-and-electron-swift-macos "https://electronjs.org/docs/latest/tutorial/native-code-and-electron-swift-macos"
[17]: https://developer.apple.com/videos/play/wwdc2025/277/ "https://developer.apple.com/videos/play/wwdc2025/277/"
[18]: https://github.com/pipecat-ai/smart-turn "https://github.com/pipecat-ai/smart-turn"
[19]: https://docs.livekit.io/agents/logic/turns/ "https://docs.livekit.io/agents/logic/turns/"
[20]: https://support.apple.com/guide/mac-help/quickly-change-settings-mchl50f94f8f/mac "Use Control Center on Mac - Apple Support"
[21]: https://electronjs.org/docs/latest/api/system-preferences "https://electronjs.org/docs/latest/api/system-preferences"
[22]: https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition "https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition"
[23]: https://electronjs.org/docs/latest/api/session "https://electronjs.org/docs/latest/api/session"
[24]: https://developer.apple.com/app-store/review/guidelines/ "https://developer.apple.com/app-store/review/guidelines/"
[25]: https://electronjs.org/docs/latest/tutorial/security "https://electronjs.org/docs/latest/tutorial/security"

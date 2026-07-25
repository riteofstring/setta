## Recommendation

There is no exact one-to-one TTS counterpart to `whisper.cpp`, because local TTS normally consists of three separable pieces: a **text frontend/phonemizer**, a **voice model**, and an **inference runtime**.

The closest answers are:

- **Closest in spirit: Piper.** It is a compact native, CPU-oriented TTS engine with CLI and C/C++ APIs and small ONNX voice files. However, the actively maintained Piper project is now GPL-3.0 and embeds eSpeak-NG; the older MIT repository is archived and points to the GPL project. That makes current Piper less straightforward for a closed-source commercial Electron app. ([GitHub][1])
- **Closest as a reusable product runtime: sherpa-onnx.** It provides C/C++, Swift, and an official multithreaded Node addon and can run Piper/VITS, Kokoro, Supertonic, Pocket TTS, KittenTTS, MatchaTTS, and other models. The caveat is that the current 1.x line still contains an eSpeak-NG dependency that its maintainers describe as incompatible with the project’s Apache-2.0 license; they plan to remove it in a breaking 2.0 release. As of July 20, 2026, the latest release is still 1.13.4. ([GitHub][2])
- **Best macOS-first MVP: Apple `AVSpeechSynthesizer`.**
- **Best bundled cross-platform neural default for an English-first product: Kokoro q8.**
- **Best stronger multilingual candidate: Supertonic 3.**
- **Best compact streaming and voice-cloning candidate: Pocket TTS.**
- **Not recommended as the commercial default: XTTS-v2**, primarily because its model and outputs are restricted to noncommercial use.

## Practical comparison

Quality descriptions below are engineering judgments rather than controlled, apples-to-apples benchmark results. Voice selection, text normalization, hardware, chunk size, and quantization can materially change perceived quality.

| Option                  | Quality and latency                                                                                                                                                                                                                                                                                              | Model size and packaging                                                                                                                                                                        | Electron/native integration                                                                                                                                                                                                                                                                                       | Licensing and commercial suitability                                                                                                                                                                                                                                                                                                                                                                                                              | Best role                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Apple system voices** | Quality varies by installed voice, but the better macOS voices are generally suitable for a desktop assistant. Very low startup overhead because the OS manages the synthesizer and model. Offline after the selected voice is installed.                                                                        | No model in the app bundle. Additional voices may require a user-initiated download and are unavailable until that finishes.                                                                    | A small Swift or Objective-C helper can enumerate voices and use `AVSpeechSynthesizer.write(_:toBufferCallback:)` to return PCM buffers. This is more controllable than relying on browser `speechSynthesis`.                                                                                                     | Lowest third-party model-license and redistribution burden because you do not ship the voice assets. Do not expose Apple Personal Voice as a general commercial voice feature: Apple explicitly limits Personal Voice to personal, noncommercial use. ([Apple Developer][3])                                                                                                                                                                      | **Best macOS MVP.**                                                                                 |
| **Piper**               | Very fast CPU synthesis and predictable resource use. Quality varies substantially by voice; generally clear and functional, but often less natural or expressive than Kokoro, Supertonic, or larger cloning models.                                                                                             | Small per-voice ONNX packages. One low-quality English voice is about 63 MB; the repository contains voices for 35 languages.                                                                   | Native executable, Python, and C/C++ APIs. For Electron, use a persistent sidecar or write an N-API wrapper. There is no equally polished first-party Node experience.                                                                                                                                            | The active project is GPL-3.0 and embeds eSpeak-NG. Commercial use is possible, but distribution of a closed-source combined product may incur GPL obligations. The archived repository is MIT, but its dependencies and individual voice terms still require auditing. Voice dataset licenses can differ by model card. ([GitHub][1])                                                                                                            | **Closest analogue to `whisper.cpp`; excellent when GPL compatibility is acceptable.**              |
| **sherpa-onnx**         | Not itself a voice-quality choice: latency and quality depend on the selected model. Its benefit is one optimized native runtime for many speech models.                                                                                                                                                         | Runtime libraries plus whichever models, lexicons, voice embeddings, and frontends you ship. Packaging is moderate rather than minimal.                                                         | Official multithreaded Node addon, C API, C++, Swift, Java, and other bindings. Its Node examples cover Kokoro, Supertonic, Piper, KittenTTS, Pocket TTS, Matcha, and others. The macOS examples currently require native-library-path configuration, so expect rpath, signing, and packaging work. ([GitHub][2]) | Top-level code is Apache-2.0, but maintainers have opened an issue to remove the currently embedded GPL eSpeak-NG/piper-phonemize path in 2.0. Do not assume the current binary distribution is clean merely because the repository license says Apache-2.0. ([GitHub][4])                                                                                                                                                                        | **Best prospective cross-platform runtime abstraction, after resolving the current license issue.** |
| **Kokoro 82M**          | One of the strongest quality-per-byte options. Natural enough for assistant responses and narration, with good CPU latency once warm. Most deployments should synthesize sentence or clause chunks rather than expect sophisticated autoregressive streaming.                                                    | 82 million parameters. Available ONNX variants include approximately 92.4 MB q8, 163 MB fp16, and 326 MB fp32. Kokoro v1.0 lists eight languages and 54 voices. ([Hugging Face][5])             | Direct JavaScript integration is available through Transformers.js or `kokoro-js`; sherpa-onnx is another native path. This makes it unusually convenient for an Electron proof of concept without shipping Python. ([Hugging Face][5])                                                                           | Model weights are Apache-2.0. The phonemization layer needs scrutiny: common multilingual paths use eSpeak, but Misaki’s English frontend can run with `fallback=None`, without eSpeak. A wrapper such as HeadTTS is also an English-only Kokoro integration that explicitly avoids eSpeak and exposes PCM, timestamps, Node server, WebGPU, and WASM paths. Audit the exact npm artifact rather than just the model license. ([Hugging Face][6]) | **Best cross-platform English neural MVP.**                                                         |
| **Supertonic 3**        | Strong multilingual reading quality, good text robustness, low-latency local inference, ten preset voices, and expression tags. It outputs 44.1 kHz audio and supports 31 languages. ([GitHub][7])                                                                                                               | 99 million parameters, but the distributed package is about 400 MB. Larger than Kokoro q8 or Piper, still dramatically smaller than XTTS. ([GitHub][8])                                         | Particularly strong integration story: official Node.js, C++, Swift, Rust, Java, browser, and other ONNX examples. It also has a local OpenAI-compatible HTTP server explicitly intended for integrations including Electron, and sherpa-onnx supports an int8 version. ([GitHub][7])                             | Sample code is MIT; the model is OpenRAIL-M. That can support commercial products, but it is a use-restricted model license and should receive explicit legal/product review rather than being treated as equivalent to Apache-2.0. ([GitHub][7])                                                                                                                                                                                                 | **Best current multilingual ONNX candidate when a roughly 400 MB pack is acceptable.**              |
| **Pocket TTS**          | Its strongest differentiator is real audio streaming and voice cloning in a compact CPU model. The project reports about 200 ms to first audio and about 6× real time on a MacBook Air M4 using two CPU cores. Current support includes English, French, German, Portuguese, Italian, and Spanish. ([GitHub][9]) | 100 million parameters. The model is compact, but the official runtime requires PyTorch 2.5+, so the complete packaged environment is substantially larger and more complex than the raw model. | Official path is Python API, CLI, or persistent local server. There are community ONNX, Candle/WASM, and MLX paths, while sherpa-onnx provides Node examples for an int8 Pocket TTS export. ([Hugging Face][10])                                                                                                  | Code is MIT. Model weights are CC-BY-4.0 but gated by additional prohibited-use conditions. Each supplied voice can have separate licensing. Voice cloning also creates consent, impersonation, and product-abuse requirements independent of the software license. ([Hugging Face][10])                                                                                                                                                          | **Best compact candidate when streaming or cloning is a core requirement.**                         |
| **Coqui/XTTS-v2**       | High quality ceiling, multilingual voice cloning from a short reference, and 17 languages. The maintained community codebase claims sub-200 ms streaming capability, but actual desktop CPU performance and memory use are highly hardware-dependent. ([Hugging Face][11])                                       | Approximately 2.09 GB of model files, including a 1.87 GB primary checkpoint, before Python, PyTorch, and supporting libraries. ([Hugging Face][12])                                            | Python/PyTorch sidecar is the practical route. The maintained fork provides macOS and Windows wheels, but this remains a much heavier deployment than an ONNX/C++ engine.                                                                                                                                         | Library code is MPL-2.0, but XTTS-v2 weights use the Coqui Public Model License, which explicitly permits only noncommercial use of both the model and its outputs. ([GitHub][13])                                                                                                                                                                                                                                                                | **Research, prototypes, or separately licensed use—not a normal commercial MVP.**                   |
| **KittenTTS**           | Extremely small and fast. Quality is useful for assistants and accessibility, although it is less mature and less polished than the leading larger options. Currently a developer preview.                                                                                                                       | Models range from 15M to 80M parameters and about 25–80 MB, with eight built-in voices and 24 kHz output. ([GitHub][14])                                                                        | Direct implementation is Python/ONNX; sherpa-onnx supplies Node/native examples.                                                                                                                                                                                                                                  | Apache-2.0. The main product risk is maturity rather than licensing.                                                                                                                                                                                                                                                                                                                                                                              | **Good “lite” optional voice pack or low-resource fallback.**                                       |

## The licensing issue is part of the technical architecture

For a shippable local TTS feature, there are at least five independently licensed artifacts:

1. The inference engine.
2. The model weights.
3. The text frontend or phonemizer.
4. Voice embeddings or reference recordings.
5. In some cases, training-dataset attribution or restrictions on generated outputs.

That is why “the repository is Apache/MIT” is not sufficient. Piper’s active engine is GPL; sherpa-onnx currently contains a GPL phonemizer despite its Apache top-level license; Kokoro’s model is Apache but some wrappers or multilingual frontends can introduce eSpeak; Pocket TTS has separate code, model, access-condition, and voice licenses; XTTS explicitly restricts model outputs to noncommercial use. ([GitHub][1])

For each distributed voice pack, keep a machine-readable manifest with:

```text
engine_license
runtime_license
model_license
phonemizer_license
voice_asset_license
required_attribution
output_use_restrictions
source_revision
sha256
```

This should be part of your build pipeline and software bill of materials, not a document assembled just before release.

## Recommended Electron architecture

Do not let the renderer own the model or call a native synthesizer directly. Put a stable provider boundary between the Electron UI and every TTS implementation:

```text
Electron renderer
    │ typed IPC / MessagePort
    ▼
TtsCoordinator in Electron main
    │
    ├── macOS provider
    │      signed Swift helper
    │      AVSpeechSynthesizer
    │
    └── neural provider
           persistent utility process or native sidecar
           ONNX Runtime / verified sherpa-onnx build
           Kokoro, Supertonic, Kitten, Piper, Pocket...
    │
    ▼
framed PCM chunks
    │
    ▼
AudioWorklet ring buffer in renderer
```

Use a small engine-neutral contract:

```ts
interface TtsProvider {
  listVoices(): Promise<VoiceInfo[]>;
  prepareVoice(voiceId: string): Promise<void>;

  synthesize(request: {
    requestId: string;
    text: string;
    voiceId: string;
    language?: string;
    rate?: number;
  }): AsyncIterable<PcmChunk>;

  cancel(requestId: string): Promise<void>;
}
```

The important implementation choices are:

- **Keep the process persistent.** Loading models or voice conditioning for every utterance will dominate perceived latency.
- **Synthesize by clauses, not tokens.** Accumulate the LLM stream until punctuation or a safe clause boundary, synthesize that chunk, and generate the following chunk while the first plays.
- **Make cancellation first-class.** Barge-in should immediately cancel queued generation, clear buffered PCM, and stop playback.
- **Standardize the audio boundary.** Have every provider return a documented PCM format and resample in one place.
- **Keep inference out of the Electron renderer and preferably out of the main process.** A model crash, native ABI failure, or long inference call should not freeze the application.
- **Use stdio, a named pipe, or a Unix-domain socket for sidecars.** A loopback HTTP service is convenient for experiments, but for production it needs a per-launch authentication token and strict loopback binding.
- **Store weights outside ASAR.** Model files should be directly accessible for memory mapping and independent updates. Put native libraries and signed helpers in `extraResources`/the equivalent unpacked area.
- **Sign every nested macOS artifact.** The helper executable, ONNX Runtime libraries, native addons, and other dylibs all need to survive hardened-runtime signing and notarization.
- **Separate the application update from model updates.** Voice packs should be individually downloadable, hash-verified, and removable.
- **Bundle one pack when first-run offline operation is a requirement.** A product that downloads its first model after launch is locally executing, but it is not genuinely offline-capable on first launch.

## Concrete MVP choice

### macOS-first release

Use **`AVSpeechSynthesizer` through a tiny Swift helper**.

The helper should:

- Enumerate `AVSpeechSynthesisVoice.speechVoices()`.
- Expose only currently installed voices.
- Synthesize through the audio-buffer callback rather than merely invoking macOS’s `say` process.
- Return PCM frames and completion/error events over framed stdio.
- Support cancellation and speaking-rate control.
- Optionally guide the user to macOS settings when a preferred enhanced voice is not installed.

This gives you the smallest app, lowest cold-start cost, no bundled model, and the least native inference work. The provider interface prevents it from becoming a macOS-only architectural commitment.

### Cross-platform neural provider

For an English-first commercial app, start with **Kokoro q8**, approximately 92 MB, using a verified English frontend that does not distribute eSpeak. A direct Node/Transformers.js implementation in an Electron utility process is suitable for the first implementation; move it into a native sidecar only if profiling shows unacceptable memory, startup, or cancellation behavior. ([Hugging Face][5])

For multilingual expansion:

- Choose **Supertonic 3** when 31-language coverage, text robustness, and official multi-runtime examples justify a roughly 400 MB pack and OpenRAIL review.
- Choose **Pocket TTS** when first-audio streaming or consented voice cloning is more important than Python/PyTorch packaging complexity.
- Offer **KittenTTS** as a very small English pack.
- Offer **Piper** where GPL compliance is acceptable or where the application itself is distributed under compatible terms.

### Use of sherpa-onnx

Treat sherpa-onnx as the likely eventual common native runtime, but do not anchor the MVP to an unreleased 2.0. For a proprietary build, either:

- wait for and audit the promised GPL-free major release;
- create and document a build that excludes eSpeak/piper-phonemize and uses external tokens or lexicons; or
- stay on direct ONNX Runtime integrations for Kokoro or Supertonic.

The maintainers’ proposed token-input design is directionally well suited to this architecture because it lets your application own a clean, engine-independent text frontend. ([GitHub][15])

## Final choice

For this product, I would ship:

1. **macOS default:** Apple system voices via `AVSpeechSynthesizer`.
2. **Optional consistent neural voice pack:** Kokoro q8 with a verified GPL-free English frontend.
3. **Cross-platform runtime boundary:** persistent sidecar/utility process returning streaming PCM.
4. **Later multilingual pack:** Supertonic 3.
5. **Later cloning/streaming pack:** Pocket TTS.
6. **sherpa-onnx migration:** only after the current eSpeak licensing mismatch is resolved or your build is independently verified as clean.

So, **Piper is the closest “whisper.cpp equivalent” by design philosophy, but Apple voices plus Kokoro is the better MVP/product decision for a macOS-first commercial Electron application.**

[1]: https://github.com/OHF-voice/piper1-gpl "https://github.com/OHF-voice/piper1-gpl"
[2]: https://github.com/k2-fsa/sherpa-onnx/blob/master/nodejs-addon-examples/README.md "https://github.com/k2-fsa/sherpa-onnx/blob/master/nodejs-addon-examples/README.md"
[3]: https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice/speechvoices%28%29 "https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice/speechvoices%28%29"
[4]: https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE "https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE"
[5]: https://huggingface.co/onnx-community/Kokoro-82M-ONNX "https://huggingface.co/onnx-community/Kokoro-82M-ONNX"
[6]: https://huggingface.co/hexgrad/Kokoro-82M "https://huggingface.co/hexgrad/Kokoro-82M"
[7]: https://github.com/supertone-inc/supertonic "https://github.com/supertone-inc/supertonic"
[8]: https://github.com/supertone-inc/supertonic-py "https://github.com/supertone-inc/supertonic-py"
[9]: https://github.com/kyutai-labs/pocket-tts "https://github.com/kyutai-labs/pocket-tts"
[10]: https://huggingface.co/kyutai/pocket-tts "https://huggingface.co/kyutai/pocket-tts"
[11]: https://huggingface.co/coqui/XTTS-v2 "https://huggingface.co/coqui/XTTS-v2"
[12]: https://huggingface.co/coqui/XTTS-v2/blob/main/model.pth "https://huggingface.co/coqui/XTTS-v2/blob/main/model.pth"
[13]: https://github.com/idiap/coqui-ai-TTS "https://github.com/idiap/coqui-ai-TTS"
[14]: https://github.com/KittenML/KittenTTS "https://github.com/KittenML/KittenTTS"
[15]: https://github.com/k2-fsa/sherpa-onnx/issues/3731 "https://github.com/k2-fsa/sherpa-onnx/issues/3731"

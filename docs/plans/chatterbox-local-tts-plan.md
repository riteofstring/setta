# Chatterbox Becomes Setta's Local Voice

**Date:** 2026-07-29
**Status:** Proposed
**Research:** `docs/plans/local-first-tts-for-electron.md`

This plan supersedes the research document's Kokoro implementation
recommendation. The research remains the option analysis; Chatterbox is the
selected product direction.

## Outcome

Setta speaks through a bundled Chatterbox Turbo neural voice by default. It
works without a network connection or API key, begins a long response after
the first coherent clause is ready, and stops immediately when the user speaks
or presses stop.

The first release uses the default speaker conditioning included in the
official Chatterbox Turbo checkpoint. Setta has one built-in voice. It does
not clone a user, accept reference recordings, or maintain different voices
for the Director and workstream narrators.

Local transcription remains local Whisper on macOS. Speech input and speech
output stop sharing one provider selection:

```text
Microphone
    ├── Local Whisper
    └── OpenAI transcription

Authoritative speech source
    └── selected output engine
            ├── Setta Local · Chatterbox built-in voice
            └── OpenAI speech · fixed adapter voice
```

Apple `AVSpeechSynthesizer` is removed from Setta. It is not retained as a
fallback, compatibility mode, or hidden recovery path.

## Direct-cutover policy

The phases below describe implementation order, not separately shippable
transition states. The merge result has only the final Chatterbox design.

- Current speech-provider and voice contracts are replaced at their owners.
- The current store schema is changed directly; superseded development data
  is discarded instead of read, converted, or migrated.
- Generated TypeScript is regenerated from the final Go contracts.
- Old HTTP endpoints, IPC commands, preload methods, renderer state, helper
  commands, and playback payloads are deleted in the same change.
- Apple synthesis and whole-WAV/base64 playback are removed when Chatterbox is
  enabled.
- No feature flag, dual read/write, bridge adapter, field alias, protocol
  negotiation, legacy event decoder, or temporary fallback survives the
  cutover.

## What is true today

The current local voice path proves the surrounding Apple-first product flow,
but it does not provide a consistent or distinctive Setta voice.

| Boundary | Current behavior | Consequence |
| --- | --- | --- |
| Local synthesis | `SpeechSynthesis.swift` uses `AVSpeechSynthesizer` | Quality depends on installed macOS voices |
| Product catalog | `internal/speech/voice_configuration.go` returns the generated OpenAI voice list | Provider data has become product configuration |
| Voice persistence | Director and narrator voice selections, catalog snapshots, reuse metadata, and narrator allocation are durable domain state | A fixed one-voice product carries unnecessary configuration and failure modes |
| Local voice mapping | `desktop/src/main/speech-ipc.ts` uses the requested OpenAI ID only if Apple happens to expose the same ID, otherwise it selects the first system voice | Different configured voices usually collapse to one local voice anyway |
| Capabilities | `SpeechCapabilities` combines transcription model, synthesis model, provider state, and voice catalog | A local selection can still report OpenAI-owned synthesis facts |
| Provider setting | One `SpeechProvider` selects both input and output | Local Whisper cannot be combined independently with local or cloud TTS |
| Audio result | Synthesis returns a complete base64 WAV in `SpeechAudio` | Playback waits for the whole utterance and copies the audio several times |
| Playback | The renderer creates a Blob URL and an `HTMLAudioElement` | There is no PCM backpressure, clause overlap, or precise buffer cancellation |
| Local model lifecycle | The existing download service manages the Whisper transcription model | There is no Chatterbox pack, manifest, or TTS process lifecycle |

Chatterbox changes more than the model file. The official Turbo ONNX export is
a multi-stage autoregressive pipeline:

1. Tokenize the input text.
2. Combine text with speaker conditioning.
3. Generate speech tokens through a language-model loop with KV caches.
4. Decode the speech tokens into 24 kHz audio.
5. Apply the PerTh audio watermark.

The official Turbo checkpoint contains `conds.pt`, and the official Python
loader uses it automatically when no `audio_prompt_path` is supplied. That is
Chatterbox's built-in voice.

The official Turbo ONNX repository does not currently include `conds.pt`; its
example obtains conditioning from `target_voice_path` through the speech
encoder. Setta must therefore convert the official built-in conditioning into
the exact tensors required by the pinned ONNX export. It does not need to
source or clone another voice.

The ONNX export separates token embedding, language model, speech encoder, and
conditional decoder graphs, with external weight data. Quantized combinations
remain hundreds of megabytes. The plan does not treat Chatterbox as a single
drop-in ONNX graph or claim that it streams audio token by token.

## Decisions

### Chatterbox replaces Apple synthesis

Chatterbox is the built-in local output engine. It is not an enhanced option
below an Apple default. The Apple catalog, synthesis coordinator, synthesis
helper commands, local output adapter, and fallback selection are deleted in
the same cutover that enables Chatterbox.

### Chatterbox Turbo ONNX is the first production family

The first implementation targets the official English Chatterbox Turbo ONNX
export. Turbo is selected because it combines:

- Chatterbox's voice quality
- An official ONNX export
- A smaller 350M-parameter architecture than the 500M multilingual models
- A single-step conditional decoder
- A credible cross-platform production path without Python

Phase 0 selects the exact upstream revisions, graph quantization, inference
process, generation parameters, conditioning conversion, and watermark
implementation. It does not reopen the choice between unrelated TTS families.

Chatterbox Flash, Nano, the original 500M English model, and Multilingual V3
are not parallel production implementations. A later product decision may
replace Turbo directly, but the first release does not ship multiple
Chatterbox runtimes.

### The official built-in conditioning is Setta's one voice

The sole local speaker source is `conds.pt` from the same pinned official
Chatterbox Turbo checkpoint as the production model family.

Phase 0 converts that asset into an owner-defined, non-PyTorch binary format
containing the conditioning values required by the selected ONNX graphs. The
manifest records both the exact upstream `conds.pt` hash and every derived
tensor's shape, dtype, byte length, and hash.

The installed application loads only the derived conditioning. It does not
deserialize a PyTorch pickle, load reference audio, or run a speech encoder.

The built-in conditioning asset is part of the model repository's MIT-licensed
release, but Phase 0 must still record that conclusion explicitly and preserve
the applicable license. If the asset's redistribution terms or provenance
cannot be accepted, stop and revisit the model choice. Do not substitute an
unreviewed recording.

### Setta has no voice catalog or voice selection

One voice does not justify a catalog, selector, automatic allocation
algorithm, or durable per-role choice.

Delete the current:

- `SpeechVoiceCatalog` product contract
- Director voice selection
- Narrator voice default
- Automatic distinct-voice allocation
- Voice reuse metadata
- Voice-selection events and configuration records
- Voice selection HTTP and IPC endpoints
- Director and narrator voice controls in settings

Director replies and narrator updates both use the same Setta voice. The
conversation presentation model no longer stores requested or resolved voice
IDs.

OpenAI remains an optional output engine, but its adapter selects one fixed
OpenAI voice as a private provider constant. OpenAI voice IDs are not product
state and are not exposed as a catalog.

Setta is unreleased. Development app data containing the removed voice
contracts is discarded. The new application does not inspect, convert, or
interpret it.

### No voice cloning ships

The app has no reference-recording picker, microphone enrollment flow,
conditioning-generation command, or voice-conversion capability.

The build uses only the official built-in `conds.pt` as an input. No external
voice actor, scraped recording, user recording, or bundled reference WAV is
needed.

If the product later needs multiple voices or user cloning, that is a separate
product, consent, abuse-prevention, storage, and architecture plan.

### The base pack ships with the app

The base English pack is included in application resources outside ASAR. A
clean install can speak offline on first launch. Runtime model download is not
part of the first cutover.

The production build may fetch pinned assets into a build cache, but the
installed application must not need the network to obtain its voice. Missing,
unverified, incomplete, or unapproved required assets fail the production
build.

The larger Chatterbox footprint is accepted as part of this choice, but Phase
0 must record the exact installed and compressed sizes before implementation
proceeds. Setta does not disguise a large pack behind an unannounced first-use
download.

### The initial engine is English

The first engine supports English. Chatterbox Multilingual V3 and
cross-language voice transfer are out of scope.

Unsupported language is represented explicitly. Setta does not send
non-English text through Turbo and pretend the result is supported.

### Input and output selections are independent

Replace the combined provider setting with:

- A transcription provider: local Whisper or OpenAI
- A speech output engine: local Chatterbox or OpenAI

Local Chatterbox is the default output engine on every platform where the
selected runtime and bundled pack pass the distribution and performance
gates. Local Whisper remains the macOS transcription default until a separate
cross-platform transcription plan changes it.

### Inference is process-isolated

Chatterbox inference never runs in the renderer or Electron main process. One
persistent process owns:

- Text tokenization
- The token-embedding ONNX session
- The autoregressive language-model ONNX session
- KV-cache allocation and reuse
- The conditional-decoder ONNX session
- The singleton built-in speaker conditioning
- PerTh watermarking
- Clause synthesis and cancellation

The leading implementation candidate is an Electron utility process using an
exact-pinned `onnxruntime-node` dependency and a normal TypeScript
implementation of the official generation loop. It ships only if Phase 0
proves memory behavior, event-loop responsiveness, crash isolation, signing,
and packaging.

If that candidate misses a gate, Phase 0 selects one native
`setta-local-tts-helper` using the ONNX Runtime C API. There is only one
production runtime. Do not ship a utility-process implementation beside a
native replacement or preserve both behind a compatibility adapter.

The official Python/PyTorch package is useful as a Phase 0 conversion tool and
reference oracle, not as an installed production dependency.

### Playback is clause-progressive PCM

Chatterbox Turbo ONNX generates speech tokens autoregressively and decodes a
complete clause. It does not provide honest sample-level streaming from the
official pipeline.

Setta therefore:

1. Segments long text at semantic sentence and clause boundaries.
2. Synthesizes the first complete clause.
3. Applies the watermark to that clause.
4. Sends its 24 kHz mono PCM to playback.
5. Synthesizes at most one later clause ahead while playback continues.

PCM crosses process and renderer boundaries as transferable buffers, not
base64. The renderer owns one resampling boundary from 24 kHz to the active
`AudioContext` sample rate, followed by an `AudioWorklet` ring buffer. Every
chunk carries a request ID and sequence number. Late chunks for canceled or
superseded requests are rejected.

### Watermarking is part of the production path

Every locally generated Chatterbox clause is processed by the pinned PerTh
watermarker before leaving the inference process. The official ONNX example's
optional `apply_watermark = false` setting is not copied into Setta.

Phase 0 must prove a distributable non-Python implementation, measure its
latency, and verify detection after clause joining and renderer resampling.
Setta does not claim Chatterbox's documented watermark while omitting the
watermark step.

### Model control tags are not raw text

Turbo recognizes tags such as `[laugh]`, `[chuckle]`, and `[cough]`. Raw
assistant, tool, Markdown, or user text cannot activate them.

The first release does not expose paralinguistic controls. The provider
adapter handles the exact supported control-token set as reserved syntax and
passes only ordinary projected speech text to the tokenizer. A future release
may introduce a typed, product-owned expression value; it must not infer
effects from arbitrary brackets or prose.

### Cloud speech remains explicit

OpenAI speech remains an optional output engine. It is not an automatic
fallback for local engine failure, because an implicit network request changes
privacy, cost, voice, and credential requirements.

Changing output engines does not change durable conversation state. Each
engine uses its one adapter-owned voice.

## Hard rules

- **No Apple synthesis fallback.** Restart and repair the Chatterbox path or
  continue in text. Never change to a system voice silently.
- **No backward compatibility, legacy support, migrations, or transitional
  code.** Replace the combined provider and voice contracts directly. Do not
  add old-field aliases, dual stores, dual read/write, schema migrations,
  protocol negotiation, old event decoders, compatibility adapters, feature
  flags, or temporary fallbacks.
- **Go owns product contracts and values.** Regenerate TypeScript from the
  Go-owned endpoint registry and values. Do not hand-edit generated outputs.
- **Provider voice values stay in their adapters.** Neither Chatterbox
  conditioning details nor OpenAI voice IDs are product contracts.
- **No product voice catalog.** One built-in voice is a fixed engine property,
  not configurable domain state.
- **No inference in Electron main or the renderer.**
- **No Python or PyTorch in the installed base application.** Phase 0 may use
  the official implementation as a conversion tool and oracle.
- **No voice cloning.** Do not add reference-audio input, a speech encoder, or
  a conditioning-generation command to the installed app.
- **No raw `conds.pt` deserialization at runtime.** Package the validated
  owner-defined conditioning format.
- **No raw Chatterbox control tags.** Only a future typed product contract may
  authorize paralinguistic effects.
- **No watermark bypass.** Watermark application and preservation are part of
  the selected engine behavior.
- **No runtime fetch for the required base pack.** A release that claims local
  voice includes all required assets.
- **No whole-utterance base64 WAV path.** Local PCM transfer replaces it; the
  old `SpeechAudio.audioBase64` result is removed rather than retained for
  local compatibility.
- **No polling for process, model, or playback status.** The inference process
  and playback worklet push typed state changes.
- **No brittle technical-text or hallucination guessing.** Structured text is
  projected deterministically. Model termination and PCM validity use
  explicit protocol invariants, not guessed transcript similarity.
- **No automated verification during implementation.** Formatting changed
  files is allowed. Automated checks begin only after the branch is ready and
  the user explicitly asks for verification.

## Target architecture

```text
Active local or remote Setta runtime
    │
    │ resolve authoritative spoken text
    ▼
SpeechOutputCoordinator · Electron main
    │
    ├── Setta Local
    │     └── isolated persistent Chatterbox process
    │           ├── deterministic spoken-text input
    │           ├── pinned tokenizer
    │           ├── derived official built-in conditioning
    │           ├── token-embedding ONNX session
    │           ├── autoregressive language-model session + KV cache
    │           ├── conditional-decoder ONNX session
    │           └── PerTh watermark encoder
    │
    └── OpenAI
          └── active runtime's existing OpenAI speech adapter
                └── fixed provider-owned voice
    │
    │ request-scoped PCM events over MessagePort
    ▼
Renderer speech playback controller
    │
    ├── request/priority queue
    ├── one resampler
    ├── byte-bounded replay cache
    └── cancellation and stale-chunk rejection
    │
    ▼
AudioWorklet ring buffer
    │
    ▼
System audio output
```

The active Setta runtime remains authoritative for which durable event is
being spoken. The desktop remains authoritative for the output engine, local
pack lifecycle, and physical audio playback. This preserves local TTS when
the active Setta runtime is remote.

## Contract shape

Exact names can follow the surrounding package vocabulary, but the ownership
and separation are required.

### Backend-owned product contract

Remove product voice IDs, catalogs, selections, and allocations. The resolved
speech concept becomes equivalent to:

```go
type TranscriptionProvider string
type SpeechOutputEngine string

type ResolvedSpeechUtterance struct {
    Source     SpeechSource
    SpokenText string
    Cadence    SpeechCadence
    Locale     string
}
```

The public contract does not expose a model path, ONNX graph name, upstream
repository ID, conditioning tensor, OpenAI voice ID, sampling parameter,
model-control tag, or raw provider rate.

`SpeechCapabilities` is split so transcription availability does not claim to
describe local TTS. Credential status remains an OpenAI concern. Local output
readiness is a desktop capability derived from the bundled pack and inference
process. There is no voice-catalog capability.

### Desktop-internal inference protocol

The semantic protocol has exhaustive command and event unions.

Commands:

- `initialize`
- `synthesize`
- `cancel`
- `shutdown`

Events:

- `ready`
- `started`
- `clause_started`
- `audio_chunk`
- `completed`
- `cancelled`
- `failed`

The `synthesize` command has no voice or conditioning parameter. The process
loads the one manifest-owned conditioning asset during initialization.

An `audio_chunk` includes:

- Request ID
- Clause index
- Monotonic sequence number
- Sample rate
- Channel count
- PCM format
- Watermark-applied marker
- Transferable audio buffer

The marker records that the configured watermark stage completed; it is not a
claim that a detector ran on every utterance.

Failures use typed codes for process startup, pack validation, tokenization,
conditioning validation, token generation, missing stop token, decoding,
watermarking, PCM validation, cancellation, and protocol violations.
User-facing copy is produced at the product boundary; internal runtime
messages are diagnostic causes.

If a native helper is selected, the same semantic messages use a
length-prefixed binary transport. Do not expose a loopback HTTP server.

### Pack manifest

One owner-defined manifest records at least:

- Manifest schema version
- Pack ID and pack version
- Exact upstream repositories and revisions
- Exact Chatterbox family and architecture
- Each ONNX graph and external-data filename
- Quantization or precision of each graph
- Byte lengths and SHA-256 hashes
- Tokenizer and generation configuration files and hashes
- Start, stop, and silence token values from the selected revision
- Native sample rate and channel count
- Supported locales
- Generation limits and fixed production parameters
- Upstream `conds.pt` repository, revision, byte length, and SHA-256
- Conditioning-converter source version
- Derived conditioning schema, tensors, shapes, dtypes, and hashes
- Watermark implementation, checkpoint, threshold policy, and hashes
- Model, runtime, tokenizer, conditioning, watermark, and asset licenses
- Required attributions

The raw `conds.pt` input may exist in the verified build cache. It is not
installed with the application.

If TypeScript needs owner-defined manifest values, generate them from the
owner rather than maintaining a mirror by hand.

## Speech behavior

### Spoken-text projection

The model does not receive display text blindly.

- Narrator milestones and status replies already intended for speech remain
  concise plain prose.
- Director replies are converted from their structured or parsed display
  representation into spoken prose.
- Markdown formatting markers are not spoken.
- Code blocks and long commands are summarized as attached or displayed
  material instead of read character by character.
- Links use meaningful label text; raw tracking URLs are omitted.
- File paths, identifiers, acronyms, dates, currency, and measurements use
  deterministic typed formatting and an explicit technical pronunciation
  lexicon.
- Chatterbox control tags are reserved and cannot be introduced by source
  text.
- Display text is never replaced by the speech projection.

The authoritative source resolver returns the spoken representation so local
and cloud output speak the same semantic content.

### Clause scheduling

Turbo is autoregressive at the speech-token stage and decodes complete token
sequences. Playback progress therefore comes from semantic clause overlap:

1. Segment complete source text at sentence boundaries.
2. Split an overlong sentence at strong clause boundaries.
3. Tokenize and enforce the selected text and speech-generation limits.
4. Generate speech tokens until the explicit stop token.
5. Decode and watermark the first clause.
6. Start playback for that clause.
7. Synthesize at most one clause ahead while the current clause plays.

Use a sentence parser or `Intl.Segmenter` with explicit maximum-size rules.
Do not send individual LLM tokens or arbitrary fixed-size character slices to
the model.

The first clause should normally be short enough for conversational latency.
Do not create unnatural fragments solely to make a benchmark look faster.

### Generation invariants

The production generation loop:

- Uses one pinned strategy and fixed parameters
- Initializes KV-cache tensors from inspected ONNX metadata
- Checks cancellation between autoregressive steps
- Requires the explicit stop token before the configured generation bound
- Never forwards prompt tokens or terminal control tokens to the decoder
- Adds only the selected, documented terminal silence tokens
- Rejects non-finite logits, invalid token IDs, invalid cache shapes, and
  contradictory model metadata
- Rejects empty, non-finite, incorrectly shaped, or oversized decoded audio

A generation that reaches the hard token bound without a stop token is a
typed model-generation failure. Setta does not play a possibly hallucinated
or unbounded tail and does not guess transcript fidelity with a keyword
heuristic.

### Built-in conditioning lifecycle

The process validates the singleton derived conditioning asset during
initialization and retains it for the process lifetime. Its schema is tied to
the exact graph revision and pack version.

The runtime has no profile-selection or conditioning-generation command. An
application update cannot change the voice without a new pinned pack version
and listening review.

### Cancellation and barge-in

Audio cancellation and agent-turn cancellation remain separate decisions.

When capture begins or the user stops speech:

1. Clear the renderer ring buffer immediately.
2. Advance the accepted request generation so late chunks are ignored.
3. Cancel queued clauses.
4. Signal cancellation to the autoregressive loop.
5. Terminate or discard an in-flight decoder or watermark run if the runtime
   cannot interrupt it safely.
6. Return playback state to stopped without waiting for the engine.

The process confirms cancellation asynchronously. A missing confirmation does
not permit more audio to play.

### Recovery

The coordinator handles specific failures:

- A crashed inference process is restarted once.
- The current clause is retried only when its request is still current, the
  failure is classified as transient, and no user input has superseded it.
- A missing stop token, conditioning mismatch, or deterministic protocol
  failure is not retried with the same inputs.
- A bad cached verification record causes hash revalidation.
- A protocol violation terminates the process before it can emit more audio.

Stale milestones are not spoken after a long recovery. Existing playback
priority and freshness rules continue to decide whether recovered work is
still useful.

The UI may say that local voice is preparing or temporarily unavailable. It
does not display native exceptions, ONNX errors, token-generation details,
schema failures, or a request for the user to retry an internal operation.

## Phase 0 — Lock the shippable Chatterbox pack

This phase is a gate. It chooses implementation facts inside the decided
Chatterbox Turbo ONNX path before product contracts depend on them.

### Build a representative corpus

Check in a compact text corpus covering:

- Director confirmations and routing receipts
- Narrator milestones, blockers, and final summaries
- Dates, times, quantities, currency, and versions
- TypeScript, JavaScript, Go, Electron, OpenAI, GitHub, and common library
  names
- CamelCase, snake_case, package names, short file paths, and domains
- Markdown emphasis, links, lists, inline code, and code blocks
- Literal bracketed text and every reserved Turbo control tag
- Questions, exclamations, short acknowledgements, and long sentences
- Names and words likely to be outside a generic English tokenizer corpus

The corpus is product text, not a tautological generator fixture.

### Record the current baseline

Before changing playback, measure the current Apple path on the oldest
supported Mac and a current Apple Silicon Mac:

- Time from synthesis request to complete WAV
- Time to audible playback
- Total utterance duration
- Cancellation latency while synthesizing and while playing
- Main-process and renderer responsiveness
- Peak helper memory and CPU

Record results append-only under
`docs/reports/performance/chatterbox-local-tts/`.

### Freeze and audit the upstream inputs

Start with the official `ResembleAI/chatterbox-turbo-ONNX` export and the
official `ResembleAI/chatterbox-turbo` checkpoint containing `conds.pt`. Pin:

- Exact Hugging Face repositories and commits
- Exact graph and external-data files
- Tokenizer and configuration files
- Exact `conds.pt` file
- The corresponding source implementation revision used for conversion and
  as the oracle
- PerTh source revision, checkpoint, and configuration
- Byte lengths and SHA-256 hashes

Do not use a floating `main`, `master`, `latest`, or unversioned download URL.
Do not combine model or conditioning assets from incompatible revisions.

Create a complete transitive license inventory for:

- Chatterbox source, ONNX export, model weights, and `conds.pt`
- ONNX Runtime
- Tokenizer implementation and assets
- Generation-loop dependencies
- PerTh code and checkpoint
- Every build-time conversion dependency
- The derived conditioning format and assets

Record the model card's training-data disclosure and the basis for treating
the official built-in conditioning as part of the MIT model release. Obtain
the required product/legal acceptance. If that review does not pass, stop;
the fallback is not to find a convenient recording on the internet.

### Select graph precision

Benchmark supported fp16, q8, q4, and q4f16 graph sets where the target
runtime can execute them correctly. Mixed precision is allowed only when one
manifest names every chosen graph and listening evidence shows why the
combination exists.

Measure:

- Compressed and installed pack size
- Cold model load and warmup
- Warm autoregressive token rate
- Conditional-decoder latency
- Peak and steady resident memory
- Quality, intelligibility, and artifacts
- Output agreement with the official implementation

Select one graph set. Later phases do not retain a quality mode and a compact
mode in parallel.

### Convert and prove the built-in conditioning

Create a normal, pinned build tool that:

1. Loads the exact upstream `conds.pt` in a controlled build environment.
2. Reproduces the official Turbo loader's no-prompt conditioning state.
3. Computes or transforms the values needed by the pinned ONNX language model
   and conditional decoder.
4. Serializes those values in a small owner-defined format that needs no
   PyTorch runtime.
5. Records every tensor's name, dtype, rank, shape, byte length, and SHA-256.
6. Rejects unknown fields, object types, or incompatible revisions.

Generate the representative corpus through:

- The official Python checkpoint using its built-in conditioning
- The ONNX pipeline using the derived conditioning

Compare voice identity, wording, intelligibility, duration, artifacts, and
numeric/runtime behavior. Confirm that the packaged graph set never loads the
speech encoder and the installed app contains neither `conds.pt` nor a
reference WAV.

If the built-in conditioning cannot be mapped faithfully into the official
ONNX export, stop and present the measured choices. Do not introduce a cloned
voice to make the selected runtime work.

### Approve the one built-in voice

Blind-listen to the built-in voice over the same corpus. It must be:

- Natural over repeated short updates
- Intelligible on technical terms
- Stable across separately synthesized clauses
- Appropriate for both Director replies and narrator milestones
- Free of distracting artifacts or an unsuitable character identity
- Clearly preferable to the current Apple default

There is no candidate-voice curation phase. If the official built-in voice
does not pass, stop and revisit the model decision.

### Select the inference process

Prototype the official multi-graph generation loop in an Electron utility
process with exact-pinned ONNX Runtime. Measure:

- Cold process start
- Graph load and warmup
- Warm time to first completed clause
- Speech-token generation rate
- Real-time factor
- Peak and steady resident memory
- Concurrent Electron, Whisper, and backend workload
- Cancellation during token generation, decoding, and watermarking
- Recovery from forced process termination
- Native-module packaging for supported architectures

Use the official Python/PyTorch output as a disposable comparison oracle.
Python is not the production fallback.

Choose a native helper only if the utility process misses a product or
distribution gate. Record the decision and measurements rather than preserving
both paths.

### Prove watermarking

Select one pinned, distributable PerTh implementation that does not bring
Python or PyTorch into the installed app. Validate:

- Watermark application to short and long clauses
- Detectability before and after clause joining
- Detectability after the renderer's production resampling path
- Audible quality and clause-boundary seams
- CPU, memory, and time added before first audio
- Cancellation during watermark processing
- Failure behavior when its model or checkpoint is invalid

The detector may remain a build and verification tool; the production runtime
must apply the watermark and report that stage through the typed protocol.

If no shippable watermark path is available, stop and present the tradeoff.
Do not silently disable it.

### Establish the performance budget

At minimum, the selected pack must:

- Synthesize faster than real time on the oldest supported machine after
  warmup
- Keep model loading off the critical path to the first usable window
- Create no Electron main-thread or renderer long task
- Stop audible playback in less than 100 ms after cancellation
- Keep queued clauses, KV caches, conditioning, and PCM memory explicitly
  bounded
- Beat the removed Apple default in blind preference on the product corpus

Record a concrete warm first-clause target, installed-size budget, and resident
memory budget from the supported-hardware measurements. If Chatterbox cannot
meet the accepted budgets, stop rather than publishing speculative numbers or
silently changing the model family.

### Phase exit

The Phase 0 report names exactly one:

- Chatterbox Turbo ONNX revision
- Official Turbo checkpoint and `conds.pt` revision
- Graph precision set
- Tokenizer and generation configuration
- Runtime process implementation
- Derived singleton-conditioning schema
- Watermark implementation
- License inventory
- Pack size and performance budget

Nothing in later phases retains alternatives rejected here.

## Phase 1 — Remove voice configuration and split the speech domain

Replace the current combined provider model and multi-voice domain directly.

### Backend and HTTP contracts

- Introduce separate transcription-provider and speech-output-engine values.
- Remove `SpeechVoiceID`, `SpeechVoiceCatalog`, voice-selection modes, and
  voice-reuse metadata from product contracts.
- Remove Director voice selection and narrator voice default endpoints.
- Remove requested and resolved narrator voice fields from conversation
  presentation records and projections.
- Remove automatic Director and narrator voice allocation.
- Keep the one OpenAI voice constant private to the OpenAI adapter.
- Replace raw provider rate with a product cadence value and explicit adapter
  mappings.
- Split combined capabilities into transcription and output-readiness
  responsibilities.
- Rename synthesis resolution to return authoritative spoken text without a
  voice ID.
- Update the `internal/httpapi` endpoint registry as the owner of every changed
  request and response.
- Replace the desktop/backend protocol version for the breaking contract and
  support only that version. Do not negotiate with the superseded protocol.

Regenerate `desktop/src/generated/backend.ts` with
`./scripts/go.sh run ./cmd/generate-contracts` before cleanup. If an
owner-defined pack manifest gains generated projections, run its generator in
the same phase. Never edit generated files manually.

### Remove durable voice state

- Delete Director voice-selection streams and events.
- Delete narrator voice-default streams and events.
- Delete voice catalog snapshots from configuration events.
- Delete voice-assignment and reuse calculations.
- Remove voice columns from the current store schema and record projections.
- Remove related service and store methods.
- Remove related HTTP, IPC, preload, and renderer state.
- Do not read, migrate, or reinterpret superseded voice events or
  configuration.

Discard existing development app data containing superseded contracts. Do not
add startup detection, runtime adapters, or conversion tooling for it.

### Desktop settings ownership

- Replace `SpeechProviderSelectionStore` with independent transcription and
  speech-output selections.
- Default output to local Chatterbox where supported.
- Remove Director and narrator voice controls.
- Preserve OpenAI credential storage as one credential concern even when it is
  used by transcription, output, or both.
- Push selection and readiness changes to renderer subscribers.

### Phase exit

Speech source resolution contains no voice ID, conversation state contains no
voice assignment, and the UI contains no voice selector. Local and cloud
adapters each own one fixed voice.

## Phase 2 — Bundle and isolate Chatterbox

### Build and resource layout

Add one build path that:

- Downloads or reuses the exact pinned upstream files
- Verifies size and SHA-256 before installing them into build output
- Converts the pinned `conds.pt` into the owner-defined conditioning format
- Verifies conversion output against the manifest
- Writes the generated or owner-defined pack manifest
- Places graphs, external data, tokenizer, derived conditioning, and
  watermark assets outside ASAR
- Excludes `conds.pt`, the speech encoder, and all reference-audio support
- Includes required notices and attributions
- Packages only the selected platform runtime binaries

Use `./update_dependencies.sh` for any lockfile-changing direct dependency
addition. Pin every checked-in direct dependency exactly.

Development and production resource resolution may use different roots, as
the existing Whisper helper does, but both read the same manifest contract.
Production does not accept an environment-only model configuration.

### Inference lifecycle

Implement the Phase 0 process choice with:

- One process launched after the app window becomes usable
- Pack and singleton-conditioning verification before model load
- Explicit ready and failed states
- One warm session for each selected production graph
- KV-cache allocation bounded by the selected generation limit
- One immutable conditioning instance
- One active inference plus at most one queued clause
- Request-scoped cancellation
- Graceful shutdown on application exit
- Forced termination after a bounded shutdown failure
- One controlled restart after an unexpected exit

Model loading, hashing, graph execution, and watermarking never block the
Electron main thread.

### Generation implementation

Implement the official algorithm as typed normal source code:

- Load text tokens through the pinned tokenizer.
- Load the manifest-owned built-in conditioning.
- Construct embeddings and first-step inputs.
- Allocate KV caches from inspected graph metadata.
- Generate one speech token per step using the selected strategy.
- Update attention mask, position, and caches exhaustively.
- Stop only on the selected terminal token or typed failure.
- Add the configured terminal silence tokens.
- Decode through the conditional decoder.
- Apply the watermark.
- Validate and transfer Float32 PCM.

Do not embed the generation loop in a string, shell script, or dynamically
downloaded example.

### Protocol validation

Validate every command and event at the process boundary. Reject:

- Unknown message types or fields
- Duplicate active request IDs
- Any voice, reference-audio, or conditioning override
- Non-monotonic audio sequences
- Unsupported sample formats
- Buffers exceeding the declared size
- An audio chunk without successful watermark application
- Completion after a contradictory terminal event

Protocol failures terminate the inference process and become one typed
coordinator failure. Do not continue after malformed output.

### Phase exit

A local harness can initialize packaged resources, synthesize the built-in
voice into nonempty watermarked 24 kHz mono PCM, cancel token generation,
discard an in-flight decode, and restart the process after a forced exit. This
is implementation evidence, not permission to begin the automated test suite.

## Phase 3 — Replace whole-WAV playback with clause-progressive PCM

### Main and preload

- Add a request-scoped output coordinator in Electron main.
- Resolve the authoritative utterance from the active Setta runtime.
- Route it to the selected output engine.
- Transfer local PCM through a `MessagePort`; do not proxy audio through
  serialized IPC return values.
- Expose start, cancel, status, and port attachment through the preload
  boundary.
- Close ports and cancel active work on renderer teardown, runtime switch, or
  application shutdown.

OpenAI output uses the same final playback event contract through its provider
adapter. When the provider returns one complete binary response, the adapter
emits PCM without crossing HTTP or IPC as base64. This is final provider
behavior, not an interim compatibility path. Local output is never forced
back into a whole-utterance WAV.

### Renderer playback

Replace Blob URL playback with:

- One lazily created `AudioContext`
- One streaming resampler
- One `AudioWorklet` ring buffer
- Explicit buffer-low and buffer-drained events
- Request generation and sequence validation
- A byte-bounded PCM replay cache keyed by source, cadence, output engine, and
  pack version

Reimplement the current intent priority, freshness, replacement, and terminal-
summary supersession product rules against the final playback contract. Do
not wrap or retain the old player.

### Backpressure

The worklet reports available capacity. The coordinator keeps bounded PCM in
flight and pauses forwarding when the renderer cannot accept more. The
inference process never allocates an unbounded clause queue for a long
response.

### Phase exit

The first coherent clause begins playback before later clauses finish
synthesis. Starting capture or pressing stop clears audible output
immediately, and late chunks cannot resume it.

## Phase 4 — Make the spoken result intentional

### Speech projection

Move spoken-text creation to the authoritative source-resolution boundary.
Add parser- or type-based projections for every source kind that can be
spoken. Preserve exact display content separately.

Delete renderer-only string cleanup that would make cloud and local speech say
different semantic content.

### Text normalization and tokenizer input

Implement normalization as normal source files and versioned assets. Include:

- Deterministic number, date, time, currency, and measurement normalization
- A reviewed technical pronunciation lexicon
- Acronym behavior
- Product and provider names
- Locale-specific punctuation behavior
- Exact reserved-tag handling
- Specific typed failures for unsupported text or input overflow

Do not introduce a phonemizer that Chatterbox does not require. Pronunciation
overrides and normalization stay provider-neutral where possible and are
versioned because they can change the sound of the same durable utterance.

### Reserved control tags

Maintain one exhaustive mapping of the Turbo revision's reserved tags at the
Chatterbox adapter boundary.

- Projected ordinary text cannot emit a control token.
- Literal brackets remain speakable without activating an effect.
- Unknown bracketed content is ordinary content, not a guessed model command.
- No renderer or backend component maintains a second tag list.
- The product does not infer laughter, coughing, or emotion from prose.

If expression controls are later added, Go owns a typed product enum and the
adapter maps it exhaustively to the selected model revision.

### Chunking and cadence

- Segment at semantic sentence and clause boundaries.
- Enforce text-input and generated-speech-token limits explicitly.
- Synthesize at most one clause ahead.
- Keep the built-in voice's natural pace from its official conditioning.
- Calibrate inter-clause timing and product cadence from listening evidence
  instead of reusing `AssistantSynthesisRate = 1.2` blindly.
- Map the same product cadence concept in the OpenAI adapter.
- Avoid playback-rate manipulation that changes pitch, artifacts, or
  watermark reliability.

### Phase exit

Every entry in the Phase 0 corpus has a recorded spoken projection, tokenizer
trace, reserved-tag result, clause boundary trace, and representative audio
sample. Listening notes identify no raw Markdown, long URL, code block,
accidental control effect, or character-by-character path reading.

## Phase 5 — Cut over the product and remove Apple speech

### Settings

Replace the combined Voice provider card with:

- **Speech input:** Local Whisper or OpenAI
- **Voice output:** Setta Local or OpenAI

The local output card reports built-in readiness, not a model download or
voice-selection action. It may include one short “Play sample” action using
the production output coordinator, cadence, cancellation, watermark, and PCM
playback path.

Do not expose reference audio, voice enrollment, model tags, quantization,
generation parameters, or a one-item voice selector.

OpenAI setup remains visible when either selected capability needs it. The UI
does not imply that local output needs the Whisper model or microphone
permission.

### Direct cutover

- Make local Chatterbox the default output selection.
- Remove local system voice enumeration.
- Remove `AVSpeechSynthesizer`, its coordinator, and synthesis protocol
  payloads from the Swift helper.
- Rename remaining local macOS helper, resource, download, and UI concepts
  around transcription rather than the ambiguous word "voice".
- Delete the local macOS speech-output provider.
- Delete all Director and narrator voice-selection UI and IPC.
- Delete product voice catalogs, selection persistence, and allocation.
- Delete the mapping from OpenAI voice IDs to Apple system voices.
- Delete the whole-WAV local validation and base64 decoding path.
- Delete obsolete combined-provider settings and copy.
- Remove or rewrite superseded tests and fixtures rather than preserving old
  behavior.

The Swift helper remains only for microphone capture and Whisper
transcription. Its build script and manifest no longer claim responsibility
for speech output.

### Phase exit

Source search finds no `AVSpeechSynthesizer`, Apple system-voice catalog,
product voice selector, local Apple output provider, or local whole-WAV
synthesis path. The only default offline output is Chatterbox's built-in
voice.

## Phase 6 — Distribution, recovery, and measured performance

### Packaging

- Package the base pack outside ASAR for every supported architecture.
- Package the selected inference runtime without unused platform binaries.
- Do not package `conds.pt`, the speech encoder, reference audio, Python,
  PyTorch, or voice-cloning code.
- Sign native modules or helpers and their dynamic libraries correctly.
- Include MIT licenses and every other required notice in the installed app.
- Confirm app updates replace the immutable bundled pack atomically.
- Record installer, installed, and update-delta size.

Before enabling local output on Windows or Linux, repeat Phase 0's performance
and packaging evidence on representative hardware. Do not advertise support
because ONNX is theoretically portable.

### Failure behavior

Exercise:

- Missing or altered graph or external-data asset
- Invalid manifest
- Derived conditioning schema, shape, dtype, or hash mismatch
- Unsupported CPU or ONNX operation
- Process startup failure
- Invalid KV-cache metadata
- Missing stop token
- Decoder output containing non-finite samples
- Watermark model or application failure
- Process crash during token generation, decoding, or watermarking
- Renderer reload during synthesis
- Active runtime switch
- Capture starting during synthesis and playback
- App shutdown with queued speech

The visible product remains usable in text. Internal failures are logged with
request, pack, engine, graph stage, and phase metadata, without recording
source text, audio, or conditioning tensors.

### Performance report

Append post-cutover results beside the Phase 0 baseline:

- Window startup impact
- Cold and warm time to first completed clause
- Time to audible playback
- Speech-token generation rate
- Decoder and watermark latency
- Real-time factor by utterance size
- Peak and steady memory
- CPU and energy impact
- Main and renderer long tasks
- Ring-buffer underruns
- Cancellation latency by inference stage
- Recovery latency
- Thirty-minute mixed narration stability
- Watermark detection before and after the production resampler

At minimum:

- Warm synthesis is faster than real time on the oldest supported machine.
- Model load does not delay the first usable window.
- Inference creates no renderer or Electron main-thread long task.
- Playback stops perceptibly immediately, with a target below 100 ms.
- Long responses do not grow process or renderer memory without a bound.
- Blind listeners clearly prefer the built-in Chatterbox voice over the
  removed Apple default on the product corpus.
- The watermark remains detectable through the production playback transform.

If a target is missed, fix and remeasure the narrow path. Do not publish a fake
estimate or silently lower the recorded requirement.

## Phase 7 — Merge verification, only when requested

Do not enter this phase until the branch is ready to merge and the user
explicitly asks for verification.

Run the narrowest checks first:

1. Pack manifest, conditioning conversion, tokenizer, generation loop, PCM
   validation, watermark, and cancellation checks
2. Focused Go speech and HTTP contract checks through `./scripts/go.sh`
3. Focused desktop main, preload, renderer, and worklet checks
4. Generated-contract consumers affected by the breaking contract

Then run deterministic end-to-end Electron workflows through the production
main/preload/renderer/HTTP/store paths using temporary app data. Coverage
includes:

- Clean offline launch with the bundled pack
- Opening a workspace and conversation
- Receiving Director and narrator output through the same built-in voice
- Receiving a narrator milestone and clause-progressive local speech
- Queueing and priority supersession
- Stop, capture barge-in, and late-chunk rejection
- Completion, cancellation, failure, and process restart
- Built-in voice sample playback
- Input and output selections remaining independent
- Renderer reload and application restart with persisted current settings
- Remote-runtime source resolution with local desktop playback
- Explicit OpenAI output selection without automatic cloud fallback
- Reserved Turbo tags in source text producing no unintended effects
- No runtime route for reference audio or conditioning overrides

Use a scripted fake inference process for malformed protocol and crash cases,
and the real bundled Chatterbox process for nonempty, non-silent, correctly
formatted, watermarked audio and performance evidence. Unit, store, component,
or HTTP-only coverage is not sufficient for the workflow.

If verification also changes or covers topic-conversation lifecycle, Codex
harness behavior, provider protocol handling, queueing, steering, approvals,
or event streaming, include the repository-required live Codex E2E gate when
the local Codex CLI has ChatGPT auth. Do not use `OPENAI_API_KEY` for that
gate, and report a missing ChatGPT-auth capability as a skip rather than proof
of provider integration.

Finally, inspect the complete packaged and signed application rather than only
the development build.

## Out of scope

- User-supplied or product-supplied reference recordings
- Voice cloning, enrollment, conversion, or a voice marketplace
- Multiple local voices or role-specific voices
- A product voice catalog or voice-selection settings
- Chatterbox Flash, Nano, original 500M, Multilingual V3, or language packs
- Product-facing paralinguistic controls
- Kokoro, Pocket TTS, Piper, or a second local TTS engine
- A runtime downloader or updater for the required base pack
- Wake-word detection
- Changing whether microphone input cancels the active agent turn
- Replacing Whisper transcription
- A compatibility migration for unreleased provider or voice settings

## Definition of done

- A clean installed application speaks offline through the bundled Chatterbox
  Turbo pack without setup.
- Director and narrator speech use Chatterbox's official built-in conditioning.
- The product contains no voice catalog, voice selector, voice allocation, or
  durable voice ID.
- The installed application contains no `conds.pt`, speech encoder, reference
  audio, Python, PyTorch, or voice-cloning path.
- Local Whisper and local Chatterbox can be selected independently.
- Long utterances begin after the first coherent clause and continue without
  audible seams or unbounded buffering.
- Stop and barge-in clear audible speech immediately.
- A crashed inference process is contained and recovered without exposing
  internal errors.
- Every local clause passes through the selected PerTh watermark stage, and
  verification demonstrates detection through the production audio path.
- Raw source text cannot activate Chatterbox control tags.
- Cloud output occurs only after explicit selection and uses one
  adapter-private voice.
- Product contracts and generated TypeScript contain no product voice catalog
  or voice-selection state.
- The repository contains no Apple speech synthesis implementation or hidden
  fallback.
- The distributed graphs, external data, tokenizer, derived conditioning,
  runtime, and watermark assets have a complete pinned manifest and license
  inventory.
- Before/after performance and listening evidence is recorded append-only.
- When requested, deterministic production-path Electron verification passes
  with temporary app data.

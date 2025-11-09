# Data Type Representation Plan

## Vocabulary
- **Live runtime**: Listener workflows running in-process with realtime deltas.
- **Packaged runtime**: Generated Python scripts executed after a snapshot is written to disk.

## Current Pipeline
- `DependencyGraph` exports callable and structured sections into a typed dependency graph (instances of `BaseDependencyKeyUnion`) and assigns sanitized attribute names (`backend/setta/code_gen/dependency_graph.py`).
- `PythonCodeGenerator` walks that graph and serializes node values through `PythonValueCodec`, yielding assignable literals for the generated `S` class (`backend/setta/code_gen/python/generate_code.py`, `backend/setta/code_gen/value_codec.py`).
- Realtime events reuse the same graph: the frontend emits `ListenerRealtimeDelta` with structured dependency-key union values, the backend forwards the payload, and `SettaListener` updates its cached `S` instance by replacing the node value and re-evaluating the canonical expression (`backend/setta/api/listener.py`).
- Packaged scripts reuse the generator instance created during snapshot updates (`backend/setta/project_state/base_project_manager.py`, `setta_files/code/**/setta_gen.py`), so both runtimes currently share identical literal representations.

## Dependency Key Typing
- `BaseDependencyKey` is now the canonical dataclass for dependency identifiers, and every graph node is either a `SectionDependencyKey` or `SectionParamDependencyKey` instance capturing section/code-object ids with a deterministic `type` discriminator (`backend/setta/types/dependency_key.py`).
- `BaseDependencyKeyUnion` and `BaseDependencyKeyUnionWithDiscriminator` (generated in `backend/setta/types/generated/dependency_keys.py`) wrap those dataclasses for serialization, provide a `BaseDependencyKeyTypeAdapter`, and ensure websocket/listener APIs can cheaply validate payloads.
- TypeScript receives the same discriminated union via Zod schemas in `frontend/src/utils/generatedTypes.ts`, so listener coverage, realtime deltas, and generated endpoint clients share the exact dependency-key surface area without ad-hoc string manipulation.
- Future dependency-value work in this plan can assume every dependency reference already carries a structured `type` field, allowing new runtime modes or codecs to branch on dependency kind without bolting on extra metadata channels.

## Pain Points
- Non-param sections (`Draw`, `Image`, `Chart`, potential "environment variable" sections) are excluded from the dependency graph, so they cannot emit or receive realtime deltas.
- Node values only carry literal payloads today; there is still no metadata about artifacts/blobs, so richer transports cannot differentiate themselves.
- Dependency values are now typed, but we still treat every payload as a literal string in practice—no base64/file streaming yet.
- Naming is tuned for `sectionId/paramId`. More granular artifacts (draw layers, environment keys) lack a deterministic mapping.
- Packaged scripts and live runtime likely need diverging IO strategies (e.g. write PNG to disk for packaged, stream base64 for live), but the generator has no notion of runtime mode.

## Proposed Model
### 1. Structured Dependency Values **(backend + frontend literal unions shipped)**
- ✅ Graph nodes and listener/runtime code now store instances of the typed dataclasses in `setta.types.dependency_value` (`LiteralDependencyValue`, `Base64DependencyValue`, `FileReadDependencyValue`) with a shared `DependencyValueType` discriminator.
- ✅ Generated Pydantic/TypeAdapter + Zod unions wrap those dataclasses, so websocket payloads and listener deltas validate the same schema (`payload` + `type`).
- Remaining work: extend the dataclasses with richer metadata when we add non-literal transports (artifact hashes, blob sizes, etc.) and introduce factory/helpers so callers don’t re-create `LiteralDependencyValue(...)` everywhere.
- Draw/Image/Chart exporters should still promote specialized types once their payload formats are defined.

### 2. Mode-Aware Codec
- Extend `PythonValueCodec` with a `PythonValueMode` enum (`LIVE_RUNTIME`, `PACKAGED_RUNTIME` for now).
- For `type="Literal"`, preserve existing behavior.
- For richer kinds, select the correct representation per mode:
  - `LIVE_RUNTIME`: return expressions that can be `literal_eval`'d directly (e.g. inline base64 dict).
  - `PACKAGED_RUNTIME`: emit helper invocations or lazy loaders that materialize files on disk before returning usable objects (e.g. `load_png("path/to/file.png")`).
- Allow the listener to request `LIVE_RUNTIME`; packaged code generation defaults to `PACKAGED_RUNTIME`.

### 3. Broader Graph Coverage
- Add a small registry for section exporters so each section type declares how it contributes nodes. *(Registry now wired in `DependencyGraph`; extend coverage to remaining sections.)*
- Register exporters for `DrawSectionImpl`, `ImageSectionImpl`, `ChartSectionImpl`, `TextBlockSectionImpl` (for markdown/file-backed content), and future environment-style sections. Dict sections with `isJsonSource=True` already flow through the Dict exporter; consider layering specialized handling only if we introduce file-backed logic. *(Backend exporters for TextBlock/Draw shipped; Image/Chart/env pending.)*
- Export granular nodes (e.g. `drawCanvas__render_png`, `drawCanvas__layers__0`) by leveraging `create_unique_name` to stay collision-safe.
- Ensure dependency-key union names remain stable between front/back ends; extend coverage snapshots to include new nodes.

### 4. Realtime Delta Schema **(Python + TS unions enforced)**
- ✅ `ListenerRealtimeDelta.value` and websocket realtime UI changes now require `BaseDependencyValueUnion` on both Python and TypeScript sides; frontend emitters wrap literals before sending.
- Future variants (draw layers, chart data, json sources) should extend the same union and ship through the existing code paths.
- Listener scripts have been updated/tests regenerated to consume the new structure; we should keep them in sync when new variants arrive.

### 5. IO Strategy Alignment
- Live runtime: continue sending base64/inline payloads, optionally batching deltas for throughput.
- Packaged runtime: decide whether to materialize artifacts during code generation (write files under `setta_files/artifacts/`) or lazily at runtime (emit helper functions that decode base64 to disk on first access).
- Store artifact metadata alongside dependency nodes so both runtimes have consistent hashes and can detect staleness.

### 6. JSON Sources & Environment Variables
- Dict sections with `isJsonSource=True` currently behave like any other Dict section. Decide whether packaged runtime should reference the persisted JSON file directly or continue embedding literals; live runtime could still stream inline JSON or diffs.
- Environment variables (future section) can emit `kind="env_var"` with optional scoping hints. Consider allowing packaged runtime to read from `.env` or OS environment while live runtime uses in-memory overrides.

## Implementation Roadmap
1. **Scaffold value types** *(DONE – backend stores typed dependency values and threads `PythonValueMode`)*
   - Introduce `DependencyValue` and `PythonValueMode`.
   - Adapt `PythonCodeGenerator` and `SettaListener` to consume the new structure while preserving current behavior for literals.
2. **Graph exporter registry** *(backend registry + TextBlock/Draw exporters complete; tests + remaining section types outstanding)*
   - Refactor `DependencyGraph` exports into per-section hooks. *(Done.)*
   - Add exporters for `TextBlock` and `Draw` to validate naming and listener flow. *(Done; add regression coverage.)*
3. **Realtime schema upgrade** *(DONE – discriminated unions live in Python + TS, emitters/tests updated)*
   - `ListenerRealtimeDelta`/`RealtimeUIChange` now use `BaseDependencyValueUnion`.
   - Frontend emission, backend validation, and unit tests were all updated to the new schema.
4. **Mode-specific rendering**
   - Teach the codec how to emit draw/image payloads differently per mode.
   - Provide helper utilities for packaged runtime (e.g. `write_base64_png`).
5. **Artifact harmonization**
   - Ensure artifact watcher updates keep the dependency cache in sync.
   - Document artifact lifecycle for both runtimes.
6. **Expand to additional types**
   - Repeat for charts, json sources, environment variables, and other complex sections.
   - Capture doc + tests before exposing new realtime dependencies in the UI.

## Testing & Tooling
- Extend listener integration tests with structured payload cases.
- Add unit coverage for the codec to ensure mode outputs remain stable.
- Gate frontend emission behind coverage snapshots to avoid flooding when no listeners subscribe.
- Continue running `source activate.sh && ./format_code.sh` before final commits touching Python logic; regenerate TypeScript bindings whenever the union schema changes.

## Open Questions
- How aggressively should we batch draw deltas to balance fidelity vs. websocket load?
- Should packaged runtime emit helper imports (e.g. `from setta.artifacts import load_png`) or inline functions?
- Do we need a datastore for large artifacts (beyond base64) before enabling listener updates?
- For json sources, should packaged runtime read the on-disk file or hydrate the dict literal in memory?
- What safeguards are required when exposing environment variable sections (masking, encryption)?

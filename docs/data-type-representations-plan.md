# Data Type Representation Plan

## Vocabulary
- **Live runtime**: Listener workflows running in-process with realtime deltas.
- **Packaged runtime**: Generated Python scripts executed after a snapshot is written to disk.

## Current Pipeline
- `DependencyGraph` exports callable and structured sections into a `{sectionId, codeObjId}` graph and assigns sanitized attribute names (`backend/setta/code_gen/dependency_graph.py`).
- `PythonCodeGenerator` walks that graph and serializes node values through `PythonValueCodec`, yielding assignable literals for the generated `S` class (`backend/setta/code_gen/python/generate_code.py`, `backend/setta/code_gen/value_codec.py`).
- Realtime events reuse the same graph: the frontend emits `ListenerRealtimeDelta` with structured dependency keys, the backend forwards the payload, and `SettaListener` updates its cached `S` instance by replacing the node value and re-evaluating the canonical expression (`backend/setta/api/listener.py`).
- Packaged scripts reuse the generator instance created during snapshot updates (`backend/setta/project_state/base_project_manager.py`, `setta_files/code/**/setta_gen.py`), so both runtimes currently share identical literal representations.

## Pain Points
- Non-param sections (`Draw`, `Image`, `Chart`, potential "environment variable" sections) are excluded from the dependency graph, so they cannot emit or receive realtime deltas.
- Node values are raw strings, preventing metadata (e.g. base64 blobs vs. artifact paths) and forcing both runtimes to handle content identically.
- `ListenerRealtimeDelta.value` is an untyped `Any`, making it hard to introduce richer payloads without risking breakage.
- Naming is tuned for `sectionId/paramId`. More granular artifacts (draw layers, environment keys) lack a deterministic mapping.
- Packaged scripts and live runtime likely need diverging IO strategies (e.g. write PNG to disk for packaged, stream base64 for live), but the generator has no notion of runtime mode.

## Proposed Model
### 1. Structured Dependency Values
- Introduce a lightweight `DependencyValue` dataclass (or Pydantic model) that wraps:
  - `kind`: literal identifier (e.g. `literal`, `draw_layer`, `json_source`, `env_var`).
  - `payload`: canonical string/expression used by current generator.
  - Optional metadata (artifact paths, hashes, compression info).
- Param nodes emit `{"kind": "literal", "payload": node.value}`.
- Draw/Image/Chart exporters populate richer kinds (`draw_layer` with base64 or artifact references).

### 2. Mode-Aware Codec
- Extend `PythonValueCodec` with a `PythonValueMode` enum (`LIVE_RUNTIME`, `PACKAGED_RUNTIME`, `TEST`).
- For `kind="literal"`, preserve existing behavior.
- For richer kinds, select the correct representation per mode:
  - `LIVE_RUNTIME`: return expressions that can be `literal_eval`'d directly (e.g. inline base64 dict).
  - `PACKAGED_RUNTIME`: emit helper invocations or lazy loaders that materialize files on disk before returning usable objects (e.g. `load_png("path/to/file.png")`).
- Allow the listener to request `LIVE_RUNTIME`; packaged code generation defaults to `PACKAGED_RUNTIME`.

### 3. Broader Graph Coverage
- Add a small registry for section exporters so each section type declares how it contributes nodes.
- Register exporters for `DrawSectionImpl`, `ImageSectionImpl`, `ChartSectionImpl`, `TextBlockSectionImpl` (for markdown/file-backed content), and future environment-style sections. Dict sections with `isJsonSource=True` already flow through the Dict exporter; consider layering specialized handling only if we introduce file-backed logic.
- Export granular nodes (e.g. `drawCanvas__render_png`, `drawCanvas__layers__0`) by leveraging `create_unique_name` to stay collision-safe.
- Ensure `ListenerDependencyKey` names remain stable between front/back ends; extend coverage snapshots to include new nodes.

### 4. Realtime Delta Schema
- Replace the plain `value: Any` field with a `ListenerRealtimeValue` union:
  - Variant `Literal` containing the existing string.
  - Variant(s) for draw layers, chart data, json sources, etc.
- Update frontend emitters to serialize the correct variant when dispatching draw or json updates.
- Drop support for raw string payloads; listener scripts must upgrade alongside the backend/frontend changes.

### 5. IO Strategy Alignment
- Live runtime: continue sending base64/inline payloads, optionally batching deltas for throughput.
- Packaged runtime: decide whether to materialize artifacts during code generation (write files under `setta_files/artifacts/`) or lazily at runtime (emit helper functions that decode base64 to disk on first access).
- Store artifact metadata alongside dependency nodes so both runtimes have consistent hashes and can detect staleness.

### 6. JSON Sources & Environment Variables
- Dict sections with `isJsonSource=True` currently behave like any other Dict section. Decide whether packaged runtime should reference the persisted JSON file directly or continue embedding literals; live runtime could still stream inline JSON or diffs.
- Environment variables (future section) can emit `kind="env_var"` with optional scoping hints. Consider allowing packaged runtime to read from `.env` or OS environment while live runtime uses in-memory overrides.

## Implementation Roadmap
1. **Scaffold value types**
   - Introduce `DependencyValue` and `PythonValueMode`.
   - Adapt `PythonCodeGenerator` and `SettaListener` to consume the new structure while preserving current behavior for literals.
2. **Graph exporter registry**
   - Refactor `DependencyGraph` exports into per-section hooks.
   - Add exporters for `TextBlock` and `Draw` to validate naming and listener flow.
3. **Realtime schema upgrade**
   - Define `ListenerRealtimeValue` union (Python + generated TS).
   - Adjust frontend emission and backend validation.
   - Update tests (`tests/setta/api/test_listener_realtime.py`, websocket integration suites) for the new schema.
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

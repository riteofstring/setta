# Project State Summary Proposal

## Problem
- `get_latest_project_state` always returns a full `ProjectStateSingleConfig`, which mirrors the websocket payload sent to the UI.
- That snapshot contains every section/core/variant/impl plus YAML dumps, decoded-image requirements, and computed maps (parent links, shown params, gen-code bindings, etc.).
- When the method is invoked through the MCP init tool, the payload can span thousands of tokens even if an agent only needs project metadata, section IDs, or code binding hints. This makes the tool expensive and noisy for LLM workflows.

## Proposed API Changes
- Extend `GetLatestProjectStateRequest` with an optional `summaryOnly: bool = False`.
- When `summaryOnly` is `False` (default), the route/tool behaves exactly as today so the UI keeps consuming the full snapshot.
- When `True`, `BaseProjectManager.get_latest_project_state` still materializes the canonical `ProjectStateSingleConfig` (so all validators run), but the response also includes a lightweight `ProjectStateSummary` object. MCP clients can ignore the heavy `projectState` blob and read only the summary fields. Longer term we can allow the backend to skip serializing the full state entirely if the caller only asks for a summary, but keeping both initially avoids breaking contract assumptions elsewhere.

## Summary Payload Shape
The summary is intentionally high-level. It should include:

### Project Metadata
- `projectConfig` fields (id, name, viewport, autosave flags, `sectionVariantMap`, `topLevelSections`, `activeIds`, etc.).
- Whether a project is the default and any rename-refactor/autosave settings that influence downstream behavior.

### Sections & Layout
- For every section reachable from `projectConfig.topLevelSections`:
  - Core id/name, current variant id/name, section type (from the active impl), parent id, and ordered child ids.
  - Layout hints pulled from `topLevelSections` plus minimized/visibility flags from shared modifiers.
  - Lightweight status bits (frozen, singleton membership, hide params) without embedding full modifier blobs or implementation internals.

### Parameter & Code Object Info
- For sections that inherit `BaseSectionWithParamsImpl`:
  - Top-level parameter ids/names/types (derive via `get_top_level_param_ids`) and whether they are pinned/selected/hidden.
  - `CodeObjType` and `passingStyle` per parameter, with truncated `value` previews for textual params.

### Code & Artifact Bindings
- Canonical `CodeFileBinding` paths and access modes for sections/code objects that own files (the values already computed in `validate_code_file_bindings`).
- Artifact references: `imagePath`, `chart.dataPath`, draw-layer asset paths, and the `requiredDecodedImages` list so the LLM knows which disk assets exist.

### Derived Maps
- `singletonSections`, `parentSectionMap`, `shownParamIds` (only keys, not the entire param hierarchy), and the set of variant ids that own `yamlValues`.

These components give an agent enough context to plan edits (IDs, layout, code locations, asset references) without dumping every field.

## Implementation Notes
- Add a helper like `build_project_state_summary(project_state: ProjectStateSingleConfig) -> ProjectStateSummary` near `convert_backend_to_single_config` so it can reuse existing traversal utilities.
- Define `ProjectStateSummary` (and nested summary dataclasses) alongside `ProjectStateSingleConfigWithCompletedOpIds` so both REST and MCP schemas stay aligned.
- `route_get_latest_project_state` continues returning `ProjectStateSingleConfigWithCompletedOpIds`, but the dataclass/pydantic model gains an optional `projectStateSummary` field populated when `summaryOnly=True`.
- MCP tool consumers can opt into the summary immediately since the generated schema will now document the flag and extra response field.
- Future optimization: if `summaryOnly` is true, allow the backend to skip serializing the full snapshot over the network (e.g., return `projectState=None`). For now, keeping both avoids surprises for any caller that still expects `projectState`.

## Why This Helps
- Dramatically reduces the default MCP token footprint while still giving LLMs actionable project context.
- Keeps REST/websocket payloads backward compatible.
- Encourages richer summaries tailored to automation workflows without touching the authoritative state format broadcast to browsers and listeners.


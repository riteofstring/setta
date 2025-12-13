# Project State Summary Proposal

## Problem
- `get_latest_project_state` always returns a full `ProjectStateSingleConfig`, which mirrors the websocket payload sent to the UI.
- That snapshot contains every section/core/variant/impl plus YAML dumps, decoded-image requirements, and computed maps (parent links, shown params, gen-code bindings, etc.).
- When the method is invoked through the MCP init tool, the payload can span thousands of tokens even if an agent only needs project metadata, section IDs, or code binding hints. This makes the tool expensive and noisy for LLM workflows.

## Proposed API Changes
- Add a dedicated `GetLatestProjectStateSummaryRequest` plus a matching `get_latest_project_state_summary` MCP tool.
- The existing `get_latest_project_state` keeps returning the full `ProjectStateSingleConfig` for the UI and websocket mirrors.
- Agents that only need high-level context call the new summary tool instead of passing flags; it returns a `ProjectStateSummary` object only.

## Summary Payload Shape
The summary is intentionally high-level. It should include:

### Project Metadata
- `projectConfig` fields (id, name, viewport, `sectionVariantMap`, `topLevelSections`, `activeIds`, etc.).

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
- Define `ProjectStateSummary` (and nested summary dataclasses) in a dedicated module so REST/MCP schemas can import them without bloating `ProjectStateSingleConfigWithCompletedOpIds`.
- `route_get_latest_project_state` continues returning `ProjectStateSingleConfigWithCompletedOpIds`; the new tool simply calls `build_project_state_summary` after materializing the same single-config view.
- MCP tool consumers opt into the summary by calling the new tool, avoiding transport bloat on the canonical snapshot path.
- Future optimization: the summary tool could avoid serializing the entire single-config blob once we have confidence no other validators rely on the intermediate object.

## Why This Helps
- Dramatically reduces the default MCP token footprint while still giving LLMs actionable project context.
- Keeps REST/websocket payloads backward compatible.
- Encourages richer summaries tailored to automation workflows without touching the authoritative state format broadcast to browsers and listeners.

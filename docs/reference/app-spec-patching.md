# App Spec Patching

Setta currently supports two ways to update an App's `appSpec`/`appDefinition`.
They exist for different workflows:

## 1) Persistent Updates: JSON Merge Patch

Used by:

- `BaseProjectManager.update_app_definition()` (`backend/setta/project_state/base_project_manager.py`)

This applies a **JSON Merge Patch** to the stored app definition/spec. Use this
for non-streaming, persisted edits (for example: "set this one field" or "apply
this config change").

## 2) Streaming Preview / Generation: JSONL JSON-Pointer Patch Ops

Used by:

- `/api/streamAppSpec` (`backend/setta/routers/app_spec_streaming.py`)
- `setta__stream_app_definition` (`backend/setta/mcp/tools/app_tools.py`)

This consumes **newline-delimited JSON (JSONL)** where each line is an operation
using JSON Pointer paths (for example: `{"op":"set","path":"/elements/foo", ...}`).

This format is designed for progressive UI updates while a model is generating a
spec, and matches the expectations of streaming UI contracts (for example
`@json-render/react`'s `useUIStream`).

### Patch Op Semantics (Important)

- `Spec.root` is a string; the empty/rootless spec is represented as `""`.
- Nested element patches like `/elements/<key>/props/...` require the element to
  already exist. Only `/elements/<key>` may create a new element (as a full
  element object).

## When To Use Which

- Use **JSON Merge Patch** when you want to persist small, targeted changes.
- Use **JSONL patch ops** when you want streaming preview while generating or
  incrementally constructing a spec.

## Validation On Persistent Updates

Persistent app-definition updates now run route validation as part of payload
validation (`setta.app.definition_diagnostics` and
`BaseProjectManager.update_app_definition` / `merge_app_spec_patch`).

Route validation covers:
- path normalization warnings (missing leading `/`, trailing `/`)
- duplicate route path errors after normalization
- missing/blank route `name` warnings
- `rootKey` existence checks against `appSpec.elements` (error if missing)

Persistent update routes fail fast on route errors (HTTP 400 via
`ValueError`), so invalid route payloads are rejected before they are written
to disk.

If/when these converge in the future, this doc should be updated to reflect the
single canonical patch format.

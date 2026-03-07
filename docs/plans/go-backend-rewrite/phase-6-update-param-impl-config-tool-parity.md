# Phase 6 Update Param Impl Config Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`change_param_impl` MCP parity work.

Go already owns:

- scoped MCP invocation with metadata-driven `section` and `codeObj` targeting
- Go-owned param rename/value writes through `set_param_name_and_value`
- Go-owned callable selection plus param refetch through `set_callable`
- Go-owned param creation through `add_kwarg`
- Go-owned param impl switching through `change_param_impl`

The remaining gap in this param-editing cluster is updating the active impl's
config fields without falling back to Python-side orchestration.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `update_param_impl_config` through `internal/projectstate` and MCP
- impl config writes now use explicit per-type field parsing and validation
- config-sensitive value normalization now stays on the Go-owned source-of-truth
  path after config updates

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for `update_param_impl_config`
- explicit field allowlists and value normalization for supported impl types:
  - base impl metadata:
    - `description`
  - `TextParam`:
    - `uiType`
  - `DateParam`:
    - `dateDisplayFormat`
    - `dateControlMode`
    - `dateSelectionMode`
    - `dateCalendarWeekStart`
    - `dateIncludesTime`
  - `TimeParam`:
    - `timeControlMode`
    - `timeDisplayFormat`
    - `timeDisplayTransparent`
    - `timeDisplayScale`
    - `timeDisplayFont`
  - `ButtonParam`:
    - `label`
    - `actionMode`
    - `requestMethod`
    - `requestUrl`
    - `requestHeaderKey`
    - `requestHeaderValue`
    - `requestBody`
  - `SliderParam` and `RotaryParam`:
    - `min`
    - `max`
    - `step`
  - `ColorPickerParam`:
    - `colorChoices`
  - `DropdownParam`:
    - `choices`
  - `DropzoneParam`:
    - `mode`
    - `maxAttachments`
    - `placeholder`
- follow-up value normalization after config changes using the same Go-owned
  value-conversion path used by impl switching and direct param writes
- a Go MCP `update_param_impl_config` write tool
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage for:
  - scalar config updates
  - list/object config updates
  - unknown-field rejection
  - dropzone value normalization after config changes
  - slider/rotary clamping after range changes
  - scoped allow/deny behavior
  - temp-id argument translation

## Non-Goals

- full legacy IDE HTTP route migration for `/updateParamImplConfig`
- generic map passthrough of arbitrary impl fields
- pulling in Python user-default settings machinery
- non-param code-object impl config mutation

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-change-param-impl-tool-parity.md`
- `docs/reference/meta-controls.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/types/code_obj_impls.py`
- `tests/types/test_helpers_lvl2.py`
- `tests/types/test_text_param_time_control_mode.py`
- `frontend/src/state/hooks/uiTypes.ts`
- `frontend/src/components/Panes/UiEditor/UIConfig/applyUiTypeComboboxSelection.ts`
- `frontend/src/components/Panes/UiEditor/QuickInfoConfig/QuickInfoConfig.tsx`
- `frontend/src/components/Params/ParamUIs/*.tsx`
- `internal/projectstate/change_param_impl.go`
- `internal/projectstate/code_object_writes.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice should not be implemented as a generic `map[string]any` write into
project state.

Python currently mutates arbitrary fields and then runs
`maybe_convert_code_obj_value(...)`, but the Go rewrite should keep config
mutation explicit:

1. transport should not decide which impl fields are legal
2. project-state should own per-type field allowlists and coercion
3. follow-up value normalization must stay on the same source-of-truth path used
   by `change_param_impl` and `set_param_entered_value`

The highest-leverage move is therefore:

- add one explicit Go config-mutation owner in `internal/projectstate`
- keep per-type field support enumerated in Go code
- reject unsupported or malformed config fields loudly
- expose the owner through MCP with the existing scoped section/code-object
  targeting metadata

## Working Decisions

- keep impl config mutation authoritative in `internal/projectstate`
  - MCP should call one Go runtime owner directly
  - do not rewrite config payloads in transport code
- reject unknown fields explicitly
  - do not silently drop unexpected keys
  - do not accept config writes for unrelated impl families
- normalize incoming JSON numbers, booleans, strings, string lists, and color
  choice objects through explicit helpers
- preserve the current Go storage layering
  - write through `setSectionCodeObjectField`
  - keep shared/non-preset/variant handling in project-state
- reuse the Go-owned value conversion path after config updates
  - config changes that invalidate current values should deterministically
    normalize them
- keep the transport layer thin
  - MCP validates arguments, enforces scope, and returns structured status
  - project-state owns semantics

## Implementation Outline

1. Add the bounded project-state owner.
   - resolve the targeted param impl
   - apply explicit per-type config field updates
   - reject unsupported fields and malformed values
   - run follow-up value normalization after the config write

2. Extend value normalization helpers where required.
   - reuse or slightly widen the existing conversion helpers for slider, rotary,
     dropzone, color-picker, and related config-sensitive types

3. Wire the MCP write tool.
   - register `update_param_impl_config`
   - use `sectionId` plus `paramInfoId` metadata targeting for scope and temp-id
     translation

4. Add focused tests.
   - project-state tests for supported fields, unknown-field rejection, and
     config-driven value normalization
   - MCP server tests for metadata, allowed/blocked writes, and temp-id
     translation
   - authenticated HTTP/app tests for scoped invocation and post-switch config
     mutation flows

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsScopedWriteMutationOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsOverAuthenticatedSSE|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient|TestAppIDEMCPToolCallRouteSupportsScopedWriteMutation' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- `delete_kwarg` has now landed to close the single-param deletion gap in this
  param-editing cluster
- the next bounded follow-on should be inventory work for the remaining
  Python-owned MCP mutation gaps

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with a Go-owned `update_param_impl_config`
  owner, explicit per-type field validation, config-sensitive value
  normalization for slider/rotary/dropzone/color-picker/date flows, MCP
  registration, and authenticated HTTP/app coverage.

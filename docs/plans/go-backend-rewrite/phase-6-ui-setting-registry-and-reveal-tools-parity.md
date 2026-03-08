# Phase 6 UI Setting Registry And Reveal Tools Parity

## Purpose

This doc scopes the next Phase 6 slice after the completed `run_agent_profile`
transport work.

The goal is to rebuild the missing Go-owned UI-setting runtime that sits behind
Python’s `search_ui_settings`, `get_ui_setting_value`, `set_ui_setting_value`,
and `reveal_ui_setting` tools, without broadening into plugin package
management or app patch streaming.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- `run_agent_profile` is now complete in Go
- the remaining non-project-state Python MCP gap count is 11
- four of those remaining tools sit behind the Python UI-setting subsystem
- Go only owns the bounded compare-and-set project-state subset for
  `core.project.show_param_display_names`,
  `core.watch_code.enabled`,
  `core.watch_code.folders`, and
  `core.watch_code.files`
- Go does not yet own the broader UI-setting registry, typed value-schema
  validation, app-definition/core-setting registry metadata, plugin setting
  integration, or frontend reveal coordinator

## Scope

This plan should cover the next bounded execution path for:

- `search_ui_settings`
- `get_ui_setting_value`
- `set_ui_setting_value`
- `reveal_ui_setting`

The recommended staged implementation is:

1. Core registry foundation
   - define Go-owned UI-setting metadata models and registry assembly for the
     core settings only
   - wire source-of-truth read/write delegates into the completed project-state
     compare-and-set owners and completed app-definition owners
   - keep plugin-contributed settings out of the first slice

2. Core search/read/write MCP parity
   - land `search_ui_settings`, `get_ui_setting_value`, and
     `set_ui_setting_value` over the completed registry
   - enforce explicit value-schema validation and stale-write protection using
     the Go-owned compare-and-set/runtime owners instead of transport heuristics

3. Reveal runtime and parity
   - add a Go-owned reveal coordinator over the existing realtime/frontend
     transport
   - land `reveal_ui_setting` and `revealAfterSet` behavior only after the
     registry and core write owners exist

4. Plugin setting follow-on
   - add plugin-contributed registry entries only after core parity lands and
     the plugin runtime exposes deterministic source-of-truth setting metadata

## Non-Goals

- plugin install/update/remove MCP parity
- app-definition patch streaming
- reintroducing Python UI-setting registry logic inside Go handlers
- heuristic setting discovery or keyword-only reveal routing
- broad plugin-setting support before the core registry is stable

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/plans/go-backend-rewrite/phase-6-compare-and-set-ui-setting-tools-parity.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tools/ui_settings.py`
- `backend/setta/ui_settings/models.py`
- `backend/setta/ui_settings/registry.py`
- `backend/setta/ui_settings/reveal_coordinator.py`
- `backend/setta/ui_settings/reveal_result_hub.py`
- `backend/setta/mcp/ui_settings_context.py`
- `tests/mcp/test_ui_setting_tools.py`
- `tests/routers/test_mcp_tools_call_agentic_scope_enforcement.py`
- `internal/projectstate/ui_settings_compare_and_set.go`
- `internal/mcpx/server.go`
- `internal/realtime/*`

## Current Python Behavior

1. `search_ui_settings`
   - builds a canonical registry for core plus plugin settings
   - ranks entries by query against setting ids, titles, descriptions, and
     synonyms
   - supports `sourceFilter` across `core`, `plugin`, and `all`

2. `get_ui_setting_value`
   - resolves a canonical setting id against the registry
   - reads the current value from a setting-specific runtime delegate
   - validates the returned value against the setting’s declared schema
   - returns typed structured errors for missing settings, plugin failures, and
     invalid persisted values

3. `set_ui_setting_value`
   - enforces writable/read-only semantics from registry metadata
   - validates proposed values against each setting’s `valueSchema`
   - uses compare-and-set style writes with `expected_old_value` to avoid stale
     clobbers
   - optionally reveals the affected control after a successful write

4. `reveal_ui_setting`
   - resolves the UI location, activation steps, and highlight strategy for a
     setting
   - dispatches a websocket `UISettingReveal` message to a chosen frontend
   - waits for a correlated frontend acknowledgement and fails closed on
     ambiguity, disconnects, or contract mismatches

## Working Decisions

- keep transport thin and move registry, validation, and reveal behavior into
  explicit Go runtime owners
- treat the compare-and-set project-state owners as reusable building blocks,
  not as the complete UI-setting subsystem
- start with core settings whose source-of-truth owners already exist in Go
- do not implement plugin setting support until the plugin runtime exposes a
  deterministic metadata source of truth
- do not implement reveal routing with best-effort heuristics; it needs an
  explicit coordinator and acknowledgement pathway

## Dependency Status

Already complete:

- compare-and-set owners for the first bounded core UI settings
- project-state and app-definition runtime owners for the initial core setting
  value sources
- authenticated MCP transport, scoped/unscoped tool harnesses, and realtime
  plumbing needed by a later reveal coordinator

Still missing:

- Go-owned UI-setting metadata models and registry builder
- typed value-schema validator shared by read/write pathways
- reveal result hub/coordinator over Go realtime ownership
- deterministic plugin UI-setting metadata source

## Open Questions

- whether the first execution slice should stop after core search/get/set or
  include reveal in the same PR; current recommendation is to land the core
  registry and read/write parity first, then add reveal on top once the setting
  metadata surface is stable
- whether app-definition-backed core settings should write through the existing
  document-level owners or a UI-setting-specific facade; current recommendation
  is to keep the existing owners as the source of truth and add only a thin
  registry delegate layer

## Next Recommended Step

- start with the Stage 1 core registry foundation above the completed
  compare-and-set and app-definition owners

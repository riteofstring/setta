# MCP Application-State Tool Rollout Plan

This document captures the concrete plan for exposing deterministic MCP tools that can mutate Setta project state and code files. The goal is to lean entirely on the existing project-manager infrastructure, provide the metadata LLMs need, and unlock the write primitives described in `docs/ai-chat-refactor-plan.md`. Breaking the app during the refactor is expected and acceptable.

## 1. Thread Chat Context Into MCP Dispatch
- ✅ **Persist project context** – Extend `backend/setta/types/chat.py` and `project_state/chats/save.py` so each chat stores the active `projectConfigId` (later: section metadata). This gives future tool invocations the context called out as “missing” in the refactor doc. Frontend submitters and `route_get_llm_response` now always include the config id.
- ✅ **Propagate from frontend** – Update the AI routes (`backend/setta/routers/ai.py`) plus the frontend submitters (`frontend/src/state/actions/ai.ts`, `ProjectChatCore.tsx`) to send the config id with every `route_get_llm_response` call.
- ✅ **Explicit MCP parameters** – `_dispatch_tool_call` no longer auto-injects `projectConfigId`; MCP tools receive exactly what the caller supplies, keeping context handling explicit as we prepare richer metadata attachments.

## 2. Build a Project-State MCP Tool Registry
- ✅ **Decorator-driven helper** – `backend/setta/mcp/tools/project_state_registry.py` now exposes `@project_state_tool`, which inspects the manager coroutine’s request model and immediately registers a generated MCP wrapper via `setta_tool`/`setta_init_tool`. Tool metadata (docstrings, schemas) stays co-located with the original method.
- ✅ **Validation + invocation** – Generated wrappers validate args through the existing Pydantic request models, fetch the correct manager via `setta_state.project_manager_switcher.get(request.projectConfigId)`, and call the original coroutine so HTTP + MCP behavior stays identical.
- ✅ **Signature shaping** – The helper synthesizes a signature from the request model fields (plus the injected `setta_state`) so LLM-facing schemas mirror the REST routes without extra boilerplate. No manual registry tables remain—decorating a method is all that’s needed.

## 3. Implement Deterministic File-Edit Primitives
- **Editing library** – Introduce helpers under `backend/setta/mcp/file_edits/` that wrap `DBE.get_file_lock`, `setta.database.backup.maybe_create_backup`, and path normalization (`setta.utils.utils.normalize_path`). Provide primitives such as `read_for_edit`, `replace_range`, `insert_at_line`, `apply_unified_diff`, and `write_full_file`.
- **Tool contracts** – Each helper/tool must:
  - Accept workspace-relative paths and operate on UTF-8 text (mirroring `read_file_range` in `backend/setta/mcp/tools/file_read.py`).
  - Emit before/after hashes and the final content so LLMs can detect conflicts.
  - Return structured error payloads instead of raw exceptions, aligning with `ToolError` behavior.
  - Notify `SettaFastAPIState.code_files` (see `backend/setta/project_state/code_files.py`) when tracked files change so watcher metadata stays accurate.
- **Tool registration** – Register these primitives as MCP tools (likely discoverable) in a new `file_write.py` module that depends solely on the helper library, keeping lock/backup logic uniform.

## 4. Expose Project-State Mutations as Tools
- ✅ **Exercise the registry with live managers** – `BaseProjectManager` now decorates real operations across layout (`set_top_level_section_layout`, `set_section_sizes`, `set_viewport`), callable/code edits (`set_callable`, `set_gen_code_prefix`, `set_gen_code_suffix`, `set_param_entered_value`, `set_code_obj_name`, `set_code`, `set_section_param_filter`), section + variant CRUD/toggles (`set_section_variant`, `set_default_section_variant`, `change_param_impl`, `create_top_level_section`, `create_child_sections`, `create_child_sections_via_incrementer`, `delete_sections`, `delete_child_sections_via_decrementer`, `create_new_section_variant`, `add_kwarg`, `delete_kwarg`, `toggle_position_lock`, `toggle_minimized`, `set_section_name`), and exposes the init-only `get_latest_project_state_summary`. The decorators are exercised end-to-end via the MCP server so the bridge mirrors FastAPI behavior.
- **Prioritize core edits** – Remaining high-impact APIs (e.g., `set_code_file_binding`, clipboard flows, rename-refactor approvals, `group_sections`/`ungroup_groups`, JSON-source helpers) still need wrappers so every mutating endpoint is reachable through MCP without duplicating logic.
- **Reuse helpers** – For flows that already rely on helper functions (clipboard operations, rename refactors, etc.), add adapters that reuse the logic in `setta/types/helpers_lvl2.py` and `helpers_lvl3.py` instead of copying it into MCP land.
- **Init vs discoverable** – Decide per tool whether it should always be available (`@setta_init_tool`) or only appear after search (`@setta_tool`). Register through `SettaFastMCP.add_setta_tools()` so the `SettaToolType` annotations remain correct.

## 5. Validation, Telemetry, and Tests
- **Unit coverage** – `tests/mcp/test_mcp_server_registration.py` now proves registry registration/search integration and the chat-manager unlock path. We still need:
  - File-edit primitive coverage (range validation, hash comparisons, structured error emission).
  - Tool-state persistence paths once chat tool lists can be serialized with the chat.
- **ID mapping hygiene (done)** – Tool argument/results persisted with each chat now reuse the canonical→temporary map before serialization, and the conversion helpers handle nested Pydantic payloads so UUIDs stay hidden from the LLM/frontend (`tests/mcp/test_id_conversion.py`).
- **Streaming feedback** – Ensure `LLMChatManager` surfaces concise error summaries when MCP calls fail so the frontend reducer (see `frontend/src/state/actions/ai.ts`) can display actionable tool-result bubbles.
- **Docs** – After landing the scaffolding, update `docs/ai-chat-refactor-plan.md` (and this file) with the actual tool catalog plus usage examples so future contributors follow the same patterns.

This plan keeps the refactor focused: first deliver the missing MCP context, then stand up a registry that reuses existing project-manager logic, add deterministic file-write primitives, and finally expose a broad surface of application-state mutations without duplicating code. Tests and documentation will anchor the new behavior once the refactor stabilizes.

# ID ↔ UUID Mapping Refactor Plan

This note documents how the existing ID/UUID translation works inside the MCP stack and the changes we plan to make so section IDs, code-object IDs, and every other identifier that surfaces to the LLM flows through the same mapper.

## Current Behavior
- `backend/setta/types/ai.py` defines the `ID` type (a `str` subclass) plus the `IDToUUIDForLLM`/`UUIDToIDForLLM` dictionaries.
- The mapping is persisted in `setta_files/uuid_mapping.json` via `DBE.read_uuid_mapping` and `DBE.write_uuid_mapping` (`backend/setta/database/db_objs.py`).
- `SettaFastMCP.setta_uuid_transformer` (`backend/setta/mcp/server.py`) wraps every MCP tool. It:
  - Strips out reserved MCP params, injects `setta_state` when requested, and converts request payloads by calling `replace_ids_with_uuids`.
  - Executes the tool coroutine, validates the declared return type, then runs `replace_uuids_with_ids` to swap UUIDs back to incremental IDs.
  - Writes the updated mapping file (we removed the websocket + `/getUUIDMappingForLLM` REST broadcasts so tooling responses are now the only source of truth).
- The transformer only touches values that are instances of `ID` (see `backend/setta/mcp/utils.py`), so any fields still typed as plain `str` bypass the mapper entirely.

## Problems With the Old Setup
- Project-state models (e.g. `ProjectStateCore.sections`, section parameters, code-object bindings) still declare their keys and identifier fields as `str`. When these models move through the MCP path they keep the underlying UUIDs, because the transformer only sees regular strings.
- Frontend consumers never wired up `WebsocketMsgUUIDMappingForLLM`; the reducer called `updateUUIDMappingForLLM`, but that function vanished, so we deleted the unused broadcast entirely rather than keep broken glue code around.
- `SettaMCPToolError`/legacy helper behavior lingers in `backend/setta/mcp/utils.py`, and docstrings still describe obsolete tuple return shapes.
- Debug prints and ad-hoc `{"error": ...}` responses in the transformer stem from an earlier iteration and do not match the ToolError contract we want for MCP.
- Because the mapping only propagates for `ID`-typed fields, sections/code objects/etc. have no stable human-sized identifiers for LLM-facing workflows.

## Refactor Plan
1. **Propagate `ID` Types Through Project State**
   - Change every identifier in `ProjectStateCore` (and related models) from `str` to `ID`: section dictionaries, code-object keys, dependency references, rename-refactor payloads, etc.
   - Re-run code generation (Python + TypeScript) so REST and MCP schemas both advertise these fields as `ID`.
   - Once types migrate, the MCP transformer automatically rewrites them because Pydantic will emit `ID` instances during validation.
2. **Clean Up the Transformer Layer**
   - Delete dead helpers (`SettaMCPToolError`, the unused tuple-return doc text) and remove the `print` debugging.
   - Convert ID lookup failures into real `ToolError`s so the frontends receive standard MCP error envelopes.
   - Drop the websocket/REST broadcast along with any frontend glue code that tried to keep the old mapping working mid-refactor—we do not need backwards compatibility.
3. **Frontend Follow-Up (Later)**
   - If we ever need explicit ID↔UUID data on the frontend again, we can re-introduce a store-backed workflow (or rely on tool-return payloads). For now, we accept the lack of client-side mapping because the MCP responses already supply the IDs we care about.

## Action Items
- [x] Update project-state Pydantic models (and generated types) so every identifier uses the `ID` type.
- [x] Remove the leftover mapping helpers/doc noise that assume tuple returns or hidden errors.
- [x] Ensure `setta_uuid_transformer` raises MCP-native errors and only logs what we actually need.
- [x] Decide whether the frontend still needs the websocket broadcast once the mapping is automatically handled server-side. (We removed the `/getUUIDMappingForLLM` REST route and the websocket broadcast entirely so MCP responses are the only source of truth.)

With this change, identifiers that matter to MCP (sections, code objects, param references, watcher handles, etc.) will consistently run through the ID ↔ UUID mapper, so the LLM gets stable numeric IDs without us manually touching each schema or endpoint.

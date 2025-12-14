**Websocket Entry Points**
- ✅ `backend/setta/routers/websocket.py:22-91` now wraps every connection with `bind_websocket_logging_context` so handlers inherit `connection_type`/`connection_id`.
- ✅ `backend/setta/routers/terminals.py:38-61` binds the websocket context plus forwards `projectConfigId`/`sectionId`/`client_id` into the spawned read/write tasks. Remaining terminal background loops live under the "Async Task Runners" section below.

**FastAPI BackgroundTasks Hooks**
- `backend/setta/routers/projects.py:93-118` (`route_save_project`) kicks off `state.wmh_frontend_sender.broadcast_notification` via FastAPI `BackgroundTasks`; the notification already includes `projectConfigId`.
- `backend/setta/routers/ai.py:100-125` (`route_get_llm_chat`) enqueues error notifications tied to `projectConfigId` when chats are missing.
- `backend/setta/routers/terminals.py:68-110` uses `BackgroundTasks` for both `route_kill_subprocesses` and `route_run_code`, emitting notifications bound to a project ID and (for `route_run_code`) mirroring CLI output.

**Async Task Runners / Long-Lived Loops**
- `backend/setta/server_state.py:107-224` starts an `_initialization_task`, then spawns async tasks for MCP client connections and LSP startup; each of those should inherit a “boot” context so logs from `connect_to_server` or `start_lsps` are attributable to the boot phase.
- `backend/setta/server.py:67-118` launches `_open_browser_after_startup` via `asyncio.create_task` under the lifespan context; if it errors we currently only see generic warnings.
- ✅ `backend/setta/project_state/base_project_manager.py:255-343` now wraps `_process_queue` and `AsyncDebouncer` with `wrap_background_coroutine`, so queue/autosave logs include the manager name and project metadata.
- `backend/setta/project_state/jsonSource/jsonSource.py:95-171` creates loader tasks whenever watched JSON sources change; the callbacks receive `sectionId`/`variantId` pairs that we can bind to the background-task context.
- ✅ `backend/setta/terminals/terminals.py:43-264` wraps reader loops and run-code tasks via `wrap_background_coroutine`, tagging `projectConfigId`, `sectionId`, and terminal IDs instead of using module loggers. `backend/setta/terminals/run_code.py:15-40` mirrors the same context metadata.
- `backend/setta/routers/terminals.py:49-54` also spawns a write loop per terminal websocket, so we’ll need the wrapper/decorator at this boundary too.
- `backend/setta/llm/llm_chat_manager.py:169-215` launches `process_query` tasks (one per chat) and attaches cleanup callbacks; `chat.id` + `chat.project_config_id` are the identifiers to seed logging with.
- `backend/setta/lsp/reader.py:13-134` starts a `reader_task` per language server and schedules diagnostics callbacks via `asyncio.create_task`; `backend/setta/lsp/writer.py:133-147` queues `fn_call` futures, and `backend/setta/lsp/managers.py:33-52` schedules toast notifications when the LSP initializes.
- `backend/setta/mcp/server.py:70-90` fires a notification task after mounting the MCP server (“MCP Server Ready”); this is another short-lived task we can wrap with `build_background_task_context`.
- `backend/setta/utils/async_debouncer.py:15-55` is a generic helper that creates tasks for delayed work (autosave, etc.); whatever calls `AsyncDebouncer.trigger` should provide the task label/project metadata.
- `backend/setta/api/listener.py:260-297` (listener runtime) creates the hot-reload watcher task, and `backend/setta/websockets/connect.py:32-58` recreates CLI websocket consumers and subprocess runners; when we wire logging helpers here we can expose the listener/CLI IDs.
- `backend/setta/lsp/reader.py:110-156` and `backend/setta/terminals/terminals.py:221-246` also spin read loops that tear down on exceptions; both currently swallow errors with debug logs only.

Binding Helpers
---------------

We will lean on the new utilities under `backend/setta/logging/context_bindings.py` to standardize how each entry point binds context before executing its real work:

1. `bind_websocket_logging_context(websocket, *, websocket_id, project_id, extra_values)` wraps the lifetime of a websocket connection, pulling canonical metadata from the socket and merging per-router identifiers (connection type, CLI/listener ids, etc.).
2. `wrap_background_callable(func, *, label, project_id, request_id, websocket_id, extra_values)` decorates sync/async callables before adding them to FastAPI `BackgroundTasks` or any callback-based scheduler so the task runs inside the appropriate context.
3. `wrap_background_coroutine(coro, *, label, project_id, request_id, websocket_id, extra_values)` produces a coroutine whose awaited body executes with the bound context, letting us wrap `asyncio.create_task` invocations, queue processors, AsyncDebouncer triggers, etc.
4. `bind_background_task_logging_context(**metadata)` is a low-level context manager for long-lived loops that already own their scheduling (e.g., reader/writer loops that `await` forever but still need to stamp each iteration with the project/task label).

Application plan per entry point:

- `backend/setta/routers/websocket.py` – wrap `websocket_route_loop` (and the CLI/listener routers) in `async with bind_websocket_logging_context(..., extra_values={"connection_type": connection_type.value, "connection_id": id})` so every message handler inherits the connection metadata automatically.
- `backend/setta/routers/terminals.py` – wrap `terminal_websocket_endpoint` the same way but pass `extra_values={"section_id": sectionId, "client_id": id}` and feed the same values into the spawned read/write tasks via `wrap_background_coroutine`.
- FastAPI `BackgroundTasks` sites (`projects.py`, `ai.py`, `terminals.py`) – each `background_tasks.add_task` call should be switched to `background_tasks.add_task(wrap_background_callable(..., label="save-notification", project_id=projectConfigId, request_id=current_request_id))` so notifications inherit the originating request/project metadata.
- Async task spawners (`server_state.py`, `server.py`, terminal loops, JSON source watchers, LLM chat manager, LSP reader/writer, MCP server ready hook, AsyncDebouncer, listener hot-reload, CLI websocket reconnect) – whenever we call `asyncio.create_task`/`loop.create_task`, wrap the coroutine with `wrap_background_coroutine(..., label="<descriptive-task>", project_id=..., websocket_id=...)` so those loops stay connected to the originating request/websocket/project.
- Generic loops that cannot easily be wrapped at construction (e.g., `_process_queue` in `base_project_manager`, terminal reader/writer loops) should call `with bind_background_task_logging_context(...):` before entering their `while True` to keep the context alive during each iteration.

Once these helpers are threaded through the entry points above, every websocket handshake and task spawn will stamp `request_id`/`project_id`/`websocket_id` exactly once, eliminating the per-module `logging.getLogger(__name__)` juggling and paving the way for ripping them out in the next refactor step.

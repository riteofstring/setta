**Websocket Entry Points**
- `backend/setta/routers/websocket.py:22-91` exposes `websocket_route_loop` plus the frontend/CLI/python-script routers; each call already knows the `WebsocketConnectionType` and optional `id` so we can bind a logging context once per connection instead of letting each handler pull `logging.getLogger`.
- `backend/setta/routers/terminals.py:38-61` defines `terminal_websocket_endpoint` with explicit `projectConfigId`, `sectionId`, and client `id` path params; those identifiers should seed the websocket logging context (and propagate into the read/write tasks that get spawned from here).

**FastAPI BackgroundTasks Hooks**
- `backend/setta/routers/projects.py:93-118` (`route_save_project`) kicks off `state.wmh_frontend_sender.broadcast_notification` via FastAPI `BackgroundTasks`; the notification already includes `projectConfigId`.
- `backend/setta/routers/ai.py:100-125` (`route_get_llm_chat`) enqueues error notifications tied to `projectConfigId` when chats are missing.
- `backend/setta/routers/terminals.py:68-110` uses `BackgroundTasks` for both `route_kill_subprocesses` and `route_run_code`, emitting notifications bound to a project ID and (for `route_run_code`) mirroring CLI output.

**Async Task Runners / Long-Lived Loops**
- `backend/setta/server_state.py:107-224` starts an `_initialization_task`, then spawns async tasks for MCP client connections and LSP startup; each of those should inherit a “boot” context so logs from `connect_to_server` or `start_lsps` are attributable to the boot phase.
- `backend/setta/server.py:67-118` launches `_open_browser_after_startup` via `asyncio.create_task` under the lifespan context; if it errors we currently only see generic warnings.
- `backend/setta/project_state/base_project_manager.py:255-343` launches `_process_queue` per project manager and manages `frontend_op_id` context; this queue plus helpers like `enqueue_method` are the main background executor for project operations.
- `backend/setta/project_state/jsonSource/jsonSource.py:95-171` creates loader tasks whenever watched JSON sources change; the callbacks receive `sectionId`/`variantId` pairs that we can bind to the background-task context.
- `backend/setta/terminals/terminals.py:43-264` spawns terminal read/write loops (`start_reading_from_terminal`, `write_to_terminal`) and additional tasks via `asyncio.create_task`; every call has access to `projectConfigId`, `sectionId`, and websocket `id` for context binding. `backend/setta/terminals/run_code.py:15-40` similarly fires off `run_command_in_terminal`.
- `backend/setta/routers/terminals.py:49-54` also spawns a write loop per terminal websocket, so we’ll need the wrapper/decorator at this boundary too.
- `backend/setta/llm/llm_chat_manager.py:169-215` launches `process_query` tasks (one per chat) and attaches cleanup callbacks; `chat.id` + `chat.project_config_id` are the identifiers to seed logging with.
- `backend/setta/lsp/reader.py:13-134` starts a `reader_task` per language server and schedules diagnostics callbacks via `asyncio.create_task`; `backend/setta/lsp/writer.py:133-147` queues `fn_call` futures, and `backend/setta/lsp/managers.py:33-52` schedules toast notifications when the LSP initializes.
- `backend/setta/mcp/server.py:70-90` fires a notification task after mounting the MCP server (“MCP Server Ready”); this is another short-lived task we can wrap with `build_background_task_context`.
- `backend/setta/utils/async_debouncer.py:15-55` is a generic helper that creates tasks for delayed work (autosave, etc.); whatever calls `AsyncDebouncer.trigger` should provide the task label/project metadata.
- `backend/setta/api/listener.py:260-297` (listener runtime) creates the hot-reload watcher task, and `backend/setta/websockets/connect.py:32-58` recreates CLI websocket consumers and subprocess runners; when we wire logging helpers here we can expose the listener/CLI IDs.
- `backend/setta/lsp/reader.py:110-156` and `backend/setta/terminals/terminals.py:221-246` also spin read loops that tear down on exceptions; both currently swallow errors with debug logs only.

With the entry points mapped, the next step is to build the websocket/background-task binding helpers and start applying them to the locations above so every spawned task inherits `request_id`/`projectConfigId`/`websocket_id` automatically. Let me know when to proceed with that step.

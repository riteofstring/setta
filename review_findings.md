## Review 1

Findings

- Medium: Share session expiry during an active websocket raises KeyError from touch_session and falls into the generic exception path, which typically closes with 1011 and logs an error. The frontend recovery
logic only triggers on 4400/4404, so this can delay recovery and add noisy logs. Consider catching KeyError and closing with 4404 (or similar) instead. backend/setta/routers/websocket.py:115 backend/setta/
share/session_store.py:70
- Medium: Share session cleanup drops LLM managers without cancelling in‑flight streaming tasks. That can leave async tasks running and emitting events after a share session expires, and retain memory in _tasks/
_sessions. Consider a shutdown() on LLMChatManager (cancel tasks, clear sessions) and call it from drop_session. backend/setta/share/chat_manager.py:87 backend/setta/llm/llm_chat_manager.py:280 backend/setta/
llm/llm_chat_manager.py:447
- Low: route_websocket_share_frontend raises ValueError when share mode is off, which becomes a 500. Returning 403/404 or closing with 4403 would avoid noisy server errors for accidental hits. backend/setta/
routers/websocket.py:186

Questions/Assumptions

- Assuming share session expiry should always surface as 4404 so the frontend can trigger the session recovery path; if you intentionally want 1011 here, ignore the first item.


## Review 2

Findings

- Medium: backend/setta/routers/websocket.py:115 share_session_store.touch_session will raise KeyError once a share session expires; this goes through the generic exception path and likely closes with a 1011
instead of 4404, so the frontend share-session recovery (which keys on 4400/4404) won’t run and you’ll get noisy error logs. Consider catching KeyError and closing with 4404 (or pre-checking session existence)
before logging.


## Review 3

Findings

- Medium backend/setta/server_state.py:562: _resolve_share_runtime_root falls back to share_deployment_root.parent when the deployments root isn’t named share_deployments. For a layout like /custom/deploys/
<name>/<version>, runtime data ends up under /custom/deploys/<name>/share_runtime/... instead of /custom/deploys/share_runtime/..., which is likely inconsistent with the other branches and makes cleanup/path
expectations unpredictable.
- Medium backend/setta/project_state/share_runtime_state.py:224: Share runs use python <file> (build_python_file_run_command) for Python sections/gen code, while IDE runs still use module execution (python -m).
That changes import resolution/__package__ semantics and can break relative imports in share mode.
- Low backend/setta/file_watchers/specific_file_watcher.py:51: _send_event bails when _get_loop() is None. update_callbacks() can call request_read() before start() captures a running loop, so initial reads can
be dropped in sync/test contexts and won’t recover until a real FS event happens.

Questions / Assumptions

- Should share runs preserve the same Python module semantics as IDE runs? If yes, the share run command should likely use build_python_module_run_command or adjust sys.path for snapshots.
- For custom deployment roots, do you expect runtime data to live alongside the deployments root (e.g., /custom/deploys/share_runtime/...) rather than nested under the deployment name? If not, ignore the
runtime-root concern.
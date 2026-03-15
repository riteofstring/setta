import asyncio
import os
import sys
from dataclasses import dataclass
from importlib import util
from pathlib import Path
from types import ModuleType
from typing import Callable

from setta.api.listener import SettaListener
from setta.logging.tasks import spawn_background_task
from setta.types.id import ID
from setta.types.share_deployment import (
    DeploymentManifest,
)
from setta.utils.env_vars import RUNTIME_ROOT_ENV

_ListenerBuilder = Callable[[SettaListener], None]
_BUILDER_NAMES = ("build_listener", "build_callbacks")


@dataclass
class _ListenerHandle:
    listener: SettaListener
    task: asyncio.Task[object]
    module: ModuleType


class ShareListenerRuntime:
    def __init__(
        self,
        *,
        deployment_root: Path,
        manifest: DeploymentManifest | None,
        runtime_root: Path | None = None,
    ) -> None:
        self._deployment_root = deployment_root
        self._manifest = manifest
        self._listener_config = None if manifest is None else manifest.listener
        if self._listener_config is None or not self._listener_config.enabled:
            self._entrypoint_path = None
        else:
            entrypoint = (
                self._deployment_root / self._listener_config.entrypoint
            ).resolve()
            if not entrypoint.exists():
                raise FileNotFoundError(
                    f"Share listener entrypoint not found: {entrypoint}"
                )
            self._entrypoint_path = entrypoint
        self._session_handles: dict[tuple[str, ID], _ListenerHandle] = {}
        self._runtime_root = (
            runtime_root.resolve() if runtime_root is not None else None
        )
        if self._runtime_root is not None:
            os.environ.setdefault(RUNTIME_ROOT_ENV, str(self._runtime_root))

    def _sanitize_module_suffix(self, value: str) -> str:
        sanitized = []
        for char in value:
            if char.isalnum() or char == "_":
                sanitized.append(char)
            else:
                sanitized.append("_")
        return "".join(sanitized)

    def _module_name_for_session(
        self, session_id: str | None, project_config_id: ID
    ) -> str:
        suffix = "shared" if session_id is None else session_id
        safe_suffix = self._sanitize_module_suffix(f"{suffix}_{project_config_id}")
        base = self._sanitize_module_suffix(self._deployment_root.name)
        return f"setta_share_listener_{base}_{safe_suffix}"

    def _drop_module(self, module: ModuleType) -> None:
        sys.modules.pop(module.__name__, None)

    def _drop_handle(self, key: tuple[str, ID], handle: _ListenerHandle) -> None:
        if key in self._session_handles:
            del self._session_handles[key]
        self._drop_module(handle.module)

    def _handle_listener_task_done(
        self, key: tuple[str, ID], task: asyncio.Task[object]
    ) -> None:
        handle = self._session_handles.get(key)
        if handle is None:
            return
        if handle.task is not task:
            return
        self._drop_handle(key, handle)

    async def ensure_listener_for_session(
        self, session_id: str | None, project_config_id: ID
    ) -> None:
        if self._entrypoint_path is None:
            return
        if session_id is None:
            raise KeyError("Share listener session id is required in share mode")
        key = (session_id, project_config_id)
        handle = self._session_handles.get(key)
        if handle is not None:
            if handle.task.done():
                self._drop_handle(key, handle)
            else:
                return
        if self._entrypoint_path is None:
            raise KeyError("Share listener entrypoint is not configured")
        module_name = self._module_name_for_session(session_id, project_config_id)
        spec = util.spec_from_file_location(module_name, self._entrypoint_path)
        if spec is None or spec.loader is None:
            raise KeyError(
                f"Failed to load share listener entrypoint: {self._entrypoint_path}"
            )
        module = util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        builder: _ListenerBuilder | None = None
        for name in _BUILDER_NAMES:
            candidate = getattr(module, name, None)
            if candidate is None:
                continue
            if not callable(candidate):
                raise TypeError(f"Share listener {name} must be callable")
            builder = candidate
            break
        if builder is None:
            raise KeyError(
                "Share listener entrypoint must define build_listener or build_callbacks"
            )
        listener = SettaListener(
            project_config_id=project_config_id,
            share_session_id=session_id,
        )
        builder(listener)
        task = spawn_background_task(
            listener.run_forever,
            label="share-listener-per-viewer",
            extra_values={"share_session_id": session_id},
        )
        task.add_done_callback(
            lambda finished_task: self._handle_listener_task_done(key, finished_task)
        )
        self._session_handles[key] = _ListenerHandle(
            listener=listener,
            task=task,
            module=module,
        )

    def stop_session_listener(self, session_id: str, project_config_id: ID) -> None:
        key = (session_id, project_config_id)
        if key not in self._session_handles:
            raise KeyError(
                f"Unknown share listener session/config: {session_id}/{project_config_id}"
            )
        handle = self._session_handles.pop(key)
        handle.listener.stop()
        handle.task.cancel()
        self._drop_module(handle.module)

    def drop_session_listener(self, session_id: str) -> None:
        session_keys = [
            key for key in self._session_handles.keys() if key[0] == session_id
        ]
        for key in session_keys:
            self.stop_session_listener(key[0], key[1])

    def stop_all(self) -> None:
        session_keys = list(self._session_handles.keys())
        for session_id, project_config_id in session_keys:
            self.stop_session_listener(session_id, project_config_id)

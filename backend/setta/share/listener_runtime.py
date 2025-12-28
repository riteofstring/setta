import asyncio
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
    ListenerIsolationMode,
    ShareDeploymentManifest,
    SharePolicy,
)

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
        manifest: ShareDeploymentManifest | None,
        policy: SharePolicy,
        project_config_id: ID,
    ) -> None:
        self._deployment_root = deployment_root
        self._manifest = manifest
        self._policy = policy
        self._project_config_id = project_config_id
        self._listener_config = None if manifest is None else manifest.listener
        self._entrypoint_path = self._resolve_entrypoint_path()
        self._shared_handle: _ListenerHandle | None = None
        self._shared_module: ModuleType | None = None
        self._session_handles: dict[str, _ListenerHandle] = {}

    def _resolve_entrypoint_path(self) -> Path | None:
        if self._listener_config is None:
            return None
        if not self._listener_config.enabled:
            return None
        entrypoint = (
            self._deployment_root / self._listener_config.entrypoint
        ).resolve()
        if not entrypoint.exists():
            raise FileNotFoundError(
                f"Share listener entrypoint not found: {entrypoint}"
            )
        return entrypoint

    def _is_enabled(self) -> bool:
        return self._entrypoint_path is not None

    def _sanitize_module_suffix(self, value: str) -> str:
        sanitized = []
        for char in value:
            if char.isalnum() or char == "_":
                sanitized.append(char)
            else:
                sanitized.append("_")
        return "".join(sanitized)

    def _module_name_for_session(self, session_id: str | None) -> str:
        suffix = "shared" if session_id is None else session_id
        safe_suffix = self._sanitize_module_suffix(suffix)
        base = self._sanitize_module_suffix(self._deployment_root.name)
        return f"setta_share_listener_{base}_{safe_suffix}"

    def _load_module(self, session_id: str | None) -> ModuleType:
        if self._entrypoint_path is None:
            raise KeyError("Share listener entrypoint is not configured")
        module_name = self._module_name_for_session(session_id)
        spec = util.spec_from_file_location(module_name, self._entrypoint_path)
        if spec is None or spec.loader is None:
            raise KeyError(
                f"Failed to load share listener entrypoint: {self._entrypoint_path}"
            )
        module = util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        return module

    def _drop_module(self, module: ModuleType) -> None:
        sys.modules.pop(module.__name__, None)

    def _resolve_builder(self, module: ModuleType) -> _ListenerBuilder:
        for name in _BUILDER_NAMES:
            builder = getattr(module, name, None)
            if builder is None:
                continue
            if not callable(builder):
                raise TypeError(f"Share listener {name} must be callable")
            return builder
        raise KeyError(
            "Share listener entrypoint must define build_listener or build_callbacks"
        )

    async def ensure_listener_for_session(self, session_id: str | None) -> None:
        if not self._is_enabled():
            return
        if self._policy.listenerIsolation is ListenerIsolationMode.shared:
            await self._ensure_shared_listener()
            return
        if session_id is None:
            raise KeyError("Share listener session id is required for per_viewer mode")
        if session_id in self._session_handles:
            return
        module = self._load_module(session_id)
        builder = self._resolve_builder(module)
        listener = SettaListener(
            project_config_id=self._project_config_id,
            share_session_id=session_id,
        )
        builder(listener)
        task = spawn_background_task(
            listener.run_forever,
            label="share-listener-per-viewer",
            extra_values={"share_session_id": session_id},
        )
        self._session_handles[session_id] = _ListenerHandle(
            listener=listener,
            task=task,
            module=module,
        )

    async def _ensure_shared_listener(self) -> None:
        if self._shared_handle is not None:
            return
        module = self._shared_module or self._load_module(None)
        self._shared_module = module
        builder = self._resolve_builder(module)
        listener = SettaListener(project_config_id=self._project_config_id)
        builder(listener)
        task = spawn_background_task(
            listener.run_forever,
            label="share-listener-shared",
        )
        self._shared_handle = _ListenerHandle(
            listener=listener,
            task=task,
            module=module,
        )

    def stop_session_listener(self, session_id: str) -> None:
        if session_id not in self._session_handles:
            raise KeyError(f"Unknown share listener session: {session_id}")
        handle = self._session_handles.pop(session_id)
        handle.listener.stop()
        handle.task.cancel()
        self._drop_module(handle.module)

    def stop_shared_listener(self) -> None:
        if self._shared_handle is None:
            return
        handle = self._shared_handle
        self._shared_handle = None
        handle.listener.stop()
        handle.task.cancel()
        self._drop_module(handle.module)
        self._shared_module = None

    def stop_all(self) -> None:
        session_ids = list(self._session_handles.keys())
        for session_id in session_ids:
            self.stop_session_listener(session_id)
        self.stop_shared_listener()

import asyncio
import importlib
import logging
import sys
from pathlib import Path
from types import ModuleType
from typing import TYPE_CHECKING, Iterable

from watchfiles import Change, awatch

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from setta.api.listener import ListenerCallbackBuilder, SettaListener


class ListenerHotReloader:
    """Reload listener callbacks in place when watched files change."""

    def __init__(
        self,
        *,
        listener: "SettaListener",
        module_name: str,
        builder_name: str,
        paths: Iterable[str],
        trigger_refresh: bool = True,
        settle_delay: float = 0.1,
    ) -> None:
        self._listener = listener
        self._module_name = module_name
        self._builder_name = builder_name
        self._paths = self._normalize_paths(paths)
        if not self._paths:
            raise ValueError("ListenerHotReloader requires at least one path to watch")
        self._trigger_refresh = trigger_refresh
        self._settle_delay = settle_delay
        self._stop_event = asyncio.Event()
        self._reload_lock = asyncio.Lock()

    @property
    def listener(self) -> "SettaListener":
        return self._listener

    @staticmethod
    def _normalize_paths(paths: Iterable[str]) -> tuple[Path, ...]:
        normalized: list[Path] = []
        for raw_path in paths:
            path = Path(raw_path).expanduser()
            try:
                path = path.resolve()
            except RuntimeError:
                path = path.absolute()
            normalized.append(path)
        return tuple(normalized)

    async def stop(self) -> None:
        """Signal the watcher loop to stop."""
        self._stop_event.set()

    async def watch(self) -> None:
        """Watch configured paths and hot-reload callbacks on change."""
        logger.debug(
            "ListenerHotReloader watching %s for module %s",
            ", ".join(str(path) for path in self._paths),
            self._module_name,
        )
        try:
            async for changes in awatch(
                *self._paths,
                stop_event=self._stop_event,
                watch_filter=self._watch_filter,
            ):
                if not changes:
                    continue
                await self._handle_changes(changes)
        except asyncio.CancelledError:
            raise
        finally:
            self._stop_event.set()

    @staticmethod
    def _watch_filter(change: Change, path: str) -> bool:
        # Only react when the file content actually mutates.
        return change in {Change.added, Change.modified, Change.deleted}

    async def reload_now(self, *, reload_module: bool = True) -> None:
        """Reload callbacks immediately, optionally skipping module reload."""
        await self._run_reload_cycle(reload_module=reload_module)

    async def _handle_changes(
        self,
        changes: set[tuple[Change, str]],
    ) -> None:
        if self._settle_delay:
            await asyncio.sleep(self._settle_delay)
        try:
            await self._run_reload_cycle(reload_module=True)
        except Exception:
            logger.exception("Listener callback reload failed; continuing to watch")
            return
        paths = ", ".join(path for _, path in changes)
        logger.info("ListenerHotReloader reloaded callbacks from %s", paths)

    async def _run_reload_cycle(self, *, reload_module: bool) -> None:
        async with self._reload_lock:
            try:
                builder = self._resolve_builder(reload_module=reload_module)
            except Exception:
                logger.exception(
                    "Failed to resolve listener callback builder %s in module %s",
                    self._builder_name,
                    self._module_name,
                )
                raise
            await self._listener.reload_callbacks(
                builder,
                trigger_refresh=self._trigger_refresh,
            )

    def _resolve_builder(
        self,
        *,
        reload_module: bool,
    ) -> "ListenerCallbackBuilder":
        module = self._load_module(reload_module=reload_module)
        builder = getattr(module, self._builder_name, None)
        if builder is None:
            raise AttributeError(
                f"Module {self._module_name!r} lacks builder {self._builder_name!r}"
            )
        if not callable(builder):
            raise TypeError(
                f"Builder attribute {self._builder_name!r} in module {self._module_name!r} is not callable"
            )
        return builder

    def _load_module(self, *, reload_module: bool) -> ModuleType:
        importlib.invalidate_caches()
        if reload_module and self._module_name in sys.modules:
            return importlib.reload(sys.modules[self._module_name])
        return importlib.import_module(self._module_name)

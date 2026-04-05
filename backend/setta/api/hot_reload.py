import asyncio
import importlib
import inspect
import logging
import sys
from dataclasses import dataclass
from fnmatch import fnmatch
from glob import has_magic
from pathlib import Path
from types import ModuleType
from typing import TYPE_CHECKING, Iterable

from watchfiles import Change, awatch

logger = logging.getLogger(__name__)
_WATCHABLE_CHANGES = frozenset((Change.added, Change.modified, Change.deleted))

if TYPE_CHECKING:
    from setta.api.listener import ListenerCallbackBuilder, SettaListener


class ListenerHotReloader:
    """Reload listener callbacks in place when watched files change."""

    def __init__(
        self,
        *,
        listener: "SettaListener",
        builder: "ListenerCallbackBuilder",
        extra_watch_paths: Iterable[str] | None = None,
        ignore_patterns: Iterable[str] | None = None,
        trigger_refresh: bool = True,
        settle_delay: float = 0.1,
    ) -> None:
        module, builder_name = self._resolve_builder_metadata(builder)
        self._listener = listener
        self._builder = builder
        self._module_name = module.__name__
        self._builder_name = builder_name
        ignore = self._normalize_patterns(ignore_patterns)
        self._watch_specs = self._build_watch_specs(
            module=module,
            extra_watch_paths=extra_watch_paths,
            ignores=ignore,
        )
        self._paths = tuple(dict.fromkeys(spec.root for spec in self._watch_specs))
        if not self._paths:
            raise ValueError("ListenerHotReloader requires at least one path to watch")
        self._trigger_refresh = trigger_refresh
        self._settle_delay = settle_delay
        self._stop_event = asyncio.Event()
        self._reload_lock = asyncio.Lock()
        self._watch_filter = self._should_watch_change

    @property
    def listener(self) -> "SettaListener":
        return self._listener

    async def stop(self) -> None:
        """Signal the watcher loop to stop."""
        self._stop_event.set()

    async def watch(self) -> None:
        """Watch configured paths and hot-reload callbacks on change."""
        if logger.isEnabledFor(logging.DEBUG):
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
                if not reload_module:
                    builder = self._builder
                else:
                    importlib.invalidate_caches()
                    if self._module_name in sys.modules:
                        module = importlib.reload(sys.modules[self._module_name])
                    else:
                        module = importlib.import_module(self._module_name)
                    builder = getattr(module, self._builder_name, None)
                    if builder is None:
                        raise AttributeError(
                            f"Module {self._module_name!r} lacks builder {self._builder_name!r}"
                        )
                    if not callable(builder):
                        raise TypeError(
                            f"Builder attribute {self._builder_name!r} in module {self._module_name!r} is not callable"
                        )
            except Exception:
                logger.exception(
                    "Failed to resolve listener callback builder %s in module %s",
                    self._builder_name,
                    self._module_name,
                )
                raise
            self._builder = builder
            await self._listener.reload_callbacks(
                builder,
                trigger_refresh=self._trigger_refresh,
            )

    @staticmethod
    def _resolve_builder_metadata(
        builder: "ListenerCallbackBuilder",
    ) -> tuple[ModuleType, str]:
        if not callable(builder):
            raise TypeError("ListenerHotReloader requires a callable builder")
        builder_name = getattr(builder, "__name__", None)
        if not builder_name:
            raise TypeError(
                "ListenerHotReloader requires a builder with a __name__ attribute"
            )
        module = inspect.getmodule(builder)
        if module is None or module.__name__ is None:
            raise TypeError(
                "ListenerHotReloader requires a builder defined in a module"
            )
        return module, builder_name

    @classmethod
    def _build_watch_specs(
        cls,
        *,
        module: ModuleType,
        extra_watch_paths: Iterable[str] | None,
        ignores: tuple[str, ...],
    ) -> tuple["_WatcherSpec", ...]:
        specs: dict[Path, _WatcherSpec] = {}
        for candidate in cls._module_watch_candidates(module):
            cls._merge_watch_spec(specs, root=candidate, includes=(), ignores=ignores)
        if extra_watch_paths:
            for raw in extra_watch_paths:
                for root, include in cls._iter_watch_path_specs(raw):
                    includes = (include,) if include is not None else ()
                    cls._merge_watch_spec(
                        specs,
                        root=root,
                        includes=includes,
                        ignores=ignores,
                    )
        return tuple(specs.values())

    @classmethod
    def _module_watch_candidates(cls, module: ModuleType) -> tuple[Path, ...]:
        candidates: list[Path] = []
        module_file = getattr(module, "__file__", None)
        if module_file:
            candidates.extend(cls._resolve_origin_candidates(Path(module_file)))
            return tuple(candidates)
        spec = getattr(module, "__spec__", None)
        origin = getattr(spec, "origin", None) if spec else None
        if origin and origin not in {"built-in", "namespace"}:
            candidates.extend(cls._resolve_origin_candidates(Path(origin)))
        search_locations = (
            getattr(spec, "submodule_search_locations", None) if spec else None
        )
        if search_locations:
            candidates.extend(
                cls._resolve_path(Path(location)) for location in search_locations
            )
        return tuple(candidates)

    @classmethod
    def _resolve_origin_candidates(cls, origin: Path) -> tuple[Path, ...]:
        resolved = cls._resolve_path(origin)
        candidates = [resolved]
        if resolved.name == "__init__.py":
            candidates.append(resolved.parent)
        return tuple(candidates)

    @classmethod
    def _merge_watch_spec(
        cls,
        specs: dict[Path, "_WatcherSpec"],
        *,
        root: Path,
        includes: tuple[str, ...],
        ignores: tuple[str, ...],
    ) -> None:
        existing = specs.get(root)
        if existing is None:
            specs[root] = _WatcherSpec(
                root=root,
                is_file=cls._is_probable_file(root),
                includes=includes,
                ignores=ignores,
            )
            return
        specs[root] = existing.merged_with(includes, ignores)

    @classmethod
    def _iter_watch_path_specs(
        cls,
        raw_path: str,
    ) -> Iterable[tuple[Path, str | None]]:
        expanded = Path(raw_path).expanduser()
        if not has_magic(str(expanded)):
            yield cls._resolve_path(expanded), None
            return
        root_parts, pattern_parts = cls._split_glob_parts(expanded.parts)
        root = Path(*root_parts) if root_parts else Path(".")
        pattern = Path(*pattern_parts).as_posix() if pattern_parts else "**"
        yield cls._resolve_path(root), pattern

    @staticmethod
    def _split_glob_parts(parts: tuple[str, ...]) -> tuple[list[str], list[str]]:
        root_parts: list[str] = []
        pattern_parts: list[str] = []
        for part in parts:
            if pattern_parts or has_magic(part):
                pattern_parts.append(part)
                continue
            root_parts.append(part)
        return root_parts, pattern_parts

    def _should_watch_change(self, change: Change, path: str) -> bool:
        if change not in _WATCHABLE_CHANGES:
            return False
        candidate = self._resolve_path(Path(path))
        return any(spec.accepts(candidate) for spec in self._watch_specs)

    @staticmethod
    def _normalize_patterns(patterns: Iterable[str] | None) -> tuple[str, ...]:
        if not patterns:
            return ()
        return tuple(pattern.replace("\\", "/") for pattern in patterns)

    @staticmethod
    def _resolve_path(raw_path: Path) -> Path:
        try:
            return raw_path.expanduser().resolve()
        except RuntimeError:
            return raw_path.expanduser().absolute()

    @staticmethod
    def _is_probable_file(path: Path) -> bool:
        if path.exists():
            return path.is_file()
        return path.suffix != ""


@dataclass(frozen=True)
class _WatcherSpec:
    root: Path
    is_file: bool
    includes: tuple[str, ...]
    ignores: tuple[str, ...]

    def accepts(self, candidate: Path) -> bool:
        if self.is_file:
            if candidate != self.root:
                return False
            if not self.ignores:
                return True
            # Treat ignored file patterns as matching the file name.
            relative = candidate.name
            if any(self._fnmatch(relative, pattern) for pattern in self.ignores):
                return False
            return True
        try:
            relative = candidate.relative_to(self.root)
        except ValueError:
            return False
        relative_as_posix = relative.as_posix()
        if self.ignores and any(
            self._fnmatch(relative_as_posix, pattern) for pattern in self.ignores
        ):
            return False
        if not self.includes:
            return True
        return any(
            self._fnmatch(relative_as_posix, pattern) for pattern in self.includes
        )

    def merged_with(
        self,
        new_includes: tuple[str, ...],
        new_ignores: tuple[str, ...],
    ) -> "_WatcherSpec":
        includes = self.includes
        if new_includes:
            includes = includes + tuple(
                pattern for pattern in new_includes if pattern not in includes
            )
        ignores = self.ignores
        if new_ignores:
            ignores = ignores + tuple(
                pattern for pattern in new_ignores if pattern not in ignores
            )
        return _WatcherSpec(
            root=self.root,
            is_file=self.is_file,
            includes=includes,
            ignores=ignores,
        )

    @staticmethod
    def _fnmatch(target: str, pattern: str) -> bool:
        return fnmatch(target, pattern)

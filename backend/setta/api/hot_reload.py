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
        self._listener = listener
        self._builder = builder
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
        self._module_name = module.__name__
        self._builder_name = builder_name
        self._watch_specs = self._build_watch_specs(
            module=module,
            extra_watch_paths=extra_watch_paths,
            ignore_patterns=ignore_patterns,
        )
        self._paths = tuple(dict.fromkeys(spec.root for spec in self._watch_specs))
        if not self._paths:
            raise ValueError("ListenerHotReloader requires at least one path to watch")
        self._trigger_refresh = trigger_refresh
        self._settle_delay = settle_delay
        self._stop_event = asyncio.Event()
        self._reload_lock = asyncio.Lock()
        self._watch_filter = self._make_watch_filter()

    @property
    def listener(self) -> "SettaListener":
        return self._listener

    def _build_watch_specs(
        self,
        *,
        module: ModuleType,
        extra_watch_paths: Iterable[str] | None,
        ignore_patterns: Iterable[str] | None,
    ) -> tuple["_WatcherSpec", ...]:
        specs: dict[Path, _WatcherSpec] = {}
        ignore = self._normalize_patterns(ignore_patterns)
        for root_path, includes in self._infer_module_watch_roots(module):
            spec = specs.get(root_path)
            include_tuple = includes if includes is not None else ()
            if spec is None:
                specs[root_path] = _WatcherSpec(
                    root=root_path,
                    is_file=self._is_probable_file(root_path),
                    includes=include_tuple,
                    ignores=ignore,
                )
                continue
            specs[root_path] = spec.merged_with(include_tuple, ignore)
        if extra_watch_paths:
            for raw in extra_watch_paths:
                for root_path, include in self._parse_extra_watch_path(raw):
                    spec = specs.get(root_path)
                    include_tuple = (include,) if include is not None else ()
                    if spec is None:
                        specs[root_path] = _WatcherSpec(
                            root=root_path,
                            is_file=self._is_probable_file(root_path),
                            includes=include_tuple,
                            ignores=ignore,
                        )
                        continue
                    specs[root_path] = spec.merged_with(include_tuple, ignore)
        return tuple(specs.values())

    def _infer_module_watch_roots(
        self,
        module: ModuleType,
    ) -> Iterable[tuple[Path, tuple[str, ...] | None]]:
        candidate_paths: list[Path] = []
        module_file = getattr(module, "__file__", None)
        if module_file:
            resolved = Path(module_file).expanduser()
            try:
                resolved = resolved.resolve()
            except RuntimeError:
                resolved = resolved.absolute()
            candidate_paths.append(resolved)
            if resolved.name == "__init__.py":
                candidate_paths.append(resolved.parent)
        else:
            spec = getattr(module, "__spec__", None)
            origin = getattr(spec, "origin", None) if spec else None
            if origin and origin not in {"built-in", "namespace"}:
                origin_path = Path(origin).expanduser()
                try:
                    origin_path = origin_path.resolve()
                except RuntimeError:
                    origin_path = origin_path.absolute()
                candidate_paths.append(origin_path)
                if origin_path.name == "__init__.py":
                    candidate_paths.append(origin_path.parent)
            if spec and getattr(spec, "submodule_search_locations", None):
                candidate_paths.extend(
                    Path(location).expanduser()
                    for location in spec.submodule_search_locations
                )
        for candidate in candidate_paths:
            normalized = self._resolve_path(candidate)
            yield normalized, None

    def _parse_extra_watch_path(
        self,
        raw_path: str,
    ) -> Iterable[tuple[Path, str | None]]:
        path_string = str(Path(raw_path).expanduser())
        if has_magic(path_string):
            root, pattern = self._split_glob_root(path_string)
            yield root, pattern
            return
        normalized = self._resolve_path(Path(path_string))
        yield normalized, None

    @staticmethod
    def _normalize_patterns(patterns: Iterable[str] | None) -> tuple[str, ...]:
        if not patterns:
            return ()
        normalized: list[str] = []
        for pattern in patterns:
            normalized.append(pattern.replace("\\", "/"))
        return tuple(normalized)

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

    def _make_watch_filter(self):
        allowed_changes = {Change.added, Change.modified, Change.deleted}

        def _filter(change: Change, path: str) -> bool:
            if change not in allowed_changes:
                return False
            candidate_path = Path(path)
            try:
                candidate = candidate_path.resolve()
            except RuntimeError:
                candidate = candidate_path.absolute()
            for spec in self._watch_specs:
                if spec.accepts(candidate):
                    return True
            return False

        return _filter

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

    @staticmethod
    def _split_glob_root(raw_path: str) -> tuple[Path, str]:
        expanded = Path(raw_path).expanduser()
        parts = expanded.parts
        root_parts: list[str] = []
        pattern_parts: list[str] = []
        for part in parts:
            if has_magic(part) or pattern_parts:
                pattern_parts.append(part)
            else:
                root_parts.append(part)
        if not root_parts:
            root = Path(".")
        else:
            root = Path(*root_parts)
        root = ListenerHotReloader._resolve_path(root)
        pattern = Path(*pattern_parts).as_posix() if pattern_parts else "**"
        return root, pattern


@dataclass(frozen=True)
class _WatcherSpec:
    root: Path
    is_file: bool
    includes: tuple[str, ...]
    ignores: tuple[str, ...]

    def accepts(self, candidate: Path) -> bool:
        if self.is_file:
            return self._match_file(candidate)
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

    def _match_file(self, candidate: Path) -> bool:
        if candidate != self.root:
            return False
        if not self.ignores:
            return True
        # Treat ignored file patterns as matching the file name.
        relative = candidate.name
        if any(self._fnmatch(relative, pattern) for pattern in self.ignores):
            return False
        return True

    @staticmethod
    def _fnmatch(target: str, pattern: str) -> bool:
        return fnmatch(target, pattern)

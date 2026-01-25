import ast
import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from setta.project_state.lsp_response_handlers.signatureHelp import SignatureHelpStatus
from setta.project_state.utils import convert_path_to_module_path
from setta.types.dependency_key import create_dep_key
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    resolve_top_level_section_position_and_pan,
)
from setta.types.id import ID
from setta.types.notifications import SettaNotification, SettaNotificationType
from setta.types.project_config import (
    ProjectCodegenLanguage,
    WatchCodeCallableKind,
    WatchCodeFolder,
    WatchCodeRegistryEntry,
    get_python_codegen_target_with_type_guard,
    project_config_has_codegen_language,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CallableSectionImpl,
    CodeLanguage,
    CodeSectionImpl,
    SectionType,
)
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.utils import compute_md5_hex, normalize_path

if TYPE_CHECKING:
    from watchdog.observers.api import ObservedWatch

    from setta.project_state.base_project_manager import BaseProjectManager

logger = logging.getLogger(__name__)

DEFAULT_WATCH_CODE_IGNORE_DIRS = {
    "node_modules",
    ".venv",
    "setta_files",
    "__pycache__",
}


@dataclass(frozen=True)
class WatchCodeCallableInfo:
    identity: str
    canonical_name: str
    module_path: str
    symbol_name: str
    kind: WatchCodeCallableKind
    signature_hash: str
    body_hash: str
    source_path: str


@dataclass(frozen=True)
class WatchCodeConfigSnapshot:
    enabled: bool
    files: tuple[str, ...]
    folders: tuple[tuple[str, bool], ...]


def build_callable_identity(callable_name: str, kind: WatchCodeCallableKind) -> str:
    return f"{callable_name}:{kind.value}"


def normalize_watch_code_files(files: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for raw in files:
        if not raw:
            continue
        normalized = str(normalize_path(raw))
        if normalized in seen:
            continue
        seen.add(normalized)
        output.append(normalized)
    return output


def normalize_watch_code_folders(
    folders: list[WatchCodeFolder],
) -> list[WatchCodeFolder]:
    output: list[WatchCodeFolder] = []
    seen: set[tuple[str, bool]] = set()
    for folder in folders:
        if not folder.path:
            continue
        normalized = str(normalize_path(folder.path))
        key = (normalized, folder.recursive)
        if key in seen:
            continue
        seen.add(key)
        output.append(WatchCodeFolder(path=normalized, recursive=folder.recursive))
    return output


def build_watch_code_snapshot(
    project_state: ProjectStateSingleConfig,
) -> WatchCodeConfigSnapshot:
    project_config = project_state.projectConfig
    files = tuple(sorted(normalize_watch_code_files(project_config.watchCodeFiles)))
    folders = tuple(
        sorted(
            (
                (str(normalize_path(folder.path)), folder.recursive)
                for folder in project_config.watchCodeFolders
                if folder.path
            ),
            key=lambda item: (item[0], item[1]),
        )
    )
    return WatchCodeConfigSnapshot(
        enabled=project_config.watchCodeEnabled,
        files=files,
        folders=folders,
    )


def _should_ignore_path(path: Path) -> bool:
    for part in path.parts:
        if part in DEFAULT_WATCH_CODE_IGNORE_DIRS:
            return True
    return False


def _iter_python_files(root: Path, recursive: bool) -> list[Path]:
    if not root.exists():
        return []
    if root.is_file():
        if root.suffix == ".py" and not _should_ignore_path(root):
            return [root]
        return []
    if not root.is_dir():
        return []
    if not recursive:
        output: list[Path] = []
        for entry in root.iterdir():
            if (
                entry.is_file()
                and entry.suffix == ".py"
                and not _should_ignore_path(entry)
            ):
                output.append(entry)
        return output
    output: list[Path] = []
    for current_root, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in DEFAULT_WATCH_CODE_IGNORE_DIRS and d]
        for filename in files:
            if not filename.endswith(".py"):
                continue
            file_path = Path(current_root) / filename
            if _should_ignore_path(file_path):
                continue
            output.append(file_path)
    return output


def _dump_default(node: ast.AST | None) -> str:
    if node is None:
        return ""
    return ast.dump(node, include_attributes=False)


def _signature_hash(args: ast.arguments, *, drop_first_arg: bool) -> str:
    posonly = list(args.posonlyargs)
    normal_args = list(args.args)
    if drop_first_arg and normal_args:
        normal_args = normal_args[1:]
    positional = [*posonly, *normal_args]
    defaults = list(args.defaults)
    default_offset = len(positional) - len(defaults)
    positional_defaults: list[str] = []
    for idx, arg in enumerate(positional):
        default_repr = ""
        default_index = idx - default_offset
        if default_index >= 0:
            default_repr = _dump_default(defaults[default_index])
        positional_defaults.append(f"pos:{arg.arg}:{default_repr}")
    items = positional_defaults
    if args.vararg is not None:
        items.append(f"vararg:{args.vararg.arg}")
    kwonly_defaults = list(args.kw_defaults)
    for idx, arg in enumerate(args.kwonlyargs):
        default_repr = ""
        if idx < len(kwonly_defaults):
            default_repr = _dump_default(kwonly_defaults[idx])
        items.append(f"kwonly:{arg.arg}:{default_repr}")
    if args.kwarg is not None:
        items.append(f"kwarg:{args.kwarg.arg}")
    signature = "|".join(items)
    return compute_md5_hex(signature)


def _body_hash(node: ast.AST) -> str:
    module = ast.Module(body=getattr(node, "body", []), type_ignores=[])
    dumped = ast.dump(module, include_attributes=False)
    return compute_md5_hex(dumped)


def _build_callable_info(
    module_path: str,
    name: str,
    kind: WatchCodeCallableKind,
    signature_hash: str,
    body_hash: str,
    source_path: Path,
) -> WatchCodeCallableInfo:
    canonical_name = f"{module_path}.{name}" if module_path else name
    identity = build_callable_identity(canonical_name, kind)
    return WatchCodeCallableInfo(
        identity=identity,
        canonical_name=canonical_name,
        module_path=module_path,
        symbol_name=name,
        kind=kind,
        signature_hash=signature_hash,
        body_hash=body_hash,
        source_path=str(normalize_path(source_path)),
    )


def parse_python_callables(code: str, source_path: Path) -> list[WatchCodeCallableInfo]:
    if not code.strip():
        return []
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []
    module_path = convert_path_to_module_path(normalize_path(source_path))
    output: list[WatchCodeCallableInfo] = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            output.append(
                _build_callable_info(
                    module_path,
                    node.name,
                    WatchCodeCallableKind.function,
                    _signature_hash(node.args, drop_first_arg=False),
                    _body_hash(node),
                    source_path,
                )
            )
        elif isinstance(node, ast.AsyncFunctionDef):
            output.append(
                _build_callable_info(
                    module_path,
                    node.name,
                    WatchCodeCallableKind.async_function,
                    _signature_hash(node.args, drop_first_arg=False),
                    _body_hash(node),
                    source_path,
                )
            )
        elif isinstance(node, ast.ClassDef):
            init_def = None
            for class_node in node.body:
                if (
                    isinstance(class_node, ast.FunctionDef)
                    and class_node.name == "__init__"
                ):
                    init_def = class_node
                    break
            if init_def is None:
                signature_hash = compute_md5_hex("")
            else:
                signature_hash = _signature_hash(init_def.args, drop_first_arg=True)
            output.append(
                _build_callable_info(
                    module_path,
                    node.name,
                    WatchCodeCallableKind.class_init,
                    signature_hash,
                    _body_hash(node),
                    source_path,
                )
            )
    return output


class WatchCodeEventHandler(FileSystemEventHandler):
    def __init__(
        self,
        loop_getter: Callable[[], asyncio.AbstractEventLoop | None],
        event_callback: Callable[[Path, str, Path | None], None],
        dir_created_callback: Callable[[Path], None] | None = None,
    ):
        self._loop_getter = loop_getter
        self._event_callback = event_callback
        self._dir_created_callback = dir_created_callback

    def on_created(self, event: FileSystemEvent):
        if event.is_directory:
            self._handle_directory_created(event)
            return
        self._dispatch(event, "created")

    def on_modified(self, event: FileSystemEvent):
        if event.is_directory:
            return
        self._dispatch(event, "modified")

    def on_deleted(self, event: FileSystemEvent):
        if event.is_directory:
            return
        self._dispatch(event, "deleted")

    def on_moved(self, event: FileSystemEvent):
        if event.is_directory:
            return
        self._dispatch(event, "moved")

    def _handle_directory_created(self, event: FileSystemEvent) -> None:
        if self._dir_created_callback is None:
            return
        loop = self._loop_getter()
        if loop is None:
            logger.debug("Watch code handler missing event loop; skipping.")
            return
        if loop.is_closed():
            logger.debug("Watch code handler event loop closed; skipping.")
            return
        abs_path = Path(event.src_path).resolve()
        loop.call_soon_threadsafe(lambda: self._dir_created_callback(abs_path))

    def _dispatch(self, event: FileSystemEvent, event_type: str) -> None:
        loop = self._loop_getter()
        if loop is None:
            logger.debug("Watch code handler missing event loop; skipping.")
            return
        if loop.is_closed():
            logger.debug("Watch code handler event loop closed; skipping.")
            return
        abs_path = Path(event.src_path).resolve()
        dest_path = None
        if event_type == "moved" and hasattr(event, "dest_path"):
            dest_path = Path(event.dest_path).resolve()
        loop.call_soon_threadsafe(
            lambda: self._event_callback(abs_path, event_type, dest_path)
        )


class WatchCodeManager:
    def __init__(
        self,
        project_manager: "BaseProjectManager",
        *,
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None:
        self._project_manager = project_manager
        self._loop = loop
        self._observer = Observer()
        self._watched_dirs: dict[Path, "ObservedWatch"] = {}
        self._pending_dirs: set[Path] = set()
        self._debouncers: dict[tuple[ID, Path], AsyncDebouncer] = {}
        self._config_snapshots: dict[ID, WatchCodeConfigSnapshot] = {}
        self._notified_import_failures: set[str] = set()
        self._started = False
        self._handler = WatchCodeEventHandler(
            self._get_loop,
            self._handle_event,
            self._handle_directory_created,
        )

    def _get_loop(self) -> asyncio.AbstractEventLoop | None:
        if self._loop is not None:
            return self._loop
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            return None
        return self._loop

    def start(self) -> None:
        if self._started:
            return
        self._observer.start()
        self._started = True

    def shutdown(self) -> None:
        if self._started:
            self._observer.stop()
            self._observer.join()
            self._started = False
        for debouncer in self._debouncers.values():
            debouncer.cancel()
        self._debouncers.clear()

    def sync_from_backend(self, backend: ProjectStateBackend) -> None:
        configs = backend.projectConfigs
        desired_watch_dirs: dict[Path, bool] = {}
        for project_config_id, config in configs.items():
            snapshot = WatchCodeConfigSnapshot(
                enabled=config.watchCodeEnabled,
                files=tuple(sorted(normalize_watch_code_files(config.watchCodeFiles))),
                folders=tuple(
                    sorted(
                        (
                            (str(normalize_path(folder.path)), folder.recursive)
                            for folder in config.watchCodeFolders
                            if folder.path
                        ),
                        key=lambda item: (item[0], item[1]),
                    )
                ),
            )
            self._config_snapshots[project_config_id] = snapshot
            if not snapshot.enabled:
                continue
            for file_path in snapshot.files:
                parent = normalize_path(Path(file_path)).parent
                desired_watch_dirs[parent] = desired_watch_dirs.get(parent, False)
            for folder_path, recursive in snapshot.folders:
                desired = desired_watch_dirs.get(normalize_path(Path(folder_path)))
                if desired is None:
                    desired_watch_dirs[normalize_path(Path(folder_path))] = recursive
                else:
                    desired_watch_dirs[normalize_path(Path(folder_path))] = (
                        desired or recursive
                    )
        self._sync_watch_dirs(desired_watch_dirs)

    def baseline_on_enable(self, project_state: ProjectStateSingleConfig) -> None:
        project_config = project_state.projectConfig
        self._baseline_watch_inputs(project_config)
        self._baseline_code_sections(project_state)

    def baseline_for_new_inputs(
        self,
        project_state: ProjectStateSingleConfig,
        previous_snapshot: WatchCodeConfigSnapshot,
    ) -> None:
        project_config = project_state.projectConfig
        next_snapshot = build_watch_code_snapshot(project_state)
        if not next_snapshot.enabled:
            return
        previous_files = set(previous_snapshot.files)
        next_files = set(next_snapshot.files)
        new_files = next_files - previous_files
        previous_folders = set(previous_snapshot.folders)
        next_folders = set(next_snapshot.folders)
        new_folders = next_folders - previous_folders
        if new_files:
            for file_path in new_files:
                self._baseline_file(project_config, Path(file_path))
        if new_folders:
            for folder_path, recursive in new_folders:
                self._baseline_folder(project_config, Path(folder_path), recursive)

    async def handle_code_section_update(
        self,
        project_state: ProjectStateSingleConfig,
        section_id: ID,
        code: str,
    ) -> bool:
        project_config = project_state.projectConfig
        if not project_config.watchCodeEnabled:
            return False
        if not project_config_has_codegen_language(
            project_config, ProjectCodegenLanguage.python
        ):
            return False
        if section_id not in project_state.sections:
            raise KeyError(f"Missing code section {section_id}.")
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if not isinstance(section_impl, CodeSectionImpl):
            return False
        if section_impl.codeLanguage is not CodeLanguage.python:
            return False
        binding = section_impl.codeFileBinding
        if binding is None:
            return False
        source_path = normalize_path(binding.canonical_path)
        return await self._apply_callable_updates(
            project_state,
            source_path,
            code,
            baseline_only=False,
        )

    def _handle_directory_created(self, path: Path) -> None:
        if not self._pending_dirs:
            return
        for pending_dir in list(self._pending_dirs):
            if pending_dir == path or pending_dir.is_relative_to(path):
                self._sync_watch_dirs({})
                return

    def _handle_event(
        self, path: Path, event_type: str, dest_path: Path | None
    ) -> None:
        if event_type == "moved":
            if dest_path is None:
                return
            if _should_ignore_path(dest_path):
                return
            if dest_path.suffix != ".py":
                return
            for project_config_id, snapshot in self._config_snapshots.items():
                if not snapshot.enabled:
                    continue
                if not self._path_matches_watch_inputs(
                    dest_path, snapshot.files, snapshot.folders
                ):
                    continue
                self._debounce_scan(
                    project_config_id,
                    dest_path,
                    baseline_only=True,
                )
            return

        if _should_ignore_path(path):
            return
        if path.suffix != ".py":
            return
        for project_config_id, snapshot in self._config_snapshots.items():
            if not snapshot.enabled:
                continue
            if not self._path_matches_watch_inputs(
                path, snapshot.files, snapshot.folders
            ):
                continue
            if event_type == "deleted":
                continue
            self._debounce_scan(project_config_id, path, baseline_only=False)

    def _debounce_scan(
        self,
        project_config_id: ID,
        path: Path,
        *,
        baseline_only: bool,
    ) -> None:
        key = (project_config_id, normalize_path(path))
        if key not in self._debouncers:
            self._debouncers[key] = AsyncDebouncer(
                self._scan_file,
                wait=0.3,
                label=f"watch-code-scan-{project_config_id}",
            )
        self._debouncers[key].trigger(
            project_config_id, normalize_path(path), baseline_only
        )

    async def _scan_file(
        self,
        project_config_id: ID,
        path: Path,
        baseline_only: bool,
    ) -> None:
        if not path.exists():
            return
        raw = self._project_manager.dbe.read(path)
        if raw is None:
            return
        project_state = self._project_manager.get_single_config_state(project_config_id)
        did_update = await self._apply_callable_updates(
            project_state,
            path,
            raw,
            baseline_only=baseline_only,
        )
        if did_update and not baseline_only:
            await self._project_manager.update_and_broadcast_project_state(
                project_state
            )
        if did_update and baseline_only:
            await self._project_manager.update_and_broadcast_project_state(
                project_state
            )

    def _path_matches_watch_inputs(
        self,
        path: Path,
        files: tuple[str, ...],
        folders: tuple[tuple[str, bool], ...],
    ) -> bool:
        normalized = normalize_path(path).resolve()
        for file_path in files:
            if normalized == normalize_path(Path(file_path)).resolve():
                return True
        for folder_path, recursive in folders:
            folder = normalize_path(Path(folder_path)).resolve()
            if recursive:
                if normalized.parts[: len(folder.parts)] == folder.parts:
                    return True
            else:
                if normalized.parent == folder:
                    return True
        return False

    def _sync_watch_dirs(self, desired: dict[Path, bool]) -> None:
        if desired:
            desired_watch_dirs = desired
        else:
            desired_watch_dirs: dict[Path, bool] = {}
            for snapshot in self._config_snapshots.values():
                if not snapshot.enabled:
                    continue
                for file_path in snapshot.files:
                    parent = normalize_path(Path(file_path)).parent
                    desired_watch_dirs[parent] = desired_watch_dirs.get(parent, False)
                for folder_path, recursive in snapshot.folders:
                    resolved = normalize_path(Path(folder_path))
                    if resolved not in desired_watch_dirs:
                        desired_watch_dirs[resolved] = recursive
                    else:
                        desired_watch_dirs[resolved] = (
                            desired_watch_dirs[resolved] or recursive
                        )
        pending_dirs: set[Path] = set()
        existing_watches = set(self._watched_dirs.keys())
        desired_paths = set(desired_watch_dirs.keys())
        to_remove = existing_watches - desired_paths
        for path in to_remove:
            watch = self._watched_dirs.pop(path, None)
            if watch is not None:
                self._observer.unschedule(watch)
        to_add = desired_paths - existing_watches
        for path in to_add:
            if not path.exists():
                pending_dirs.add(path)
                continue
            recursive = desired_watch_dirs[path]
            self._watched_dirs[path] = self._observer.schedule(
                self._handler, str(path), recursive=recursive
            )
        self._pending_dirs = pending_dirs

    def _baseline_watch_inputs(self, project_config) -> None:
        for file_path in normalize_watch_code_files(project_config.watchCodeFiles):
            self._baseline_file(project_config, Path(file_path))
        for folder in project_config.watchCodeFolders:
            if not folder.path:
                continue
            self._baseline_folder(project_config, Path(folder.path), folder.recursive)

    def _baseline_code_sections(self, project_state: ProjectStateSingleConfig) -> None:
        for section_id in project_state.sections:
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, CodeSectionImpl):
                continue
            if section_impl.codeLanguage is not CodeLanguage.python:
                continue
            binding = section_impl.codeFileBinding
            if binding is None:
                continue
            self._record_baseline(
                project_state.projectConfig,
                normalize_path(binding.canonical_path),
                parse_python_callables(section_impl.code, binding.canonical_path),
            )

    def _baseline_folder(
        self,
        project_config,
        folder: Path,
        recursive: bool,
    ) -> None:
        for file_path in _iter_python_files(normalize_path(folder), recursive):
            self._baseline_file(project_config, file_path)

    def _baseline_file(self, project_config, file_path: Path) -> None:
        normalized = normalize_path(file_path)
        if not normalized.exists():
            return
        raw = self._project_manager.dbe.read(normalized)
        if raw is None:
            return
        callables = parse_python_callables(raw, normalized)
        self._record_baseline(project_config, normalized, callables)

    def _record_baseline(
        self,
        project_config,
        path: Path,
        callables: list[WatchCodeCallableInfo],
    ) -> None:
        baseline = project_config.watchCodeBaselineByPath
        key = str(normalize_path(path))
        baseline[key] = [entry.identity for entry in callables]

    async def _apply_callable_updates(
        self,
        project_state: ProjectStateSingleConfig,
        source_path: Path,
        code: str,
        *,
        baseline_only: bool,
    ) -> bool:
        project_config = project_state.projectConfig
        callables = parse_python_callables(code, source_path)
        if baseline_only:
            self._record_baseline(project_config, source_path, callables)
            return True
        if not callables:
            return False
        if not project_config_has_codegen_language(
            project_config, ProjectCodegenLanguage.python
        ):
            return False

        registry = project_config.watchCodeRegistry
        baseline = project_config.watchCodeBaselineByPath
        source_key = str(normalize_path(source_path))
        if source_key in baseline:
            baseline_entries = set(baseline[source_key])
        else:
            baseline_entries = set()

        current_by_identity: dict[str, WatchCodeCallableInfo] = {
            entry.identity: entry for entry in callables
        }
        registry_entries_for_file: dict[str, WatchCodeRegistryEntry] = {}
        for identity, entry in registry.items():
            if entry.sourcePath == source_key:
                registry_entries_for_file[identity] = entry

        removed_identities = set(registry_entries_for_file.keys()) - set(
            current_by_identity.keys()
        )
        added_identities = set(current_by_identity.keys()) - set(
            registry_entries_for_file.keys()
        )
        did_update = False
        if removed_identities and added_identities:
            added_by_key: dict[str, list[WatchCodeCallableInfo]] = {}
            for identity in added_identities:
                info = current_by_identity[identity]
                rename_key = f"{info.kind.value}:{info.signature_hash}:{info.body_hash}"
                added_by_key.setdefault(rename_key, []).append(info)
            for identity in removed_identities:
                entry = registry_entries_for_file[identity]
                rename_key = (
                    f"{entry.kind.value}:{entry.signatureHash}:{entry.bodyHash}"
                )
                if rename_key not in added_by_key:
                    continue
                candidates = added_by_key[rename_key]
                if not candidates:
                    continue
                new_info = candidates.pop(0)
                self._update_registry_identity(
                    registry,
                    identity,
                    entry,
                    new_info,
                )
                entry.sectionIds = self._prune_section_ids(project_state, entry)
                entry.sectionsCount = len(entry.sectionIds)
                old_reference_name = entry.callableName
                old_module_path, old_symbol_name = self._split_canonical_identity(
                    identity
                )
                reference_name = self._resolve_reference_name(
                    registry, new_info, exclude_identity=new_info.identity
                )
                if old_reference_name != reference_name:
                    self._remove_gen_code_import(
                        project_state,
                        old_module_path,
                        old_symbol_name,
                        old_reference_name,
                    )
                self._ensure_gen_code_import(
                    project_state,
                    new_info.module_path,
                    new_info.symbol_name,
                    reference_name,
                )
                entry.callableName = reference_name
                self._rename_sections_for_callable(
                    project_state,
                    entry.sectionIds,
                    reference_name,
                )
                did_update = True
            added_identities = set(current_by_identity.keys()) - set(registry.keys())

        for identity, info in current_by_identity.items():
            if identity in registry:
                entry = registry[identity]
                entry.sectionIds = self._prune_section_ids(project_state, entry)
                entry.sectionsCount = len(entry.sectionIds)
                if entry.signatureHash != info.signature_hash:
                    entry.signatureHash = info.signature_hash
                    entry.bodyHash = info.body_hash
                    entry.sourcePath = info.source_path
                    await self._update_sections_for_callable(
                        project_state, entry.sectionIds, entry.callableName
                    )
                    did_update = True
                else:
                    if entry.bodyHash != info.body_hash:
                        entry.bodyHash = info.body_hash
                continue
            if identity in baseline_entries:
                continue
            reference_name = self._resolve_reference_name(registry, info)
            self._ensure_gen_code_import(
                project_state,
                info.module_path,
                info.symbol_name,
                reference_name,
            )
            section_id = self._create_callable_section(project_state)
            registry[identity] = WatchCodeRegistryEntry(
                callableName=reference_name,
                kind=info.kind,
                signatureHash=info.signature_hash,
                bodyHash=info.body_hash,
                sourcePath=info.source_path,
                sectionIds=[section_id],
                sectionsCount=1,
            )
            did_update = True
            await self._update_sections_for_callable(
                project_state, [section_id], reference_name
            )
        return did_update

    def _update_registry_identity(
        self,
        registry: dict[str, WatchCodeRegistryEntry],
        old_identity: str,
        entry: WatchCodeRegistryEntry,
        info: WatchCodeCallableInfo,
    ) -> None:
        registry.pop(old_identity)
        entry.kind = info.kind
        entry.signatureHash = info.signature_hash
        entry.bodyHash = info.body_hash
        entry.sourcePath = info.source_path
        registry[info.identity] = entry

    async def _update_sections_for_callable(
        self,
        project_state: ProjectStateSingleConfig,
        section_ids: list[ID],
        callable_name: str,
    ) -> None:
        project_config_id = project_state.projectConfig.id
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        gen_code = self._project_manager.gen_code.get(project_config_id)
        needs_refresh = gen_code is None
        if gen_code is not None:
            if gen_code.code_generator.gen_code_prefix != python_target.genCodePrefix:
                needs_refresh = True
            elif any(
                create_dep_key(section_id) not in gen_code.dep_graph.graph
                for section_id in section_ids
            ):
                needs_refresh = True
        if needs_refresh:
            await self._project_manager._refresh_codegen_state(project_state)
            gen_code = self._project_manager._require_python_codegen(project_config_id)
        settings = self._project_manager.settings_file.settings
        for section_id in section_ids:
            if section_id not in project_state.sections:
                continue
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, CallableSectionImpl):
                continue
            response = await gen_code.set_callable(
                settings,
                project_state,
                section_id,
                callable_name,
                True,
            )
            if (
                response.lspStatus is SignatureHelpStatus.NO_MATCH
                and gen_code.lsp_writer is not None
            ):
                await self._notify_import_failure(
                    project_config_id, callable_name, source=callable_name
                )

    def _rename_sections_for_callable(
        self,
        project_state: ProjectStateSingleConfig,
        section_ids: list[ID],
        callable_name: str,
    ) -> None:
        for section_id in section_ids:
            if section_id not in project_state.sections:
                continue
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, CallableSectionImpl):
                continue
            if section_impl.callable is None:
                continue
            callable_id = section_impl.callable
            if callable_id not in project_state.codeObjs:
                continue
            callable_obj = project_state.codeObjs[callable_id]
            if callable_obj.name != callable_name:
                callable_obj.name = callable_name

    def _create_callable_section(self, project_state: ProjectStateSingleConfig) -> ID:
        settings = self._project_manager.settings_file.settings
        position, _ = resolve_top_level_section_position_and_pan(
            settings,
            project_state,
            SectionType.Callable,
            None,
            None,
            None,
            None,
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Callable,
            position=position,
        )
        return section_id

    def _ensure_gen_code_import(
        self,
        project_state: ProjectStateSingleConfig,
        module_path: str,
        symbol_name: str,
        reference_name: str,
    ) -> None:
        if not module_path:
            return
        if module_path.startswith("."):
            return
        parts = module_path.split(".")
        for part in parts:
            if not part.isidentifier():
                return
        if not symbol_name.isidentifier():
            return
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        alias = None
        if reference_name != symbol_name:
            alias = reference_name
        import_line = (
            f"from {module_path} import {symbol_name}"
            if alias is None
            else f"from {module_path} import {symbol_name} as {alias}"
        )
        existing_lines = python_target.genCodePrefix.splitlines()
        for line in existing_lines:
            stripped = line.strip()
            if not stripped:
                continue
            if stripped == import_line:
                return
            if not stripped.startswith(f"from {module_path} import"):
                continue
            if "#" in stripped:
                stripped = stripped.split("#", 1)[0].strip()
            parts = stripped.split("import", 1)
            if len(parts) != 2:
                continue
            imports = [item.strip() for item in parts[1].split(",")]
            for item in imports:
                if not item:
                    continue
                if alias is None and item == symbol_name:
                    return
                if alias is not None and item == f"{symbol_name} as {alias}":
                    return
        prefix = python_target.genCodePrefix
        if prefix and not prefix.endswith("\n"):
            prefix = f"{prefix}\n"
        prefix = f"{prefix}{import_line}\n"
        python_target.genCodePrefix = prefix

    def _remove_gen_code_import(
        self,
        project_state: ProjectStateSingleConfig,
        module_path: str,
        symbol_name: str,
        reference_name: str,
    ) -> None:
        if not module_path:
            return
        if module_path.startswith("."):
            return
        if not symbol_name.isidentifier():
            return
        alias = None
        if reference_name != symbol_name:
            alias = reference_name
        import_line = (
            f"from {module_path} import {symbol_name}"
            if alias is None
            else f"from {module_path} import {symbol_name} as {alias}"
        )
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        prefix = python_target.genCodePrefix
        if not prefix:
            return
        lines = prefix.splitlines()
        kept: list[str] = []
        removed = False
        for line in lines:
            if line.strip() == import_line:
                removed = True
                continue
            kept.append(line)
        if not removed:
            return
        new_prefix = "\n".join(kept)
        if prefix.endswith("\n") and new_prefix:
            new_prefix = f"{new_prefix}\n"
        python_target.genCodePrefix = new_prefix

    def _prune_section_ids(
        self,
        project_state: ProjectStateSingleConfig,
        entry: WatchCodeRegistryEntry,
    ) -> list[ID]:
        if not entry.sectionIds:
            return []
        valid: list[ID] = []
        for section_id in entry.sectionIds:
            if section_id in project_state.sections:
                valid.append(section_id)
        return valid

    async def _notify_import_failure(
        self,
        project_config_id: ID,
        callable_name: str,
        *,
        source: str,
    ) -> None:
        if source in self._notified_import_failures:
            return
        self._notified_import_failures.add(source)
        notification = SettaNotification(
            projectConfigId=project_config_id,
            type=SettaNotificationType.warning,
            message=(
                f"Watch Code could not resolve params for {callable_name}. "
                "Verify the module import path or add imports in gen code prefix."
            ),
        )
        await self._project_manager.websocket_msg_handler.broadcast_notification(
            notification
        )

    def _resolve_reference_name(
        self,
        registry: dict[str, WatchCodeRegistryEntry],
        info: WatchCodeCallableInfo,
        *,
        exclude_identity: str | None = None,
    ) -> str:
        reserved: set[str] = set()
        for identity, entry in registry.items():
            if exclude_identity is not None and identity == exclude_identity:
                continue
            reserved.add(entry.callableName)
        base = info.symbol_name
        if base not in reserved:
            return base
        suffix = 2
        while True:
            candidate = f"{base}{suffix}"
            if candidate not in reserved:
                return candidate
            suffix += 1

    def _split_canonical_identity(self, identity: str) -> tuple[str, str]:
        if ":" not in identity:
            raise ValueError(f"Invalid watch code identity: {identity}")
        canonical_name = identity.rsplit(":", 1)[0]
        if "." in canonical_name:
            module_path, symbol_name = canonical_name.rsplit(".", 1)
        else:
            module_path = ""
            symbol_name = canonical_name
        return module_path, symbol_name

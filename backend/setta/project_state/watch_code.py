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
from setta.types.code_obj_impls import ParameterPassingStyle
from setta.types.dependency_key import create_dep_key
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_variant_base_and_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    delete_section_variant,
    delete_sections,
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
    param_proposals: tuple["WatchCodeParamProposal", ...]


@dataclass(frozen=True)
class WatchCodeParamProposal:
    name: str
    default: str
    passing_style: ParameterPassingStyle


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
        normalized = str(_normalize_watch_code_path(raw, "file"))
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
        normalized = str(_normalize_watch_code_path(folder.path, "folder"))
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
    normalized_folders = normalize_watch_code_folders(project_config.watchCodeFolders)
    folders = tuple(
        sorted(
            (
                (folder.path, folder.recursive)
                for folder in normalized_folders
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


def _normalize_watch_code_path(raw: str, label: str) -> Path:
    candidate = Path(raw)
    if candidate.is_absolute():
        raise ValueError(f"Watch code {label} paths must be repo-relative: {raw!r}")
    normalized = normalize_path(raw)
    if normalized.is_absolute():
        raise ValueError(f"Watch code {label} paths must be inside the repo: {raw!r}")
    return normalized


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


def _build_param_proposals(
    args: ast.arguments, *, drop_first_arg: bool
) -> tuple[WatchCodeParamProposal, ...]:
    posonly = list(args.posonlyargs)
    normal_args = list(args.args)
    if drop_first_arg and normal_args:
        normal_args = normal_args[1:]
    positional = [*posonly, *normal_args]
    defaults = list(args.defaults)
    default_offset = len(positional) - len(defaults)
    output: list[WatchCodeParamProposal] = []
    for idx, arg in enumerate(positional):
        default_repr = ""
        default_index = idx - default_offset
        if default_index >= 0:
            default_repr = _dump_default(defaults[default_index])
        passing_style = (
            ParameterPassingStyle.POSITIONAL_ONLY
            if idx < len(posonly)
            else ParameterPassingStyle.DEFAULT
        )
        output.append(
            WatchCodeParamProposal(
                name=arg.arg,
                default=default_repr,
                passing_style=passing_style,
            )
        )
    if args.vararg is not None:
        output.append(
            WatchCodeParamProposal(
                name=args.vararg.arg,
                default="",
                passing_style=ParameterPassingStyle.ARGS,
            )
        )
    kwonly_defaults = list(args.kw_defaults)
    for idx, arg in enumerate(args.kwonlyargs):
        default_repr = ""
        if idx < len(kwonly_defaults) and kwonly_defaults[idx] is not None:
            default_repr = _dump_default(kwonly_defaults[idx])
        output.append(
            WatchCodeParamProposal(
                name=arg.arg,
                default=default_repr,
                passing_style=ParameterPassingStyle.KEYWORD_ONLY,
            )
        )
    if args.kwarg is not None:
        output.append(
            WatchCodeParamProposal(
                name=args.kwarg.arg,
                default="",
                passing_style=ParameterPassingStyle.KWARGS,
            )
        )
    return tuple(output)


def _build_callable_info(
    module_path: str,
    name: str,
    kind: WatchCodeCallableKind,
    signature_hash: str,
    body_hash: str,
    source_path: Path,
    param_proposals: tuple[WatchCodeParamProposal, ...],
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
        param_proposals=param_proposals,
    )


def parse_python_callables(
    code: str,
    source_path: Path,
    *,
    include_params: bool | None = None,
) -> list[WatchCodeCallableInfo] | None:
    if not code.strip():
        return []
    try:
        tree = ast.parse(code)
    except SyntaxError:
        logger.debug(
            "watch_code.parse_python_callables syntax_error source_path=%s",
            normalize_path(source_path),
        )
        return None
    module_path = convert_path_to_module_path(normalize_path(source_path))
    output: list[WatchCodeCallableInfo] = []
    build_params = (
        logger.isEnabledFor(logging.DEBUG) if include_params is None else include_params
    )
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
                    _build_param_proposals(node.args, drop_first_arg=False)
                    if build_params
                    else (),
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
                    _build_param_proposals(node.args, drop_first_arg=False)
                    if build_params
                    else (),
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
                proposals: tuple[WatchCodeParamProposal, ...] = ()
            else:
                signature_hash = _signature_hash(init_def.args, drop_first_arg=True)
                proposals = (
                    _build_param_proposals(init_def.args, drop_first_arg=True)
                    if build_params
                    else ()
                )
            output.append(
                _build_callable_info(
                    module_path,
                    node.name,
                    WatchCodeCallableKind.class_init,
                    signature_hash,
                    _body_hash(node),
                    source_path,
                    proposals,
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
        self._watched_dirs: dict[Path, tuple["ObservedWatch", bool]] = {}
        self._pending_dirs: set[Path] = set()
        self._debouncers: dict[tuple[ID, Path], AsyncDebouncer] = {}
        self._delete_debouncers: dict[tuple[ID, Path], AsyncDebouncer] = {}
        self._config_snapshots: dict[ID, WatchCodeConfigSnapshot] = {}
        self._notified_import_failures: set[tuple[ID, str]] = set()
        self._pending_moves: dict[tuple[ID, Path], Path] = {}
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
        for debouncer in self._delete_debouncers.values():
            debouncer.cancel()
        self._delete_debouncers.clear()

    def sync_from_backend(self, backend: ProjectStateBackend) -> None:
        configs = backend.projectConfigs
        existing_config_ids = set(self._config_snapshots.keys())
        next_config_ids = set(configs.keys())
        removed_config_ids = existing_config_ids - next_config_ids
        if removed_config_ids:
            for config_id in removed_config_ids:
                self._config_snapshots.pop(config_id, None)
            self._cancel_debouncers_for_configs(removed_config_ids)
            self._cancel_delete_debouncers_for_configs(removed_config_ids)
            self._clear_pending_moves_for_configs(removed_config_ids)
            self._clear_import_failures_for_configs(removed_config_ids)

        desired_watch_dirs: dict[Path, bool] = {}
        next_snapshots: dict[ID, WatchCodeConfigSnapshot] = {}
        for project_config_id, config in configs.items():
            normalized_files = normalize_watch_code_files(config.watchCodeFiles)
            normalized_folders = normalize_watch_code_folders(config.watchCodeFolders)
            snapshot = WatchCodeConfigSnapshot(
                enabled=config.watchCodeEnabled,
                files=tuple(sorted(normalized_files)),
                folders=tuple(
                    sorted(
                        (
                            (folder.path, folder.recursive)
                            for folder in normalized_folders
                            if folder.path
                        ),
                        key=lambda item: (item[0], item[1]),
                    )
                ),
            )
            next_snapshots[project_config_id] = snapshot
            if not snapshot.enabled:
                continue
            for file_path in snapshot.files:
                parent = normalize_path(Path(file_path)).parent
                desired_watch_dirs[parent] = desired_watch_dirs.get(parent, False)
            for folder_path, recursive in snapshot.folders:
                resolved = normalize_path(Path(folder_path))
                desired = desired_watch_dirs.get(resolved)
                if desired is None:
                    desired_watch_dirs[resolved] = recursive
                else:
                    desired_watch_dirs[resolved] = desired or recursive
        self._config_snapshots = next_snapshots

        disabled_config_ids = {
            project_config_id
            for project_config_id, snapshot in next_snapshots.items()
            if not snapshot.enabled
        }
        if disabled_config_ids:
            self._cancel_debouncers_for_configs(disabled_config_ids)
            self._cancel_delete_debouncers_for_configs(disabled_config_ids)
            self._clear_pending_moves_for_configs(disabled_config_ids)
            self._clear_import_failures_for_configs(disabled_config_ids)

        stale_debouncer_keys: list[tuple[ID, Path]] = []
        for key in list(self._debouncers.keys()):
            project_config_id, path = key
            if project_config_id not in next_snapshots:
                continue
            snapshot = next_snapshots[project_config_id]
            if not snapshot.enabled:
                continue
            if not self._path_matches_watch_inputs(
                path, snapshot.files, snapshot.folders
            ):
                stale_debouncer_keys.append(key)
        for key in stale_debouncer_keys:
            debouncer = self._debouncers.pop(key, None)
            if debouncer is None:
                continue
            debouncer.cancel()

        stale_delete_keys: list[tuple[ID, Path]] = []
        for key in list(self._delete_debouncers.keys()):
            project_config_id, path = key
            if project_config_id not in next_snapshots:
                continue
            snapshot = next_snapshots[project_config_id]
            if not snapshot.enabled:
                continue
            if not self._path_matches_watch_inputs(
                path, snapshot.files, snapshot.folders
            ):
                stale_delete_keys.append(key)
        for key in stale_delete_keys:
            debouncer = self._delete_debouncers.pop(key, None)
            if debouncer is None:
                continue
            debouncer.cancel()

        for key in list(self._pending_moves.keys()):
            project_config_id, dest_path = key
            if project_config_id not in next_snapshots:
                continue
            snapshot = next_snapshots[project_config_id]
            if not snapshot.enabled:
                continue
            if not self._path_matches_watch_inputs(
                dest_path, snapshot.files, snapshot.folders
            ):
                self._pending_moves.pop(key, None)

        self._sync_watch_dirs(desired_watch_dirs)

    def _cancel_debouncers_for_configs(self, config_ids: set[ID]) -> None:
        for key in list(self._debouncers.keys()):
            project_config_id, _ = key
            if project_config_id not in config_ids:
                continue
            debouncer = self._debouncers.pop(key)
            debouncer.cancel()

    def _cancel_delete_debouncers_for_configs(self, config_ids: set[ID]) -> None:
        for key in list(self._delete_debouncers.keys()):
            project_config_id, _ = key
            if project_config_id not in config_ids:
                continue
            debouncer = self._delete_debouncers.pop(key)
            debouncer.cancel()

    def _clear_pending_moves_for_configs(self, config_ids: set[ID]) -> None:
        for key in list(self._pending_moves.keys()):
            project_config_id, _ = key
            if project_config_id not in config_ids:
                continue
            self._pending_moves.pop(key, None)

    def _clear_import_failures_for_configs(self, config_ids: set[ID]) -> None:
        if not config_ids:
            return
        self._notified_import_failures = {
            (project_config_id, source)
            for project_config_id, source in self._notified_import_failures
            if project_config_id not in config_ids
        }

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
        logger.debug(
            "watch_code.handle_code_section_update section_id=%s source_path=%s code_len=%s",
            section_id,
            source_path,
            len(code),
        )
        return await self._apply_callable_updates(
            project_state,
            source_path,
            code,
            baseline_only=False,
        )

    def _handle_directory_created(self, path: Path) -> None:
        if not self._pending_dirs:
            return
        normalized_path = normalize_path(path)
        for pending_dir in list(self._pending_dirs):
            if pending_dir == normalized_path or pending_dir.is_relative_to(
                normalized_path
            ):
                self._sync_watch_dirs({})
                return

    def _handle_event(
        self, path: Path, event_type: str, dest_path: Path | None
    ) -> None:
        if event_type == "moved":
            if dest_path is None:
                return
            src_is_py = path.suffix == ".py" and not _should_ignore_path(path)
            dest_is_py = dest_path.suffix == ".py" and not _should_ignore_path(
                dest_path
            )
            for project_config_id, snapshot in self._config_snapshots.items():
                if not snapshot.enabled:
                    continue
                src_matches = False
                if src_is_py and self._path_matches_watch_inputs(
                    path, snapshot.files, snapshot.folders
                ):
                    src_matches = True
                dest_matches = False
                if dest_is_py and self._path_matches_watch_inputs(
                    dest_path, snapshot.files, snapshot.folders
                ):
                    dest_matches = True
                if dest_matches:
                    self._pending_moves[
                        (project_config_id, normalize_path(dest_path))
                    ] = normalize_path(path)
                    self._debounce_scan(
                        project_config_id,
                        dest_path,
                        baseline_only=False,
                    )
                elif src_matches:
                    self._debounce_delete(project_config_id, path)
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
                self._debounce_delete(project_config_id, path)
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

    def _debounce_delete(self, project_config_id: ID, path: Path) -> None:
        key = (project_config_id, normalize_path(path))
        if key not in self._delete_debouncers:
            self._delete_debouncers[key] = AsyncDebouncer(
                self._handle_deleted_file,
                wait=0.3,
                label=f"watch-code-delete-{project_config_id}",
            )
        self._delete_debouncers[key].trigger(project_config_id, normalize_path(path))

    async def _scan_file(
        self,
        project_config_id: ID,
        path: Path,
        baseline_only: bool,
    ) -> None:
        move_key = (project_config_id, normalize_path(path))
        moved_from = self._pending_moves.pop(move_key, None)
        if project_config_id not in self._config_snapshots:
            return
        if not path.exists():
            if moved_from is not None:
                await self._project_manager.apply_watch_code_file_delete(
                    project_config_id,
                    normalize_path(moved_from),
                )
            return
        raw = self._project_manager.dbe.read(path)
        if raw is None:
            if moved_from is not None:
                await self._project_manager.apply_watch_code_file_delete(
                    project_config_id,
                    normalize_path(moved_from),
                )
            return
        logger.debug(
            "watch_code._scan_file project_config_id=%s path=%s baseline_only=%s",
            project_config_id,
            normalize_path(path),
            baseline_only,
        )
        await self._project_manager.apply_watch_code_file_update(
            project_config_id,
            normalize_path(path),
            raw,
            baseline_only=baseline_only,
            moved_from=moved_from,
        )

    async def _handle_deleted_file(self, project_config_id: ID, path: Path) -> None:
        if project_config_id not in self._config_snapshots:
            return
        await self._project_manager.apply_watch_code_file_delete(
            project_config_id,
            normalize_path(path),
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

    def _find_existing_ancestor(self, path: Path) -> Path | None:
        current = normalize_path(path)
        while True:
            if current.exists():
                return current
            parent = current.parent
            if parent == current:
                return None
            current = parent

    def _sync_watch_dirs(self, desired: dict[Path, bool]) -> None:
        if desired:
            desired_watch_dirs = dict(desired)
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
        for path in list(desired_watch_dirs):
            if path.exists():
                continue
            pending_dirs.add(path)
            ancestor = self._find_existing_ancestor(path)
            if ancestor is None:
                continue
            if ancestor not in desired_watch_dirs:
                desired_watch_dirs[ancestor] = False
        existing_watches = set(self._watched_dirs.keys())
        desired_paths = set(desired_watch_dirs.keys())
        to_remove = existing_watches - desired_paths
        for path in to_remove:
            entry = self._watched_dirs.pop(path, None)
            if entry is not None:
                watch, _ = entry
                self._observer.unschedule(watch)
        to_add = desired_paths - existing_watches
        for path in to_add:
            if not path.exists():
                pending_dirs.add(path)
                continue
            recursive = desired_watch_dirs[path]
            self._watched_dirs[path] = (
                self._observer.schedule(self._handler, str(path), recursive=recursive),
                recursive,
            )
        for path in desired_paths & existing_watches:
            entry = self._watched_dirs.get(path)
            if entry is None:
                continue
            watch, current_recursive = entry
            desired_recursive = desired_watch_dirs[path]
            if current_recursive == desired_recursive:
                continue
            self._observer.unschedule(watch)
            if not path.exists():
                self._watched_dirs.pop(path, None)
                pending_dirs.add(path)
                continue
            self._watched_dirs[path] = (
                self._observer.schedule(
                    self._handler, str(path), recursive=desired_recursive
                ),
                desired_recursive,
            )
        self._pending_dirs = pending_dirs

    async def apply_scan_update(
        self,
        project_state: ProjectStateSingleConfig,
        path: Path,
        raw: str,
        *,
        baseline_only: bool,
        moved_from: Path | None,
    ) -> bool:
        did_move_update = False
        if moved_from is not None:
            project_config = project_state.projectConfig
            registry = project_config.watchCodeRegistry
            baseline = project_config.watchCodeBaselineByPath
            dest_key = str(normalize_path(path))
            src_key = str(normalize_path(moved_from))
            dest_known = dest_key in baseline or any(
                entry.sourcePath == dest_key for entry in registry.values()
            )
            src_tracked = src_key in baseline or any(
                entry.sourcePath == src_key for entry in registry.values()
            )
            logger.debug(
                "watch_code._scan_file move_detected project_config_id=%s src=%s dest=%s src_tracked=%s dest_known=%s registry_size=%s baseline_paths=%s",
                project_config.id,
                normalize_path(moved_from),
                normalize_path(path),
                src_tracked,
                dest_known,
                len(registry),
                len(baseline),
            )
            if src_tracked:
                parsed_callables = parse_python_callables(raw, path)
                if parsed_callables is None:
                    if src_key in baseline:
                        baseline[dest_key] = list(baseline[src_key])
                else:
                    baseline[dest_key] = [entry.identity for entry in parsed_callables]
                if src_key in baseline:
                    baseline.pop(src_key, None)
                moved_registry_entries = 0
                for entry in registry.values():
                    if entry.sourcePath == src_key:
                        entry.sourcePath = dest_key
                        moved_registry_entries += 1
                did_move_update = True
                logger.debug(
                    "watch_code._scan_file move_update project_config_id=%s dest=%s parsed_callables=%s moved_registry_entries=%s",
                    project_config.id,
                    normalize_path(path),
                    0 if parsed_callables is None else len(parsed_callables),
                    moved_registry_entries,
                )
        did_update = await self._apply_callable_updates(
            project_state,
            path,
            raw,
            baseline_only=baseline_only,
        )
        return did_update or did_move_update

    async def apply_delete_update(
        self,
        project_state: ProjectStateSingleConfig,
        path: Path,
    ) -> bool:
        project_config = project_state.projectConfig
        if not project_config_has_codegen_language(
            project_config, ProjectCodegenLanguage.python
        ):
            return False
        registry = project_config.watchCodeRegistry
        baseline = project_config.watchCodeBaselineByPath
        source_key = str(normalize_path(path))
        removed_identities = {
            identity
            for identity, entry in registry.items()
            if entry.sourcePath == source_key
        }
        did_update = False
        if removed_identities:
            if self._remove_watch_code_identities(project_state, removed_identities):
                did_update = True
        if source_key in baseline:
            baseline.pop(source_key)
            did_update = True
        return did_update

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
            callables = parse_python_callables(
                section_impl.code, binding.canonical_path
            )
            if callables is None:
                continue
            self._record_baseline(
                project_state.projectConfig,
                normalize_path(binding.canonical_path),
                callables,
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
        if callables is None:
            return
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
        if callables is None:
            logger.debug(
                "watch_code._apply_callable_updates parse_failed source_path=%s baseline_only=%s code_len=%s",
                source_path,
                baseline_only,
                len(code),
            )
            return False
        if logger.isEnabledFor(logging.DEBUG):
            code_hash = compute_md5_hex(code)
            logger.debug(
                "watch_code._apply_callable_updates source_path=%s baseline_only=%s callable_count=%s code_len=%s code_hash=%s",
                source_path,
                baseline_only,
                len(callables),
                len(code),
                code_hash,
            )
        if baseline_only:
            self._record_baseline(project_config, source_path, callables)
            return True
        if not project_config_has_codegen_language(
            project_config, ProjectCodegenLanguage.python
        ):
            return False

        registry = project_config.watchCodeRegistry
        baseline = project_config.watchCodeBaselineByPath
        source_key = str(normalize_path(source_path))
        current_by_identity: dict[str, WatchCodeCallableInfo] = {
            entry.identity: entry for entry in callables
        }
        registry_entries_for_file: dict[str, WatchCodeRegistryEntry] = {}
        for identity, entry in registry.items():
            if entry.sourcePath == source_key:
                registry_entries_for_file[identity] = entry
        logger.debug(
            "watch_code._apply_callable_updates baseline_entries=%s registry_entries=%s source_path=%s",
            len(baseline.get(source_key, [])),
            len(registry_entries_for_file),
            source_key,
        )

        removed_identities = set(registry_entries_for_file.keys()) - set(
            current_by_identity.keys()
        )
        added_identities = set(current_by_identity.keys()) - set(
            registry_entries_for_file.keys()
        )
        logger.debug(
            "watch_code._apply_callable_updates added=%s removed=%s source_path=%s",
            len(added_identities),
            len(removed_identities),
            source_key,
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
                logger.debug(
                    "watch_code._apply_callable_updates rename_detected identity=%s new_identity=%s callable=%s section_ids=%s",
                    identity,
                    new_info.identity,
                    entry.callableName,
                    entry.sectionIds,
                )
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
                if (
                    old_reference_name != reference_name
                    or old_module_path != new_info.module_path
                    or old_symbol_name != new_info.symbol_name
                ):
                    logger.debug(
                        "watch_code._apply_callable_updates updating import identity=%s old_name=%s new_name=%s",
                        identity,
                        old_reference_name,
                        reference_name,
                    )
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

        registry_entries_for_file = {
            identity: entry
            for identity, entry in registry.items()
            if entry.sourcePath == source_key
        }
        removed_identities = set(registry_entries_for_file.keys()) - set(
            current_by_identity.keys()
        )
        baseline_entries: set[str] = set()
        if source_key in baseline:
            updated_baseline = [
                identity
                for identity in baseline[source_key]
                if identity in current_by_identity
            ]
            if updated_baseline != baseline[source_key]:
                baseline[source_key] = updated_baseline
                did_update = True
            baseline_entries = set(baseline[source_key])
        if removed_identities:
            if self._remove_watch_code_identities(project_state, removed_identities):
                did_update = True

        signature_updates: list[tuple[str, list[ID]]] = []
        new_section_updates: list[tuple[str, list[ID]]] = []
        for identity, info in current_by_identity.items():
            if identity in registry:
                entry = registry[identity]
                entry.sectionIds = self._prune_section_ids(project_state, entry)
                entry.sectionsCount = len(entry.sectionIds)
                if entry.signatureHash != info.signature_hash:
                    logger.debug(
                        "watch_code._apply_callable_updates signature change identity=%s callable=%s sections=%s",
                        identity,
                        entry.callableName,
                        entry.sectionIds,
                    )
                    logger.debug(
                        "watch_code._apply_callable_updates signature details identity=%s old_hash=%s new_hash=%s param_names=%s",
                        identity,
                        entry.signatureHash,
                        info.signature_hash,
                        [proposal.name for proposal in info.param_proposals],
                    )
                    entry.signatureHash = info.signature_hash
                    entry.bodyHash = info.body_hash
                    entry.sourcePath = info.source_path
                    signature_updates.append((entry.callableName, entry.sectionIds))
                    did_update = True
                else:
                    if entry.bodyHash != info.body_hash:
                        entry.bodyHash = info.body_hash
                continue
            if identity in baseline_entries:
                logger.debug(
                    "watch_code._apply_callable_updates baseline_skip identity=%s callable=%s",
                    identity,
                    info.canonical_name,
                )
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
            logger.debug(
                "watch_code._apply_callable_updates new callable identity=%s callable=%s section_id=%s source_path=%s",
                identity,
                reference_name,
                section_id,
                info.source_path,
            )
            logger.debug(
                "watch_code._apply_callable_updates new callable params identity=%s param_names=%s",
                identity,
                [proposal.name for proposal in info.param_proposals],
            )
            did_update = True
            new_section_updates.append((reference_name, [section_id]))
        combined_updates = signature_updates + new_section_updates
        if combined_updates:
            await self._update_sections_for_callables(project_state, combined_updates)
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

    async def _update_sections_for_callables(
        self,
        project_state: ProjectStateSingleConfig,
        callables: list[tuple[str, list[ID]]],
    ) -> None:
        if not callables:
            return
        project_config_id = project_state.projectConfig.id
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        gen_code = self._project_manager.gen_code.get(project_config_id)
        section_ids = [section_id for _, ids in callables for section_id in ids]
        missing_dep_keys: list[ID] = []
        prefix_mismatch = False
        if gen_code is not None:
            prefix_mismatch = (
                gen_code.code_generator.gen_code_prefix != python_target.genCodePrefix
            )
            missing_dep_keys = [
                section_id
                for section_id in section_ids
                if create_dep_key(section_id) not in gen_code.dep_graph.graph
            ]
        needs_refresh = gen_code is None or prefix_mismatch or bool(missing_dep_keys)
        logger.debug(
            "watch_code._update_sections_for_callables callables=%s section_ids=%s gen_code=%s prefix_mismatch=%s missing_dep_keys=%s needs_refresh=%s",
            len(callables),
            section_ids,
            gen_code is not None,
            prefix_mismatch,
            missing_dep_keys,
            needs_refresh,
        )
        if needs_refresh:
            await self._project_manager._refresh_codegen_state(project_state)
            gen_code = self._project_manager._require_python_codegen(project_config_id)
            missing_after_refresh = [
                section_id
                for section_id in section_ids
                if create_dep_key(section_id) not in gen_code.dep_graph.graph
            ]
            if missing_after_refresh:
                logger.error(
                    "watch_code._update_sections_for_callables dep_graph missing after refresh missing_section_ids=%s graph_size=%s",
                    missing_after_refresh,
                    len(gen_code.dep_graph.graph),
                )
        settings = self._project_manager.settings_file.settings
        for callable_name, callable_section_ids in callables:
            for section_id in callable_section_ids:
                if section_id not in project_state.sections:
                    logger.warning(
                        "watch_code._update_sections_for_callables missing section_id=%s callable=%s",
                        section_id,
                        callable_name,
                    )
                    continue
                section_impl = get_curr_effective_section_impl(
                    project_state, section_id
                )
                if not isinstance(section_impl, CallableSectionImpl):
                    logger.debug(
                        "watch_code._update_sections_for_callables non-callable section_id=%s callable=%s section_type=%s",
                        section_id,
                        callable_name,
                        type(section_impl).__name__,
                    )
                    continue
                logger.debug(
                    "watch_code._update_sections_for_callables applying callable=%s section_id=%s",
                    callable_name,
                    section_id,
                )
                response = await gen_code.set_callable(
                    settings,
                    project_state,
                    section_id,
                    callable_name,
                    True,
                )
                logger.debug(
                    "watch_code._update_sections_for_callables set_callable_result callable=%s section_id=%s lsp_status=%s",
                    callable_name,
                    section_id,
                    response.lspStatus,
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
        project_state.parentSectionMap[section_id] = None
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

    def _remove_watch_code_identities(
        self,
        project_state: ProjectStateSingleConfig,
        identities: set[str],
    ) -> bool:
        if not identities:
            return False
        registry = project_state.projectConfig.watchCodeRegistry
        did_update = False
        for identity in sorted(identities):
            if identity not in registry:
                continue
            entry = registry[identity]
            self._cleanup_removed_callable(project_state, identity, entry)
            registry.pop(identity)
            did_update = True
        return did_update

    def _cleanup_removed_callable(
        self,
        project_state: ProjectStateSingleConfig,
        identity: str,
        entry: WatchCodeRegistryEntry,
    ) -> None:
        module_path, symbol_name = self._split_canonical_identity(identity)
        self._remove_gen_code_import(
            project_state,
            module_path,
            symbol_name,
            entry.callableName,
        )
        section_ids = self._prune_section_ids(project_state, entry)
        entry.sectionIds = section_ids
        entry.sectionsCount = len(section_ids)
        sections_to_delete: set[ID] = set()
        for section_id in section_ids:
            if section_id not in project_state.sections:
                continue
            core = project_state.sections[section_id]
            variants_to_remove: list[ID] = []
            for variant_id in list(core.variants):
                _, _, impl = (
                    get_variant_base_and_effective_section_impl_with_type_guard(
                        project_state,
                        core,
                        variant_id,
                        CallableSectionImpl,
                    )
                )
                if impl.callable is None:
                    continue
                callable_id = impl.callable
                if callable_id not in project_state.codeObjs:
                    raise KeyError(
                        f"Missing callable {callable_id} for section {section_id}."
                    )
                callable_obj = project_state.codeObjs[callable_id]
                if callable_obj.name == entry.callableName:
                    variants_to_remove.append(variant_id)
            if not variants_to_remove:
                continue
            remaining_variants = [
                variant_id
                for variant_id in core.variants
                if variant_id not in variants_to_remove
            ]
            if not remaining_variants:
                sections_to_delete.add(section_id)
                continue
            for variant_id in variants_to_remove:
                delete_section_variant(project_state, section_id, variant_id)
        if sections_to_delete:
            delete_sections(project_state, sorted(sections_to_delete))

    async def _notify_import_failure(
        self,
        project_config_id: ID,
        callable_name: str,
        *,
        source: str,
    ) -> None:
        key = (project_config_id, source)
        if key in self._notified_import_failures:
            return
        self._notified_import_failures.add(key)
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

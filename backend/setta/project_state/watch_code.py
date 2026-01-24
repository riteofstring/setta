import ast
import asyncio
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Iterable

from watchfiles import Change, awatch

from setta.logging.tasks import spawn_background_task
from setta.project_state.lsp_response_handlers.signatureHelp import SignatureHelpStatus
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl2 import (
    compute_smart_top_level_section_position,
    create_top_level_section,
    set_section_name,
)
from setta.types.project_config import WatchCodeFolder, WatchCodeRegistryEntry
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    CodeLanguage,
    CodeSectionImpl,
    SectionType,
)
from setta.utils.async_debouncer import AsyncDebouncer
from setta.utils.constants import CWD
from setta.utils.utils import compute_md5_hex, normalize_path

from .utils import convert_path_to_module_path

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.project_state.base_project_manager import BaseProjectManager
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)

TAG_MARKER = "setta-auto-detect"
SECTIONS_RE = re.compile(r"sections\s*=\s*(\d+)")
NO_DEFAULT_MARKER = "__setta_no_default__"
DEFAULT_DEBOUNCE_S = 0.3
IGNORED_DIR_NAMES = {"node_modules", ".venv", "setta_files"}


@dataclass(frozen=True)
class TaggedCallable:
    callable_name: str
    sections_count: int
    signature_hash: str
    source_path: Path


@dataclass(frozen=True)
class WatchSpec:
    root: Path
    recursive: bool
    is_file: bool


@dataclass
class _WatchTask:
    stop_event: asyncio.Event
    task: asyncio.Task
    specs: tuple[WatchSpec, ...]


def _resolve_watch_path(raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = CWD / candidate
    return candidate.resolve(strict=False)


def _normalize_sections_count(comment: str) -> int:
    match = SECTIONS_RE.search(comment)
    if not match:
        return 1
    count = int(match.group(1))
    return max(count, 1)


def _should_ignore_path(path: Path) -> bool:
    return any(part in IGNORED_DIR_NAMES for part in path.parts)


def _iter_watch_files(specs: Iterable[WatchSpec]) -> Iterable[Path]:
    for spec in specs:
        if spec.is_file:
            if spec.root.suffix == ".py" and not _should_ignore_path(spec.root):
                yield spec.root
            continue
        if not spec.root.exists():
            continue
        if spec.recursive:
            for path in spec.root.rglob("*.py"):
                if _should_ignore_path(path):
                    continue
                yield path
        else:
            for path in spec.root.glob("*.py"):
                if _should_ignore_path(path):
                    continue
                yield path


def _signature_hash_from_args(args: ast.arguments, *, skip_first: bool) -> str:
    params: list[dict[str, str | None]] = []
    positional = [*args.posonlyargs, *args.args]
    default_offset = len(positional) - len(args.defaults)
    for idx, arg in enumerate(positional):
        if skip_first and idx == 0:
            continue
        default_node = None
        if idx >= default_offset:
            default_node = args.defaults[idx - default_offset]
        default_repr = (
            NO_DEFAULT_MARKER
            if default_node is None
            else ast.dump(default_node, include_attributes=False)
        )
        kind = "positional_only" if idx < len(args.posonlyargs) else "positional"
        params.append({"kind": kind, "name": arg.arg, "default": default_repr})
    if args.vararg is not None:
        params.append(
            {"kind": "var_positional", "name": args.vararg.arg, "default": None}
        )
    for kw_arg, kw_default in zip(args.kwonlyargs, args.kw_defaults, strict=False):
        default_repr = (
            NO_DEFAULT_MARKER
            if kw_default is None
            else ast.dump(kw_default, include_attributes=False)
        )
        params.append(
            {"kind": "keyword_only", "name": kw_arg.arg, "default": default_repr}
        )
    if args.kwarg is not None:
        params.append({"kind": "var_keyword", "name": args.kwarg.arg, "default": None})
    payload = json.dumps(params, sort_keys=True)
    return compute_md5_hex(payload)


def _signature_hash_for_node(node: ast.AST) -> str:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return _signature_hash_from_args(node.args, skip_first=False)
    if isinstance(node, ast.ClassDef):
        for child in node.body:
            if (
                isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                and child.name == "__init__"
            ):
                return _signature_hash_from_args(child.args, skip_first=True)
        return compute_md5_hex("[]")
    return compute_md5_hex("[]")


def parse_tagged_callables(
    source: str, *, module_path: str, source_path: Path
) -> list[TaggedCallable]:
    lines = source.splitlines()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    output: list[TaggedCallable] = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        if node.lineno is None or node.lineno < 2:
            continue
        if node.lineno - 2 >= len(lines):
            continue
        prev_line = lines[node.lineno - 2].strip()
        if not prev_line.startswith("#"):
            continue
        if TAG_MARKER not in prev_line:
            continue
        sections_count = _normalize_sections_count(prev_line)
        callable_name = f"{module_path}.{node.name}"
        signature_hash = _signature_hash_for_node(node)
        output.append(
            TaggedCallable(
                callable_name=callable_name,
                sections_count=sections_count,
                signature_hash=signature_hash,
                source_path=source_path,
            )
        )
    return output


class WatchCodeManager:
    def __init__(
        self,
        *,
        project_manager: "BaseProjectManager",
        dbe: "DBE",
        websocket_msg_handler: "WMHFrontendSender",
        debounce_s: float = DEFAULT_DEBOUNCE_S,
    ) -> None:
        self.project_manager = project_manager
        self.dbe = dbe
        self.websocket_msg_handler = websocket_msg_handler
        self._debounce_s = debounce_s
        self._debouncers: dict[tuple[str, Path], AsyncDebouncer] = {}
        self._file_hashes: dict[tuple[str, Path], str] = {}
        self._watch_tasks: dict[str, _WatchTask] = {}
        self._external_path_notified: set[tuple[str, Path]] = set()

    async def configure_project(self, project_state: ProjectStateSingleConfig) -> None:
        project_config = project_state.projectConfig
        project_config_id = project_config.id
        if not project_config.watchCodeEnabled:
            await self._stop_watcher(project_config_id)
            return
        specs = self._build_watch_specs(
            project_config.watchCodeFolders, project_config.watchCodeFiles
        )
        await self._start_or_update_watcher(project_config_id, specs)
        await self._initial_scan(project_state, specs)

    def queue_inline_update(
        self,
        project_config_id: str,
        source_path: Path,
        source: str,
    ) -> None:
        self._queue_source_update(project_config_id, source_path, source)

    def queue_file_update(
        self,
        project_config_id: str,
        source_path: Path,
        source: str | None,
    ) -> None:
        if source is None:
            return
        self._queue_source_update(project_config_id, source_path, source)

    def _queue_source_update(
        self, project_config_id: str, source_path: Path, source: str
    ) -> None:
        key = (project_config_id, source_path)
        content_hash = compute_md5_hex(source)
        if self._file_hashes.get(key) == content_hash:
            return
        self._file_hashes[key] = content_hash
        debouncer = self._debouncers.get(key)
        if debouncer is None:
            debouncer = AsyncDebouncer(
                self._apply_source_update,
                wait=self._debounce_s,
                label=f"watch-code:{project_config_id}",
            )
            self._debouncers[key] = debouncer
        debouncer.trigger(project_config_id, source_path, source)

    async def _apply_source_update(
        self,
        project_config_id: str,
        source_path: Path,
        source: str,
    ) -> None:
        normalized = normalize_path(source_path)
        module_path = convert_path_to_module_path(normalized)
        tagged_callables = parse_tagged_callables(
            source,
            module_path=module_path,
            source_path=source_path,
        )
        if not tagged_callables:
            return
        await self._apply_tagged_callables(
            project_config_id, source_path, tagged_callables
        )

    def _build_watch_specs(
        self,
        folders: list[WatchCodeFolder],
        files: list[str],
    ) -> tuple[WatchSpec, ...]:
        specs: list[WatchSpec] = []
        for folder in folders:
            resolved = _resolve_watch_path(folder.path)
            if not resolved.exists():
                continue
            specs.append(
                WatchSpec(
                    root=resolved,
                    recursive=folder.recursive,
                    is_file=resolved.is_file(),
                )
            )
        for raw in files:
            resolved = _resolve_watch_path(raw)
            if not resolved.exists():
                continue
            specs.append(
                WatchSpec(
                    root=resolved,
                    recursive=False,
                    is_file=True,
                )
            )
        return tuple(dict.fromkeys(specs))

    async def _initial_scan(
        self,
        project_state: ProjectStateSingleConfig,
        specs: tuple[WatchSpec, ...],
    ) -> None:
        project_config_id = project_state.projectConfig.id
        for section_id, core in project_state.sections.items():
            section_impl = self._get_code_section_impl(project_state, section_id)
            if section_impl is None:
                continue
            binding = section_impl.codeFileBinding
            if binding is None:
                continue
            self.queue_inline_update(
                project_config_id, binding.canonical_path, section_impl.code
            )
        for path in _iter_watch_files(specs):
            content = self._read_text_file(path)
            if content is None:
                continue
            self.queue_file_update(project_config_id, path, content)

    def _get_code_section_impl(
        self, project_state: ProjectStateSingleConfig, section_id: str
    ) -> BaseCodeSectionImpl | None:
        impl = get_curr_effective_section_impl(project_state, section_id)
        if (
            isinstance(impl, CodeSectionImpl)
            and impl.codeLanguage == CodeLanguage.python
        ):
            return impl
        return None

    def _read_text_file(self, path: Path) -> str | None:
        raw = self.dbe.read(path)
        if raw in (None, b"", ""):
            return None
        return str(raw)

    async def _start_or_update_watcher(
        self, project_config_id: str, specs: tuple[WatchSpec, ...]
    ) -> None:
        if not specs:
            await self._stop_watcher(project_config_id)
            return
        existing = self._watch_tasks.get(project_config_id)
        if existing and existing.specs == specs:
            return
        await self._stop_watcher(project_config_id)
        stop_event = asyncio.Event()
        task = spawn_background_task(
            self._watch_loop(project_config_id, specs, stop_event),
            label=f"watch-code:{project_config_id}",
        )
        self._watch_tasks[project_config_id] = _WatchTask(
            stop_event=stop_event,
            task=task,
            specs=specs,
        )

    async def _stop_watcher(self, project_config_id: str) -> None:
        existing = self._watch_tasks.pop(project_config_id, None)
        if existing is None:
            return
        existing.stop_event.set()
        existing.task.cancel()
        try:
            await existing.task
        except asyncio.CancelledError:
            pass

    async def _watch_loop(
        self,
        project_config_id: str,
        specs: tuple[WatchSpec, ...],
        stop_event: asyncio.Event,
    ) -> None:
        paths = tuple(spec.root for spec in specs)
        if not paths:
            return
        try:
            async for changes in awatch(
                *paths,
                stop_event=stop_event,
                watch_filter=self._build_watch_filter(specs),
            ):
                if not changes:
                    continue
                for change, raw_path in changes:
                    if change == Change.deleted:
                        continue
                    candidate = Path(raw_path).resolve(strict=False)
                    if candidate.suffix != ".py":
                        continue
                    content = self._read_text_file(candidate)
                    if content is None:
                        continue
                    self.queue_file_update(project_config_id, candidate, content)
        except asyncio.CancelledError:
            raise
        finally:
            stop_event.set()

    def _build_watch_filter(self, specs: tuple[WatchSpec, ...]):
        allowed_changes = {Change.added, Change.modified, Change.deleted}

        def _filter(change: Change, path: str) -> bool:
            if change not in allowed_changes:
                return False
            candidate = Path(path).resolve(strict=False)
            if _should_ignore_path(candidate):
                return False
            if candidate.suffix != ".py":
                return False
            for spec in specs:
                if spec.is_file:
                    if candidate == spec.root:
                        return True
                else:
                    if spec.recursive and candidate.is_relative_to(spec.root):
                        return True
                    if not spec.recursive and candidate.parent == spec.root:
                        return True
            return False

        return _filter

    async def _apply_tagged_callables(
        self,
        project_config_id: str,
        source_path: Path,
        tagged_callables: list[TaggedCallable],
    ) -> None:
        project_state = self.project_manager.get_single_config_state(project_config_id)
        if not project_state.projectConfig.watchCodeEnabled:
            return
        if not self.project_manager._has_python_codegen(project_state.projectConfig):
            return
        gen_code = self.project_manager._require_python_codegen(project_config_id)
        settings = self.project_manager.settings_file.settings
        registry = project_state.projectConfig.watchCodeRegistry
        normalized = normalize_path(source_path)
        if normalized.is_absolute():
            key = (project_config_id, normalized)
            if key not in self._external_path_notified:
                self._external_path_notified.add(key)
                await self.project_manager.notify_watch_code_external_path(
                    project_config_id, normalized
                )

        changed = False
        for tagged in tagged_callables:
            entry = registry.get(tagged.callable_name)
            new_section_ids: list[str] = []
            if entry is None:
                entry = WatchCodeRegistryEntry(
                    sectionsCount=tagged.sections_count,
                    signatureHash=tagged.signature_hash,
                    sourcePath=str(tagged.source_path),
                    sectionIds=[],
                )
                registry[tagged.callable_name] = entry
                changed = True
            else:
                entry.sourcePath = str(tagged.source_path)
            current_section_ids = [
                sid for sid in entry.sectionIds if sid in project_state.sections
            ]
            if len(current_section_ids) != len(entry.sectionIds):
                entry.sectionIds = current_section_ids
                changed = True
            if len(entry.sectionIds) > entry.sectionsCount:
                entry.sectionsCount = len(entry.sectionIds)
                changed = True
            if tagged.sections_count > entry.sectionsCount:
                entry.sectionsCount = tagged.sections_count
                changed = True
            new_sections_needed = max(entry.sectionsCount - len(entry.sectionIds), 0)
            for _ in range(new_sections_needed):
                position, _ = compute_smart_top_level_section_position(
                    settings,
                    project_state,
                    SectionType.Callable,
                    None,
                    None,
                    None,
                )
                section_id = create_top_level_section(
                    settings,
                    project_state,
                    SectionType.Callable,
                    position,
                )
                set_section_name(project_state, section_id, tagged.callable_name)
                entry.sectionIds.append(section_id)
                new_section_ids.append(section_id)
                changed = True
            signature_changed = entry.signatureHash != tagged.signature_hash
            for section_id in entry.sectionIds:
                if signature_changed or section_id in new_section_ids:
                    response = await gen_code.set_callable(
                        settings,
                        project_state,
                        section_id,
                        tagged.callable_name,
                        True,
                    )
                    if response.lspStatus is SignatureHelpStatus.NO_MATCH:
                        await self.project_manager.notify_watch_code_import_failure(
                            project_config_id, tagged.callable_name
                        )
                    changed = True
            if signature_changed:
                entry.signatureHash = tagged.signature_hash

        if changed:
            await self.project_manager.update_and_broadcast_project_state(project_state)

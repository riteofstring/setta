import logging
import shlex
import uuid
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from setta.database.db_objs import DBE
from setta.lsp.managers import LSPWriters
from setta.project_state.utils import (
    convert_path_to_module_path,
    create_timestamped_folder,
)
from setta.types.id import ID
from setta.types.section_impls import CodeFileAccessMode, CodeFileBinding
from setta.utils.utils import compute_md5_hex, normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.project_state.code_files import CodeFileMetadata, CodeFiles

logger = logging.getLogger(__name__)

RunCommandBuilder = Callable[[Path], str]
SnapshotSectionInput = tuple[str, CodeFileBinding, RunCommandBuilder]


@dataclass(frozen=True)
class SnapshotCodeSection:
    code: str
    binding: CodeFileBinding
    run_command_builder: RunCommandBuilder


def build_python_module_run_command(path: Path) -> str:
    normalized = normalize_path(path)
    module_path = convert_path_to_module_path(normalized)
    return f"python -m {module_path}"


def build_python_file_run_command(path: Path) -> str:
    resolved = shlex.quote(str(path.resolve()))
    return f"python {resolved}"


def build_bash_run_command(
    path: Path,
    *,
    use_absolute: bool = False,
    quote: bool = False,
) -> str:
    resolved = path.resolve() if use_absolute else normalize_path(path)
    rendered = str(resolved)
    if quote:
        rendered = shlex.quote(rendered)
    return f"bash {rendered}"


def write_snapshot_file(
    dbe: DBE,
    target_folder: Path,
    binding: CodeFileBinding,
    code: str,
) -> Path:
    target_folder.mkdir(parents=True, exist_ok=True)
    target_path = target_folder / binding.canonical_path.name
    dbe.write(target_path, code)
    return target_path


def create_snapshot_run_command(
    *,
    dbe: DBE,
    snapshot_root: Path,
    entry_section_id: ID | None,
    gen_code: str,
    gen_binding: CodeFileBinding,
    code_sections: dict[ID, SnapshotCodeSection],
    gen_command_builder: RunCommandBuilder,
) -> str:
    target_folder = create_timestamped_folder(snapshot_root)
    gen_code_path = write_snapshot_file(dbe, target_folder, gen_binding, gen_code)
    code_paths: dict[ID, Path] = {}
    for section_id, section in code_sections.items():
        code_paths[section_id] = write_snapshot_file(
            dbe,
            target_folder,
            section.binding,
            section.code,
        )
    if entry_section_id:
        if entry_section_id not in code_paths:
            raise KeyError(f"Missing code section for run: {entry_section_id}")
        section = code_sections[entry_section_id]
        return section.run_command_builder(code_paths[entry_section_id])
    return gen_command_builder(gen_code_path)


def create_snapshot_run_command_from_sections(
    *,
    dbe: DBE,
    snapshot_root: Path,
    entry_section_id: ID | None,
    gen_code: str,
    gen_binding: CodeFileBinding,
    section_inputs: dict[ID, SnapshotSectionInput],
    gen_command_builder: RunCommandBuilder,
) -> str:
    snapshot_sections: dict[ID, SnapshotCodeSection] = {}
    for section_id, (code, binding, run_command_builder) in section_inputs.items():
        snapshot_sections[section_id] = SnapshotCodeSection(
            code=code,
            binding=binding,
            run_command_builder=run_command_builder,
        )
    return create_snapshot_run_command(
        dbe=dbe,
        snapshot_root=snapshot_root,
        entry_section_id=entry_section_id,
        gen_code=gen_code,
        gen_binding=gen_binding,
        code_sections=snapshot_sections,
        gen_command_builder=gen_command_builder,
    )


class Code(ABC):
    def __init__(self, dbe: DBE, code_files: "CodeFiles", binding: "CodeFileBinding"):
        self.dbe = dbe
        self.code_files = code_files
        self.binding = binding

    def get_base_filename(self):
        return self.binding.canonical_path.stem

    @abstractmethod
    def get_extension(self):
        pass

    @abstractmethod
    def get_run_command(self):
        pass

    def write_to_disk(self, code: str) -> bool:
        filepath = self.binding.canonical_path
        access_mode = self.code_files.get_access_mode(filepath)
        if access_mode == CodeFileAccessMode.read_only:
            logger.debug("Skipping write for read-only file %s", filepath)
            return False

        code_hash = compute_md5_hex(code)

        metadata: CodeFileMetadata | None = self.code_files.get_metadata(filepath)
        content_already_synced = (
            filepath.exists()
            and metadata is not None
            and (
                metadata.last_read_hash == code_hash
                or metadata.last_written_hash == code_hash
            )
        )

        self.code_files.record_write(filepath, code_hash)
        if content_already_synced:
            logger.debug("Skipping write for %s; content hash unchanged", filepath)
            return False

        logger.debug("Writing canonical file %s", filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        self.dbe.write(filepath, code)
        return True

    async def sync_lsp(self, _code: str) -> None:
        return None

    async def handle_external_reload(self, new_code: str) -> None:
        """Refresh in-memory state after the canonical file was reloaded."""
        setattr(self, "code", new_code)

    def write_to_folder(self, code: str, folder: Path) -> Path:
        folder.mkdir(parents=True, exist_ok=True)
        target_path = folder / self.binding.canonical_path.name
        self.dbe.write(target_path, code)
        return target_path


class PythonCode(Code):
    def __init__(
        self,
        dbe: DBE,
        code_files: "CodeFiles",
        binding: "CodeFileBinding",
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
    ):
        super().__init__(dbe, code_files, binding)
        self.lsp_writer = lsp_writers.full
        self.websocket_msg_handler = websocket_msg_handler
        self.uri: str = ""

    async def sync_lsp(self, code: str) -> None:
        await self.send_document_open_request(code)

    async def send_document_open_request(self, code):
        if self.lsp_writer is None:
            return
        filepath = self.binding.canonical_path
        self.uri = await self.lsp_writer.send_document_open_request(
            filepath=filepath,
            code=code,
            diagnostics_callback=self.diagnostics_callback,
        )

    def callback_cleanup(self):
        if self.lsp_writer is None:
            return
        if self.diagnostics_callback and self.uri:
            self.lsp_writer.remove_diagnostics_response_callback(self.uri)

    def get_extension(self):
        return "py"

    def get_run_command(self, path: Path):
        return build_python_module_run_command(path)

    @abstractmethod
    async def diagnostics_callback(self, lsp_response):
        pass

    @asynccontextmanager
    async def temporary_document(self, code: str):
        snapshot_dir = self.binding.snapshot_dir
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        filepath = (
            snapshot_dir
            / f"{self.get_base_filename()}__{uuid.uuid4().hex}.{self.get_extension()}"
        )
        uri: str | None = None
        try:
            self.dbe.write(filepath, code)
            if self.lsp_writer is None:
                yield filepath
                return
            uri = await self.lsp_writer.send_document_open_request(
                filepath=filepath,
                code=code,
            )
            yield filepath
        finally:
            if uri:
                await self.lsp_writer.send_document_close_request(filepath)
            if filepath.exists():
                filepath.unlink()


class BashCode(Code):
    def get_extension(self):
        return "sh"

    def get_run_command(self, path: Path):
        return build_bash_run_command(path)

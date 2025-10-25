from __future__ import annotations

import hashlib
import logging
import uuid
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.lsp.managers import LSPWriters
from setta.project_state.utils import convert_path_to_module_path
from setta.types.section_impls import CodeFileAccessMode, CodeFileBinding
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.project_state.code_files import CodeFiles, CodeFileMetadata

logger = logging.getLogger(__name__)


class Code(ABC):
    def __init__(self, dbe: DBE, code_files: CodeFiles, binding: CodeFileBinding):
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

    def update_file(self, code: str) -> bool:
        filepath = self.binding.canonical_path
        access_mode = self.code_files.get_access_mode(filepath)
        if access_mode == CodeFileAccessMode.read_only:
            logger.debug("Skipping write for read-only file %s", filepath)
            return False

        code_hash = hashlib.md5(code.encode("utf-8")).hexdigest()

        metadata: CodeFileMetadata | None = self.code_files.get_metadata(filepath)
        content_already_synced = (
            metadata is not None
            and (
                metadata.last_read_hash == code_hash
                or metadata.last_written_hash == code_hash
            )
        )

        self.code_files.record_write(filepath, code_hash)
        if content_already_synced:
            logger.debug(
                "Skipping write for %s; content hash unchanged", filepath
            )
            return False

        logger.debug("Writing canonical file %s", filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        self.dbe.write(filepath, code)
        return True

    def write_to_folder(self, code: str, folder: Path) -> Path:
        folder.mkdir(parents=True, exist_ok=True)
        target_path = folder / self.binding.canonical_path.name
        self.dbe.write(target_path, code)
        return target_path


class PythonCode(Code):
    def __init__(
        self,
        dbe: DBE,
        code_files: CodeFiles,
        binding: CodeFileBinding,
        lsp_writers: LSPWriters,
        websocket_msg_handler: WMHFrontendSender,
    ):
        super().__init__(dbe, code_files, binding)
        self.lsp_writer = lsp_writers.full
        self.websocket_msg_handler = websocket_msg_handler
        self.uri: str = ""

    async def update_file(self, code):
        wrote = super().update_file(code)
        if wrote:
            await self.send_document_open_request(code)

    async def send_document_open_request(self, code):
        filepath = self.binding.canonical_path
        if filepath.exists():
            self.uri = await self.lsp_writer.send_document_open_request(
                filepath=filepath,
                code=code,
                diagnostics_callback=self.diagnostics_callback,
            )

    def callback_cleanup(self):
        if self.diagnostics_callback and self.uri:
            self.lsp_writer.remove_diagnostics_response_callback(self.uri)

    def get_extension(self):
        return "py"

    def get_run_command(self, path: Path):
        path = normalize_path(path)
        module_path = convert_path_to_module_path(path)
        return f"python -m {module_path}"

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
        path = normalize_path(path)
        return f"bash {path}"

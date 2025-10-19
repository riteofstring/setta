# pyright: reportMissingImports=false
import asyncio
import tempfile
import unittest
from pathlib import Path

from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.code_files import (
    CodeFileMetadata,
    CodeFiles,
    RegisteredCodeFileBinding,
)
from setta.types.section_impls import CodeFileAccessMode
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def register_binding(
    manager: CodeFiles, path: Path, access_mode: CodeFileAccessMode
) -> RegisteredCodeFileBinding:
    binding = RegisteredCodeFileBinding(
        section_id="section",
        variant_id="variant",
        project_config_id="config",
        access_mode=access_mode,
    )
    manager.register_binding(path, binding)
    return binding


class CodeFilesTests(unittest.TestCase):
    def setUp(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._tmpdir = tempfile.TemporaryDirectory()
        root = Path(self._tmpdir.name).resolve()

        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        file_watcher = SpecificFileWatcher()
        dbe = DBE(root)

        self.manager = CodeFiles(frontend_sender, file_watcher, dbe)
        self.path = root / "code.py"

    def tearDown(self) -> None:
        asyncio.set_event_loop(None)
        self._loop.close()
        self._tmpdir.cleanup()

    def test_register_binding_tracks_metadata(self) -> None:
        binding = register_binding(
            self.manager, self.path, CodeFileAccessMode.read_write
        )

        self.assertEqual(self.manager.get_bindings(self.path), {binding})
        metadata = self.manager.get_metadata(self.path)
        self.assertIsNotNone(metadata)
        self.assertIsInstance(metadata, CodeFileMetadata)
        assert metadata is not None
        self.assertIsNone(metadata.last_read_hash)
        self.assertIsNone(metadata.last_written_hash)

    def test_register_binding_rejects_conflicting_access_modes(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_only)
        conflicting = RegisteredCodeFileBinding(
            section_id="section",
            variant_id="variant",
            project_config_id="config",
            access_mode=CodeFileAccessMode.write_only,
        )

        with self.assertRaises(ValueError):
            self.manager.register_binding(self.path, conflicting)

    def test_record_write_updates_metadata(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)

        self.manager.record_write(self.path, "hash")

        metadata = self.manager.get_metadata(self.path)
        self.assertIsNotNone(metadata)
        assert metadata is not None
        self.assertEqual(metadata.last_written_hash, "hash")
        self.assertFalse(metadata.has_conflict)

    def test_record_write_rejects_read_only(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_only)

        with self.assertRaises(PermissionError):
            self.manager.record_write(self.path, "hash")

    def test_should_reload_skips_known_write_hash(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)
        self.manager.record_write(self.path, "hash")

        should_reload = self.manager.should_reload(self.path, "hash")

        self.assertFalse(should_reload)
        metadata = self.manager.get_metadata(self.path)
        self.assertIsNotNone(metadata)
        assert metadata is not None
        self.assertEqual(metadata.last_read_hash, "hash")
        self.assertFalse(metadata.has_conflict)

    def test_should_reload_marks_conflict_on_external_change(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)
        self.manager.record_write(self.path, "hash-old")

        should_reload = self.manager.should_reload(self.path, "hash-new")

        self.assertTrue(should_reload)
        metadata = self.manager.get_metadata(self.path)
        self.assertIsNotNone(metadata)
        assert metadata is not None
        self.assertTrue(metadata.has_conflict)
        self.assertIsNone(metadata.last_read_hash)

    def test_should_reload_ignores_write_only_files(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.write_only)
        self.manager.record_write(self.path, "hash-old")

        should_reload = self.manager.should_reload(self.path, "hash-new")

        self.assertFalse(should_reload)
        metadata = self.manager.get_metadata(self.path)
        self.assertIsNotNone(metadata)
        assert metadata is not None
        self.assertTrue(metadata.has_conflict)

    def test_record_read_clears_conflict(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)
        self.manager.record_write(self.path, "hash-old")
        self.manager.should_reload(self.path, "hash-new")

        self.manager.record_read(self.path, "hash-new")

        metadata = self.manager.get_metadata(self.path)
        self.assertIsNotNone(metadata)
        assert metadata is not None
        self.assertEqual(metadata.last_read_hash, "hash-new")
        self.assertFalse(metadata.has_conflict)


if __name__ == "__main__":  # pragma: no cover - manual execution
    unittest.main()

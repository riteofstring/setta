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
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import CodeFileAccessMode, CodeFileBinding, CodeSectionImpl
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from setta.utils.utils import normalize_path
from setta.types.helpers_lvl3 import merge_single_config_into_backend


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
        self.path.touch()
        self.snapshot_dir = root / "snapshots"
        self.snapshot_dir.mkdir(exist_ok=True)

    def tearDown(self) -> None:
        asyncio.set_event_loop(None)
        self._loop.close()
        self._tmpdir.cleanup()

    def _build_project_state(self) -> tuple[ProjectStateSingleConfig, str, str, str]:
        code_impl = CodeSectionImpl(id="code-impl")
        code_impl.code = "print('sync test')"
        code_impl.codeFileBinding = CodeFileBinding(
            canonical_path=self.path,
            snapshot_dir=self.snapshot_dir,
            access_mode=CodeFileAccessMode.read_write,
        )
        variant = Variant(
            id="variant-main",
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            id="section-main",
            name="Main Section",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            id="config",
            name="Demo Project",
            sectionVariantMap={section.id: variant.id},
            topLevelSections={section.id: TopLevelSectionLayout()},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section.id: section},
            sectionImpls={code_impl.id: code_impl},
            sectionVariants={variant.id: variant},
        )
        return project_state, section.id, variant.id, project_config.id

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

    def test_watch_code_files_registers_callbacks(self) -> None:
        state, _, _, _ = self._build_project_state()
        backend = merge_single_config_into_backend(ProjectStateBackend(), state)

        category = "TestCategory"
        async def _reload(*args, **kwargs):  # pragma: no cover - stub
            return None

        self.manager.watch_code_files(category, lambda: backend, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))

        normalized = normalize_path(self.path)
        callbacks = self.manager.specific_file_watcher.callbacks.get(category, {})
        self.assertIn(normalized, callbacks)
        tracked_bindings = self.manager._category_to_bindings.get(category, {})
        self.assertIn(normalized, tracked_bindings)

    def test_watch_code_files_clears_callbacks_when_config_removed(self) -> None:
        state, _, _, _ = self._build_project_state()
        backend_holder = {
            "value": merge_single_config_into_backend(ProjectStateBackend(), state)
        }

        category = "TestCategory"

        async def _reload(*args, **kwargs):  # pragma: no cover - stub
            return None

        def _getter() -> ProjectStateBackend:
            return backend_holder["value"]

        self.manager.watch_code_files(category, _getter, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))
        normalized = normalize_path(self.path)
        callbacks = self.manager.specific_file_watcher.callbacks.get(category, {})
        self.assertIn(normalized, callbacks)

        backend_holder["value"] = ProjectStateBackend()
        self.manager.watch_code_files(category, _getter, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))

        callbacks_after = self.manager.specific_file_watcher.callbacks.get(
            category, {}
        )
        self.assertEqual(callbacks_after, {})
        tracked_bindings = self.manager._category_to_bindings.get(category, {})
        self.assertEqual(tracked_bindings, {})

    def test_watch_code_files_refreshes_bindings_from_backend(self) -> None:
        state, section_id, variant_id, project_config_id = self._build_project_state()
        backend = merge_single_config_into_backend(ProjectStateBackend(), state)

        category = "TestCategory"

        async def _reload(*args, **kwargs):  # pragma: no cover - stub
            return None

        # Pre-populate bindings with unrelated data to ensure the watcher refresh clears it.
        stale_path = normalize_path(self.path.parent / "stale.py")
        stale_binding = RegisteredCodeFileBinding(
            section_id="old",
            variant_id="old",
            project_config_id="old-config",
            access_mode=CodeFileAccessMode.read_only,
        )
        self.manager._bindings[stale_path] = {stale_binding}

        self.manager.watch_code_files(category, lambda: backend, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))

        bindings = self.manager.get_bindings(self.path)
        self.assertEqual(len(bindings), 1)
        (binding,) = tuple(bindings)
        self.assertEqual(binding.section_id, section_id)
        self.assertEqual(binding.variant_id, variant_id)
        self.assertEqual(binding.project_config_id, project_config_id)
        self.assertEqual(binding.access_mode, CodeFileAccessMode.read_write)
        self.assertNotIn(stale_path, self.manager._bindings)

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

import asyncio
import hashlib
import tempfile
from contextlib import suppress
from pathlib import Path
from unittest.mock import patch

import pytest
from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.code import BashCode
from setta.project_state.code_files import (
    CodeFileMetadata,
    CodeFiles,
    RegisteredCodeFileBinding,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeSectionImpl,
)
from setta.utils.paths import normalize_workspace_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def register_binding(
    manager: CodeFiles, path: Path, access_mode: CodeFileAccessMode
) -> RegisteredCodeFileBinding:
    binding = RegisteredCodeFileBinding(
        section_id=ID("section"),
        variant_id=ID("variant"),
        project_config_id=ID("config"),
        access_mode=access_mode,
    )
    manager.register_binding(path, binding)
    return binding


class TestCodeFiles:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
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

        yield

        asyncio.set_event_loop(None)
        self._loop.close()
        self._tmpdir.cleanup()

    def _build_project_state(self) -> tuple[ProjectStateSingleConfig, str, str, str]:
        code_impl = CodeSectionImpl(id=ID("code-impl"))
        code_impl.code = "print('sync test')"
        code_impl.codeFileBinding = CodeFileBinding(
            canonical_path=self.path,
            access_mode=CodeFileAccessMode.read_write,
        )
        variant = Variant(
            id=ID("variant-main"),
            impl=code_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
        )
        section = Core(
            id=ID("section-main"),
            name="Main Section",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            id=ID("config"),
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

        assert self.manager.get_bindings(self.path) == {binding}
        metadata = self.manager.get_metadata(self.path)
        assert metadata is not None
        assert isinstance(metadata, CodeFileMetadata)
        assert metadata is not None
        assert metadata.last_read_hash is None
        assert metadata.last_written_hash is None

    def test_register_binding_updates_existing_access_mode(self) -> None:
        original = register_binding(
            self.manager, self.path, CodeFileAccessMode.read_write
        )
        updated = RegisteredCodeFileBinding(
            section_id=original.section_id,
            variant_id=original.variant_id,
            project_config_id=original.project_config_id,
            access_mode=CodeFileAccessMode.read_only,
        )

        self.manager.register_binding(self.path, updated)

        assert self.manager.get_bindings(self.path) == {updated}

    def test_register_binding_rejects_conflicts_for_other_sections(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_only)
        conflicting = RegisteredCodeFileBinding(
            section_id=ID("other-section"),
            variant_id=ID("variant"),
            project_config_id=ID("config"),
            access_mode=CodeFileAccessMode.write_only,
        )

        with pytest.raises(ValueError):
            self.manager.register_binding(self.path, conflicting)

    def test_record_write_updates_metadata(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)

        self.manager.record_write(self.path, "hash")

        metadata = self.manager.get_metadata(self.path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.last_written_hash == "hash"
        assert not metadata.has_conflict

    def test_watch_code_files_registers_callbacks(self) -> None:
        state, _, _, _ = self._build_project_state()
        backend = merge_single_config_into_backend(ProjectStateBackend(), state)

        category = "TestCategory"

        async def _reload(_plan):  # pragma: no cover - stub
            return None

        self.manager.watch_code_files(category, lambda: backend, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))

        normalized = normalize_workspace_path(self.path)
        callbacks = self.manager.specific_file_watcher.callbacks.get(category, {})
        assert normalized in callbacks
        tracked_bindings = self.manager._category_to_bindings.get(category, {})
        assert normalized in tracked_bindings

    def test_watch_code_files_clears_callbacks_when_config_removed(self) -> None:
        state, _, _, _ = self._build_project_state()
        backend_holder = {
            "value": merge_single_config_into_backend(ProjectStateBackend(), state)
        }

        category = "TestCategory"

        async def _reload(_plan):  # pragma: no cover - stub
            return None

        def _getter() -> ProjectStateBackend:
            return backend_holder["value"]

        self.manager.watch_code_files(category, _getter, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))
        normalized = normalize_workspace_path(self.path)
        callbacks = self.manager.specific_file_watcher.callbacks.get(category, {})
        assert normalized in callbacks

        backend_holder["value"] = ProjectStateBackend()
        self.manager.watch_code_files(category, _getter, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))

        callbacks_after = self.manager.specific_file_watcher.callbacks.get(category, {})
        assert callbacks_after == {}
        tracked_bindings = self.manager._category_to_bindings.get(category, {})
        assert tracked_bindings == {}

    def test_watch_code_files_refreshes_bindings_from_backend(self) -> None:
        state, section_id, variant_id, project_config_id = self._build_project_state()
        backend = merge_single_config_into_backend(ProjectStateBackend(), state)

        category = "TestCategory"

        async def _reload(_plan):  # pragma: no cover - stub
            return None

        # Pre-populate bindings with unrelated data to ensure the watcher refresh clears it.
        stale_path = normalize_workspace_path(self.path.parent / "stale.py")
        stale_binding = RegisteredCodeFileBinding(
            section_id=ID("old"),
            variant_id=ID("old"),
            project_config_id=ID("old-config"),
            access_mode=CodeFileAccessMode.read_only,
        )
        self.manager._bindings[stale_path] = {stale_binding}

        self.manager.watch_code_files(category, lambda: backend, _reload)
        self._loop.run_until_complete(asyncio.sleep(0))

        bindings = self.manager.get_bindings(self.path)
        assert len(bindings) == 1
        (binding,) = tuple(bindings)
        assert binding.section_id == section_id
        assert binding.variant_id == variant_id
        assert binding.project_config_id == project_config_id
        assert binding.access_mode == CodeFileAccessMode.read_write
        assert stale_path not in self.manager._bindings

    def test_watch_code_files_uses_single_config_fast_path_when_provided(self) -> None:
        state, _, _, _ = self._build_project_state()
        backend = merge_single_config_into_backend(ProjectStateBackend(), state)

        category = "TestCategoryFastPath"

        async def _reload(_plan):  # pragma: no cover - stub
            return None

        with patch(
            "setta.project_state.code_files.convert_backend_to_single_config"
        ) as convert:
            convert.side_effect = AssertionError(
                "Fast path should not rebuild single-config slices."
            )
            self.manager.watch_code_files(
                category,
                lambda: backend,
                _reload,
                project_state=state,
            )
            self._loop.run_until_complete(asyncio.sleep(0))

        normalized = normalize_workspace_path(self.path)
        callbacks = self.manager.specific_file_watcher.callbacks.get(category, {})
        assert normalized in callbacks

    def test_record_write_rejects_read_only(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_only)

        with pytest.raises(PermissionError):
            self.manager.record_write(self.path, "hash")

    def test_should_reload_skips_known_write_hash(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)
        self.manager.record_write(self.path, "hash")

        should_reload = self.manager.should_reload(self.path, "hash")

        assert not should_reload
        metadata = self.manager.get_metadata(self.path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.last_read_hash == "hash"
        assert not metadata.has_conflict

    def test_should_reload_marks_conflict_on_external_change(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)
        self.manager.record_write(self.path, "hash-old")

        should_reload = self.manager.should_reload(self.path, "hash-new")

        assert should_reload
        metadata = self.manager.get_metadata(self.path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.has_conflict
        assert metadata.last_read_hash is None

    def test_should_reload_ignores_write_only_files(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.write_only)
        self.manager.record_write(self.path, "hash-old")

        should_reload = self.manager.should_reload(self.path, "hash-new")

        assert not should_reload
        metadata = self.manager.get_metadata(self.path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.has_conflict

    def test_record_read_clears_conflict(self) -> None:
        register_binding(self.manager, self.path, CodeFileAccessMode.read_write)
        self.manager.record_write(self.path, "hash-old")
        self.manager.should_reload(self.path, "hash-new")

        self.manager.record_read(self.path, "hash-new")

        metadata = self.manager.get_metadata(self.path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.last_read_hash == "hash-new"
        assert not metadata.has_conflict


class TestCodeWriteToDisk:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        root = Path(self._tmpdir.name).resolve()

        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self.websocket_manager = WebsocketManager()
        self.frontend_sender = WMHFrontendSender(self.websocket_manager)
        self.file_watcher = SpecificFileWatcher()
        self.dbe = DBE(root)
        self.code_files = CodeFiles(self.frontend_sender, self.file_watcher, self.dbe)

        yield

        with suppress(RuntimeError):
            self.file_watcher.stop()
        asyncio.set_event_loop(None)
        self._loop.close()
        self._tmpdir.cleanup()

    def _register_binding(
        self, filename: str, access_mode: CodeFileAccessMode
    ) -> CodeFileBinding:
        path = normalize_workspace_path(Path(self._tmpdir.name) / filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.touch()
        binding = CodeFileBinding(
            canonical_path=path,
            access_mode=access_mode,
        )
        registered = RegisteredCodeFileBinding(
            section_id=ID("section"),
            variant_id=ID("variant"),
            project_config_id=ID("config"),
            access_mode=access_mode,
        )
        self.code_files.register_binding(path, registered)
        return binding

    def test_write_to_disk_rejects_read_only_binding(self) -> None:
        binding = self._register_binding("readonly.sh", CodeFileAccessMode.read_only)
        code = BashCode(self.dbe, self.code_files, binding)

        with patch.object(self.dbe, "write", wraps=self.dbe.write) as mock_write:
            wrote = code.write_to_disk("echo 'blocked'")

        assert not wrote
        mock_write.assert_not_called()
        metadata = self.code_files.get_metadata(binding.canonical_path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.last_written_hash is None

    def test_write_to_disk_skips_noop_writes(self) -> None:
        binding = self._register_binding("noop.sh", CodeFileAccessMode.read_write)
        initial_content = "echo 'hello'"
        self.dbe.write(binding.canonical_path, initial_content)
        initial_hash = hashlib.md5(initial_content.encode("utf-8")).hexdigest()
        self.code_files.record_read(binding.canonical_path, initial_hash)
        code = BashCode(self.dbe, self.code_files, binding)

        with patch.object(self.dbe, "write", wraps=self.dbe.write) as mock_write:
            wrote = code.write_to_disk(initial_content)

        assert not wrote
        mock_write.assert_not_called()
        metadata = self.code_files.get_metadata(binding.canonical_path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.last_written_hash == initial_hash

    def test_write_to_disk_records_write_metadata(self) -> None:
        binding = self._register_binding("write.sh", CodeFileAccessMode.read_write)
        code = BashCode(self.dbe, self.code_files, binding)
        new_content = "echo 'updated'"
        expected_hash = hashlib.md5(new_content.encode("utf-8")).hexdigest()

        with patch.object(self.dbe, "write", wraps=self.dbe.write) as mock_write:
            wrote = code.write_to_disk(new_content)

        assert wrote
        mock_write.assert_called_once_with(binding.canonical_path, new_content)
        metadata = self.code_files.get_metadata(binding.canonical_path)
        assert metadata is not None
        assert metadata is not None
        assert metadata.last_written_hash == expected_hash
        assert not metadata.has_conflict
        disk_content = self.dbe.read(binding.canonical_path)
        assert disk_content == new_content

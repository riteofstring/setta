from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_state import ProjectStateCore
from setta.types.section_impls import DictSectionImpl
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.paths import normalize_workspace_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.setta_paths import temporary_setta_paths


def test_json_source_update_matches_relative_variant_paths() -> None:
    with TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        workspace_root = base / "workspace"
        setta_root = base / "setta_files"
        workspace_root.mkdir(parents=True, exist_ok=True)
        setta_root.mkdir(parents=True, exist_ok=True)
        (workspace_root / "json_sources").mkdir(parents=True, exist_ok=True)

        with temporary_setta_paths(
            workspace_root=workspace_root,
            setta_files_root=setta_root,
        ):
            websocket_manager = WebsocketManager()
            sender = WMHFrontendSender(websocket_manager)
            dbe = DBE(setta_root)
            settings_file = SettingsFile(dbe, sender)
            watcher = SpecificFileWatcher()
            json_source = JSONSource(sender, settings_file, watcher, dbe)

            impl = DictSectionImpl(
                id=ID("dict-impl"),
                isJsonSource=True,
            )
            variant = Variant(
                id=ID("variant-json"),
                name="json_sources/sample.json",
                impl=impl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(impl),
            )
            section = Core(
                id=ID("section-json"),
                variants=[variant.id],
                defaultVariant=variant.id,
            )
            project_state = ProjectStateCore(
                sections={section.id: section},
                sectionImpls={impl.id: impl},
                sectionVariants={variant.id: variant},
            )

            abs_path = normalize_workspace_path("json_sources/sample.json")
            update = FileWatcherCoreUpdate(
                absPath=abs_path,
                relPath=abs_path,
                eventType=FileEventType.modified,
                matchingGlobPatterns=[],
                fileToRead=abs_path,
            )
            matches = json_source.get_section_variants_for_json_source_update(
                project_state, update
            )
            assert matches == {(section.id, variant.id)}


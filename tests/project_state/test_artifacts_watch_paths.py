import tempfile
from pathlib import Path

from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.types.artifact import ArtifactType
from setta.types.core import Core, Variant
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import ChartSectionImpl, ImageSectionImpl
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _make_artifacts(dbe_root: Path) -> Artifacts:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager)
    file_watcher = SpecificFileWatcher()
    dbe = DBE(dbe_root)
    return Artifacts(frontend_sender, file_watcher, dbe)


def _make_project_state(impl: ImageSectionImpl | ChartSectionImpl) -> ProjectStateBackend:
    variant = Variant(impl=impl.id, nonPresetImpls=[impl.id])
    section = Core(variants=[variant.id], defaultVariant=variant.id)
    return ProjectStateBackend(
        sections={section.id: section},
        sectionVariants={variant.id: variant},
        sectionImpls={impl.id: impl},
    )


class TestArtifactWatchPaths:
    def test_skips_empty_image_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifacts = _make_artifacts(Path(temp_dir))
            project_state = _make_project_state(ImageSectionImpl(imagePath=""))

            path_and_types, path_to_types = artifacts.get_artifact_files_to_watch(
                project_state
            )

            assert path_and_types == set()
            assert Path(".") not in path_to_types

    def test_skips_empty_chart_data_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifacts = _make_artifacts(Path(temp_dir))
            project_state = _make_project_state(ChartSectionImpl(dataPath=""))

            path_and_types, path_to_types = artifacts.get_artifact_files_to_watch(
                project_state
            )

            assert path_and_types == set()
            assert Path(".") not in path_to_types

    def test_includes_valid_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifacts = _make_artifacts(Path(temp_dir))
            project_state = _make_project_state(
                ImageSectionImpl(imagePath="setta_files/artifacts/test.png")
            )

            path_and_types, path_to_types = artifacts.get_artifact_files_to_watch(
                project_state
            )

            expected_path = Path("setta_files/artifacts/test.png")
            assert (expected_path, ArtifactType.Image) in path_and_types
            assert path_to_types[expected_path] == {ArtifactType.Image}

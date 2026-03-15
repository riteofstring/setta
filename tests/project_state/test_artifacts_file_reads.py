import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, cast

from setta.binary import BinaryStore
from setta.database.db_objs import DBE
from setta.project_state.artifacts import Artifacts
from setta.types.artifact import FileArtifact
from setta.utils.paths import normalize_state_path
from setta.utils.utils import compute_md5_hex

if TYPE_CHECKING:
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class _StubFrontendSender:
    async def broadcast_artifacts_update(self, *args, **kwargs):
        raise AssertionError("broadcast_artifacts_update should not be called")


class _StubSpecificFileWatcher:
    def start(self):
        pass

    def update_callbacks(self, *args, **kwargs):
        pass


class TestArtifactFileRead:
    def test_read_file_from_disk_allows_empty_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root)
            websocket_handler = cast("WMHFrontendSender", _StubFrontendSender())
            file_watcher = cast("SpecificFileWatcher", _StubSpecificFileWatcher())
            artifacts = Artifacts(websocket_handler, file_watcher, dbe)

            file_path = root / "artifacts" / "empty.bin"
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(b"")

            artifact = artifacts.read_file_from_disk(file_path)

            assert isinstance(artifact, FileArtifact)
            assert artifact.value.byteLength == 0
            binary_store = BinaryStore.from_dbe(dbe)
            assert binary_store.read_bytes(artifact.value.contentId) == b""
            normalized_path = normalize_state_path(file_path)
            assert normalized_path in artifacts.files
            metadata = artifacts.file_metadata[normalized_path]
            assert compute_md5_hex(b"") == metadata.last_read_hash

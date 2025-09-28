import base64
from pathlib import Path
from typing import TYPE_CHECKING, Any

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.artifact import (
    ArtifactType,
    ImageArtifact,
)
from setta.types.helpers_lvl1 import get_variant_effective_section_impl
from setta.types.notifications import SettaNotification
from setta.types.section_impls import (
    ChartSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
)

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.project_state import ProjectStateBackend
    from setta.types.specific_file_watcher import FileWatcherCoreUpdate
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class Artifacts:
    def __init__(
        self,
        websocket_msg_handler: "WMHFrontendSender",
        specific_file_watcher: "SpecificFileWatcher",
        dbe: "DBE",
    ):
        self.websocket_msg_handler = websocket_msg_handler
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe
        self.artifacts: dict[tuple[Path, ArtifactType], Any] = {}

    def watch_artifact_files(
        self,
        callbackCategory: str,
        project_state_backend: "ProjectStateBackend",
    ):
        path_and_types = self.get_artifact_files_to_watch(project_state_backend)
        callbacks = {
            k[0]: self.get_artifact_file_watcher_callback() for k in path_and_types
        }
        fire_immediately: set[Path] = set(
            [k[0] for k in path_and_types if k not in self.artifacts]
        )
        self.specific_file_watcher.update_callbacks(
            callbacks, callbackCategory, fire_immediately
        )

    def get_artifact_file_watcher_callback(self) -> FileWatcherCallback:
        async def fn(coreUpdate: "FileWatcherCoreUpdate"):
            artifact = self.load_image(coreUpdate.fileToRead)
            await self.websocket_msg_handler.broadcast_artifact_update(
                artifact=artifact, updateType="update"
            )
            notification = SettaNotification(
                message=f"{coreUpdate.relPath} {coreUpdate.eventType.value}",
            )
            await self.websocket_msg_handler.broadcast_notification(notification)

        return fn

    def get_artifact_files_to_watch(self, p: "ProjectStateBackend"):
        path_and_types: set[tuple[Path, ArtifactType]] = set()
        for s in p.sections.values():
            for v in s.variants:
                impl = get_variant_effective_section_impl(p, s.id, v)
                if isinstance(impl, ImageSectionImpl):
                    path_and_types.add(
                        (Path(impl.imagePath).resolve(), ArtifactType.Image)
                    )
                elif isinstance(impl, DrawSectionImpl):
                    for layer in impl.layers:
                        for el in layer.elements:
                            path_and_types.add((Path(el.dataPath).resolve(), el.type))
                elif isinstance(impl, ChartSectionImpl):
                    path_and_types.add(
                        (Path(impl.dataPath).resolve(), ArtifactType.ChartData)
                    )

        return path_and_types

    def load_image(self, imagePath: Path):
        img = self.dbe.read(imagePath, "rb")
        if img:
            b64_str = base64.b64encode(img).decode("utf-8")
            artifact = ImageArtifact(
                id=str(imagePath), value=f"data:image/png;base64,{b64_str}"
            )
            self.artifacts[(imagePath, ArtifactType.Image)] = artifact
            return artifact
        else:
            raise ValueError

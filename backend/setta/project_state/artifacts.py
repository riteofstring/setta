import base64
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.artifact import (
    BrushStrokeMapping,
    ChartDataMapping,
    DrawAreaLayerItemTransformMapping,
    ImageArtifact,
    ImageMapping,
)
from setta.types.helpers_lvl1 import get_variant_effective_section_impl
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
        self.images: "ImageMapping" = {}
        self.brushStrokes: "BrushStrokeMapping" = {}
        self.chartData: "ChartDataMapping" = {}
        self.drawAreaLayerItemTransforms: "DrawAreaLayerItemTransformMapping" = {}
        self.artifact_to_section_mapping: dict[Path, list[str]] = {}

    def watch_artifact_files(
        self,
        callbackCategory: str,
        project_state_backend: "ProjectStateBackend",
    ):
        filename_set, new_artifact_to_section_mapping = (
            self.get_artifact_files_to_watch(project_state_backend)
        )
        # callbacks = {k: self.get_artifact_file_watcher_callback() for k in filename_set}
        # fire_immediately: list[Path] = []
        # for k, v in new_artifact_to_section_mapping.items():
        #     if self.artifact_to_section_mapping.get(k) != v:
        #         fire_immediately.append(k)

        # self.artifact_to_section_mapping = new_artifact_to_section_mapping
        # self.specific_file_watcher.update_callbacks(
        #     callbacks, self.__class__.__name__, fire_immediately
        # )

    def get_artifact_file_watcher_callback(self) -> FileWatcherCallback:
        async def fn(coreUpdate: "FileWatcherCoreUpdate"):
            self.load_image(str(coreUpdate.fileToRead), updateFileWatcher=False)

        return fn

    def get_artifact_files_to_watch(self, p: "ProjectStateBackend"):
        filename_set: set[Path] = set()
        artifact_to_section_mapping: dict[Path, list[str]] = defaultdict(list)
        for s in p.sections.values():
            for v in s.variants:
                impl = get_variant_effective_section_impl(p, s.id, v)
                currPaths: set[Path] = set()
                if isinstance(impl, ImageSectionImpl):
                    currPaths.add(Path(impl.imagePath))
                elif isinstance(impl, DrawSectionImpl):
                    for layer in impl.layers:
                        for el in layer.elements:
                            currPaths.add(Path(el.dataPath))
                elif isinstance(impl, ChartSectionImpl):
                    currPaths.add(Path(impl.dataPath))
                if len(currPaths) > 0:
                    filename_set.update(currPaths)
                    for curr in currPaths:
                        artifact_to_section_mapping[curr].append(s.id)

        return filename_set, artifact_to_section_mapping

    def load_image(self, imagePath: str, updateFileWatcher=True):
        img = self.dbe.read(Path(imagePath), "rb")
        if img:
            b64_str = base64.b64encode(img).decode("utf-8")
            artifact = ImageArtifact(
                id=imagePath, value=f"data:image/png;base64,{b64_str}"
            )
            self.images[imagePath] = artifact

    # async def broadcast_update(
    #     self, artifact: BaseArtifactUnion, updateType: Literal["update", "delete"]
    # ):
    #     await self.websocket_msg_handler.broadcast_artifact_update(
    #         artifact=artifact, updateType=updateType
    #     )

    # def update_file_watcher_callbacks(self):
    #     callbacks = {
    #         Path(k).resolve(): self.get_artifact_file_watcher_callback()
    #         for k in self.images.keys()
    #     }
    #     self.specific_file_watcher.update_callbacks(
    #         callbacks,
    #         "artifact",
    #     )

import base64
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, assert_never

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.artifact import (
    ArtifactType,
    BrushStrokeMapping,
    ChartData,
    ChartDataArtifact,
    ChartDataMapping,
    DrawAreaLayerItemTransformMapping,
    ImageArtifact,
    ImageMapping,
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
    from setta.types.generated.unions import BaseArtifactUnion
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
        self.images: ImageMapping = {}
        self.chart_data: ChartDataMapping = {}
        self.brush_strokes: BrushStrokeMapping = {}
        self.draw_area_layer_item_transforms: DrawAreaLayerItemTransformMapping = {}

    def watch_artifact_files(
        self,
        callbackCategory: str,
        project_state_backend: "ProjectStateBackend",
    ):
        path_and_types, path_to_types = self.get_artifact_files_to_watch(
            project_state_backend
        )
        callbacks = {
            k: self.get_artifact_file_watcher_callback(types)
            for k, types in path_to_types.items()
        }
        fire_immediately: set[Path] = set(
            [
                k[0]
                for k in path_and_types
                if k[0] not in self.dict_for_artifact_type(k[1])
            ]
        )
        self.specific_file_watcher.update_callbacks(
            callbacks, callbackCategory, fire_immediately
        )

    def get_artifact_file_watcher_callback(
        self, types: set[ArtifactType]
    ) -> FileWatcherCallback:
        async def fn(coreUpdate: "FileWatcherCoreUpdate"):
            artifacts: list[BaseArtifactUnion] = []
            for t in types:
                artifact = None
                if t == ArtifactType.Image:
                    artifact = self.read_image_from_disk(coreUpdate.fileToRead)
                elif t == ArtifactType.ChartData:
                    artifact = self.read_chart_data_from_disk(coreUpdate.fileToRead)
                if artifact:
                    artifacts.append(artifact)

            await self.websocket_msg_handler.broadcast_artifacts_update(
                artifacts=artifacts, updateType="update"
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

        path_to_types: dict[Path, set[ArtifactType]] = defaultdict(set)
        for path, artifact_type in path_and_types:
            path_to_types[path].add(artifact_type)

        return path_and_types, path_to_types

    def read_image_from_disk(self, path: Path):
        img = self.dbe.read(path, "rb")
        if img:
            b64_str = base64.b64encode(img).decode("utf-8")
            artifact = ImageArtifact(
                id=str(path), value=f"data:image/png;base64,{b64_str}"
            )
            self.images[path] = artifact
            return artifact
        raise ValueError

    def read_chart_data_from_disk(self, path: Path):
        x = self.dbe.read(path)
        if x:
            value = parse_csv_content(x)
            artifact = ChartDataArtifact(id=str(path), value=value)
            self.chart_data[path] = artifact
            return artifact
        raise ValueError

    def get_cached_image(self, path: Path):
        return self.images.get(path)

    def get_cached_chart_data(self, path: Path):
        return self.chart_data.get(path)

    def dict_for_artifact_type(self, x: ArtifactType):
        match x:
            case ArtifactType.Image:
                return self.images
            case ArtifactType.ChartData:
                return self.chart_data
            case ArtifactType.BrushStroke:
                return self.brush_strokes
            case ArtifactType.DrawAreaLayerItemTransform:
                return self.draw_area_layer_item_transforms
            case _:
                assert_never(x)


def parse_csv_row(values):
    row: list[str | float] = []
    for x in values:
        if x.strip() == "":
            row.append("")
        else:
            try:
                row.append(float(x))
            except ValueError:
                row.append(x)
    return row


def parse_csv_content(content: str) -> ChartData:
    lines = content.strip().split("\n")
    if not lines:
        return {}

    headers = [h.strip() for h in lines[0].split(",")]
    result: ChartData = {header: [] for header in headers}

    if not lines[1:]:
        return result

    # Parse rows and populate lists
    for line in lines[1:]:
        values = parse_csv_row(line.strip().split(","))
        for header, value in zip(headers, values):
            result[header].append(value)

    return result

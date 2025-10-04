import base64
import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, assert_never

from setta.file_watchers.specific_file_watcher import FileWatcherCallback
from setta.types.artifact import (
    ArtifactType,
    BrushStroke,
    BrushStrokeArtifact,
    BrushStrokeMapping,
    ChartData,
    ChartDataArtifact,
    ChartDataMapping,
    DrawAreaLayerItemTransform,
    DrawAreaLayerItemTransformArtifact,
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


@dataclass
class ArtifactMetadata:
    last_read_hash: str | None
    is_dirty: bool = False


class SaveConflictStrategy(str, Enum):
    skip = "skip"
    backup = "backup"
    overwrite = "overwrite"


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

        # Add metadata tracking
        self.image_metadata: dict[Path, ArtifactMetadata] = {}
        self.chart_data_metadata: dict[Path, ArtifactMetadata] = {}
        self.brush_stroke_metadata: dict[Path, ArtifactMetadata] = {}
        self.transform_metadata: dict[Path, ArtifactMetadata] = {}

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
                match t:
                    case ArtifactType.Image:
                        artifact = self.read_image_from_disk(coreUpdate.fileToRead)
                    case ArtifactType.ChartData:
                        artifact = self.read_chart_data_from_disk(coreUpdate.fileToRead)
                    case ArtifactType.BrushStroke:
                        artifact = self.read_brush_stroke_from_disk(
                            coreUpdate.fileToRead
                        )
                    case ArtifactType.DrawAreaLayerItemTransform:
                        artifact = self.read_transform_from_disk(coreUpdate.fileToRead)
                    case _:
                        assert_never(t)
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

    def _compute_hash(self, data: bytes):
        return hashlib.md5(data).hexdigest()

    def _compute_file_hash(self, path: Path):
        try:
            content = self.dbe.read(path, "rb")
            if content:
                return self._compute_hash(content)
        except:
            pass
        return None

    def read_image_from_disk(self, path: Path):
        img = self.dbe.read(path, "rb")
        if img:
            b64_str = base64.b64encode(img).decode("utf-8")
            artifact = ImageArtifact(
                id=str(path), value=f"data:image/png;base64,{b64_str}"
            )
            self.images[path] = artifact
            self.image_metadata[path] = ArtifactMetadata(
                last_read_hash=self._compute_hash(img),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def read_chart_data_from_disk(self, path: Path):
        x = self.dbe.read(path)
        if x:
            value = csv_to_chart_data(x)
            artifact = ChartDataArtifact(id=str(path), value=value)
            self.chart_data[path] = artifact
            self.chart_data_metadata[path] = ArtifactMetadata(
                last_read_hash=self._compute_hash(x.encode()),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def read_brush_stroke_from_disk(self, path: Path):
        content = self.dbe.read(path)
        if content:
            data = json.loads(content)
            artifact = BrushStrokeArtifact(
                id=str(path), value=BrushStroke.model_validate(data)
            )
            self.brush_strokes[path] = artifact
            self.brush_stroke_metadata[path] = ArtifactMetadata(
                last_read_hash=self._compute_hash(content.encode()),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def read_transform_from_disk(self, path: Path):
        content = self.dbe.read(path)
        if content:
            data = json.loads(content)
            artifact = DrawAreaLayerItemTransformArtifact(
                id=str(path), value=DrawAreaLayerItemTransform.model_validate(data)
            )
            self.draw_area_layer_item_transforms[path] = artifact
            self.transform_metadata[path] = ArtifactMetadata(
                last_read_hash=self._compute_hash(content.encode()),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def get_cached_image(self, path: Path):
        return self.images.get(path)

    def get_cached_chart_data(self, path: Path):
        return self.chart_data.get(path)

    def mark_dirty(self, path: Path, artifact_type: ArtifactType):
        metadata_dict = self.metadata_dict_for_artifact_type(artifact_type)
        if path in metadata_dict:
            metadata_dict[path].is_dirty = True

    def metadata_dict_for_artifact_type(self, artifact_type: ArtifactType):
        match artifact_type:
            case ArtifactType.Image:
                return self.image_metadata
            case ArtifactType.ChartData:
                return self.chart_data_metadata
            case ArtifactType.BrushStroke:
                return self.brush_stroke_metadata
            case ArtifactType.DrawAreaLayerItemTransform:
                return self.transform_metadata
            case _:
                assert_never(artifact_type)

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

    def _save_artifact_to_disk(
        self,
        path: Path,
        artifact: "BaseArtifactUnion",
        metadata: ArtifactMetadata,
        conflict_strategy: SaveConflictStrategy,
    ):
        # Check if file changed on disk
        if (
            metadata.last_read_hash is not None
        ):  # Only check conflicts for existing files
            current_hash = self._compute_file_hash(path)
            if current_hash and current_hash != metadata.last_read_hash:
                # File changed externally
                if conflict_strategy == SaveConflictStrategy.skip:
                    return
                elif conflict_strategy == SaveConflictStrategy.backup:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    backup_path = path.with_suffix(f".backup_{timestamp}{path.suffix}")
                    self.dbe.copy(path, backup_path)

        if isinstance(artifact, ImageArtifact):
            # Extract base64 and write binary
            if "," in artifact.value:
                data = artifact.value.split(",")[1]  # Remove data:image/png;base64,
            else:
                data = artifact.value
            binary_data = base64.b64decode(data)
            self.dbe.write(path, binary_data, "wb")
            new_hash = self._compute_hash(binary_data)

        elif isinstance(artifact, ChartDataArtifact):
            csv_content = chart_data_to_csv(artifact.value)
            self.dbe.write(path, csv_content)
            new_hash = self._compute_hash(csv_content.encode())

        elif isinstance(artifact, BrushStrokeArtifact):
            data = artifact.value.model_dump()
            json_content = json.dumps(data, indent=2, sort_keys=True)
            self.dbe.write(path, json_content)
            new_hash = self._compute_hash(json_content.encode())

        elif isinstance(artifact, DrawAreaLayerItemTransformArtifact):
            data = artifact.value.model_dump()
            json_content = json.dumps(data, indent=2, sort_keys=True)
            self.dbe.write(path, json_content)
            new_hash = self._compute_hash(json_content.encode())
        else:
            raise TypeError

        # Update metadata
        metadata.last_read_hash = new_hash
        metadata.is_dirty = False

    def save(self, conflict_strategy: SaveConflictStrategy = SaveConflictStrategy.skip):
        for artifact_type in ArtifactType:
            art_dict = self.dict_for_artifact_type(artifact_type)
            metadata_dict = self.metadata_dict_for_artifact_type(artifact_type)
            for path, artifact in art_dict.items():
                metadata = metadata_dict.get(path)
                if metadata and metadata.is_dirty:
                    self._save_artifact_to_disk(
                        path, artifact, metadata, conflict_strategy
                    )

    def add_artifact(self, x: "BaseArtifactUnion"):
        d = self.dict_for_artifact_type(x.type)
        m = self.metadata_dict_for_artifact_type(x.type)
        d[Path(x.id)] = x  # type: ignore
        m[Path(x.id)] = ArtifactMetadata(last_read_hash=None, is_dirty=True)


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


def csv_to_chart_data(content: str) -> ChartData:
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


def chart_data_to_csv(data: ChartData):
    if not data:
        return ""

    headers = list(data.keys())

    # Get the number of rows (all columns should have the same length)
    num_rows = len(data[headers[0]]) if headers else 0

    # Build CSV string
    csv_lines = [",".join(headers)]

    for i in range(num_rows):
        row_values = []
        for header in headers:
            value = data[header][i]
            # Convert value to string, handling empty strings specially
            if value == "":
                row_values.append("")
            else:
                row_values.append(str(value))
        csv_lines.append(",".join(row_values))

    return "\n".join(csv_lines)

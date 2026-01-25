import base64
import json
import logging
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Literal, assert_never

from pydantic import BaseModel

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
    FileArtifact,
    FileMapping,
    ImageArtifact,
    ImageMapping,
)
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import Base64DependencyValue
from setta.types.helpers_lvl1 import get_variant_effective_section_impl
from setta.types.id import ID
from setta.types.listener import ListenerRealtimeDelta
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.section_impls import (
    ChartSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
)
from setta.utils.utils import compute_md5_hex, normalize_path

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.types.generated.unions import BaseArtifactUnion
    from setta.types.project_state import ProjectStateBackend, ProjectStateCore
    from setta.types.specific_file_watcher import FileWatcherCoreUpdate
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
    from setta.websockets.realtime_event_hub import RealtimeEventHub

logger = logging.getLogger(__name__)


@dataclass
class ArtifactMetadata:
    last_read_hash: str | None
    is_dirty: bool = False
    has_conflict: bool = False


@dataclass
class PreparedArtifact:
    payload: bytes | str
    mode: Literal["wb", "w"]
    hash: str


class ArtifactSaveResult(BaseModel):
    id: str
    type: ArtifactType
    status: Literal["saved", "unchanged", "skipped", "conflict"]
    backupPath: str | None = None
    message: str | None = None


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
        artifact_id_resolver: Callable[[Path | str], Path | str] | None = None,
        path_resolver: Callable[[Path | str], Path] | None = None,
        realtime_event_hub: "RealtimeEventHub | None" = None,
        share_session_id: str | None = None,
    ):
        self.websocket_msg_handler = websocket_msg_handler
        self.specific_file_watcher = specific_file_watcher
        self.dbe = dbe
        self._path_resolver = path_resolver or normalize_path
        self._artifact_id_resolver = artifact_id_resolver or self._path_resolver
        self._realtime_event_hub = realtime_event_hub
        self._share_session_id = share_session_id
        self.images: ImageMapping = {}
        self.chart_data: ChartDataMapping = {}
        self.brush_strokes: BrushStrokeMapping = {}
        self.draw_area_layer_item_transforms: DrawAreaLayerItemTransformMapping = {}
        self.files: FileMapping = {}

        self.image_metadata: dict[Path, ArtifactMetadata] = {}
        self.chart_data_metadata: dict[Path, ArtifactMetadata] = {}
        self.brush_stroke_metadata: dict[Path, ArtifactMetadata] = {}
        self.transform_metadata: dict[Path, ArtifactMetadata] = {}
        self.file_metadata: dict[Path, ArtifactMetadata] = {}
        self._image_section_refs_by_path: dict[Path, list[tuple[ID, ID]]] = {}

    def normalize_artifact_id(self, path: Path | str) -> str:
        return str(self._artifact_id_resolver(path))

    def _resolve_path(self, path: Path | str) -> Path:
        return self._path_resolver(path)

    def watch_artifact_files(
        self,
        callbackCategory: str,
        project_state_backend: "ProjectStateBackend",
    ):
        path_and_types, path_to_types = self.get_artifact_files_to_watch(
            project_state_backend
        )
        self._image_section_refs_by_path = self._collect_image_section_refs_by_path(
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
            conflict_infos: list[tuple[BaseArtifactUnion, str]] = []
            normalized_path = self._resolve_path(coreUpdate.fileToRead)
            for t in types:
                artifact = None
                metadata_dict = self.metadata_dict_for_artifact_type(t)
                art_dict = self.dict_for_artifact_type(t)
                metadata = metadata_dict.get(normalized_path)
                backup_path: str | None = None
                if metadata and metadata.is_dirty:
                    cached_artifact = art_dict.get(normalized_path)
                    backup_path = self._backup_local_version(
                        normalized_path, cached_artifact
                    )
                    metadata.is_dirty = False
                    metadata.has_conflict = True
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
                    case ArtifactType.File:
                        artifact = self.read_file_from_disk(coreUpdate.fileToRead)
                    case _:
                        assert_never(t)
                if artifact:
                    artifacts.append(artifact)
                    if backup_path:
                        metadata_after = metadata_dict.get(
                            self._resolve_path(artifact.id)
                        )
                        if metadata_after:
                            metadata_after.has_conflict = True
                        conflict_infos.append((artifact, backup_path))

            if artifacts:
                await self.websocket_msg_handler.broadcast_artifacts_update(
                    artifacts=artifacts, updateType="update"
                )
                await self.emit_realtime_image_updates(artifacts)
            logger.debug(
                "Artifact update: %s %s",
                normalized_path,
                coreUpdate.eventType.value,
            )
            # TODO: do something with conflict_infos. Let's figure this out later.

        return fn

    def get_artifact_files_to_watch(self, p: "ProjectStateCore"):
        path_and_types: set[tuple[Path, ArtifactType]] = set()
        for s in p.sections.values():
            for v in s.variants:
                impl = get_variant_effective_section_impl(p, s.id, v)
                if isinstance(impl, ImageSectionImpl):
                    path_and_types.add(
                        (self._resolve_path(impl.imagePath), ArtifactType.Image)
                    )
                elif isinstance(impl, DrawSectionImpl):
                    for layer in impl.layers:
                        for el in layer.elements:
                            path_and_types.add(
                                (self._resolve_path(el.dataPath), el.type)
                            )
                            path_and_types.add(
                                (
                                    self._resolve_path(el.transformId),
                                    ArtifactType.DrawAreaLayerItemTransform,
                                )
                            )
                elif isinstance(impl, ChartSectionImpl):
                    path_and_types.add(
                        (self._resolve_path(impl.dataPath), ArtifactType.ChartData)
                    )

        path_to_types: dict[Path, set[ArtifactType]] = defaultdict(set)
        for path, artifact_type in path_and_types:
            path_to_types[path].add(artifact_type)

        return path_and_types, path_to_types

    def _collect_image_section_refs_by_path(
        self,
        p: "ProjectStateBackend",
    ) -> dict[Path, list[tuple[ID, ID]]]:
        mapping: dict[Path, list[tuple[ID, ID]]] = {}
        for project_config_id, project_config in p.projectConfigs.items():
            for section_id, variant_id in project_config.sectionVariantMap.items():
                if section_id not in p.sections:
                    raise KeyError(f"Unknown section id {section_id}")
                if variant_id not in p.sectionVariants:
                    raise KeyError(f"Unknown section variant id {variant_id}")
                impl = get_variant_effective_section_impl(p, section_id, variant_id)
                if not isinstance(impl, ImageSectionImpl):
                    continue
                if not impl.imagePath:
                    continue
                path = self._resolve_path(impl.imagePath)
                mapping.setdefault(path, []).append((project_config_id, section_id))
        return mapping

    def _compute_file_hash(self, path: Path):
        content = self.dbe.read(path, "rb")
        if content:
            return compute_md5_hex(content)
        return None

    def read_image_from_disk(self, path: Path):
        normalized_path = self._resolve_path(path)
        img = self.dbe.read(normalized_path, "rb")
        if img:
            b64_str = base64.b64encode(img).decode("utf-8")
            artifact = ImageArtifact(
                id=self.normalize_artifact_id(path),
                value=f"data:image/png;base64,{b64_str}",
            )
            self.images[normalized_path] = artifact
            self.image_metadata[normalized_path] = ArtifactMetadata(
                last_read_hash=compute_md5_hex(img),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def read_chart_data_from_disk(self, path: Path):
        normalized_path = self._resolve_path(path)
        x = self.dbe.read(normalized_path)
        if x:
            value = csv_to_chart_data(x)
            artifact = ChartDataArtifact(
                id=self.normalize_artifact_id(path),
                value=value,
            )
            self.chart_data[normalized_path] = artifact
            self.chart_data_metadata[normalized_path] = ArtifactMetadata(
                last_read_hash=compute_md5_hex(x),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def read_brush_stroke_from_disk(self, path: Path):
        normalized_path = self._resolve_path(path)
        content = self.dbe.read(normalized_path)
        if content:
            data = json.loads(content)
            artifact = BrushStrokeArtifact(
                id=self.normalize_artifact_id(path),
                value=BrushStroke.model_validate(data),
            )
            self.brush_strokes[normalized_path] = artifact
            self.brush_stroke_metadata[normalized_path] = ArtifactMetadata(
                last_read_hash=compute_md5_hex(content),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def read_transform_from_disk(self, path: Path):
        normalized_path = self._resolve_path(path)
        content = self.dbe.read(normalized_path)
        if content:
            data = json.loads(content)
            artifact = DrawAreaLayerItemTransformArtifact(
                id=self.normalize_artifact_id(path),
                value=DrawAreaLayerItemTransform.model_validate(data),
            )
            self.draw_area_layer_item_transforms[normalized_path] = artifact
            self.transform_metadata[normalized_path] = ArtifactMetadata(
                last_read_hash=compute_md5_hex(content),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def read_file_from_disk(self, path: Path):
        normalized_path = self._resolve_path(path)
        content = self.dbe.read(normalized_path, "rb")
        if content:
            b64_str = base64.b64encode(content).decode("utf-8")
            artifact = FileArtifact(
                id=self.normalize_artifact_id(path),
                value=b64_str,
            )
            self.files[normalized_path] = artifact
            self.file_metadata[normalized_path] = ArtifactMetadata(
                last_read_hash=compute_md5_hex(content),
                is_dirty=False,
            )
            return artifact
        raise ValueError

    def get_cached_image(self, path: Path | str):
        return self.images.get(self._resolve_path(path))

    def get_cached_chart_data(self, path: Path | str):
        return self.chart_data.get(self._resolve_path(path))

    def get_cached_brush_stroke(self, path: Path | str):
        return self.brush_strokes.get(self._resolve_path(path))

    def get_cached_draw_area_layer_item_transform(self, path: Path | str):
        return self.draw_area_layer_item_transforms.get(self._resolve_path(path))

    def get_cached_file(self, path: Path | str):
        return self.files.get(self._resolve_path(path))

    async def emit_realtime_image_updates(
        self, artifacts: list["BaseArtifactUnion"]
    ) -> None:
        if self._realtime_event_hub is None:
            return
        if not artifacts:
            return
        if not self._image_section_refs_by_path:
            return

        deltas_by_project: dict[ID, list[ListenerRealtimeDelta]] = defaultdict(list)
        for artifact in artifacts:
            if not isinstance(artifact, ImageArtifact):
                continue
            path = self._resolve_path(artifact.id)
            refs = self._image_section_refs_by_path.get(path)
            if not refs:
                continue
            payload = self._normalize_image_base64(artifact.value)
            for project_config_id, section_id in refs:
                deltas_by_project[project_config_id].append(
                    ListenerRealtimeDelta(
                        dependency=SectionDependencyKey(sectionId=section_id),
                        value=Base64DependencyValue(payload),
                    )
                )

        for project_config_id, deltas in deltas_by_project.items():
            await self._realtime_event_hub.emit_realtime_delta(
                project_config_id=project_config_id,
                deltas=deltas,
                share_session_id=self._share_session_id,
            )

    def get_cached_artifact_type(self, path: Path | str) -> ArtifactType | None:
        """Return the cached artifact type for a normalized path, if any.

        Raises ValueError when multiple artifact caches know about the same path,
        since that indicates inconsistent state we cannot safely resolve.
        """

        normalized = self._resolve_path(path)
        matches: list[ArtifactType] = []
        for artifact_type in ArtifactType:
            art_dict = self.dict_for_artifact_type(artifact_type)
            if normalized in art_dict:
                matches.append(artifact_type)

        if not matches:
            return None
        if len(matches) == 1:
            return matches[0]
        raise ValueError(
            f"artifact path {normalized} has multiple cached types: {matches}"
        )

    @staticmethod
    def _normalize_image_base64(value: str) -> str:
        if value.startswith("data:image/"):
            _, _, suffix = value.partition(",")
            if suffix:
                return suffix
        return value

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
            case ArtifactType.File:
                return self.file_metadata
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
            case ArtifactType.File:
                return self.files
            case _:
                assert_never(x)

    def cache_artifact_in_memory(
        self,
        artifact: "BaseArtifactUnion",
        *,
        compute_last_read_hash: bool = True,
        new_metadata_last_read_hash: str | None = None,
        reset_conflict: bool = False,
    ) -> tuple[Path, ArtifactMetadata]:
        """Store an artifact in the in-memory cache and mark metadata dirty."""
        art_dict = self.dict_for_artifact_type(artifact.type)
        metadata_dict = self.metadata_dict_for_artifact_type(artifact.type)
        path = self._resolve_path(artifact.id)

        art_dict[path] = artifact  # type: ignore[index]
        metadata = metadata_dict.get(path)
        if metadata is None:
            last_read_hash = (
                self._compute_file_hash(path)
                if compute_last_read_hash
                else new_metadata_last_read_hash
            )
            metadata = ArtifactMetadata(
                last_read_hash=last_read_hash,
                is_dirty=True,
            )
            metadata_dict[path] = metadata
        else:
            metadata.is_dirty = True
            if reset_conflict:
                metadata.has_conflict = False

        return path, metadata

    def _prepare_artifact_for_storage(
        self, artifact: "BaseArtifactUnion"
    ) -> PreparedArtifact:
        if isinstance(artifact, ImageArtifact):
            data = (
                artifact.value.split(",", 1)[1]
                if "," in artifact.value
                else artifact.value
            )
            binary_data = base64.b64decode(data)
            return PreparedArtifact(
                payload=binary_data,
                mode="wb",
                hash=compute_md5_hex(binary_data),
            )
        if isinstance(artifact, ChartDataArtifact):
            csv_content = chart_data_to_csv(artifact.value)
            encoded = csv_content.encode("utf-8")
            return PreparedArtifact(
                payload=csv_content,
                mode="w",
                hash=compute_md5_hex(encoded),
            )
        if isinstance(artifact, BrushStrokeArtifact):
            data = artifact.value.model_dump()
            json_content = json.dumps(data, indent=2, sort_keys=True)
            encoded = json_content.encode("utf-8")
            return PreparedArtifact(
                payload=json_content,
                mode="w",
                hash=compute_md5_hex(encoded),
            )
        if isinstance(artifact, DrawAreaLayerItemTransformArtifact):
            data = artifact.value.model_dump()
            json_content = json.dumps(data, indent=2, sort_keys=True)
            encoded = json_content.encode("utf-8")
            return PreparedArtifact(
                payload=json_content,
                mode="w",
                hash=compute_md5_hex(encoded),
            )
        if isinstance(artifact, FileArtifact):
            binary_data = base64.b64decode(artifact.value)
            return PreparedArtifact(
                payload=binary_data,
                mode="wb",
                hash=compute_md5_hex(binary_data),
            )
        raise TypeError

    def _create_backup_path(self, path: Path, prefix: str = "backup") -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        suffix = path.suffix
        backup_name = f".{prefix}_{timestamp}{suffix}"
        return path.with_suffix(backup_name)

    def _write_prepared_artifact(
        self,
        path: Path,
        artifact: "BaseArtifactUnion",
        metadata: ArtifactMetadata,
        prepared: PreparedArtifact,
        conflict_strategy: SaveConflictStrategy,
    ) -> ArtifactSaveResult:
        backup_path_str: str | None = None
        message: str | None = None
        # Short-circuit if nothing changed and artifact already clean
        if metadata.last_read_hash == prepared.hash and not metadata.is_dirty:
            return ArtifactSaveResult(
                id=str(path),
                type=artifact.type,
                status="unchanged",
            )

        current_hash = (
            self._compute_file_hash(path) if metadata.last_read_hash else None
        )

        if (
            metadata.last_read_hash is not None
            and current_hash
            and current_hash != metadata.last_read_hash
        ):
            metadata.has_conflict = True
            if conflict_strategy == SaveConflictStrategy.skip:
                metadata.is_dirty = True
                return ArtifactSaveResult(
                    id=str(path),
                    type=artifact.type,
                    status="skipped",
                    message="Skipped save due to detected external changes.",
                )
            if conflict_strategy == SaveConflictStrategy.backup:
                backup_path = self._create_backup_path(path, prefix="conflict_backup")
                self.dbe.copy(path, backup_path)
                backup_path_str = str(backup_path)
                message = f"External changes detected. Previous contents copied to {backup_path_str}."
            elif conflict_strategy == SaveConflictStrategy.overwrite:
                message = (
                    "External changes detected. Overwriting per requested strategy."
                )
        else:
            metadata.has_conflict = False

        self.dbe.write(path, prepared.payload, prepared.mode)

        metadata.last_read_hash = prepared.hash
        metadata.is_dirty = False

        return ArtifactSaveResult(
            id=str(path),
            type=artifact.type,
            status="conflict" if metadata.has_conflict else "saved",
            backupPath=backup_path_str,
            message=message,
        )

    def _backup_local_version(
        self,
        path: Path,
        artifact: "BaseArtifactUnion | None",
    ) -> str | None:
        if artifact is None:
            return None
        prepared = self._prepare_artifact_for_storage(artifact)
        backup_path = self._create_backup_path(path, prefix="local_unsaved")
        self.dbe.write(backup_path, prepared.payload, prepared.mode)
        return str(backup_path)

    def _update_single_artifact(
        self,
        artifact: "BaseArtifactUnion",
        conflict_strategy: SaveConflictStrategy,
    ) -> ArtifactSaveResult:
        path, metadata = self.cache_artifact_in_memory(artifact)
        prepared = self._prepare_artifact_for_storage(artifact)
        return self._write_prepared_artifact(
            path, artifact, metadata, prepared, conflict_strategy
        )

    async def apply_updates(
        self,
        artifacts: list["BaseArtifactUnion"],
        conflict_strategy: SaveConflictStrategy,
    ) -> list[ArtifactSaveResult]:
        results: list[ArtifactSaveResult] = []
        for artifact in artifacts:
            result = self._update_single_artifact(artifact, conflict_strategy)
            results.append(result)
            if result.status == "conflict":
                message = f"Detected conflicting changes while saving {result.id}."
                if result.backupPath:
                    message += f" Local version stored at {result.backupPath}."
                await self.websocket_msg_handler.log_and_broadcast_backend_log_event(
                    message,
                    severity=SettaBackendLogEventSeverity.warning,
                )
            elif result.status == "skipped":
                message = result.message or (
                    f"Skipped saving {result.id} due to detected external changes."
                )
                await self.websocket_msg_handler.log_and_broadcast_backend_log_event(
                    message,
                    severity=SettaBackendLogEventSeverity.warning,
                )
        return results

    def _save_artifact_to_disk(
        self,
        path: Path,
        artifact: "BaseArtifactUnion",
        metadata: ArtifactMetadata,
        conflict_strategy: SaveConflictStrategy,
    ) -> ArtifactSaveResult:
        prepared = self._prepare_artifact_for_storage(artifact)
        return self._write_prepared_artifact(
            path, artifact, metadata, prepared, conflict_strategy
        )

    def save(self, conflict_strategy: SaveConflictStrategy = SaveConflictStrategy.skip):
        results: list[ArtifactSaveResult] = []
        for artifact_type in ArtifactType:
            art_dict = self.dict_for_artifact_type(artifact_type)
            metadata_dict = self.metadata_dict_for_artifact_type(artifact_type)
            for path, artifact in art_dict.items():
                metadata = metadata_dict.get(path)
                if metadata and metadata.is_dirty:
                    result = self._save_artifact_to_disk(
                        path, artifact, metadata, conflict_strategy
                    )
                    results.append(result)
        return results


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

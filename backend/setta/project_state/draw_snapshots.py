import base64
from pathlib import Path
from typing import TYPE_CHECKING

from setta.types.generated.impl_args_as_typed_dicts import (
    DrawSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    set_curr_effective_section_impl_value,
)
from setta.types.section_impls import DrawSectionImpl
from setta.utils.constants import C

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.types.id import ID
    from setta.types.project_state import ProjectStateSingleConfig

DRAW_SNAPSHOT_FOLDER_NAME = "draw_snapshots"


def build_draw_snapshot_path(section_id: "ID", artifact_root: Path) -> Path:
    return artifact_root / DRAW_SNAPSHOT_FOLDER_NAME / f"{section_id}.png"


def _decode_base64_payload(payload: str) -> bytes:
    normalized = payload.strip()
    if "," in normalized:
        normalized = normalized.split(",", 1)[1]
    return base64.b64decode(normalized)


def apply_draw_snapshot_updates(
    *,
    dbe: "DBE",
    project_state: "ProjectStateSingleConfig",
    snapshots_by_section_id: dict["ID", str | None] | None,
    artifact_root: Path = C.ARTIFACTS_FOLDER,
) -> bool:
    snapshots = snapshots_by_section_id or {}
    did_update = False
    section_ids = project_state.projectConfig.sectionVariantMap.keys()
    for section_id in section_ids:
        impl = get_curr_effective_section_impl(project_state, section_id)
        if not isinstance(impl, DrawSectionImpl):
            continue
        payload = snapshots.get(section_id)
        if payload:
            target_path = (
                Path(impl.renderedImagePath)
                if impl.renderedImagePath
                else build_draw_snapshot_path(section_id, artifact_root)
            )
            dbe.write(
                target_path,
                _decode_base64_payload(payload),
                mode="wb",
            )
            new_path = target_path.as_posix()
            if impl.renderedImagePath != new_path:
                set_curr_effective_section_impl_value(
                    project_state,
                    section_id,
                    DrawSectionImplArgsWithCallable(
                        renderedImagePath=new_path,
                    ),
                )
                did_update = True
            continue
        if impl.renderedImagePath is not None:
            set_curr_effective_section_impl_value(
                project_state,
                section_id,
                DrawSectionImplArgsWithCallable(
                    renderedImagePath=None,
                ),
            )
            did_update = True
    return did_update

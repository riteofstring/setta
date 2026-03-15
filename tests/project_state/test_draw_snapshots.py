from pathlib import Path
from tempfile import TemporaryDirectory

from setta.binary import BinaryStore
from setta.database.db_objs import DBE
from setta.project_state.draw_snapshots import (
    apply_draw_snapshot_updates,
    build_draw_snapshot_path,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import DrawSectionImpl


class TestDrawSnapshot:
    def _build_project_state(self) -> tuple[ProjectStateSingleConfig, ID]:
        draw_impl = DrawSectionImpl(id=ID("draw-impl"), name="Draw")
        variant = Variant(
            id=ID("draw-variant"),
            name="Draw",
            impl=draw_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(draw_impl),
        )
        section_id = ID("draw-section")
        section = Core(
            id=section_id,
            name="Draw",
            variants=[variant.id],
            defaultVariant=variant.id,
        )
        project_config = ProjectConfig(
            name="Draw Project",
            sectionVariantMap={section_id: variant.id},
            topLevelSections={section_id: TopLevelSectionLayout()},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section_id: section},
            sectionImpls={draw_impl.id: draw_impl},
            sectionVariants={variant.id: variant},
        )
        return project_state, section_id

    def test_apply_draw_snapshot_updates_writes_png_and_sets_path(self) -> None:
        expected_bytes = b"snapshot-bytes"
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            artifacts_root = root / "artifacts"
            dbe = DBE(root)
            binary_store = BinaryStore.from_dbe(dbe)
            ref = binary_store.store_bytes(expected_bytes, mime_type="image/png")
            project_state, section_id = self._build_project_state()
            did_update = apply_draw_snapshot_updates(
                dbe=dbe,
                project_state=project_state,
                snapshots_by_section_id={section_id: ref},
                artifact_root=artifacts_root,
            )
            assert did_update
            impl = get_curr_effective_section_impl_with_type_guard(
                project_state,
                section_id,
                DrawSectionImpl,
            )
            expected_path = build_draw_snapshot_path(section_id, artifacts_root)
            assert expected_path.as_posix() == impl.renderedImagePath
            written = dbe.read(expected_path, mode="rb")
            assert expected_bytes == written

            did_skip = apply_draw_snapshot_updates(
                dbe=dbe,
                project_state=project_state,
                snapshots_by_section_id={},
                artifact_root=artifacts_root,
            )
            assert not did_skip
            impl_after_skip = get_curr_effective_section_impl_with_type_guard(
                project_state,
                section_id,
                DrawSectionImpl,
            )
            assert expected_path.as_posix() == impl_after_skip.renderedImagePath

    def test_apply_draw_snapshot_updates_noop_when_missing(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            artifacts_root = root / "artifacts"
            dbe = DBE(root)
            project_state, section_id = self._build_project_state()
            did_update = apply_draw_snapshot_updates(
                dbe=dbe,
                project_state=project_state,
                snapshots_by_section_id=None,
                artifact_root=artifacts_root,
            )
            assert not did_update
            impl = get_curr_effective_section_impl_with_type_guard(
                project_state,
                section_id,
                DrawSectionImpl,
            )
            assert impl.renderedImagePath is None

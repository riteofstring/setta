from typing import TYPE_CHECKING

import pytest

from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    RedoRequest,
    SetViewportRequest,
    UndoRequest,
)
from setta.types.id import ID
from setta.types.project_config import Viewport
from setta.types.section_impls import SectionType
from tests.utils.manager_fixture import real_project_manager

if TYPE_CHECKING:
    from setta.project_state.session_project_manager import SessionProjectManager


async def _create_project_config(manager: "SessionProjectManager") -> ID:
    existing_ids = set(manager.project_state_backend.projectConfigs.keys())
    await manager.create_project_config(previewImgColor="#00aa66")
    created_ids = (
        set(manager.project_state_backend.projectConfigs.keys()) - existing_ids
    )
    assert len(created_ids) == 1
    return next(iter(created_ids))


async def _create_dict_section(
    manager: "SessionProjectManager",
    project_config_id: ID,
) -> ID:
    response = await manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=SectionType.Dict,
            controlCodeObjType=None,
            implOverrides=None,
            position=None,
            topLevelSections=None,
            viewportBounds=None,
        )
    )
    return response.sectionId


def _snapshot_viewport_state(
    manager: "SessionProjectManager",
    project_config_id: ID,
) -> tuple[dict[str, float] | None, bool, dict[str, float] | None, bool]:
    project_config = manager.project_state_backend.projectConfigs[project_config_id]
    active_view_mode_id = project_config.activeViewModeId
    assert active_view_mode_id is not None
    active_view_mode = project_config.viewModes[active_view_mode_id]
    project_viewport = (
        project_config.viewport.model_dump()
        if project_config.viewport is not None
        else None
    )
    mode_viewport = (
        active_view_mode.viewport.model_dump()
        if active_view_mode.viewport is not None
        else None
    )
    return (
        project_viewport,
        project_config.viewportInitialized,
        mode_viewport,
        active_view_mode.viewportInitialized,
    )


def _expected_viewport_state(
    viewport: Viewport | None,
) -> tuple[dict[str, float] | None, bool, dict[str, float] | None, bool]:
    payload = viewport.model_dump() if viewport is not None else None
    initialized = viewport is not None
    return payload, initialized, payload, initialized


@pytest.mark.asyncio
async def test_scoped_history_entry_only_deep_copies_target_project_graph() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        target_config_id = manager.project_state_backend.defaultProjectConfigId
        assert target_config_id is not None

        await _create_dict_section(manager, target_config_id)
        other_config_id = await _create_project_config(manager)
        await _create_dict_section(manager, other_config_id)

        target_state = manager.get_single_config_state(target_config_id)
        other_state = manager.get_single_config_state(other_config_id)
        assert target_state.projectConfig.sectionVariantMap
        assert other_state.projectConfig.sectionVariantMap

        target_section_id = next(iter(target_state.projectConfig.sectionVariantMap))
        other_section_id = next(iter(other_state.projectConfig.sectionVariantMap))
        target_variant_id = target_state.projectConfig.sectionVariantMap[
            target_section_id
        ]
        other_variant_id = other_state.projectConfig.sectionVariantMap[other_section_id]
        target_impl_id = target_state.sectionVariants[target_variant_id].impl
        other_impl_id = other_state.sectionVariants[other_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=target_config_id,
        )
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert backend_after is not backend_before
        assert (
            backend_after.projectConfigs[target_config_id]
            is not backend_before.projectConfigs[target_config_id]
        )
        assert (
            backend_after.projectConfigs[other_config_id]
            is backend_before.projectConfigs[other_config_id]
        )
        assert (
            backend_after.sections[target_section_id]
            is not backend_before.sections[target_section_id]
        )
        assert (
            backend_after.sections[other_section_id]
            is backend_before.sections[other_section_id]
        )
        assert (
            backend_after.sectionVariants[target_variant_id]
            is not backend_before.sectionVariants[target_variant_id]
        )
        assert (
            backend_after.sectionVariants[other_variant_id]
            is backend_before.sectionVariants[other_variant_id]
        )
        assert (
            backend_after.sectionImpls[target_impl_id]
            is not backend_before.sectionImpls[target_impl_id]
        )
        assert (
            backend_after.sectionImpls[other_impl_id]
            is backend_before.sectionImpls[other_impl_id]
        )

        # Mutating targeted objects after the scoped copy must not back-propagate.
        original_name = backend_before.projectConfigs[target_config_id].name
        backend_after.projectConfigs[target_config_id].name = "scoped-history-target"
        assert backend_before.projectConfigs[target_config_id].name == original_name


@pytest.mark.asyncio
async def test_project_config_only_history_entry_copies_only_project_config() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        target_config_id = manager.project_state_backend.defaultProjectConfigId
        assert target_config_id is not None

        await _create_dict_section(manager, target_config_id)
        other_config_id = await _create_project_config(manager)
        await _create_dict_section(manager, other_config_id)

        target_state = manager.get_single_config_state(target_config_id)
        other_state = manager.get_single_config_state(other_config_id)
        assert target_state.projectConfig.sectionVariantMap
        assert other_state.projectConfig.sectionVariantMap

        target_section_id = next(iter(target_state.projectConfig.sectionVariantMap))
        other_section_id = next(iter(other_state.projectConfig.sectionVariantMap))
        target_variant_id = target_state.projectConfig.sectionVariantMap[
            target_section_id
        ]
        other_variant_id = other_state.projectConfig.sectionVariantMap[other_section_id]
        target_impl_id = target_state.sectionVariants[target_variant_id].impl
        other_impl_id = other_state.sectionVariants[other_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=target_config_id,
            project_config_only=True,
        )
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert backend_after is not backend_before
        assert (
            backend_after.projectConfigs[target_config_id]
            is not backend_before.projectConfigs[target_config_id]
        )
        assert (
            backend_after.projectConfigs[other_config_id]
            is backend_before.projectConfigs[other_config_id]
        )
        assert (
            backend_after.sections[target_section_id]
            is backend_before.sections[target_section_id]
        )
        assert (
            backend_after.sections[other_section_id]
            is backend_before.sections[other_section_id]
        )
        assert (
            backend_after.sectionVariants[target_variant_id]
            is backend_before.sectionVariants[target_variant_id]
        )
        assert (
            backend_after.sectionVariants[other_variant_id]
            is backend_before.sectionVariants[other_variant_id]
        )
        assert (
            backend_after.sectionImpls[target_impl_id]
            is backend_before.sectionImpls[target_impl_id]
        )
        assert (
            backend_after.sectionImpls[other_impl_id]
            is backend_before.sectionImpls[other_impl_id]
        )

        original_name = backend_before.projectConfigs[target_config_id].name
        backend_after.projectConfigs[
            target_config_id
        ].name = "project-config-only-history-target"
        assert backend_before.projectConfigs[target_config_id].name == original_name


@pytest.mark.asyncio
async def test_set_viewport_undo_redo_remains_correct_across_project_configs() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        first_config_id = manager.project_state_backend.defaultProjectConfigId
        assert first_config_id is not None
        second_config_id = await _create_project_config(manager)

        baseline_first = _snapshot_viewport_state(manager, first_config_id)
        baseline_second = _snapshot_viewport_state(manager, second_config_id)
        first_viewport = Viewport(x=12.5, y=-3.0, zoom=1.4)
        second_viewport = Viewport(x=-20.0, y=8.0, zoom=0.7)

        history_len_before = len(manager.history._history)
        await manager.set_viewport(
            SetViewportRequest(
                projectConfigId=first_config_id,
                viewport=first_viewport,
            )
        )
        await manager.set_viewport(
            SetViewportRequest(
                projectConfigId=second_config_id,
                viewport=second_viewport,
            )
        )
        assert len(manager.history._history) == history_len_before + 2
        assert _snapshot_viewport_state(
            manager,
            first_config_id,
        ) == _expected_viewport_state(first_viewport)
        assert _snapshot_viewport_state(
            manager,
            second_config_id,
        ) == _expected_viewport_state(second_viewport)

        # Undo should walk history one entry at a time and only roll back the latest edit.
        await manager.undo(UndoRequest(projectConfigId=second_config_id, steps=1))
        assert _snapshot_viewport_state(
            manager,
            first_config_id,
        ) == _expected_viewport_state(first_viewport)
        assert _snapshot_viewport_state(manager, second_config_id) == baseline_second

        await manager.undo(UndoRequest(projectConfigId=first_config_id, steps=1))
        assert _snapshot_viewport_state(manager, first_config_id) == baseline_first
        assert _snapshot_viewport_state(manager, second_config_id) == baseline_second

        await manager.redo(RedoRequest(projectConfigId=first_config_id, steps=1))
        assert _snapshot_viewport_state(
            manager,
            first_config_id,
        ) == _expected_viewport_state(first_viewport)
        assert _snapshot_viewport_state(manager, second_config_id) == baseline_second

        await manager.redo(RedoRequest(projectConfigId=second_config_id, steps=1))
        assert _snapshot_viewport_state(
            manager,
            first_config_id,
        ) == _expected_viewport_state(first_viewport)
        assert _snapshot_viewport_state(
            manager,
            second_config_id,
        ) == _expected_viewport_state(second_viewport)

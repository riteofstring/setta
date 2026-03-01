from typing import TYPE_CHECKING

import pytest

from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    MoveSectionsRequest,
    RedoRequest,
    SetCodeSectionAttachedTerminalRequest,
    SetSectionTagColorRequest,
    SetViewportRequest,
    UndoRequest,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
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
    return await _create_section(manager, project_config_id, SectionType.Dict)


async def _create_section(
    manager: "SessionProjectManager",
    project_config_id: ID,
    section_type: SectionType,
) -> ID:
    response = await manager.create_top_level_section(
        CreateTopLevelSectionRequest(
            projectConfigId=project_config_id,
            implType=section_type,
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


def _snapshot_section_tag_color(
    manager: "SessionProjectManager",
    project_config_id: ID,
    section_id: ID,
) -> str | None:
    project_state = manager.get_single_config_state(project_config_id)
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    return section_impl.tagColor


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
async def test_section_impl_only_history_entry_copies_only_targeted_section_graph() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        target_config_id = manager.project_state_backend.defaultProjectConfigId
        assert target_config_id is not None

        target_section_id = await _create_dict_section(manager, target_config_id)
        sibling_section_id = await _create_dict_section(manager, target_config_id)
        other_config_id = await _create_project_config(manager)
        other_section_id = await _create_dict_section(manager, other_config_id)

        target_state = manager.get_single_config_state(target_config_id)
        other_state = manager.get_single_config_state(other_config_id)

        target_variant_id = target_state.projectConfig.sectionVariantMap[target_section_id]
        sibling_variant_id = target_state.projectConfig.sectionVariantMap[sibling_section_id]
        other_variant_id = other_state.projectConfig.sectionVariantMap[other_section_id]

        target_impl_id = target_state.sectionVariants[target_variant_id].impl
        sibling_impl_id = target_state.sectionVariants[sibling_variant_id].impl
        other_impl_id = other_state.sectionVariants[other_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=target_config_id,
            section_impl_only_ids={target_section_id},
        )
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert backend_after is not backend_before
        assert (
            backend_after.sections[target_section_id]
            is not backend_before.sections[target_section_id]
        )
        assert (
            backend_after.sections[sibling_section_id]
            is backend_before.sections[sibling_section_id]
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
            backend_after.sectionVariants[sibling_variant_id]
            is backend_before.sectionVariants[sibling_variant_id]
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
            backend_after.sectionImpls[sibling_impl_id]
            is backend_before.sectionImpls[sibling_impl_id]
        )
        assert (
            backend_after.sectionImpls[other_impl_id]
            is backend_before.sectionImpls[other_impl_id]
        )
        assert (
            backend_after.projectConfigs[target_config_id]
            is backend_before.projectConfigs[target_config_id]
        )
        assert (
            backend_after.projectConfigs[other_config_id]
            is backend_before.projectConfigs[other_config_id]
        )

        original_name = backend_before.sections[target_section_id].name
        backend_after.sections[target_section_id].name = "section-impl-only-history-target"
        assert backend_before.sections[target_section_id].name == original_name


@pytest.mark.asyncio
async def test_move_sections_history_copy_isolates_project_config_and_affected_sections() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        assert project_config_id is not None

        parent_a_id = await _create_section(manager, project_config_id, SectionType.Group)
        parent_b_id = await _create_section(manager, project_config_id, SectionType.Group)
        child_section_id = await _create_section(
            manager, project_config_id, SectionType.Code
        )
        unaffected_section_id = await _create_dict_section(manager, project_config_id)
        await manager.move_sections(
            MoveSectionsRequest(
                projectConfigId=project_config_id,
                sectionIds=[child_section_id],
                newParentId=parent_a_id,
                newIndex=0,
                positionsById=None,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        current_state = manager.get_single_config_state(project_config_id)
        parent_a_variant_id = current_state.projectConfig.sectionVariantMap[parent_a_id]
        parent_b_variant_id = current_state.projectConfig.sectionVariantMap[parent_b_id]
        child_variant_id = current_state.projectConfig.sectionVariantMap[child_section_id]
        unaffected_variant_id = current_state.projectConfig.sectionVariantMap[
            unaffected_section_id
        ]
        parent_a_impl_id = current_state.sectionVariants[parent_a_variant_id].impl
        parent_b_impl_id = current_state.sectionVariants[parent_b_variant_id].impl
        child_impl_id = current_state.sectionVariants[child_variant_id].impl
        unaffected_impl_id = current_state.sectionVariants[unaffected_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        await manager.move_sections(
            MoveSectionsRequest(
                projectConfigId=project_config_id,
                sectionIds=[child_section_id],
                newParentId=parent_b_id,
                newIndex=0,
                positionsById=None,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert (
            backend_after.projectConfigs[project_config_id]
            is not backend_before.projectConfigs[project_config_id]
        )
        assert (
            backend_after.sections[parent_a_id] is not backend_before.sections[parent_a_id]
        )
        assert (
            backend_after.sections[parent_b_id] is not backend_before.sections[parent_b_id]
        )
        assert (
            backend_after.sections[child_section_id]
            is not backend_before.sections[child_section_id]
        )
        assert (
            backend_after.sectionVariants[parent_a_variant_id]
            is not backend_before.sectionVariants[parent_a_variant_id]
        )
        assert (
            backend_after.sectionVariants[parent_b_variant_id]
            is not backend_before.sectionVariants[parent_b_variant_id]
        )
        assert (
            backend_after.sectionVariants[child_variant_id]
            is not backend_before.sectionVariants[child_variant_id]
        )
        assert (
            backend_after.sectionImpls[parent_a_impl_id]
            is not backend_before.sectionImpls[parent_a_impl_id]
        )
        assert (
            backend_after.sectionImpls[parent_b_impl_id]
            is not backend_before.sectionImpls[parent_b_impl_id]
        )
        assert (
            backend_after.sectionImpls[child_impl_id]
            is not backend_before.sectionImpls[child_impl_id]
        )
        assert (
            backend_after.sections[unaffected_section_id]
            is backend_before.sections[unaffected_section_id]
        )
        assert (
            backend_after.sectionVariants[unaffected_variant_id]
            is backend_before.sectionVariants[unaffected_variant_id]
        )
        assert (
            backend_after.sectionImpls[unaffected_impl_id]
            is backend_before.sectionImpls[unaffected_impl_id]
        )

        moved_state = manager.get_single_config_state(project_config_id)
        assert moved_state.parentSectionMap[child_section_id] == parent_b_id

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        undone_state = manager.get_single_config_state(project_config_id)
        assert undone_state.parentSectionMap[child_section_id] == parent_a_id


@pytest.mark.asyncio
async def test_set_code_section_attached_terminal_history_copy_isolates_affected_sections() -> (
    None
):
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        assert project_config_id is not None

        code_section_id = await _create_section(manager, project_config_id, SectionType.Code)
        terminal_section_id = await _create_section(
            manager, project_config_id, SectionType.Terminal
        )
        unaffected_section_id = await _create_dict_section(manager, project_config_id)

        current_state = manager.get_single_config_state(project_config_id)
        code_variant_id = current_state.projectConfig.sectionVariantMap[code_section_id]
        terminal_variant_id = current_state.projectConfig.sectionVariantMap[
            terminal_section_id
        ]
        unaffected_variant_id = current_state.projectConfig.sectionVariantMap[
            unaffected_section_id
        ]
        code_impl_id = current_state.sectionVariants[code_variant_id].impl
        terminal_impl_id = current_state.sectionVariants[terminal_variant_id].impl
        unaffected_impl_id = current_state.sectionVariants[unaffected_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        await manager.set_code_section_attached_terminal(
            SetCodeSectionAttachedTerminalRequest(
                projectConfigId=project_config_id,
                sectionId=code_section_id,
                terminalSectionId=terminal_section_id,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert (
            backend_after.projectConfigs[project_config_id]
            is not backend_before.projectConfigs[project_config_id]
        )
        assert (
            backend_after.sections[code_section_id] is not backend_before.sections[code_section_id]
        )
        assert (
            backend_after.sections[terminal_section_id]
            is not backend_before.sections[terminal_section_id]
        )
        assert (
            backend_after.sectionVariants[code_variant_id]
            is not backend_before.sectionVariants[code_variant_id]
        )
        assert (
            backend_after.sectionVariants[terminal_variant_id]
            is not backend_before.sectionVariants[terminal_variant_id]
        )
        assert (
            backend_after.sectionImpls[code_impl_id]
            is not backend_before.sectionImpls[code_impl_id]
        )
        assert (
            backend_after.sectionImpls[terminal_impl_id]
            is not backend_before.sectionImpls[terminal_impl_id]
        )
        assert (
            backend_after.sections[unaffected_section_id]
            is backend_before.sections[unaffected_section_id]
        )
        assert (
            backend_after.sectionVariants[unaffected_variant_id]
            is backend_before.sectionVariants[unaffected_variant_id]
        )
        assert (
            backend_after.sectionImpls[unaffected_impl_id]
            is backend_before.sectionImpls[unaffected_impl_id]
        )

        moved_state = manager.get_single_config_state(project_config_id)
        assert moved_state.parentSectionMap[terminal_section_id] == code_section_id

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=5.0)
        undone_state = manager.get_single_config_state(project_config_id)
        assert undone_state.parentSectionMap[terminal_section_id] is None


@pytest.mark.asyncio
async def test_set_section_tag_color_undo_redo_remains_correct_across_project_configs() -> None:
    async with real_project_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        first_config_id = manager.project_state_backend.defaultProjectConfigId
        assert first_config_id is not None
        second_config_id = await _create_project_config(manager)

        first_section_id = await _create_dict_section(manager, first_config_id)
        second_section_id = await _create_dict_section(manager, second_config_id)

        baseline_first = _snapshot_section_tag_color(
            manager, first_config_id, first_section_id
        )
        baseline_second = _snapshot_section_tag_color(
            manager, second_config_id, second_section_id
        )

        history_len_before = len(manager.history._history)
        await manager.set_section_tag_color(
            SetSectionTagColorRequest(
                projectConfigId=first_config_id,
                sectionId=first_section_id,
                tagColor="#111827",
            )
        )
        await manager.set_section_tag_color(
            SetSectionTagColorRequest(
                projectConfigId=second_config_id,
                sectionId=second_section_id,
                tagColor="#22c55e",
            )
        )

        assert len(manager.history._history) == history_len_before + 2
        assert (
            _snapshot_section_tag_color(manager, first_config_id, first_section_id)
            == "#111827"
        )
        assert (
            _snapshot_section_tag_color(manager, second_config_id, second_section_id)
            == "#22c55e"
        )

        await manager.undo(UndoRequest(projectConfigId=second_config_id, steps=1))
        assert (
            _snapshot_section_tag_color(manager, first_config_id, first_section_id)
            == "#111827"
        )
        assert (
            _snapshot_section_tag_color(manager, second_config_id, second_section_id)
            == baseline_second
        )

        await manager.undo(UndoRequest(projectConfigId=first_config_id, steps=1))
        assert (
            _snapshot_section_tag_color(manager, first_config_id, first_section_id)
            == baseline_first
        )
        assert (
            _snapshot_section_tag_color(manager, second_config_id, second_section_id)
            == baseline_second
        )

        await manager.redo(RedoRequest(projectConfigId=first_config_id, steps=1))
        assert (
            _snapshot_section_tag_color(manager, first_config_id, first_section_id)
            == "#111827"
        )
        assert (
            _snapshot_section_tag_color(manager, second_config_id, second_section_id)
            == baseline_second
        )

        await manager.redo(RedoRequest(projectConfigId=second_config_id, steps=1))
        assert (
            _snapshot_section_tag_color(manager, first_config_id, first_section_id)
            == "#111827"
        )
        assert (
            _snapshot_section_tag_color(manager, second_config_id, second_section_id)
            == "#22c55e"
        )


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

import copy

import pytest

from setta.project_state.project_manager_types import (
    RedoRequest,
    SetActiveIdsRequest,
    SetCallableRequest,
    SetGenCodePrefixRequest,
    SetTopLevelSectionLayoutRequest,
    UndoRequest,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.project_config import get_python_codegen_target_with_type_guard
from setta.types.section_impls import CallableSectionImpl
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


async def _build_prefix_and_callable_history(
    *,
    manager,
    project_config_id: str,
    section_id: str,
) -> tuple[int, dict[str, object], list[str]]:
    """Create a minimal history where the latest entry comes from scoped callable edits."""
    await manager.set_gen_code_prefix(
        SetGenCodePrefixRequest(
            projectConfigId=project_config_id,
            genCodePrefix="import math",
        )
    )
    await manager.set_callable(
        SetCallableRequest(
            projectConfigId=project_config_id,
            sectionId=section_id,
            callableName="math.sqrt",
            refetchParams=False,
        )
    )
    await manager.finish_pending_operations(timeout=10.0)

    history_index_with_callable = manager.history._current
    if history_index_with_callable < 1:
        raise ValueError("Expected callable setup to create a scoped history entry.")

    callable_entry_backend = manager.history._history[history_index_with_callable]
    callable_entry_project_config = callable_entry_backend.projectConfigs[project_config_id]
    callable_entry_layout = copy.deepcopy(callable_entry_project_config.topLevelSections)
    callable_entry_active_ids = list(callable_entry_project_config.activeIds)
    return history_index_with_callable, callable_entry_layout, callable_entry_active_ids


@pytest.mark.asyncio
async def test_layout_in_place_mutation_does_not_retroactively_modify_redo_entries() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=10.0)

        project_config_id = project_state.projectConfig.id
        section_id = next(iter(project_state.sections.keys()))

        (
            callable_history_index,
            callable_entry_layout,
            _callable_entry_active_ids,
        ) = await _build_prefix_and_callable_history(
            manager=manager,
            project_config_id=project_config_id,
            section_id=section_id,
        )

        # Move to the pre-callable entry, then apply an in-place layout mutation.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)
        assert manager.history._current == callable_history_index - 1

        state_before_layout_update = manager.get_single_config_state(project_config_id)
        shifted_layout = {
            top_level_section_id: position.model_copy(
                update={
                    "x": position.x + 1.0,
                    "y": position.y + 1.0,
                }
            )
            for top_level_section_id, position in (
                state_before_layout_update.projectConfig.topLevelSections.items()
            )
        }
        await manager.set_top_level_section_layout(
            SetTopLevelSectionLayoutRequest(
                projectConfigId=project_config_id,
                topLevelSections=shifted_layout,
            )
        )
        await manager.finish_pending_operations(timeout=10.0)

        # The future callable entry must remain immutable after current-entry updates.
        callable_entry_backend_after_layout = manager.history._history[callable_history_index]
        callable_entry_project_config_after_layout = callable_entry_backend_after_layout.projectConfigs[
            project_config_id
        ]
        assert (
            callable_entry_project_config_after_layout.topLevelSections
            == callable_entry_layout
        )

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)

        state_after_redo = manager.get_single_config_state(project_config_id)
        callable_impl_after_redo = get_curr_effective_section_impl_with_type_guard(
            state_after_redo,
            section_id,
            CallableSectionImpl,
        )
        callable_id_after_redo = callable_impl_after_redo.callable
        assert callable_id_after_redo is not None
        assert state_after_redo.codeObjs[callable_id_after_redo].name == "math.sqrt"

        python_target = get_python_codegen_target_with_type_guard(
            state_after_redo.projectConfig
        )
        assert python_target.genCodePrefix == "import math"


@pytest.mark.asyncio
async def test_active_ids_in_place_mutation_does_not_retroactively_modify_redo_entries() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=10.0)

        project_config_id = project_state.projectConfig.id
        section_id = next(iter(project_state.sections.keys()))

        (
            callable_history_index,
            _callable_entry_layout,
            callable_entry_active_ids,
        ) = await _build_prefix_and_callable_history(
            manager=manager,
            project_config_id=project_config_id,
            section_id=section_id,
        )

        # Move before the callable entry, then apply an in-place activeIds mutation.
        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)
        assert manager.history._current == callable_history_index - 1

        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[section_id],
            )
        )
        await manager.finish_pending_operations(timeout=10.0)

        # The redo entry should keep its original activeIds payload.
        callable_entry_backend_after_active_ids = manager.history._history[
            callable_history_index
        ]
        callable_entry_project_config_after_active_ids = (
            callable_entry_backend_after_active_ids.projectConfigs[project_config_id]
        )
        assert (
            callable_entry_project_config_after_active_ids.activeIds
            == callable_entry_active_ids
        )

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)

        state_after_redo = manager.get_single_config_state(project_config_id)
        callable_impl_after_redo = get_curr_effective_section_impl_with_type_guard(
            state_after_redo,
            section_id,
            CallableSectionImpl,
        )
        callable_id_after_redo = callable_impl_after_redo.callable
        assert callable_id_after_redo is not None
        assert state_after_redo.codeObjs[callable_id_after_redo].name == "math.sqrt"

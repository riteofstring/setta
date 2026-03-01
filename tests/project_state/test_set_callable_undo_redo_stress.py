import asyncio

import pytest

from setta.project_state.project_manager_types import (
    AddKwargRequest,
    CreateTopLevelSectionRequest,
    DeleteKwargRequest,
    RedoRequest,
    SetTopLevelSectionLayoutRequest,
    SetParamEnteredValueRequest,
    SetParamNameAndValueRequest,
    SetCallableRequest,
    UndoRequest,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import get_curr_top_level_param_ids
from setta.types.project_config import Position
from setta.types.section_impls import CallableSectionImpl
from setta.types.section_impls import SectionType
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


@pytest.mark.asyncio
async def test_set_callable_burst_undo_redo_requests_do_not_raise() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)

        project_config_id = project_state.projectConfig.id
        section_id = next(iter(project_state.sections.keys()))

        # Create multiple callable snapshots so repeated undo/redo traverses
        # callable trees under rapid request bursts.
        await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="sorted",
                refetchParams=True,
            )
        )
        await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="sum",
                refetchParams=True,
            )
        )
        await manager.finish_pending_operations(timeout=10.0)

        # Simulate key-repeat request bursts by enqueueing many requests without
        # waiting for each one to complete.
        await asyncio.gather(
            *[
                manager.undo(
                    UndoRequest(projectConfigId=project_config_id, steps=1)
                )
                for _ in range(40)
            ]
        )
        await manager.finish_pending_operations(timeout=10.0)
        await asyncio.gather(
            *[
                manager.redo(
                    RedoRequest(projectConfigId=project_config_id, steps=1)
                )
                for _ in range(40)
            ]
        )
        await manager.finish_pending_operations(timeout=10.0)

        state = manager.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            state,
            section_id,
            CallableSectionImpl,
        )
        assert section_impl.callable is not None


@pytest.mark.asyncio
async def test_set_callable_undo_redo_with_auto_refetch_keeps_callable_name() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        manager.settings_file.settings.backend.autoRefetchCallableParamsOnLspMismatch = (
            True
        )
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)

        project_config_id = project_state.projectConfig.id
        create_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Callable,
                position=Position(x=640.0, y=160.0),
            )
        )
        section_id = create_response.sectionId

        # The frontend uses refetchParams=False for callable selection. Use the same
        # flow, then trigger the background mismatch refetch callback path.
        await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="math.sqrt",
                refetchParams=False,
            )
        )
        await manager.finish_pending_operations(timeout=10.0)

        state_after_set = manager.get_single_config_state(project_config_id)
        section_impl_after_set = get_curr_effective_section_impl_with_type_guard(
            state_after_set,
            section_id,
            CallableSectionImpl,
        )
        callable_id_after_set = section_impl_after_set.callable
        assert callable_id_after_set is not None
        assert state_after_set.codeObjs[callable_id_after_set].name == "math.sqrt"
        history_len_after_set = len(manager.history._history)

        await manager.auto_refetch_callable_params_on_lsp_mismatch(
            project_config_id,
            {section_id},
        )
        await manager.finish_pending_operations(timeout=10.0)

        # Auto-refetch is a background reconciliation step and must not consume a
        # user-visible undo slot.
        assert len(manager.history._history) == history_len_after_set

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)
        state_after_undo = manager.get_single_config_state(project_config_id)
        section_impl_after_undo = get_curr_effective_section_impl_with_type_guard(
            state_after_undo,
            section_id,
            CallableSectionImpl,
        )
        assert section_impl_after_undo.callable is None

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)
        state_after_redo = manager.get_single_config_state(project_config_id)
        section_impl_after_redo = get_curr_effective_section_impl_with_type_guard(
            state_after_redo,
            section_id,
            CallableSectionImpl,
        )
        callable_id_after_redo = section_impl_after_redo.callable
        assert callable_id_after_redo is not None
        assert state_after_redo.codeObjs[callable_id_after_redo].name == "math.sqrt"


@pytest.mark.asyncio
async def test_mixed_mutation_bursts_keep_undo_redo_stable() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)

        project_config_id = project_state.projectConfig.id
        create_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Callable,
                position=Position(x=620.0, y=120.0),
            )
        )
        section_id = create_response.sectionId

        # Build a mixed mutation history similar to real user interactions.
        await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="sorted",
                refetchParams=True,
            )
        )
        await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="sum",
                refetchParams=True,
            )
        )
        state = manager.get_single_config_state(project_config_id)
        top_level_param_ids = get_curr_top_level_param_ids(state, section_id)
        if not top_level_param_ids:
            await manager.add_kwarg(
                AddKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_id,
                )
            )
            state = manager.get_single_config_state(project_config_id)
            top_level_param_ids = get_curr_top_level_param_ids(state, section_id)
        if not top_level_param_ids:
            raise KeyError(
                "Callable section is missing top-level params for stress test."
            )
        param_id = top_level_param_ids[0]
        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                paramInfoId=param_id,
                value="[3, 2, 1]",
            )
        )
        await manager.set_param_name_and_value(
            SetParamNameAndValueRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                codeObjId=param_id,
                name="iterable",
                value="[9, 1, 5]",
            )
        )
        await manager.add_kwarg(
            AddKwargRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
            )
        )
        await manager.delete_kwarg(
            DeleteKwargRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
            )
        )
        await manager.finish_pending_operations(timeout=10.0)

        # Simulate prolonged key-repeat bursts for both directions.
        await asyncio.gather(
            *[
                manager.undo(
                    UndoRequest(projectConfigId=project_config_id, steps=1)
                )
                for _ in range(50)
            ]
        )
        await manager.finish_pending_operations(timeout=10.0)
        await asyncio.gather(
            *[
                manager.redo(
                    RedoRequest(projectConfigId=project_config_id, steps=1)
                )
                for _ in range(50)
            ]
        )
        await manager.finish_pending_operations(timeout=10.0)

        # Interleave rapid undo/redo calls to mimic users alternating shortcuts.
        interleaved_requests = []
        for _ in range(20):
            interleaved_requests.append(
                manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
            )
            interleaved_requests.append(
                manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
            )
        await asyncio.gather(*interleaved_requests)
        await manager.finish_pending_operations(timeout=10.0)

        final_state = manager.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            final_state,
            section_id,
            CallableSectionImpl,
        )
        assert section_impl.callable is not None


@pytest.mark.asyncio
async def test_high_repeat_undo_redo_with_interleaved_layout_updates_stays_stable() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(6)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)

        project_config_id = project_state.projectConfig.id
        create_response = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Callable,
                position=Position(x=720.0, y=180.0),
            )
        )
        section_id = create_response.sectionId
        await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="sorted",
                refetchParams=True,
            )
        )
        await manager.set_callable(
            SetCallableRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                callableName="sum",
                refetchParams=True,
            )
        )
        await manager.finish_pending_operations(timeout=10.0)

        # Simulate held keyboard shortcuts by rapidly enqueueing undo/redo
        # requests while view layout updates are also being sent.
        burst_requests = []
        for idx in range(80):
            burst_requests.append(
                manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
            )
            burst_requests.append(
                manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
            )
            if idx % 4 != 0:
                continue
            current_state = manager.get_single_config_state(project_config_id)
            updated_layout = {}
            for top_level_section_id, layout in (
                current_state.projectConfig.topLevelSections.items()
            ):
                updated_layout[top_level_section_id] = layout.model_copy(
                    update={
                        "x": layout.x + 0.5,
                        "y": layout.y - 0.5,
                    }
                )
            burst_requests.append(
                manager.set_top_level_section_layout(
                    SetTopLevelSectionLayoutRequest(
                        projectConfigId=project_config_id,
                        topLevelSections=updated_layout,
                    )
                )
            )

        await asyncio.gather(*burst_requests)
        await manager.finish_pending_operations(timeout=10.0)

        final_state = manager.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            final_state,
            section_id,
            CallableSectionImpl,
        )
        assert section_impl.callable is not None

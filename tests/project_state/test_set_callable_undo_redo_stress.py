import asyncio

import pytest

from setta.project_state.project_manager_types import (
    AddKwargRequest,
    CreateTopLevelSectionRequest,
    DeleteKwargRequest,
    RedoRequest,
    SetActiveIdsRequest,
    SetGenCodePrefixRequest,
    SetTopLevelSectionLayoutRequest,
    SetParamEnteredValueRequest,
    SetParamNameAndValueRequest,
    SetCallableRequest,
    UndoRequest,
)
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
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


@pytest.mark.asyncio
async def test_callable_param_undo_redo_keeps_scoped_patch_transport_after_ui_only_updates() -> (
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
                position=Position(x=640.0, y=200.0),
            )
        )
        section_id = create_response.sectionId

        # Mirror the user sequence: prefix change, callable selection, and param edits.
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

        state_after_callable = manager.get_single_config_state(project_config_id)
        top_level_param_ids = get_curr_top_level_param_ids(state_after_callable, section_id)
        if not top_level_param_ids:
            # In non-LSP environments callable discovery can return no params.
            # Create one explicitly so undo/redo coverage still exercises param paths.
            await manager.add_kwarg(
                AddKwargRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_id,
                )
            )
            state_after_callable = manager.get_single_config_state(project_config_id)
            top_level_param_ids = get_curr_top_level_param_ids(
                state_after_callable, section_id
            )
        if not top_level_param_ids:
            raise KeyError("Callable section is missing top-level params for undo test.")
        param_id = top_level_param_ids[0]
        baseline_param_value = get_curr_effective_code_obj_impl_with_type_guard(
            state_after_callable,
            section_id,
            param_id,
            BaseChildlessCodeObjImpl,
        ).value

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                paramInfoId=param_id,
                value="1",
            )
        )
        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                paramInfoId=param_id,
                value="123",
            )
        )
        await manager.finish_pending_operations(timeout=10.0)

        # UI-only routes mutate in place and must not create additional undo slots.
        history_entry_count_before_ui_only_updates = len(manager.history.get_entry_tokens())
        target_entry_token = manager.history.get_current_entry_token()
        await manager.set_active_ids(
            SetActiveIdsRequest(projectConfigId=project_config_id, activeIds=[section_id])
        )
        state_for_layout = manager.get_single_config_state(project_config_id)
        shifted_layout = {
            top_level_section_id: layout.model_copy(
                update={"x": layout.x + 2.0, "y": layout.y + 2.0}
            )
            for top_level_section_id, layout in (
                state_for_layout.projectConfig.topLevelSections.items()
            )
        }
        await manager.set_top_level_section_layout(
            SetTopLevelSectionLayoutRequest(
                projectConfigId=project_config_id,
                topLevelSections=shifted_layout,
            )
        )
        await manager.finish_pending_operations(timeout=10.0)
        assert len(manager.history.get_entry_tokens()) == (
            history_entry_count_before_ui_only_updates
        )

        # Ensure in-place metadata updates augment scoped transport instead of forcing
        # undo/redo into unknown full-diff fallback for this token.
        patch_scope_by_project_config = manager._history_patch_scope_by_entry_token.get(
            target_entry_token
        )
        assert patch_scope_by_project_config is not None
        patch_scope = patch_scope_by_project_config.get(project_config_id)
        assert patch_scope is not None
        assert patch_scope.project_config_only
        assert param_id in patch_scope.code_obj_ids

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        await manager.finish_pending_operations(timeout=10.0)
        state_after_first_undo = manager.get_single_config_state(project_config_id)
        first_undo_impl = get_curr_effective_section_impl_with_type_guard(
            state_after_first_undo,
            section_id,
            CallableSectionImpl,
        )
        first_undo_callable_id = first_undo_impl.callable
        assert first_undo_callable_id is not None
        assert state_after_first_undo.codeObjs[first_undo_callable_id].name == "math.sqrt"
        assert get_curr_effective_code_obj_impl_with_type_guard(
            state_after_first_undo,
            section_id,
            param_id,
            BaseChildlessCodeObjImpl,
        ).value == baseline_param_value

        saw_callable_cleared = False
        for _ in range(len(manager.history.get_entry_tokens())):
            if not manager.history.can_undo(1):
                break
            await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
            await manager.finish_pending_operations(timeout=10.0)
            state_after_undo = manager.get_single_config_state(project_config_id)
            undo_impl = get_curr_effective_section_impl_with_type_guard(
                state_after_undo,
                section_id,
                CallableSectionImpl,
            )
            if undo_impl.callable is None:
                saw_callable_cleared = True
                break
        assert saw_callable_cleared

        saw_callable_and_param_restored = False
        for _ in range(len(manager.history.get_entry_tokens())):
            if not manager.history.can_redo(1):
                break
            await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
            await manager.finish_pending_operations(timeout=10.0)
            state_after_redo = manager.get_single_config_state(project_config_id)
            redo_impl = get_curr_effective_section_impl_with_type_guard(
                state_after_redo,
                section_id,
                CallableSectionImpl,
            )
            redo_callable_id = redo_impl.callable
            if redo_callable_id is None:
                continue
            if state_after_redo.codeObjs[redo_callable_id].name != "math.sqrt":
                continue
            if param_id not in get_curr_top_level_param_ids(state_after_redo, section_id):
                continue
            if (
                get_curr_effective_code_obj_impl_with_type_guard(
                    state_after_redo,
                    section_id,
                    param_id,
                    BaseChildlessCodeObjImpl,
                ).value
                == "123"
            ):
                saw_callable_and_param_restored = True
                break
        assert saw_callable_and_param_restored

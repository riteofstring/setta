import pytest

from setta.project_state.project_manager_types import (
    MoveParamsRequest,
    RedoRequest,
    SetParamEnteredValueRequest,
    UndoRequest,
)
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseParentCodeObjImpl,
    CodeCallableCodeObjImpl,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import CallableSectionImpl, SectionType
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")
TARGET_PARAM_ID = ID("param-0")
SIBLING_PARAM_ID = ID("param-1")
UNCHANGED_PARAM_ID = ID("param-2")


@pytest.mark.asyncio
async def test_code_obj_only_history_entry_copies_only_targeted_code_obj_graph() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(8)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        current_state = manager.get_single_config_state(project_config_id)
        callable_impl = get_curr_effective_section_impl_with_type_guard(
            current_state,
            SECTION_ID,
            CallableSectionImpl,
        )
        target_variant_id = callable_impl.codeObjVariantMap[TARGET_PARAM_ID]
        sibling_variant_id = callable_impl.codeObjVariantMap[SIBLING_PARAM_ID]
        target_impl_id = current_state.codeObjVariants[target_variant_id].impl
        sibling_impl_id = current_state.codeObjVariants[sibling_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        manager.add_new_history_entry(
            trigger_autosave=False,
            project_config_id=project_config_id,
            code_obj_only_ids={TARGET_PARAM_ID},
        )
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert backend_after is not backend_before
        assert (
            backend_after.codeObjs[TARGET_PARAM_ID]
            is not backend_before.codeObjs[TARGET_PARAM_ID]
        )
        assert (
            backend_after.codeObjs[SIBLING_PARAM_ID]
            is backend_before.codeObjs[SIBLING_PARAM_ID]
        )
        assert (
            backend_after.codeObjVariants[target_variant_id]
            is not backend_before.codeObjVariants[target_variant_id]
        )
        assert (
            backend_after.codeObjVariants[sibling_variant_id]
            is backend_before.codeObjVariants[sibling_variant_id]
        )
        assert (
            backend_after.codeObjImpls[target_impl_id]
            is not backend_before.codeObjImpls[target_impl_id]
        )
        assert (
            backend_after.codeObjImpls[sibling_impl_id]
            is backend_before.codeObjImpls[sibling_impl_id]
        )
        assert backend_after.sections[SECTION_ID] is backend_before.sections[SECTION_ID]
        assert (
            backend_after.projectConfigs[project_config_id]
            is backend_before.projectConfigs[project_config_id]
        )

        original_name = backend_before.codeObjs[TARGET_PARAM_ID].name
        backend_after.codeObjs[TARGET_PARAM_ID].name = "scoped-history-code-obj"
        assert backend_before.codeObjs[TARGET_PARAM_ID].name == original_name


@pytest.mark.asyncio
async def test_set_param_entered_value_history_copy_isolates_codegen_singletons() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(8)
        settings = SettingsState()
        gen_code_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.GenPythonCode,
            Position(x=900, y=0),
            core_overrides={"name": "scoped_history_gen_code"},
        )
        gen_meta_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.GenPythonMetadata,
            Position(x=980, y=80),
            core_overrides={"name": "scoped_history_gen_meta"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        current_state = manager.get_single_config_state(project_config_id)
        callable_impl = get_curr_effective_section_impl_with_type_guard(
            current_state,
            SECTION_ID,
            CallableSectionImpl,
        )
        target_variant_id = callable_impl.codeObjVariantMap[TARGET_PARAM_ID]
        sibling_variant_id = callable_impl.codeObjVariantMap[SIBLING_PARAM_ID]
        target_impl_id = current_state.codeObjVariants[target_variant_id].impl
        sibling_impl_id = current_state.codeObjVariants[sibling_variant_id].impl

        gen_code_variant_id = current_state.projectConfig.sectionVariantMap[
            gen_code_section_id
        ]
        gen_meta_variant_id = current_state.projectConfig.sectionVariantMap[
            gen_meta_section_id
        ]
        gen_code_impl_id = current_state.sectionVariants[gen_code_variant_id].impl
        gen_meta_impl_id = current_state.sectionVariants[gen_meta_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        baseline_gen_code_impl = backend_before.sectionImpls[gen_code_impl_id].model_dump()
        baseline_gen_meta_impl = backend_before.sectionImpls[gen_meta_impl_id].model_dump()

        await manager.set_param_entered_value(
            SetParamEnteredValueRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramInfoId=TARGET_PARAM_ID,
                value="scoped-history-value",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert (
            backend_after.codeObjs[TARGET_PARAM_ID]
            is not backend_before.codeObjs[TARGET_PARAM_ID]
        )
        assert (
            backend_after.codeObjVariants[target_variant_id]
            is not backend_before.codeObjVariants[target_variant_id]
        )
        assert (
            backend_after.codeObjImpls[target_impl_id]
            is not backend_before.codeObjImpls[target_impl_id]
        )
        assert (
            backend_after.codeObjs[SIBLING_PARAM_ID]
            is backend_before.codeObjs[SIBLING_PARAM_ID]
        )
        assert (
            backend_after.codeObjVariants[sibling_variant_id]
            is backend_before.codeObjVariants[sibling_variant_id]
        )
        assert (
            backend_after.codeObjImpls[sibling_impl_id]
            is backend_before.codeObjImpls[sibling_impl_id]
        )
        assert (
            backend_after.sectionImpls[gen_code_impl_id]
            is not backend_before.sectionImpls[gen_code_impl_id]
        )
        assert (
            backend_after.sectionImpls[gen_meta_impl_id]
            is not backend_before.sectionImpls[gen_meta_impl_id]
        )
        assert (
            backend_before.sectionImpls[gen_code_impl_id].model_dump()
            == baseline_gen_code_impl
        )
        assert (
            backend_before.sectionImpls[gen_meta_impl_id].model_dump()
            == baseline_gen_meta_impl
        )

        updated_state = manager.get_single_config_state(project_config_id)
        updated_param = get_curr_effective_code_obj_impl_with_type_guard(
            updated_state,
            SECTION_ID,
            TARGET_PARAM_ID,
            BaseChildlessCodeObjImpl,
        )
        assert updated_param.value == "scoped-history-value"


@pytest.mark.asyncio
async def test_move_params_history_copy_isolates_parents_and_codegen_singletons() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(8)
        settings = SettingsState()
        gen_code_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.GenPythonCode,
            Position(x=900, y=0),
            core_overrides={"name": "scoped_history_move_gen_code"},
        )
        gen_meta_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.GenPythonMetadata,
            Position(x=980, y=80),
            core_overrides={"name": "scoped_history_move_gen_meta"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        current_state = manager.get_single_config_state(project_config_id)
        callable_impl = get_curr_effective_section_impl_with_type_guard(
            current_state,
            SECTION_ID,
            CallableSectionImpl,
        )
        callable_id = callable_impl.callable
        assert callable_id is not None
        callable_variant_id = callable_impl.codeObjVariantMap[callable_id]
        new_parent_variant_id = callable_impl.codeObjVariantMap[TARGET_PARAM_ID]
        unchanged_variant_id = callable_impl.codeObjVariantMap[UNCHANGED_PARAM_ID]
        callable_impl_id = current_state.codeObjVariants[callable_variant_id].impl
        new_parent_impl_id = current_state.codeObjVariants[new_parent_variant_id].impl
        unchanged_impl_id = current_state.codeObjVariants[unchanged_variant_id].impl
        gen_code_variant_id = current_state.projectConfig.sectionVariantMap[
            gen_code_section_id
        ]
        gen_meta_variant_id = current_state.projectConfig.sectionVariantMap[
            gen_meta_section_id
        ]
        gen_code_impl_id = current_state.sectionVariants[gen_code_variant_id].impl
        gen_meta_impl_id = current_state.sectionVariants[gen_meta_variant_id].impl

        history_len_before = len(manager.history._history)
        backend_before = manager.project_state_backend
        baseline_gen_code_impl = backend_before.sectionImpls[gen_code_impl_id].model_dump()
        baseline_gen_meta_impl = backend_before.sectionImpls[gen_meta_impl_id].model_dump()

        await manager.move_params(
            MoveParamsRequest(
                projectConfigId=project_config_id,
                sectionId=SECTION_ID,
                paramIds=[SIBLING_PARAM_ID],
                newParentId=TARGET_PARAM_ID,
                newIndex=0,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        backend_after = manager.project_state_backend

        assert len(manager.history._history) == history_len_before + 1
        assert (
            backend_after.codeObjImpls[callable_impl_id]
            is not backend_before.codeObjImpls[callable_impl_id]
        )
        assert (
            backend_after.codeObjVariants[new_parent_variant_id]
            is not backend_before.codeObjVariants[new_parent_variant_id]
        )
        assert (
            backend_after.codeObjImpls[new_parent_impl_id]
            is not backend_before.codeObjImpls[new_parent_impl_id]
        )
        assert (
            backend_after.codeObjs[UNCHANGED_PARAM_ID]
            is backend_before.codeObjs[UNCHANGED_PARAM_ID]
        )
        assert (
            backend_after.codeObjVariants[unchanged_variant_id]
            is backend_before.codeObjVariants[unchanged_variant_id]
        )
        assert (
            backend_after.codeObjImpls[unchanged_impl_id]
            is backend_before.codeObjImpls[unchanged_impl_id]
        )
        assert (
            backend_after.sectionImpls[gen_code_impl_id]
            is not backend_before.sectionImpls[gen_code_impl_id]
        )
        assert (
            backend_after.sectionImpls[gen_meta_impl_id]
            is not backend_before.sectionImpls[gen_meta_impl_id]
        )
        assert (
            backend_before.sectionImpls[gen_code_impl_id].model_dump()
            == baseline_gen_code_impl
        )
        assert (
            backend_before.sectionImpls[gen_meta_impl_id].model_dump()
            == baseline_gen_meta_impl
        )

        updated_state = manager.get_single_config_state(project_config_id)
        callable_impl_after = get_curr_effective_code_obj_impl_with_type_guard(
            updated_state,
            SECTION_ID,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert SIBLING_PARAM_ID not in callable_impl_after.children
        new_parent_impl_after = get_curr_effective_code_obj_impl_with_type_guard(
            updated_state,
            SECTION_ID,
            TARGET_PARAM_ID,
            BaseParentCodeObjImpl,
        )
        assert SIBLING_PARAM_ID in new_parent_impl_after.children

        await manager.undo(UndoRequest(projectConfigId=project_config_id, steps=1))
        undo_state = manager.get_single_config_state(project_config_id)
        callable_impl_after_undo = get_curr_effective_code_obj_impl_with_type_guard(
            undo_state,
            SECTION_ID,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert SIBLING_PARAM_ID in callable_impl_after_undo.children
        reverted_new_parent = get_curr_effective_code_obj_impl_with_type_guard(
            undo_state,
            SECTION_ID,
            TARGET_PARAM_ID,
            BaseChildlessCodeObjImpl,
        )
        assert reverted_new_parent.value == "0"

        await manager.redo(RedoRequest(projectConfigId=project_config_id, steps=1))
        redo_state = manager.get_single_config_state(project_config_id)
        callable_impl_after_redo = get_curr_effective_code_obj_impl_with_type_guard(
            redo_state,
            SECTION_ID,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert SIBLING_PARAM_ID not in callable_impl_after_redo.children
        new_parent_impl_after_redo = get_curr_effective_code_obj_impl_with_type_guard(
            redo_state,
            SECTION_ID,
            TARGET_PARAM_ID,
            BaseParentCodeObjImpl,
        )
        assert SIBLING_PARAM_ID in new_parent_impl_after_redo.children

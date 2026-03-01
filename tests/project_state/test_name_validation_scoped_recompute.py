import pytest

import setta.project_state.base_project_manager as base_project_manager_module
from setta.project_state.project_manager_types import SetCodeObjNameRequest
from setta.types.code_obj_impls import BaseParamCodeObjImpl
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.id import ID
from setta.types.section_impls import BaseSectionWithParamsImpl
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


SECTION_ID = ID("section-1")


@pytest.mark.asyncio
async def test_code_obj_name_uses_scoped_param_name_validation_after_cache_warmup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        project_state_after_update = manager.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state_after_update,
            SECTION_ID,
            BaseSectionWithParamsImpl,
        )
        param_ids: list[ID] = []
        for code_obj_id in section_impl.codeObjVariantMap:
            code_obj_impl = get_curr_effective_code_obj_impl(
                project_state_after_update,
                SECTION_ID,
                code_obj_id,
            )
            if isinstance(code_obj_impl, BaseParamCodeObjImpl):
                param_ids.append(code_obj_id)
        assert len(param_ids) >= 2

        full_param_validation_calls = 0
        scoped_param_validation_calls = 0
        original_collect_param_name_errors = (
            base_project_manager_module.collect_param_name_errors
        )
        original_collect_param_name_errors_for_sections = (
            base_project_manager_module.collect_param_name_errors_for_sections
        )

        def record_collect_param_name_errors(project_state_for_validation):
            nonlocal full_param_validation_calls
            full_param_validation_calls += 1
            return original_collect_param_name_errors(project_state_for_validation)

        def record_collect_param_name_errors_for_sections(
            project_state_for_validation,
            section_ids_for_validation,
        ):
            nonlocal scoped_param_validation_calls
            scoped_param_validation_calls += 1
            return original_collect_param_name_errors_for_sections(
                project_state_for_validation,
                section_ids_for_validation,
            )

        monkeypatch.setattr(
            base_project_manager_module,
            "collect_param_name_errors",
            record_collect_param_name_errors,
        )
        monkeypatch.setattr(
            base_project_manager_module,
            "collect_param_name_errors_for_sections",
            record_collect_param_name_errors_for_sections,
        )

        await manager.set_code_obj_name(
            SetCodeObjNameRequest(
                projectConfigId=project_config_id,
                codeObjId=param_ids[0],
                name="scoped_validation_name_one",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        await manager.set_code_obj_name(
            SetCodeObjNameRequest(
                projectConfigId=project_config_id,
                codeObjId=param_ids[1],
                name="scoped_validation_name_two",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)

        assert full_param_validation_calls == 1
        assert scoped_param_validation_calls >= 1

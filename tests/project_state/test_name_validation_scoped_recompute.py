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


def _collect_param_ids(manager, project_config_id: ID) -> list[ID]:
    project_state = manager.get_single_config_state(project_config_id)
    section_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        SECTION_ID,
        BaseSectionWithParamsImpl,
    )
    param_ids: list[ID] = []
    for code_obj_id in section_impl.codeObjVariantMap:
        code_obj_impl = get_curr_effective_code_obj_impl(
            project_state,
            SECTION_ID,
            code_obj_id,
        )
        if isinstance(code_obj_impl, BaseParamCodeObjImpl):
            param_ids.append(code_obj_id)
    return param_ids


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
        param_ids = _collect_param_ids(manager, project_config_id)
        assert len(param_ids) >= 2

        full_param_validation_calls = 0
        scoped_param_validation_calls = 0
        section_name_conflict_calls = 0
        section_name_format_calls = 0
        heading_name_calls = 0
        project_name_calls = 0
        original_collect_param_name_errors = (
            base_project_manager_module.collect_param_name_errors
        )
        original_collect_param_name_errors_for_sections = (
            base_project_manager_module.collect_param_name_errors_for_sections
        )
        original_collect_section_name_conflicts = (
            base_project_manager_module.collect_section_name_conflicts
        )
        original_collect_section_name_format_errors = (
            base_project_manager_module.collect_section_name_format_errors
        )
        original_collect_text_block_heading_name_errors = (
            base_project_manager_module.collect_text_block_heading_name_errors
        )
        original_collect_project_name_format_errors = (
            base_project_manager_module.collect_project_name_format_errors
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

        def record_collect_section_name_conflicts(project_state_for_validation):
            nonlocal section_name_conflict_calls
            section_name_conflict_calls += 1
            return original_collect_section_name_conflicts(project_state_for_validation)

        def record_collect_section_name_format_errors(project_state_for_validation):
            nonlocal section_name_format_calls
            section_name_format_calls += 1
            return original_collect_section_name_format_errors(
                project_state_for_validation
            )

        def record_collect_text_block_heading_name_errors(project_state_for_validation):
            nonlocal heading_name_calls
            heading_name_calls += 1
            return original_collect_text_block_heading_name_errors(
                project_state_for_validation
            )

        def record_collect_project_name_format_errors(project_state_for_validation):
            nonlocal project_name_calls
            project_name_calls += 1
            return original_collect_project_name_format_errors(
                project_state_for_validation
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
        monkeypatch.setattr(
            base_project_manager_module,
            "collect_section_name_conflicts",
            record_collect_section_name_conflicts,
        )
        monkeypatch.setattr(
            base_project_manager_module,
            "collect_section_name_format_errors",
            record_collect_section_name_format_errors,
        )
        monkeypatch.setattr(
            base_project_manager_module,
            "collect_text_block_heading_name_errors",
            record_collect_text_block_heading_name_errors,
        )
        monkeypatch.setattr(
            base_project_manager_module,
            "collect_project_name_format_errors",
            record_collect_project_name_format_errors,
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
        assert section_name_conflict_calls == 1
        assert section_name_format_calls == 1
        assert heading_name_calls == 1
        assert project_name_calls == 1


@pytest.mark.asyncio
async def test_code_obj_name_skips_name_validation_broadcast_when_payload_unchanged() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id
        param_ids = _collect_param_ids(manager, project_config_id)
        assert len(param_ids) >= 2

        sender = manager.websocket_msg_handler
        name_validation_broadcast_calls = 0
        original_name_validation_broadcast = sender.broadcast_name_validation_errors

        async def record_name_validation_broadcast(content) -> None:
            nonlocal name_validation_broadcast_calls
            name_validation_broadcast_calls += 1
            await original_name_validation_broadcast(content)

        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await manager.set_code_obj_name(
                SetCodeObjNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=param_ids[0],
                    name="scoped_validation_name_three",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert name_validation_broadcast_calls == 1

            await manager.set_code_obj_name(
                SetCodeObjNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=param_ids[1],
                    name="scoped_validation_name_four",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

        assert name_validation_broadcast_calls == 1

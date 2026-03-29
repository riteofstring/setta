import pytest

from setta.project_state.project_manager_types import SetParamEnteredValueRequest
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.section_impls import DictSectionImpl

from tests.utils.manager_fixture import real_settings_manager


def _find_param_info(
    project_state, section_name: str, param_name: str
) -> tuple[ID, ID, str]:
    for section_id, section in project_state.sections.items():
        if section.name != section_name:
            continue
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            DictSectionImpl,
        )
        for param_id in section_impl.codeObjVariantMap.keys():
            code_obj = project_state.codeObjs[param_id]
            if code_obj.name != param_name:
                continue
            code_impl = get_curr_effective_code_obj_impl_with_type_guard(
                project_state,
                section_id,
                param_id,
                BaseChildlessCodeObjImpl,
            )
            return section_id, param_id, code_impl.value
    raise KeyError(f"Missing {section_name}.{param_name} in settings project.")


@pytest.mark.asyncio
class TestSettingsProjectJsonSourceLoad:
    async def test_settings_project_loads_json_sources_before_save(self) -> None:
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None

            project_state = convert_backend_to_single_config(
                manager.project_state_backend,
                default_config_id,
            )
            section_id, param_id, current_value = _find_param_info(
                project_state,
                "backend",
                "autosave",
            )
            expected_value = (
                "true" if SettingsState().backend.autosave else "false"
            )
            assert current_value == expected_value

            next_value = "false" if current_value == "true" else "true"
            await manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=default_config_id,
                    sectionId=section_id,
                    paramInfoId=param_id,
                    value=next_value,
                )
            )
            manager.perform_manual_save()

            reloaded = fixture.settings_file.load_settings()
            assert reloaded.backend.autosave == (next_value == "true")

from setta.project_state.listener_dependency_updates import (
    apply_listener_dependency_updates,
)
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl, CodeObjType
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    get_meta_control_param_id,
)
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class TestListenerMetaControlUpdates:
    def test_listener_updates_meta_control_param_value(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-meta-control")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.TextParam,
        )
        control_param_id = get_meta_control_param_id(project_state, section_id)
        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionParamDependencyKey(
                sectionId=section_id,
                codeObjId=control_param_id,
            ),
            value=LiteralDependencyValue("updated"),
        )

        apply_listener_dependency_updates(
            project_state=project_state,
            updates=[update],
        )

        impl = get_curr_effective_code_obj_impl_with_type_guard(
            project_state,
            section_id,
            control_param_id,
            BaseChildlessCodeObjImpl,
        )
        assert impl.value == "updated"

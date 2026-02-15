import pytest

from setta.project_state.listener_dependency_updates import (
    ListenerDependencyUpdateError,
    apply_listener_dependency_updates,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    ChatSectionImpl,
    ChatSectionState,
    PluginSectionImpl,
    SectionType,
)


class TestListenerChatSectionUpdates:
    def test_listener_updates_chat_section_with_dict_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-chat")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(),
        )
        message = UserChatMessage(content=[MessageTextContent(text="hello")])
        state = ChatSectionState(
            messages=[message],
            inputText="draft",
            waitingForResponse=True,
            toolCallArguments={"tool": "arg"},
        )
        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue(state.model_dump()),
        )

        apply_listener_dependency_updates(
            project_state=project_state,
            updates=[update],
        )

        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            ChatSectionImpl,
        )
        assert impl.inputText == "draft"
        assert impl.waitingForResponse
        assert impl.toolCallArguments == {"tool": "arg"}
        assert len(impl.messages) == 1
        assert impl.messages[0].content[0].text == "hello"


class TestListenerPluginSectionUpdates:
    def test_listener_updates_plugin_section_with_data_patch_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-plugin")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Plugin,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            {
                "data": {
                    "existing": 1,
                    "keep": True,
                }
            },
        )

        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue('{"existing": 2, "added": "ok"}'),
        )
        apply_listener_dependency_updates(
            project_state=project_state,
            updates=[update],
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            PluginSectionImpl,
        )
        assert impl.data == {
            "existing": 2,
            "keep": True,
            "added": "ok",
        }

    def test_listener_updates_plugin_section_with_structured_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-plugin")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Plugin,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            {
                "data": {
                    "existing": 1,
                }
            },
        )

        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue(
                '{"data": {"replaced": true}, "merge": false, "kind": "live", "schemaVersion": 7}'
            ),
        )
        apply_listener_dependency_updates(
            project_state=project_state,
            updates=[update],
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            PluginSectionImpl,
        )
        assert impl.data == {"replaced": True}
        assert impl.kind == "live"
        assert impl.schemaVersion == 7

    def test_listener_treats_kind_key_as_plain_data_without_control_data_field(
        self,
    ) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-plugin")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Plugin,
            Position(),
        )
        set_curr_effective_section_impl_value(
            project_state,
            section_id,
            {
                "data": {
                    "existing": 1,
                }
            },
        )
        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue('{"kind": "data-kind", "points": [1, 2, 3]}'),
        )

        apply_listener_dependency_updates(
            project_state=project_state,
            updates=[update],
        )

        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            PluginSectionImpl,
        )
        assert impl.data == {
            "existing": 1,
            "kind": "data-kind",
            "points": [1, 2, 3],
        }

    def test_listener_rejects_invalid_plugin_section_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-plugin")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Plugin,
            Position(),
        )

        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue('{"data": "invalid"}'),
        )
        with pytest.raises(ListenerDependencyUpdateError):
            apply_listener_dependency_updates(
                project_state=project_state,
                updates=[update],
            )

    def test_listener_rejects_python_literal_plugin_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-plugin")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Plugin,
            Position(),
        )

        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue("{'data': {'invalid': True}}"),
        )
        with pytest.raises(ListenerDependencyUpdateError) as exc_info:
            apply_listener_dependency_updates(
                project_state=project_state,
                updates=[update],
            )

        assert "must be valid JSON" in str(exc_info.value)

    def test_listener_updates_chat_section_with_json_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-chat")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(),
        )
        message = UserChatMessage(content=[MessageTextContent(text="hello")])
        state = ChatSectionState(
            messages=[message],
            inputText="draft",
            waitingForResponse=True,
            toolCallArguments={"tool": "arg"},
        )
        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue(state.model_dump_json()),
        )

        apply_listener_dependency_updates(
            project_state=project_state,
            updates=[update],
        )

        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            ChatSectionImpl,
        )
        assert impl.inputText == "draft"
        assert impl.waitingForResponse
        assert impl.toolCallArguments == {"tool": "arg"}
        assert len(impl.messages) == 1
        assert impl.messages[0].content[0].text == "hello"

    def test_listener_updates_chat_section_with_literal_payload(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="listener-chat")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(),
        )
        message = UserChatMessage(content=[MessageTextContent(text="hello")])
        state = ChatSectionState(
            messages=[message],
            inputText="draft",
            waitingForResponse=True,
            toolCallArguments={"tool": "arg"},
        )
        update = ListenerFrontendEmitKeyAndValue(
            dependencyKey=SectionDependencyKey(sectionId=section_id),
            value=LiteralDependencyValue(repr(state.model_dump(mode="json"))),
        )

        apply_listener_dependency_updates(
            project_state=project_state,
            updates=[update],
        )

        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            ChatSectionImpl,
        )
        assert impl.inputText == "draft"
        assert impl.waitingForResponse
        assert impl.toolCallArguments == {"tool": "arg"}
        assert len(impl.messages) == 1
        assert impl.messages[0].content[0].text == "hello"

from setta.project_state.listener_dependency_updates import (
    apply_listener_dependency_updates,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionImpl, ChatSectionState, SectionType


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

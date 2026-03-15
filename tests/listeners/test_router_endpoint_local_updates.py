from ast import literal_eval

from setta.code_gen.dependency_graph import DependencyGraph
from setta.listeners.router_endpoint_local_updates import (
    build_local_router_endpoint_updates,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import FileReadDependencyValue, LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import create_top_level_section, set_chat_section_chat_id
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectConfig,
    SectionCodegenMode,
    SectionRepresentationMode,
    SectionTypeCodegenPolicy,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionState, SectionType
from setta.utils.constants import C


def _build_chat_project_state(
    *,
    representation: SectionRepresentationMode,
    chat_id: ID | None = None,
) -> tuple[ProjectStateSingleConfig, ID, DependencyGraph]:
    settings = SettingsState()
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(name="test-project")
    )
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    if chat_id is not None:
        set_chat_section_chat_id(project_state, section_id, chat_id)
    policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
    policy.typePolicies[SectionType.Chat] = SectionTypeCodegenPolicy(
        mode=SectionCodegenMode.include,
        representation=representation,
    )
    return project_state, section_id, DependencyGraph(project_state)


class TestRouterEndpointLocalUpdates:
    def test_builds_chat_section_update_payload_expression(self) -> None:
        project_state, section_id, dependency_graph = _build_chat_project_state(
            representation=SectionRepresentationMode.expression,
        )
        state = ChatSectionState(
            messages=[
                UserChatMessage(
                    id=ID("msg-1"),
                    content=[MessageTextContent(text="hi")],
                )
            ],
            inputText="",
            waitingForResponse=False,
            toolCallArguments={"tool-1": "{}"},
        )

        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_chat_section_state",
            payload={"sectionId": section_id, "state": state},
            dependency_graph=dependency_graph,
            project_state=project_state,
        )

        assert len(updates) == 1
        update = updates[0]
        assert (
            SectionDependencyKey(sectionId=section_id)
            == update.dependency_key
        )
        assert isinstance(update.value, LiteralDependencyValue)
        parsed = ChatSectionState.model_validate(literal_eval(update.value.payload))
        assert state.messages == parsed.messages
        assert state.toolCallArguments == parsed.toolCallArguments

    def test_builds_chat_section_update_payload_file_path(self) -> None:
        chat_id = ID("chat-path")
        project_state, section_id, dependency_graph = _build_chat_project_state(
            representation=SectionRepresentationMode.file_path,
            chat_id=chat_id,
        )
        state = ChatSectionState(
            messages=[],
            inputText="",
            waitingForResponse=False,
            toolCallArguments={},
        )

        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_chat_section_state",
            payload={"sectionId": section_id, "state": state},
            dependency_graph=dependency_graph,
            project_state=project_state,
        )

        assert len(updates) == 1
        update = updates[0]
        assert isinstance(update.value, LiteralDependencyValue)
        expected_path = str(C.SETTA_FILES_FOLDER / "chats" / f"{chat_id}.json")
        assert update.value.payload == expected_path

    def test_builds_chat_section_update_payload_file_read(self) -> None:
        chat_id = ID("chat-read")
        project_state, section_id, dependency_graph = _build_chat_project_state(
            representation=SectionRepresentationMode.file_read,
            chat_id=chat_id,
        )
        state = ChatSectionState(
            messages=[],
            inputText="",
            waitingForResponse=False,
            toolCallArguments={},
        )

        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_chat_section_state",
            payload={"sectionId": section_id, "state": state},
            dependency_graph=dependency_graph,
            project_state=project_state,
        )

        assert len(updates) == 1
        update = updates[0]
        assert isinstance(update.value, FileReadDependencyValue)
        expected_path = str(C.SETTA_FILES_FOLDER / "chats" / f"{chat_id}.json")
        assert update.value.payload == expected_path

    def test_builds_chat_section_update_payload_without_chat_id(self) -> None:
        project_state, section_id, dependency_graph = _build_chat_project_state(
            representation=SectionRepresentationMode.file_path,
        )
        state = ChatSectionState(
            messages=[],
            inputText="",
            waitingForResponse=False,
            toolCallArguments={},
        )

        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_chat_section_state",
            payload={"sectionId": section_id, "state": state},
            dependency_graph=dependency_graph,
            project_state=project_state,
        )

        assert len(updates) == 1
        update = updates[0]
        assert isinstance(update.value, LiteralDependencyValue)
        parsed = ChatSectionState.model_validate(literal_eval(update.value.payload))
        assert state.messages == parsed.messages
        assert state.toolCallArguments == parsed.toolCallArguments

    def test_ignores_unrelated_endpoints(self) -> None:
        project_state, _, dependency_graph = _build_chat_project_state(
            representation=SectionRepresentationMode.expression,
        )
        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_text_block_text",
            payload={"sectionId": ID("text-1"), "text": "hi"},
            dependency_graph=dependency_graph,
            project_state=project_state,
        )
        assert updates == []

    def test_skips_missing_dependency_graph_entries(self) -> None:
        project_state, _, dependency_graph = _build_chat_project_state(
            representation=SectionRepresentationMode.expression,
        )
        state = ChatSectionState(
            messages=[],
            inputText="",
            waitingForResponse=False,
            toolCallArguments={},
        )

        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_chat_section_state",
            payload={"sectionId": ID("missing-section"), "state": state},
            dependency_graph=dependency_graph,
            project_state=project_state,
        )

        assert updates == []

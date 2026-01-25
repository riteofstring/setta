from unittest import TestCase

from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.types.chat_messages import MessageTextContent, SystemChatMessage
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import FileReadDependencyValue, LiteralDependencyValue
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    set_chat_section_chat_id,
    set_chat_section_state,
)
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


class ChatDependencyGraphTests(TestCase):
    def test_chat_section_expression_exports_dict_literal(self) -> None:
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
        chat_state = ChatSectionState(
            messages=[
                SystemChatMessage(content=[MessageTextContent(text="hello")])
            ],
            inputText="hi",
            waitingForResponse=True,
            toolCallArguments={"x": "y"},
        )
        set_chat_section_state(project_state, section_id, chat_state)
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Chat] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.expression,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        self.assertIsInstance(node, SectionNode)
        self.assertIsInstance(node.value, LiteralDependencyValue)
        assert node.value is not None
        self.assertEqual(
            node.value.payload,
            repr(chat_state.model_dump(mode="json")),
        )

    def test_chat_section_file_path_exports_literal_path(self) -> None:
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
        chat_id = ID("chat-1")
        set_chat_section_chat_id(project_state, section_id, chat_id)
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Chat] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file_path,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        self.assertIsInstance(node, SectionNode)
        self.assertIsInstance(node.value, LiteralDependencyValue)
        assert node.value is not None
        expected_path = str(C.SETTA_FILES_FOLDER / "chats" / f"{chat_id}.json")
        self.assertEqual(node.value.payload, expected_path)

    def test_chat_section_file_read_requires_chat_id(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(),
        )
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Chat] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file_read,
        )

        with self.assertRaises(ValueError):
            DependencyGraph(project_state)

    def test_chat_section_file_read_exports_file_value(self) -> None:
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
        chat_id = ID("chat-2")
        set_chat_section_chat_id(project_state, section_id, chat_id)
        policy = project_state.projectConfig.codegenTargets[0].sectionPolicy
        policy.typePolicies[SectionType.Chat] = SectionTypeCodegenPolicy(
            mode=SectionCodegenMode.include,
            representation=SectionRepresentationMode.file_read,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id)
        node = graph.graph[dep_key]
        self.assertIsInstance(node, SectionNode)
        self.assertIsInstance(node.value, FileReadDependencyValue)
        assert node.value is not None
        expected_path = str(C.SETTA_FILES_FOLDER / "chats" / f"{chat_id}.json")
        self.assertEqual(node.value.payload, expected_path)

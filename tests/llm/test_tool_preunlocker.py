import unittest

from setta.llm.tool_preunlocker import ToolPreunlocker
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType
from setta.project_state.project_state_summary_types import (
    ProjectStateSummary,
    ProjectStateSummarySection,
)
from setta.types.chat import Chat
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.section_impls import SectionType


def _build_chat(message_text: str) -> Chat:
    return Chat(
        id=ID("chat-1"),
        name="Tool Preunlocker Chat",
        projectConfigId=ID("project-1"),
        llmConfig=LLMConfig(id="default", model="gpt-4o"),
        messages=[
            UserChatMessage(content=[MessageTextContent(text=message_text)])
        ],
    )


def _build_summary(section_type: SectionType) -> ProjectStateSummary:
    project_config = ProjectConfig(id=ID("project-1"), name="Test Project")
    section = ProjectStateSummarySection(
        sectionId=ID("section-1"),
        coreName="Section",
        variantId=ID("variant-1"),
        variantName="variant",
        sectionType=section_type,
    )
    return ProjectStateSummary(
        projectConfig=project_config,
        sections=[section],
    )


def _register_tool(
    available_tools: dict[str, dict[str, dict]],
    annotations_by_name: dict[str, SettaToolAnnotations | None],
    *,
    name: str,
    description: str,
    tags: list[str],
    category: str | None,
) -> None:
    definition = {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {},
        },
    }
    available_tools[name] = definition
    annotations_by_name[name] = SettaToolAnnotations(
        settaToolType=SettaToolType.discoverable,
        searchTags=tags,
        searchCategory=category,
    )


def _register_tool_without_annotations(
    available_tools: dict[str, dict[str, dict]],
    *,
    name: str,
    description: str,
) -> None:
    definition = {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {},
        },
    }
    available_tools[name] = definition


class ToolPreunlockerTests(unittest.TestCase):
    def test_selects_tool_based_on_message_tokens(self) -> None:
        available_tools: dict[str, dict[str, dict]] = {}
        annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        _register_tool(
            available_tools,
            annotations_by_name,
            name="setta__read_file_range",
            description="Read file contents",
            tags=["read", "file"],
            category="files",
        )
        _register_tool(
            available_tools,
            annotations_by_name,
            name="setta__set_section_sizes",
            description="Update layout sizes",
            tags=["section", "layout"],
            category="sections",
        )

        preunlocker = ToolPreunlocker()
        summary = _build_summary(SectionType.Code)
        chat = _build_chat("Read the file range")

        selected = preunlocker.select_tools(
            chat,
            summary,
            available_tools=available_tools,
            annotations_by_name=annotations_by_name,
        )

        self.assertIn("setta__read_file_range", selected)
        self.assertNotIn("setta__set_section_sizes", selected)

    def test_selects_tool_from_section_category_when_message_empty(self) -> None:
        available_tools: dict[str, dict[str, dict]] = {}
        annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        _register_tool(
            available_tools,
            annotations_by_name,
            name="setta__list_terminals",
            description="Return terminal sessions",
            tags=["terminal"],
            category="terminal",
        )
        _register_tool(
            available_tools,
            annotations_by_name,
            name="setta__list_projects",
            description="Return project configs",
            tags=["project"],
            category="project",
        )

        preunlocker = ToolPreunlocker()
        summary = _build_summary(SectionType.Terminal)
        chat = _build_chat(" ")

        selected = preunlocker.select_tools(
            chat,
            summary,
            available_tools=available_tools,
            annotations_by_name=annotations_by_name,
        )

        self.assertIn("setta__list_terminals", selected)
        self.assertNotIn("setta__list_projects", selected)

    def test_selects_tool_with_server_id_even_without_annotations(self) -> None:
        available_tools: dict[str, dict[str, dict]] = {}
        annotations_by_name: dict[str, SettaToolAnnotations | None] = {}
        _register_tool_without_annotations(
            available_tools,
            name="context7__get-library-docs",
            description="Fetch docs for a library.",
        )
        _register_tool(
            available_tools,
            annotations_by_name,
            name="setta__read_file_range",
            description="Read file contents",
            tags=["read", "file"],
            category="files",
        )

        preunlocker = ToolPreunlocker()
        summary = _build_summary(SectionType.Code)
        chat = _build_chat("Use context7 to read docs")

        selected = preunlocker.select_tools(
            chat,
            summary,
            available_tools=available_tools,
            annotations_by_name=annotations_by_name,
        )

        self.assertIn("context7__get-library-docs", selected)


if __name__ == "__main__":
    unittest.main()

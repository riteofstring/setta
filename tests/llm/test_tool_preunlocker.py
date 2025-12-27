import unittest

from setta.llm.tool_preunlocker import ToolPreunlocker
from setta.mcp.client import MCPClient
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
    mcp_client: MCPClient,
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
    mcp_client.discoverable_tool_definitions[name] = definition
    mcp_client.tool_annotations_by_name[name] = SettaToolAnnotations(
        settaToolType=SettaToolType.discoverable,
        searchTags=tags,
        searchCategory=category,
    )


class ToolPreunlockerTests(unittest.TestCase):
    def test_selects_tool_based_on_message_tokens(self) -> None:
        mcp_client = MCPClient("http://localhost")
        mcp_client.discoverable_tool_definitions = {}
        mcp_client.tool_annotations_by_name = {}
        _register_tool(
            mcp_client,
            name="read_file_range",
            description="Read file contents",
            tags=["read", "file"],
            category="files",
        )
        _register_tool(
            mcp_client,
            name="set_section_sizes",
            description="Update layout sizes",
            tags=["section", "layout"],
            category="sections",
        )

        preunlocker = ToolPreunlocker(mcp_client)
        summary = _build_summary(SectionType.Code)
        chat = _build_chat("Read the file range")

        selected = preunlocker.select_tools(chat, summary)

        self.assertIn("read_file_range", selected)
        self.assertNotIn("set_section_sizes", selected)

    def test_selects_tool_from_section_category_when_message_empty(self) -> None:
        mcp_client = MCPClient("http://localhost")
        mcp_client.discoverable_tool_definitions = {}
        mcp_client.tool_annotations_by_name = {}
        _register_tool(
            mcp_client,
            name="list_terminals",
            description="Return terminal sessions",
            tags=["terminal"],
            category="terminal",
        )
        _register_tool(
            mcp_client,
            name="list_projects",
            description="Return project configs",
            tags=["project"],
            category="project",
        )

        preunlocker = ToolPreunlocker(mcp_client)
        summary = _build_summary(SectionType.Terminal)
        chat = _build_chat(" ")

        selected = preunlocker.select_tools(chat, summary)

        self.assertIn("list_terminals", selected)
        self.assertNotIn("list_projects", selected)


if __name__ == "__main__":
    unittest.main()

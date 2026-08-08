from setta.mcp.tool_search_index import (
    ToolSearchIndex,
    build_tool_search_entries_from_llm_definitions,
)
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType


class TestLocalToolSearch:
    def test_search_returns_namespaced_tool_names(self) -> None:
        definitions = {
            "setta__read_file_range": {
                "type": "function",
                "function": {
                    "name": "setta__read_file_range",
                    "description": "Read file contents",
                    "parameters": {},
                },
            },
            "github__create_issue": {
                "type": "function",
                "function": {
                    "name": "github__create_issue",
                    "description": "Create repository issues",
                    "parameters": {},
                },
            },
        }
        annotations: dict[str, SettaToolAnnotations | None] = {
            "setta__read_file_range": SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                searchCategory="files",
            ),
            "github__create_issue": None,
        }

        entries = build_tool_search_entries_from_llm_definitions(
            definitions,
            annotations,
        )
        index = ToolSearchIndex.build(entries)

        assert index is not None
        results = index.search("read file", 1)

        assert results[0].name == "setta__read_file_range"

    def test_search_includes_categories(self) -> None:
        definitions = {
            "setta__list_notifications": {
                "type": "function",
                "function": {
                    "name": "setta__list_notifications",
                    "description": "List notifications",
                    "parameters": {},
                },
            }
        }
        annotations: dict[str, SettaToolAnnotations | None] = {
            "setta__list_notifications": SettaToolAnnotations(
                settaToolType=SettaToolType.discoverable,
                searchCategory="alerts",
            )
        }

        entries = build_tool_search_entries_from_llm_definitions(
            definitions,
            annotations,
        )
        index = ToolSearchIndex.build(entries)

        assert index is not None
        results = index.search("notifications", 1)

        assert results[0].category == "alerts"

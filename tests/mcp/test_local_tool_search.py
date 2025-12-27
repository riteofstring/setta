import unittest

from setta.mcp.local_tool_search import (
    build_local_tool_search_index,
    search_local_tool_index,
)
from setta.mcp.tool_metadata import SettaToolAnnotations, SettaToolType


class LocalToolSearchTests(unittest.TestCase):
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

        index = build_local_tool_search_index(definitions, annotations)

        self.assertIsNotNone(index)
        results = search_local_tool_index(index, "read file", 1)

        self.assertEqual(results[0]["name"], "setta__read_file_range")

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

        index = build_local_tool_search_index(definitions, annotations)

        self.assertIsNotNone(index)
        results = search_local_tool_index(index, "notifications", 1)

        self.assertEqual(results[0]["category"], "alerts")

import unittest

from setta.agentic.external_tool_allowlist import build_external_tool_allowlist


class ExternalToolAllowlistTests(unittest.TestCase):
    def test_empty_allowlist_returns_none(self) -> None:
        allowlist, error = build_external_tool_allowlist([])
        self.assertIsNone(allowlist)
        self.assertIsNone(error)

        allowlist, error = build_external_tool_allowlist(None)
        self.assertIsNone(allowlist)
        self.assertIsNone(error)

    def test_rejects_empty_entries(self) -> None:
        allowlist, error = build_external_tool_allowlist([" "])
        self.assertIsNone(allowlist)
        self.assertEqual(error, "toolAllowlist entries must be non-empty strings")

    def test_accepts_bare_tool_names(self) -> None:
        allowlist, error = build_external_tool_allowlist(["runTool", "getProjectState"])
        self.assertIsNone(error)
        self.assertIsNotNone(allowlist)
        self.assertFalse(allowlist.allow_all)
        self.assertEqual(
            list(allowlist.tool_names),
            ["getProjectState", "runTool"],
        )

    def test_accepts_namespaced_tool_names(self) -> None:
        allowlist, error = build_external_tool_allowlist(
            ["setta__getProjectState", "mcp__setta__runTool"]
        )
        self.assertIsNone(error)
        self.assertIsNotNone(allowlist)
        self.assertFalse(allowlist.allow_all)
        self.assertEqual(
            list(allowlist.tool_names),
            ["getProjectState", "runTool"],
        )

    def test_rejects_other_server_entries(self) -> None:
        allowlist, error = build_external_tool_allowlist(["other__tool"])
        self.assertIsNone(allowlist)
        self.assertEqual(
            error,
            "External tool allowlist only supports MCP server 'setta': other__tool",
        )

        allowlist, error = build_external_tool_allowlist(["mcp__other__tool"])
        self.assertIsNone(allowlist)
        self.assertEqual(
            error,
            "External tool allowlist only supports MCP server 'setta': mcp__other__tool",
        )

    def test_allows_server_entry(self) -> None:
        allowlist, error = build_external_tool_allowlist(["setta"])
        self.assertIsNone(error)
        self.assertIsNotNone(allowlist)
        self.assertTrue(allowlist.allow_all)
        self.assertEqual(list(allowlist.tool_names), [])

    def test_server_entry_overrides_named_tools(self) -> None:
        allowlist, error = build_external_tool_allowlist(
            ["setta__runTool", "setta", "getProjectState"]
        )
        self.assertIsNone(error)
        self.assertIsNotNone(allowlist)
        self.assertTrue(allowlist.allow_all)
        self.assertEqual(list(allowlist.tool_names), [])


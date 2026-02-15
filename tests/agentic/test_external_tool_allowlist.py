from setta.agentic.external_tool_allowlist import build_external_tool_allowlist


class TestExternalToolAllowlist:
    def test_empty_allowlist_returns_none(self) -> None:
        allowlist, error = build_external_tool_allowlist([])
        assert allowlist is None
        assert error is None

        allowlist, error = build_external_tool_allowlist(None)
        assert allowlist is None
        assert error is None

    def test_rejects_empty_entries(self) -> None:
        allowlist, error = build_external_tool_allowlist([" "])
        assert allowlist is None
        assert error == "toolAllowlist entries must be non-empty strings"

    def test_accepts_bare_tool_names(self) -> None:
        allowlist, error = build_external_tool_allowlist(["runTool", "getProjectState"])
        assert error is None
        assert allowlist is not None
        assert not allowlist.allow_all
        assert list(allowlist.tool_names) == [
            "getProjectState",
            "runTool",
            "set_agentic_context",
        ]

    def test_accepts_namespaced_tool_names(self) -> None:
        allowlist, error = build_external_tool_allowlist(
            ["setta__getProjectState", "mcp__setta__runTool"]
        )
        assert error is None
        assert allowlist is not None
        assert not allowlist.allow_all
        assert list(allowlist.tool_names) == [
            "getProjectState",
            "runTool",
            "set_agentic_context",
        ]

    def test_rejects_other_server_entries(self) -> None:
        allowlist, error = build_external_tool_allowlist(["other__tool"])
        assert allowlist is None
        assert (
            error
            == "External tool allowlist only supports MCP server 'setta': other__tool"
        )

        allowlist, error = build_external_tool_allowlist(["mcp__other__tool"])
        assert allowlist is None
        assert (
            error
            == "External tool allowlist only supports MCP server 'setta': mcp__other__tool"
        )

    def test_allows_server_entry(self) -> None:
        allowlist, error = build_external_tool_allowlist(["setta"])
        assert error is None
        assert allowlist is not None
        assert allowlist.allow_all
        assert list(allowlist.tool_names) == []

    def test_server_entry_overrides_named_tools(self) -> None:
        allowlist, error = build_external_tool_allowlist(
            ["setta__runTool", "setta", "getProjectState"]
        )
        assert error is None
        assert allowlist is not None
        assert allowlist.allow_all
        assert list(allowlist.tool_names) == []

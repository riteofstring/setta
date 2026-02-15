import pytest

from setta.mcp.tool_approval_policy import (
    SettaMCPToolApprovalPolicy,
    normalize_setta_mcp_tool_approval_policy,
    resolve_setta_mcp_tool_approval_policy,
)
from setta.types.external_agents import ExternalAgentToolType


def test_resolve_policy_returns_none_without_inputs() -> None:
    policy = resolve_setta_mcp_tool_approval_policy(
        permission_mode=None,
        external_tool_type=None,
        external_approval_policy=None,
    )
    assert policy is None


def test_resolve_policy_maps_yolo_to_allow_all() -> None:
    policy = resolve_setta_mcp_tool_approval_policy(
        permission_mode="yolo",
    )
    assert policy == SettaMCPToolApprovalPolicy.allow_all


def test_resolve_policy_maps_codex_never_to_allow_all() -> None:
    policy = resolve_setta_mcp_tool_approval_policy(
        permission_mode="minimal",
        external_tool_type=ExternalAgentToolType.codex,
        external_approval_policy="never",
    )
    assert policy == SettaMCPToolApprovalPolicy.allow_all


def test_resolve_policy_maps_claude_bypass_to_allow_all() -> None:
    policy = resolve_setta_mcp_tool_approval_policy(
        permission_mode="minimal",
        external_tool_type=ExternalAgentToolType.claude_code,
        external_approval_policy="bypassPermissions",
    )
    assert policy == SettaMCPToolApprovalPolicy.allow_all


def test_resolve_policy_maps_opencode_allow_to_allow_all() -> None:
    policy = resolve_setta_mcp_tool_approval_policy(
        permission_mode="minimal",
        external_tool_type=ExternalAgentToolType.opencode,
        external_approval_policy="allow",
    )
    assert policy == SettaMCPToolApprovalPolicy.allow_all


def test_resolve_policy_defaults_to_deny_without_approval_channel() -> None:
    policy = resolve_setta_mcp_tool_approval_policy(
        permission_mode="minimal",
        external_tool_type=ExternalAgentToolType.codex,
        external_approval_policy="on-request",
    )
    assert (
        policy
        == SettaMCPToolApprovalPolicy.deny_destructive_without_approval_channel
    )


def test_resolve_policy_uses_approval_required_mode_when_channel_available() -> None:
    policy = resolve_setta_mcp_tool_approval_policy(
        permission_mode="minimal",
        external_tool_type=ExternalAgentToolType.codex,
        external_approval_policy="on-request",
        has_approval_channel=True,
    )
    assert policy == SettaMCPToolApprovalPolicy.require_approval_for_destructive


def test_normalize_setta_policy_accepts_hyphen_and_underscore_forms() -> None:
    assert (
        normalize_setta_mcp_tool_approval_policy("allow-all")
        == SettaMCPToolApprovalPolicy.allow_all
    )
    assert (
        normalize_setta_mcp_tool_approval_policy(
            "deny_destructive_without_approval_channel"
        )
        == SettaMCPToolApprovalPolicy.deny_destructive_without_approval_channel
    )


def test_normalize_setta_policy_rejects_unknown_values() -> None:
    with pytest.raises(ValueError):
        normalize_setta_mcp_tool_approval_policy("unknown-policy")

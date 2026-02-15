from enum import Enum

from setta.types.external_agents import ExternalAgentToolType
from setta.types.section_impls import ChatPermissionMode


class SettaMCPToolApprovalPolicy(str, Enum):
    allow_all = "allow_all"
    require_approval_for_destructive = "require_approval_for_destructive"
    deny_destructive_without_approval_channel = (
        "deny_destructive_without_approval_channel"
    )


_ALLOW_ALL_EXTERNAL_POLICIES_BY_TOOL_TYPE: dict[str, set[str]] = {
    ExternalAgentToolType.codex.value: {"never"},
    ExternalAgentToolType.claude_code.value: {"bypasspermissions", "acceptedits"},
    ExternalAgentToolType.opencode.value: {"allow"},
}


def normalize_setta_mcp_tool_approval_policy(
    value: str | None,
) -> SettaMCPToolApprovalPolicy | None:
    normalized = _normalize_policy_value(value)
    if normalized is None:
        return None
    mapping: dict[str, SettaMCPToolApprovalPolicy] = {
        "allowall": SettaMCPToolApprovalPolicy.allow_all,
        "requireapprovalfordestructive": SettaMCPToolApprovalPolicy.require_approval_for_destructive,
        "denydestructivewithoutapprovalchannel": SettaMCPToolApprovalPolicy.deny_destructive_without_approval_channel,
    }
    resolved = mapping.get(normalized)
    if resolved is None:
        raise ValueError(f"Unsupported Setta MCP tool approval policy: {value!r}")
    return resolved


def resolve_setta_mcp_tool_approval_policy(
    *,
    permission_mode: str | None,
    external_tool_type: ExternalAgentToolType | str | None = None,
    external_approval_policy: str | None = None,
    has_approval_channel: bool = False,
) -> SettaMCPToolApprovalPolicy | None:
    normalized_permission_mode = _normalize_policy_value(permission_mode)
    normalized_external_policy = _normalize_policy_value(external_approval_policy)
    normalized_tool_type = _normalize_external_tool_type(external_tool_type)

    if (
        normalized_permission_mode is None
        and normalized_external_policy is None
        and normalized_tool_type is None
    ):
        return None

    if normalized_permission_mode == ChatPermissionMode.yolo.value:
        return SettaMCPToolApprovalPolicy.allow_all

    if _is_allow_all_external_policy(
        normalized_tool_type=normalized_tool_type,
        normalized_external_policy=normalized_external_policy,
    ):
        return SettaMCPToolApprovalPolicy.allow_all

    if has_approval_channel:
        return SettaMCPToolApprovalPolicy.require_approval_for_destructive

    return SettaMCPToolApprovalPolicy.deny_destructive_without_approval_channel


def policy_allows_destructive_tools(policy: SettaMCPToolApprovalPolicy) -> bool:
    return policy == SettaMCPToolApprovalPolicy.allow_all


def _normalize_policy_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized == "":
        return None
    return normalized.replace(" ", "").replace("-", "").replace("_", "")


def _normalize_external_tool_type(
    value: ExternalAgentToolType | str | None,
) -> str | None:
    if value is None:
        return None
    if isinstance(value, ExternalAgentToolType):
        return value.value
    normalized = value.strip().lower()
    return normalized if normalized else None


def _is_allow_all_external_policy(
    *,
    normalized_tool_type: str | None,
    normalized_external_policy: str | None,
) -> bool:
    if normalized_external_policy is None:
        return False
    if normalized_tool_type is not None:
        allow_all_values = _ALLOW_ALL_EXTERNAL_POLICIES_BY_TOOL_TYPE.get(
            normalized_tool_type
        )
        if allow_all_values is not None and normalized_external_policy in allow_all_values:
            return True
    return normalized_external_policy in {
        "allow",
        "never",
        "bypasspermissions",
        "acceptedits",
    }

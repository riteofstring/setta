import json
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from setta.agentic.external_tool_allowlist import ExternalToolAllowlist
from setta.database.db_objs import DBE
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.external_agents import (
    ClaudeSettingsManaged,
    ExternalAgentConfig,
    ExternalAgentSettingsMode,
    ExternalAgentToolType,
)
from setta.utils.constants import CWD

_SETTINGS_ROOT_NAME = "external_agent_settings"
_CLAUDE_SETTINGS_DIR = ".claude"
_CLAUDE_SETTINGS_PROJECT = "settings.json"
_CLAUDE_SETTINGS_LOCAL = "settings.local.json"
_CODEX_CONFIG_NAME = "config.toml"
_OPENCODE_CONFIG_NAME = "opencode.json"


@dataclass(frozen=True)
class ExternalAgentSettingsPaths:
    claude_settings: Path | None = None
    codex_config: Path | None = None
    opencode_config: Path | None = None


def resolve_settings_root(dbe: DBE) -> Path:
    return dbe.path / _SETTINGS_ROOT_NAME


def resolve_claude_settings_path(
    config: ExternalAgentConfig, project_root: Path | None = None
) -> Path | None:
    if config.toolType != ExternalAgentToolType.claude_code:
        return None
    if config.settingsMode == ExternalAgentSettingsMode.managed_local:
        return _resolve_project_settings_root(project_root) / _CLAUDE_SETTINGS_LOCAL
    if config.settingsMode == ExternalAgentSettingsMode.managed_project:
        return _resolve_project_settings_root(project_root) / _CLAUDE_SETTINGS_PROJECT
    return None


def resolve_codex_settings_path(dbe: DBE, config: ExternalAgentConfig) -> Path | None:
    if config.toolType != ExternalAgentToolType.codex:
        return None
    root = resolve_settings_root(dbe) / "codex" / str(config.id)
    return root / _CODEX_CONFIG_NAME


def resolve_opencode_settings_path(
    dbe: DBE, config: ExternalAgentConfig
) -> Path | None:
    if config.toolType != ExternalAgentToolType.opencode:
        return None
    root = resolve_settings_root(dbe) / "opencode" / str(config.id)
    return root / _OPENCODE_CONFIG_NAME


def build_settings_paths(
    dbe: DBE, config: ExternalAgentConfig, project_root: Path | None = None
) -> ExternalAgentSettingsPaths:
    return ExternalAgentSettingsPaths(
        claude_settings=resolve_claude_settings_path(config, project_root),
        codex_config=resolve_codex_settings_path(dbe, config),
        opencode_config=resolve_opencode_settings_path(dbe, config),
    )


def resolve_claude_setting_sources(config: ExternalAgentConfig) -> list[str] | None:
    sources = config.settingsSources or []
    if sources:
        return [source.value for source in sources]
    if config.toolType != ExternalAgentToolType.claude_code:
        return None
    return ["project", "local"]


def write_claude_settings_file(
    config: ExternalAgentConfig,
    *,
    project_root: Path | None = None,
) -> Path | None:
    path = resolve_claude_settings_path(config, project_root)
    if path is None:
        return None
    if path.exists() and not config.settingsAllowSettaEdits:
        return path
    payload: dict[str, Any] = {}
    if path.exists():
        payload = _load_json(path)
    managed_payload = _build_claude_managed_payload(config)
    if managed_payload:
        managed_block = managed_payload.get("setta")
        if managed_block is not None:
            payload["setta"] = managed_block
    if not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def build_codex_settings_file(
    dbe: DBE,
    config: ExternalAgentConfig,
    *,
    allowlist: ExternalToolAllowlist | None,
    mcp_url: str,
    auth_headers: dict[str, str] | None,
) -> Path:
    settings_path = resolve_codex_settings_path(dbe, config)
    if settings_path is None:
        raise ValueError("Codex settings path unavailable for non-codex config")
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    base_path = _resolve_settings_base_path(config, settings_path)
    payload: dict[str, Any] = {}
    if base_path is not None and base_path.exists():
        payload = _load_toml(base_path)
    _set_codex_mcp_server(payload, mcp_url, auth_headers)
    if _allow_managed_settings_update(config, base_path):
        _apply_codex_managed_settings(payload, config, allowlist)
    settings_path.write_text(_dump_toml(payload), encoding="utf-8")
    return settings_path.parent


def build_opencode_settings_file(
    dbe: DBE,
    config: ExternalAgentConfig,
    *,
    allowlist: ExternalToolAllowlist | None,
    mcp_url: str,
    auth_headers: dict[str, str] | None,
) -> Path:
    settings_path = resolve_opencode_settings_path(dbe, config)
    if settings_path is None:
        raise ValueError("OpenCode settings path unavailable for non-opencode config")
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    base_path = _resolve_settings_base_path(config, settings_path)
    payload: dict[str, Any] = {}
    if base_path is not None and base_path.exists():
        payload = _load_json(base_path)
    _set_opencode_mcp_server(payload, mcp_url, auth_headers)
    if _allow_managed_settings_update(config, base_path):
        _apply_opencode_managed_settings(payload, config, allowlist)
    settings_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return settings_path


def _resolve_settings_base_path(
    config: ExternalAgentConfig, output_path: Path
) -> Path | None:
    if (
        config.settingsMode == ExternalAgentSettingsMode.explicit_path
        and config.settingsFilePath
    ):
        return Path(config.settingsFilePath)
    if output_path.exists():
        return output_path
    return None


def _allow_managed_settings_update(
    config: ExternalAgentConfig, base_path: Path | None
) -> bool:
    if config.settingsMode == ExternalAgentSettingsMode.read_only:
        return False
    if config.settingsMode == ExternalAgentSettingsMode.explicit_path:
        return config.settingsAllowSettaEdits
    if (
        base_path is not None
        and base_path.exists()
        and not config.settingsAllowSettaEdits
    ):
        return False
    return True


def _build_claude_managed_payload(config: ExternalAgentConfig) -> dict[str, Any]:
    block: ClaudeSettingsManaged | None = None
    if config.settingsManagedBlock is not None:
        block = config.settingsManagedBlock.claude
    if block is None:
        return {}
    setta_payload: dict[str, Any] = {}
    if block.permissions is not None:
        permissions_payload = {
            "allow": list(block.permissions.allow),
            "ask": list(block.permissions.ask),
            "deny": list(block.permissions.deny),
        }
        if block.defaultMode:
            permissions_payload["defaultMode"] = block.defaultMode
        setta_payload["permissions"] = permissions_payload
    if block.mcp is not None:
        setta_payload["mcp"] = block.mcp
    if not setta_payload:
        return {}
    return {"setta": setta_payload}


def _apply_codex_managed_settings(
    payload: dict[str, Any],
    config: ExternalAgentConfig,
    allowlist: ExternalToolAllowlist | None,
) -> None:
    block = None
    if config.settingsManagedBlock is not None:
        block = config.settingsManagedBlock.codex
    model = block.model if block and block.model is not None else config.defaultModel
    approval_policy = (
        block.approvalPolicy
        if block and block.approvalPolicy is not None
        else config.approvalPolicy
    )
    sandbox_mode = (
        block.sandboxMode
        if block and block.sandboxMode is not None
        else config.sandboxPolicy
    )
    enabled_tools: list[str] | None = None
    if allowlist is not None and not allowlist.allow_all:
        enabled_tools = list(allowlist.tool_names)
    elif block and block.enabledTools is not None:
        enabled_tools = list(block.enabledTools)

    if model is not None:
        payload["model"] = model
    if approval_policy is not None:
        payload["approval_policy"] = approval_policy
    if sandbox_mode is not None:
        payload["sandbox_mode"] = sandbox_mode
    if enabled_tools is not None:
        payload["enabled_tools"] = enabled_tools


def _apply_opencode_managed_settings(
    payload: dict[str, Any],
    config: ExternalAgentConfig,
    allowlist: ExternalToolAllowlist | None,
) -> None:
    block = None
    if config.settingsManagedBlock is not None:
        block = config.settingsManagedBlock.opencode
    model = block.model if block and block.model is not None else config.defaultModel
    permission = _parse_opencode_permissions(config.approvalPolicy)
    if block and block.permission is not None:
        permission = block.permission
    permission = _merge_opencode_permissions(permission, allowlist)
    if permission is not None:
        payload["permission"] = permission
    if model is not None:
        payload["model"] = model
    if block and block.mcp is not None:
        mcp_entries = payload.get("mcp")
        if not isinstance(mcp_entries, dict):
            mcp_entries = {}
        mcp_entries.update(block.mcp)
        payload["mcp"] = mcp_entries


def _set_codex_mcp_server(
    payload: dict[str, Any],
    mcp_url: str,
    auth_headers: dict[str, str] | None,
) -> None:
    mcp_servers = payload.get("mcp_servers")
    if not isinstance(mcp_servers, dict):
        mcp_servers = {}
    server_entry: dict[str, Any] = {"url": mcp_url}
    if auth_headers:
        cookie_value = auth_headers.get("Cookie")
        if cookie_value:
            server_entry["headers"] = {"Cookie": cookie_value}
    mcp_servers[SETTA_MCP_SERVER_ID] = server_entry
    payload["mcp_servers"] = mcp_servers


def _set_opencode_mcp_server(
    payload: dict[str, Any],
    mcp_url: str,
    auth_headers: dict[str, str] | None,
) -> None:
    mcp = payload.get("mcp")
    if not isinstance(mcp, dict):
        mcp = {}
    server_entry: dict[str, Any] = {
        "type": "remote",
        "url": mcp_url,
        "enabled": True,
    }
    if auth_headers:
        server_entry["headers"] = auth_headers
    mcp[SETTA_MCP_SERVER_ID] = server_entry
    payload["mcp"] = mcp


def _load_json(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    if not raw.strip():
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError(f"Settings file must contain a JSON object: {path}")
    return payload


def _load_toml(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    if not raw.strip():
        return {}
    payload = tomllib.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError(f"Settings file must contain a TOML table: {path}")
    return payload


def _dump_toml(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    _emit_toml_table(lines, [], payload)
    if not lines:
        return ""
    return "\n".join(lines).rstrip() + "\n"


def _emit_toml_table(lines: list[str], path: list[str], table: dict[str, Any]) -> None:
    scalar_items: dict[str, Any] = {}
    nested_tables: dict[str, dict[str, Any]] = {}
    for key, value in table.items():
        if isinstance(value, dict):
            nested_tables[str(key)] = value
        else:
            scalar_items[str(key)] = value
    if path:
        lines.append(f"[{'.'.join(path)}]")
    for key in sorted(scalar_items.keys()):
        value = scalar_items[key]
        if value is None:
            continue
        lines.append(f"{key} = {_dump_toml_value(value)}")
    for key in sorted(nested_tables.keys()):
        if lines and lines[-1] != "":
            lines.append("")
        _emit_toml_table(lines, path + [key], nested_tables[key])


def _dump_toml_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        items = ", ".join(_dump_toml_value(item) for item in value)
        return f"[{items}]"
    if isinstance(value, dict):
        return _dump_inline_toml_table(value)
    return json.dumps(str(value))


def _dump_inline_toml_table(value: dict[str, Any]) -> str:
    items = ", ".join(
        f"{key} = {_dump_toml_value(item)}" for key, item in value.items()
    )
    return f"{{ {items} }}"


def _resolve_project_settings_root(project_root: Path | None) -> Path:
    return (project_root or CWD) / _CLAUDE_SETTINGS_DIR


def _parse_opencode_permissions(value: str | None) -> Any | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if normalized.startswith("{") or normalized.startswith("["):
        parsed = json.loads(normalized)
        if isinstance(parsed, dict | list):
            return parsed
        return normalized
    return normalized


def _merge_opencode_permissions(
    permission: Any | None,
    allowlist: ExternalToolAllowlist | None,
) -> Any | None:
    if allowlist is None or allowlist.allow_all:
        return permission
    default_policy: str | None = None
    if permission is None:
        permission = {}
    elif isinstance(permission, str):
        default_policy = permission
        permission = {}
    if not isinstance(permission, dict):
        raise ValueError(
            "OpenCode permission must be a JSON object when toolAllowlist is set"
        )
    merged = dict(permission)
    merged[f"{SETTA_MCP_SERVER_ID}_*"] = "deny"
    for tool_name in allowlist.tool_names:
        merged.setdefault(
            f"{SETTA_MCP_SERVER_ID}_{tool_name}",
            default_policy or "allow",
        )
    return merged

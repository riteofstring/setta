import json
import os
import tomllib
from copy import deepcopy
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
from setta.utils.paths import get_setta_paths

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
        payload.update(managed_payload)
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
    agentic_headers: dict[str, str] | None = None,
    system_prompt: str | None,
    project_root: Path | None = None,
    output_dir: Path | None = None,
) -> Path:
    settings_path = resolve_codex_settings_path(dbe, config)
    if settings_path is None:
        raise ValueError("Codex settings path unavailable for non-codex config")
    output_root = output_dir or settings_path.parent
    output_root.mkdir(parents=True, exist_ok=True)
    output_path = output_root / _CODEX_CONFIG_NAME

    base_path: Path | None = None
    if (
        config.settingsMode == ExternalAgentSettingsMode.explicit_path
        and config.settingsFilePath
    ):
        base_path = Path(config.settingsFilePath)
    elif output_dir is not None:
        # Runtime config should treat the shared config (or explicit path) as the base
        # to avoid accumulating previous dynamic mutations (developer_instructions, etc.).
        if settings_path.exists():
            base_path = settings_path
    else:
        base_path = _resolve_settings_base_path(config, settings_path)
    payload: dict[str, Any] = {}
    if base_path is not None and base_path.exists():
        payload = _load_toml(base_path)
    _bootstrap_codex_mcp_servers_from_user_config(payload, config)
    _set_codex_mcp_server(payload, mcp_url, auth_headers, agentic_headers)
    if _allow_managed_settings_update(config, base_path):
        _apply_codex_managed_settings(payload, config, allowlist)
        _apply_codex_auth_settings(payload, config)
        _apply_codex_reasoning_settings(payload)
    _apply_codex_system_prompt(payload, system_prompt)
    _apply_codex_trusted_project(payload, project_root)
    output_path.write_text(_dump_toml(payload), encoding="utf-8")
    return output_root


def build_opencode_settings_file(
    dbe: DBE,
    config: ExternalAgentConfig,
    *,
    allowlist: ExternalToolAllowlist | None,
    mcp_url: str,
    auth_headers: dict[str, str] | None,
    agentic_headers: dict[str, str] | None = None,
    output_path: Path | None = None,
) -> Path:
    settings_path = resolve_opencode_settings_path(dbe, config)
    if settings_path is None:
        raise ValueError("OpenCode settings path unavailable for non-opencode config")
    resolved_output_path = output_path or settings_path
    resolved_output_path.parent.mkdir(parents=True, exist_ok=True)

    base_path: Path | None = None
    if (
        config.settingsMode == ExternalAgentSettingsMode.explicit_path
        and config.settingsFilePath
    ):
        base_path = Path(config.settingsFilePath)
    elif output_path is not None:
        # Runtime config should treat the shared config (or explicit path) as the base
        # to avoid accumulating previous dynamic mutations.
        if settings_path.exists():
            base_path = settings_path
    else:
        base_path = _resolve_settings_base_path(config, settings_path)
    payload: dict[str, Any] = {}
    if base_path is not None and base_path.exists():
        payload = _load_json(base_path)
    _set_opencode_mcp_server(payload, mcp_url, auth_headers, agentic_headers)
    if _allow_managed_settings_update(config, base_path):
        _apply_opencode_managed_settings(payload, config, allowlist)
    resolved_output_path.write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8",
    )
    return resolved_output_path


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
    managed_payload: dict[str, Any] = {}
    if block.permissions is not None:
        permissions_payload = {
            "allow": list(block.permissions.allow),
            "ask": list(block.permissions.ask),
            "deny": list(block.permissions.deny),
        }
        if block.defaultMode:
            permissions_payload["defaultMode"] = block.defaultMode
        managed_payload["permissions"] = permissions_payload
    if block.mcp is not None:
        managed_payload["mcp"] = block.mcp
    if not managed_payload:
        return {}
    return managed_payload


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
        mcp_servers = payload.get("mcp_servers")
        if not isinstance(mcp_servers, dict):
            mcp_servers = {}
        server_entry = mcp_servers.get(SETTA_MCP_SERVER_ID)
        if not isinstance(server_entry, dict):
            server_entry = {}
        server_entry["enabled_tools"] = enabled_tools
        mcp_servers[SETTA_MCP_SERVER_ID] = server_entry
        payload["mcp_servers"] = mcp_servers


def _apply_codex_system_prompt(
    payload: dict[str, Any], system_prompt: str | None
) -> None:
    if system_prompt is None:
        return
    normalized = system_prompt.strip()
    if not normalized:
        return
    existing = payload.get("developer_instructions")
    if isinstance(existing, str) and existing.strip():
        payload["developer_instructions"] = f"{normalized}\n\n{existing.strip()}"
        return
    payload["developer_instructions"] = normalized


def _apply_codex_auth_settings(
    payload: dict[str, Any], config: ExternalAgentConfig
) -> None:
    if "OPENAI_API_KEY" not in config.envVarWhitelist:
        return
    forced = payload.get("forced_login_method")
    if not (isinstance(forced, str) and forced.strip()):
        payload["forced_login_method"] = "api"
    preferred = payload.get("preferred_auth_method")
    if not (isinstance(preferred, str) and preferred.strip()):
        payload["preferred_auth_method"] = "apikey"
    credentials_store = payload.get("cli_auth_credentials_store")
    if not (isinstance(credentials_store, str) and credentials_store.strip()):
        payload["cli_auth_credentials_store"] = "file"
    features = payload.get("features")
    if not isinstance(features, dict):
        features = {}
    if "remote_models" not in features:
        features["remote_models"] = False
    if "remote_compaction" not in features:
        features["remote_compaction"] = False
    if features:
        payload["features"] = features


def _apply_codex_reasoning_settings(payload: dict[str, Any]) -> None:
    summary = payload.get("model_reasoning_summary")
    if isinstance(summary, str) and summary.strip():
        return
    payload["model_reasoning_summary"] = "none"


def _apply_codex_trusted_project(
    payload: dict[str, Any], project_root: Path | None
) -> None:
    if project_root is None:
        return
    projects = payload.get("projects")
    if not isinstance(projects, dict):
        projects = {}
    projects = _normalize_codex_project_keys(projects)
    project_key = _quote_codex_project_key(str(project_root))
    entry = projects.get(project_key)
    if not isinstance(entry, dict):
        entry = {}
    entry["trust_level"] = "trusted"
    projects[project_key] = entry
    payload["projects"] = projects


def _normalize_codex_project_keys(
    projects: dict[str, Any],
) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in projects.items():
        key_str = str(key)
        normalized[_quote_codex_project_key(key_str)] = value
    return normalized


def _quote_codex_project_key(key: str) -> str:
    stripped = key.strip()
    if stripped.startswith('"') and stripped.endswith('"'):
        return stripped
    if "/" in stripped or "\\" in stripped:
        return f'"{stripped}"'
    return stripped


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
    _force_opencode_openai_text_verbosity(payload, "gpt-5.2-chat-latest", "medium")


def _force_opencode_openai_text_verbosity(
    payload: dict[str, Any], model_id: str, verbosity: str
) -> None:
    provider = payload.get("provider")
    if not isinstance(provider, dict):
        provider = {}
    openai = provider.get("openai")
    if not isinstance(openai, dict):
        openai = {}
    models = openai.get("models")
    if not isinstance(models, dict):
        models = {}
    model_entry = models.get(model_id)
    if not isinstance(model_entry, dict):
        model_entry = {}
    options = model_entry.get("options")
    if not isinstance(options, dict):
        options = {}
    options["textVerbosity"] = verbosity
    text_options = options.get("text")
    if isinstance(text_options, dict) and "verbosity" in text_options:
        text_options = dict(text_options)
        text_options.pop("verbosity", None)
        if text_options:
            options["text"] = text_options
        else:
            options.pop("text", None)
    model_entry["options"] = options
    models[model_id] = model_entry
    openai["models"] = models
    provider["openai"] = openai
    payload["provider"] = provider


def _set_codex_mcp_server(
    payload: dict[str, Any],
    mcp_url: str,
    auth_headers: dict[str, str] | None,
    agentic_headers: dict[str, str] | None,
) -> None:
    mcp_servers = payload.get("mcp_servers")
    if not isinstance(mcp_servers, dict):
        mcp_servers = {}
    server_entry = mcp_servers.get(SETTA_MCP_SERVER_ID)
    if not isinstance(server_entry, dict):
        server_entry = {}
    server_entry["url"] = mcp_url
    http_headers: dict[str, str] = {}
    existing_headers = server_entry.get("http_headers")
    if isinstance(existing_headers, dict):
        http_headers.update(
            {
                str(key): str(value)
                for key, value in existing_headers.items()
                if isinstance(key, str) and isinstance(value, str)
            }
        )
    if auth_headers:
        cookie_value = auth_headers.get("Cookie")
        if cookie_value:
            http_headers["Cookie"] = cookie_value
    if agentic_headers:
        http_headers.update(agentic_headers)
    if http_headers:
        server_entry["http_headers"] = http_headers
    mcp_servers[SETTA_MCP_SERVER_ID] = server_entry
    payload["mcp_servers"] = mcp_servers


def _bootstrap_codex_mcp_servers_from_user_config(
    payload: dict[str, Any],
    config: ExternalAgentConfig,
) -> None:
    if config.settingsMode == ExternalAgentSettingsMode.explicit_path:
        return
    existing_servers = _resolve_raw_codex_mcp_servers(payload)
    if _has_non_setta_mcp_server(existing_servers):
        payload["mcp_servers"] = existing_servers
        return
    imported_servers = _load_non_setta_codex_mcp_servers_from_user_config()
    if not imported_servers:
        payload["mcp_servers"] = existing_servers
        return
    for server_id, server_config in imported_servers.items():
        if server_id in existing_servers:
            continue
        existing_servers[server_id] = server_config
    payload["mcp_servers"] = existing_servers


def _resolve_raw_codex_mcp_servers(payload: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    snake_case = payload.get("mcp_servers")
    if isinstance(snake_case, dict):
        for server_id, raw_entry in snake_case.items():
            if not isinstance(server_id, str):
                continue
            if not isinstance(raw_entry, dict):
                continue
            merged[server_id] = deepcopy(raw_entry)
    camel_case = payload.get("mcpServers")
    if isinstance(camel_case, dict):
        for server_id, raw_entry in camel_case.items():
            if not isinstance(server_id, str):
                continue
            if not isinstance(raw_entry, dict):
                continue
            if server_id in merged:
                continue
            merged[server_id] = deepcopy(raw_entry)
    return merged


def _load_non_setta_codex_mcp_servers_from_user_config() -> dict[str, dict[str, Any]]:
    for config_path in _iter_codex_config_paths():
        if not config_path.is_file():
            continue
        try:
            raw_payload = config_path.read_text(encoding="utf-8")
        except OSError:
            continue
        if not raw_payload.strip():
            continue
        try:
            payload = tomllib.loads(raw_payload)
        except tomllib.TOMLDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        raw_servers = _resolve_raw_codex_mcp_servers(payload)
        if not raw_servers:
            continue
        parsed = _filter_non_setta_raw_mcp_servers(raw_servers)
        if parsed:
            return parsed
    return {}


def _iter_codex_config_paths() -> list[Path]:
    candidates: list[Path] = []
    codex_home = os.environ.get("CODEX_HOME")
    if isinstance(codex_home, str) and codex_home.strip():
        candidates.append(
            (Path(codex_home).expanduser() / "config.toml").resolve(strict=False)
        )
    candidates.append((Path.home() / ".codex" / "config.toml").resolve(strict=False))
    unique_candidates: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        unique_candidates.append(candidate)
    return unique_candidates


def _filter_non_setta_raw_mcp_servers(
    raw_servers: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    parsed: dict[str, dict[str, Any]] = {}
    for raw_server_id, raw_server_entry in raw_servers.items():
        if not isinstance(raw_server_id, str):
            continue
        server_id = raw_server_id.strip()
        if not server_id or server_id == SETTA_MCP_SERVER_ID or "__" in server_id:
            continue
        if not isinstance(raw_server_entry, dict):
            continue
        parsed[server_id] = deepcopy(raw_server_entry)
    return parsed


def _has_non_setta_mcp_server(mcp_servers: dict[str, Any]) -> bool:
    for server_id in mcp_servers.keys():
        if server_id != SETTA_MCP_SERVER_ID:
            return True
    return False


def _set_opencode_mcp_server(
    payload: dict[str, Any],
    mcp_url: str,
    auth_headers: dict[str, str] | None,
    agentic_headers: dict[str, str] | None,
) -> None:
    mcp = payload.get("mcp")
    if not isinstance(mcp, dict):
        mcp = {}
    server_entry: dict[str, Any] = {
        "type": "remote",
        "url": mcp_url,
        "enabled": True,
    }
    headers: dict[str, str] = {}
    existing_headers = None
    existing_entry = mcp.get(SETTA_MCP_SERVER_ID)
    if isinstance(existing_entry, dict):
        existing_headers = existing_entry.get("headers")
    if isinstance(existing_headers, dict):
        headers.update(
            {
                str(key): str(value)
                for key, value in existing_headers.items()
                if isinstance(key, str) and isinstance(value, str)
            }
        )
    if auth_headers:
        headers.update(auth_headers)
    if agentic_headers:
        headers.update(agentic_headers)
    if headers:
        server_entry["headers"] = headers
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
    return (project_root or get_setta_paths().workspace_root) / _CLAUDE_SETTINGS_DIR


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
        key = f"{SETTA_MCP_SERVER_ID}_{tool_name}"
        value = merged.pop(key, None) or default_policy or "allow"
        merged[key] = value
    return merged

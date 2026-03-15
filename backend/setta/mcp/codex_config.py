import logging
import os
import tomllib
from copy import deepcopy
from pathlib import Path
from typing import Any

from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.llm_config import MCPServerConfig

logger = logging.getLogger(__name__)

_SUPPORTED_TRANSPORTS = {"stdio", "sse", "streamable_http"}
_SUPPORTED_FIELDS = {
    "transport",
    "url",
    "command",
    "args",
    "env",
    "cwd",
    "encoding",
    "encoding_error_handler",
    "http_headers",
}
_SUPPORTED_ENCODING_ERROR_HANDLERS = {"strict", "ignore", "replace"}


def resolve_codex_home_config_path() -> Path | None:
    codex_home = os.environ.get("CODEX_HOME")
    if not isinstance(codex_home, str):
        return None
    normalized_home = codex_home.strip()
    if not normalized_home:
        return None
    return (Path(normalized_home).expanduser() / "config.toml").resolve(strict=False)


def resolve_default_codex_config_path() -> Path:
    return (Path.home() / ".codex" / "config.toml").resolve(strict=False)


def _resolve_raw_codex_mcp_servers_table(
    payload: dict[str, Any],
    *,
    field_name: str,
) -> dict[str, Any] | None:
    if field_name not in payload:
        return None
    raw_servers = payload[field_name]
    if not isinstance(raw_servers, dict):
        raise ValueError(f"'{field_name}' must be an object")
    return deepcopy(raw_servers)


def resolve_raw_codex_mcp_servers(payload: dict[str, Any]) -> dict[str, Any]:
    if "mcpServers" in payload:
        raise ValueError("'mcpServers' is not supported. Use 'mcp_servers'.")
    snake_case_servers = _resolve_raw_codex_mcp_servers_table(
        payload,
        field_name="mcp_servers",
    )
    if snake_case_servers is None:
        return {}
    return snake_case_servers


def load_codex_mcp_servers_from_config() -> dict[str, MCPServerConfig]:
    codex_home_env = os.environ.get("CODEX_HOME")
    if isinstance(codex_home_env, str):
        codex_home_config_path = resolve_codex_home_config_path()
        if codex_home_config_path is None:
            return {}
        loaded_from_codex_home = _load_codex_mcp_servers_from_path(
            codex_home_config_path,
            fail_closed=True,
        )
        if loaded_from_codex_home is None:
            return {}
        return loaded_from_codex_home
    parsed = _load_codex_mcp_servers_from_path(
        resolve_default_codex_config_path(),
        fail_closed=False,
    )
    if parsed:
        return parsed
    return {}


def _load_codex_mcp_servers_from_path(
    config_path: Path,
    *,
    fail_closed: bool,
) -> dict[str, MCPServerConfig] | None:
    if not config_path.is_file():
        return None
    try:
        raw_payload = config_path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning(
            "Failed to read Codex config at '%s': %s",
            config_path,
            exc,
        )
        return {} if fail_closed else None
    if not raw_payload.strip():
        return {} if fail_closed else None
    try:
        payload = tomllib.loads(raw_payload)
    except tomllib.TOMLDecodeError as exc:
        logger.warning(
            "Failed to parse Codex config at '%s': %s",
            config_path,
            exc,
        )
        return {} if fail_closed else None
    if not isinstance(payload, dict):
        logger.warning(
            "Skipping Codex config at '%s': root payload must be an object",
            config_path,
        )
        return {} if fail_closed else None
    try:
        raw_servers = resolve_raw_codex_mcp_servers(payload)
    except ValueError as exc:
        logger.warning(
            "Skipping Codex config at '%s': %s",
            config_path,
            exc,
        )
        return {} if fail_closed else None
    if not raw_servers:
        return {} if fail_closed else None
    parsed = parse_codex_mcp_servers(raw_servers)
    if parsed:
        return parsed
    return {} if fail_closed else None
def parse_codex_mcp_servers(raw_servers: dict[str, Any]) -> dict[str, MCPServerConfig]:
    parsed: dict[str, MCPServerConfig] = {}
    validated_entries: list[tuple[str, str, Any]] = []
    raw_server_labels_by_canonical_id: dict[str, list[str]] = {}

    for raw_server_id, raw_entry in raw_servers.items():
        server_label = _format_server_label(raw_server_id)
        try:
            server_id = _validate_codex_server_id(raw_server_id)
        except ValueError as exc:
            logger.warning(
                "Skipping Codex MCP server '%s': %s",
                server_label,
                exc,
            )
            continue
        validated_entries.append((server_label, server_id, raw_entry))
        labels_for_server_id = raw_server_labels_by_canonical_id.get(server_id)
        if labels_for_server_id is None:
            raw_server_labels_by_canonical_id[server_id] = [server_label]
            continue
        labels_for_server_id.append(server_label)

    collided_canonical_ids = {
        server_id: labels_for_server_id
        for server_id, labels_for_server_id in raw_server_labels_by_canonical_id.items()
        if len(labels_for_server_id) > 1
    }
    for server_id, labels_for_server_id in collided_canonical_ids.items():
        colliding_raw_keys = ", ".join(f"'{label}'" for label in labels_for_server_id)
        logger.warning(
            "Skipping Codex MCP server canonical id '%s': "
            "duplicate canonical server id from raw keys [%s]",
            server_id,
            colliding_raw_keys,
        )

    for server_label, server_id, raw_entry in validated_entries:
        if server_id in collided_canonical_ids:
            continue
        try:
            server_config = _parse_codex_mcp_server_entry(
                raw_entry, server_id=server_id
            )
        except ValueError as exc:
            logger.warning(
                "Skipping Codex MCP server '%s': %s",
                server_label,
                exc,
            )
            continue
        parsed[server_id] = server_config

    return parsed


def _parse_codex_mcp_server_entry(
    raw_entry: Any,
    *,
    server_id: str,
) -> MCPServerConfig:
    if not isinstance(raw_entry, dict):
        raise ValueError(f"server '{server_id}' entry must be an object")
    unknown_fields = sorted(set(raw_entry.keys()) - _SUPPORTED_FIELDS)
    if unknown_fields:
        raise ValueError(
            f"server '{server_id}' has unsupported fields: "
            + ", ".join(str(field) for field in unknown_fields)
        )

    transport = _parse_optional_nonempty_string_field(
        raw_entry,
        server_id=server_id,
        field_name="transport",
    )
    if transport is not None:
        transport = transport.lower()
    if transport is not None and transport not in _SUPPORTED_TRANSPORTS:
        raise ValueError(
            f"server '{server_id}' has unsupported transport '{transport}'"
        )

    command = _parse_optional_nonempty_string_field(
        raw_entry,
        server_id=server_id,
        field_name="command",
    )
    url = _parse_optional_nonempty_string_field(
        raw_entry,
        server_id=server_id,
        field_name="url",
    )
    if command and url:
        raise ValueError(f"server '{server_id}' cannot declare both command and url")

    http_headers = _parse_http_headers(raw_entry, server_id=server_id)

    resolved_transport = transport
    if not resolved_transport:
        if command:
            resolved_transport = "stdio"
        elif url:
            resolved_transport = "streamable_http"
        else:
            raise ValueError(f"server '{server_id}' must declare either command or url")

    if resolved_transport == "stdio":
        if url is not None:
            raise ValueError(f"server '{server_id}' stdio transport cannot declare url")
        if command is None:
            raise ValueError(f"server '{server_id}' stdio transport requires command")
        if http_headers is not None:
            raise ValueError(
                f"server '{server_id}' stdio transport cannot define http_headers"
            )
        return MCPServerConfig(
            transport="stdio",
            command=command,
            args=_parse_args(raw_entry, server_id=server_id),
            env=_parse_env(raw_entry, server_id=server_id),
            cwd=_parse_optional_nonempty_string_field(
                raw_entry,
                server_id=server_id,
                field_name="cwd",
            ),
            encoding=_parse_encoding(raw_entry, server_id=server_id),
            encoding_error_handler=_parse_encoding_error_handler(
                raw_entry,
                server_id=server_id,
            ),
        )

    if command is not None:
        raise ValueError(
            f"server '{server_id}' {resolved_transport} transport cannot declare command"
        )
    if url is None:
        raise ValueError(
            f"server '{server_id}' {resolved_transport} transport requires url"
        )
    return MCPServerConfig(
        transport=resolved_transport,
        url=url,
        http_headers=http_headers,
    )


def _parse_http_headers(
    raw_entry: dict[str, Any],
    *,
    server_id: str,
) -> dict[str, str] | None:
    return _parse_http_headers_payload(
        raw_entry.get("http_headers"),
        server_id=server_id,
        field_name="http_headers",
    )


def _parse_http_headers_payload(
    raw_http_headers: Any,
    *,
    server_id: str,
    field_name: str,
) -> dict[str, str] | None:
    if raw_http_headers is None:
        return None
    if not isinstance(raw_http_headers, dict):
        raise ValueError(f"server '{server_id}' {field_name} must be an object")
    normalized_headers: dict[str, str] = {}
    for header_name, header_value in raw_http_headers.items():
        if not isinstance(header_name, str) or not isinstance(header_value, str):
            raise ValueError(
                f"server '{server_id}' {field_name} values must be string key/value pairs"
            )
        normalized_name = header_name.strip()
        if not normalized_name:
            continue
        normalized_headers[normalized_name] = header_value
    if not normalized_headers:
        return None
    return normalized_headers


def _parse_args(raw_entry: dict[str, Any], *, server_id: str) -> list[str]:
    args: list[str] = []
    raw_args = raw_entry.get("args")
    if raw_args is None:
        return args
    if not isinstance(raw_args, list):
        raise ValueError(f"server '{server_id}' args must be an array of strings")
    for index, item in enumerate(raw_args):
        if not isinstance(item, str):
            raise ValueError(
                f"server '{server_id}' has invalid args[{index}] value (expected string)"
            )
        normalized_item = item.strip()
        if normalized_item:
            args.append(normalized_item)
    return args


def _parse_env(raw_entry: dict[str, Any], *, server_id: str) -> dict[str, str] | None:
    raw_env = raw_entry.get("env")
    if raw_env is None:
        return None
    if not isinstance(raw_env, dict):
        raise ValueError(
            f"server '{server_id}' env must be an object of string key/value pairs"
        )
    normalized_env: dict[str, str] = {}
    for raw_env_key, raw_env_value in raw_env.items():
        if not isinstance(raw_env_key, str):
            raise ValueError(
                f"server '{server_id}' has invalid env key {raw_env_key!r} "
                "(expected string)"
            )
        if not isinstance(raw_env_value, str):
            raise ValueError(
                f"server '{server_id}' has invalid env.{raw_env_key} value "
                "(expected string)"
            )
        normalized_key = raw_env_key.strip()
        if not normalized_key:
            raise ValueError(f"server '{server_id}' has an empty env key")
        normalized_env[normalized_key] = raw_env_value
    if not normalized_env:
        return None
    return normalized_env


def _parse_encoding(raw_entry: dict[str, Any], *, server_id: str) -> str:
    encoding = _parse_optional_nonempty_string_field(
        raw_entry,
        server_id=server_id,
        field_name="encoding",
    )
    if encoding is None:
        return "utf-8"
    return encoding


def _parse_encoding_error_handler(raw_entry: dict[str, Any], *, server_id: str) -> str:
    raw_value = raw_entry.get("encoding_error_handler")
    if raw_value is None:
        return "strict"
    if not isinstance(raw_value, str):
        raise ValueError(
            f"server '{server_id}' encoding_error_handler must be a string"
        )
    normalized_value = raw_value.strip().lower()
    if not normalized_value:
        raise ValueError(f"server '{server_id}' encoding_error_handler cannot be empty")
    if normalized_value not in _SUPPORTED_ENCODING_ERROR_HANDLERS:
        raise ValueError(
            f"server '{server_id}' has unsupported encoding_error_handler "
            f"'{normalized_value}'"
        )
    return normalized_value


def _parse_optional_nonempty_string_field(
    raw_entry: dict[str, Any],
    *,
    server_id: str,
    field_name: str,
) -> str | None:
    if field_name not in raw_entry:
        return None
    value = raw_entry[field_name]
    if not isinstance(value, str):
        raise ValueError(f"server '{server_id}' {field_name} must be a string")
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def _validate_codex_server_id(raw_server_id: Any) -> str:
    if not isinstance(raw_server_id, str):
        raise ValueError("server id must be a string")
    server_id = raw_server_id.strip()
    if not server_id:
        raise ValueError("server id is empty")
    if server_id == SETTA_MCP_SERVER_ID:
        raise ValueError("server id is reserved for setta")
    if "__" in server_id:
        raise ValueError("server id cannot contain '__'")
    return server_id


def _format_server_label(raw_server_id: Any) -> str:
    if isinstance(raw_server_id, str):
        return raw_server_id
    return repr(raw_server_id)

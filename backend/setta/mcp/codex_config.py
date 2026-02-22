import logging
import os
import tomllib
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
    "headers",
}
_SUPPORTED_ENCODING_ERROR_HANDLERS = {"strict", "ignore", "replace"}


def iter_codex_config_paths() -> list[Path]:
    candidates: list[Path] = []
    codex_home = os.environ.get("CODEX_HOME")
    if isinstance(codex_home, str) and codex_home.strip():
        candidates.append(
            (Path(codex_home).expanduser() / "config.toml").resolve(strict=False)
        )
    candidates.append((Path.home() / ".codex" / "config.toml").resolve(strict=False))
    unique_paths: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        unique_paths.append(candidate)
    return unique_paths


def resolve_raw_codex_mcp_servers(payload: dict[str, Any]) -> dict[str, Any]:
    raw_servers = payload.get("mcp_servers")
    if isinstance(raw_servers, dict):
        return raw_servers
    raw_servers = payload.get("mcpServers")
    if isinstance(raw_servers, dict):
        return raw_servers
    return {}


def load_codex_mcp_servers_from_config() -> dict[str, MCPServerConfig]:
    for config_path in iter_codex_config_paths():
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
        raw_servers = resolve_raw_codex_mcp_servers(payload)
        if not raw_servers:
            continue
        parsed = parse_codex_mcp_servers(raw_servers)
        if parsed:
            return parsed
    return {}


def load_codex_mcp_server_payloads_from_config() -> dict[str, dict[str, Any]]:
    parsed = load_codex_mcp_servers_from_config()
    return {
        server_id: _serialize_mcp_server_config_for_codex(server_config)
        for server_id, server_config in parsed.items()
    }


def parse_codex_mcp_servers(raw_servers: dict[str, Any]) -> dict[str, MCPServerConfig]:
    parsed: dict[str, MCPServerConfig] = {}
    for raw_server_id, raw_entry in raw_servers.items():
        if not isinstance(raw_server_id, str):
            continue
        server_id = raw_server_id.strip()
        if not server_id or server_id == SETTA_MCP_SERVER_ID or "__" in server_id:
            continue
        try:
            server_config = _parse_codex_mcp_server_entry(
                raw_entry, server_id=server_id
            )
        except ValueError as exc:
            logger.warning(
                "Skipping Codex MCP server '%s': %s",
                server_id,
                exc,
            )
            continue
        if server_config is None:
            continue
        parsed[server_id] = server_config
    return parsed


def _parse_codex_mcp_server_entry(
    raw_entry: Any,
    *,
    server_id: str,
) -> MCPServerConfig | None:
    if not isinstance(raw_entry, dict):
        return None
    unknown_fields = sorted(set(raw_entry.keys()) - _SUPPORTED_FIELDS)
    if unknown_fields:
        raise ValueError(
            f"server '{server_id}' has unsupported fields: "
            + ", ".join(str(field) for field in unknown_fields)
        )

    raw_transport = raw_entry.get("transport")
    transport = ""
    if isinstance(raw_transport, str):
        transport = raw_transport.strip().lower()
    if transport and transport not in _SUPPORTED_TRANSPORTS:
        raise ValueError(
            f"server '{server_id}' has unsupported transport '{transport}'"
        )

    command = _normalize_nonempty_string(raw_entry.get("command"))
    url = _normalize_nonempty_string(raw_entry.get("url"))
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
            return None

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
            args=_parse_args(raw_entry),
            env=_parse_env(raw_entry),
            cwd=_normalize_nonempty_string(raw_entry.get("cwd")),
            encoding=_parse_encoding(raw_entry),
            encoding_error_handler=_parse_encoding_error_handler(raw_entry),
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
    raw_http_headers = raw_entry.get("http_headers")
    if raw_http_headers is None:
        raw_http_headers = raw_entry.get("headers")
    if raw_http_headers is None:
        return None
    if not isinstance(raw_http_headers, dict):
        raise ValueError(f"server '{server_id}' http_headers must be an object")
    normalized_headers: dict[str, str] = {}
    for header_name, header_value in raw_http_headers.items():
        if not isinstance(header_name, str) or not isinstance(header_value, str):
            raise ValueError(
                f"server '{server_id}' http_headers values must be string key/value pairs"
            )
        normalized_name = header_name.strip()
        if not normalized_name:
            continue
        normalized_headers[normalized_name] = header_value
    if not normalized_headers:
        return None
    return normalized_headers


def _parse_args(raw_entry: dict[str, Any]) -> list[str]:
    args: list[str] = []
    raw_args = raw_entry.get("args")
    if isinstance(raw_args, list):
        for item in raw_args:
            if not isinstance(item, str):
                continue
            normalized_item = item.strip()
            if normalized_item:
                args.append(normalized_item)
    return args


def _parse_env(raw_entry: dict[str, Any]) -> dict[str, str] | None:
    raw_env = raw_entry.get("env")
    if not isinstance(raw_env, dict):
        return None
    normalized_env = {
        key: value
        for key, value in raw_env.items()
        if isinstance(key, str) and isinstance(value, str)
    }
    if not normalized_env:
        return None
    return normalized_env


def _parse_encoding(raw_entry: dict[str, Any]) -> str:
    encoding = _normalize_nonempty_string(raw_entry.get("encoding"))
    if encoding is None:
        return "utf-8"
    return encoding


def _parse_encoding_error_handler(raw_entry: dict[str, Any]) -> str:
    raw_value = raw_entry.get("encoding_error_handler")
    if isinstance(raw_value, str) and raw_value in _SUPPORTED_ENCODING_ERROR_HANDLERS:
        return raw_value
    return "strict"


def _normalize_nonempty_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def _serialize_mcp_server_config_for_codex(
    server_config: MCPServerConfig,
) -> dict[str, Any]:
    return server_config.model_dump(exclude_none=True, exclude_defaults=True)

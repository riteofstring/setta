"""Helpers for persisting the LLM configuration file."""

import json
import logging
import os
import tomllib
from pathlib import Path
from typing import Any, Iterable

from setta.database.db_objs import DBE
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.chat import ChatMetadata
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.utils import constants
from setta.utils.generate_memorable_string import generate_memorable_available_string
from setta.utils.network import format_host_for_url

logger = logging.getLogger(__name__)


def load_llm_config(dbe: DBE, *, allow_write: bool = True) -> AllLLMConfigs:
    raw = dbe.read_llm_config()
    seeded_from_example: AllLLMConfigs | None = None
    if not raw or raw == {"configs": {}, "default_config_id": None}:
        example = dbe.read_llm_config_example()
        if example:
            config = AllLLMConfigs.model_validate(example)
            config = _ensure_setta_mcp_server_url(config)
            if allow_write:
                save_llm_config(config, dbe)
            seeded_from_example = config
    if raw:
        config = AllLLMConfigs.model_validate(raw)
    elif seeded_from_example is not None:
        config = seeded_from_example
    else:
        config = _build_default_llm_config()
        config = _ensure_setta_mcp_server_url(config)
        if allow_write:
            save_llm_config(config, dbe)

    config = _ensure_setta_mcp_server_url(config)
    return _bootstrap_codex_mcp_servers_if_needed(
        config,
        dbe,
        allow_write=allow_write,
    )


def save_llm_config(
    config: AllLLMConfigs,
    dbe: DBE,
    *,
    is_example: bool = False,
) -> None:
    """Persist the LLM configuration, writing canonical JSON."""
    sanitized = _strip_temporary_configs(config)
    payload = sanitized.model_dump(exclude_unset=True)
    configs = payload.get("configs")
    if isinstance(configs, dict):
        for entry in configs.values():
            if isinstance(entry, dict) and "id" in entry:
                entry.pop("id")
    if is_example:
        dbe.write_llm_config_example(payload)
    else:
        dbe.write_llm_config(payload)


def _strip_temporary_configs(config: AllLLMConfigs) -> AllLLMConfigs:
    persisted: dict[str, Any] = {}
    for config_id, entry in config.configs.items():
        if entry.temporary:
            continue
        persisted[config_id] = entry
    default_config_id = config.default_config_id
    if default_config_id and default_config_id not in persisted:
        default_config_id = None
    return AllLLMConfigs(
        configs=persisted,
        mcpServers=config.mcpServers,
        defaultMcpServerIds=config.defaultMcpServerIds,
        default_config_id=default_config_id,
    )


def _build_default_llm_config() -> AllLLMConfigs:
    return AllLLMConfigs(
        mcpServers={
            SETTA_MCP_SERVER_ID: MCPServerConfig(
                transport="sse",
                url=f"{constants.C.BACKEND}/mcp",
            )
        },
    )


def _ensure_setta_mcp_server_url(config: AllLLMConfigs) -> AllLLMConfigs:
    server = config.mcpServers.get(SETTA_MCP_SERVER_ID)
    if server is None:
        return config
    if server.transport not in {"sse", "streamable_http"}:
        return config
    host = format_host_for_url(constants.C.HOST)
    desired_url = f"http://{host}:{constants.C.PORT}/mcp"
    if server.url == desired_url:
        return config
    config.mcpServers[SETTA_MCP_SERVER_ID] = server.model_copy(
        update={"url": desired_url}
    )
    return config


def _bootstrap_codex_mcp_servers_if_needed(
    config: AllLLMConfigs,
    dbe: DBE,
    *,
    allow_write: bool,
) -> AllLLMConfigs:
    if _has_non_setta_mcp_servers(config):
        return config
    imported_servers = _load_codex_mcp_servers_from_config()
    if not imported_servers:
        return config
    merged_servers = dict(config.mcpServers)
    added = 0
    for server_id, server_config in imported_servers.items():
        if server_id in merged_servers:
            continue
        merged_servers[server_id] = server_config
        added += 1
    if added == 0:
        return config
    updated = config.model_copy(update={"mcpServers": merged_servers})
    if allow_write:
        save_llm_config(updated, dbe)
    return updated


def _has_non_setta_mcp_servers(config: AllLLMConfigs) -> bool:
    for server_id in config.mcpServers.keys():
        if server_id != SETTA_MCP_SERVER_ID:
            return True
    return False


def _load_codex_mcp_servers_from_config() -> dict[str, MCPServerConfig]:
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
        raw_servers = payload.get("mcp_servers")
        if not isinstance(raw_servers, dict):
            raw_servers = payload.get("mcpServers")
        if not isinstance(raw_servers, dict):
            continue
        parsed = _parse_codex_mcp_servers(raw_servers)
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
    unique_paths: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        unique_paths.append(candidate)
    return unique_paths


def _parse_codex_mcp_servers(
    raw_servers: dict[str, Any],
) -> dict[str, MCPServerConfig]:
    parsed: dict[str, MCPServerConfig] = {}
    for raw_server_id, raw_entry in raw_servers.items():
        if not isinstance(raw_server_id, str):
            continue
        server_id = raw_server_id.strip()
        if not server_id or server_id == SETTA_MCP_SERVER_ID or "__" in server_id:
            continue
        try:
            server_config = _parse_codex_mcp_server_entry(
                raw_entry,
                server_id=server_id,
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
    supported_fields = {
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
    unknown_fields = sorted(set(raw_entry.keys()) - supported_fields)
    if unknown_fields:
        raise ValueError(
            f"server '{server_id}' has unsupported fields: "
            + ", ".join(str(field) for field in unknown_fields)
        )

    raw_transport = raw_entry.get("transport")
    transport = ""
    if isinstance(raw_transport, str):
        transport = raw_transport.strip().lower()
    if transport and transport not in {"stdio", "sse", "streamable_http"}:
        raise ValueError(f"server '{server_id}' has unsupported transport '{transport}'")

    raw_command = raw_entry.get("command")
    command: str | None = None
    if isinstance(raw_command, str):
        normalized_command = raw_command.strip()
        if normalized_command:
            command = normalized_command

    raw_url = raw_entry.get("url")
    url: str | None = None
    if isinstance(raw_url, str):
        normalized_url = raw_url.strip()
        if normalized_url:
            url = normalized_url

    if command is not None and url is not None:
        raise ValueError(f"server '{server_id}' cannot declare both command and url")

    http_headers: dict[str, str] | None = None
    raw_http_headers = raw_entry.get("http_headers")
    if raw_http_headers is None:
        raw_http_headers = raw_entry.get("headers")
    if raw_http_headers is not None:
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
        if normalized_headers:
            http_headers = normalized_headers

    if command is not None:
        if http_headers is not None:
            raise ValueError(
                f"server '{server_id}' stdio transport cannot define http_headers"
            )
        args: list[str] = []
        raw_args = raw_entry.get("args")
        if isinstance(raw_args, list):
            for item in raw_args:
                if not isinstance(item, str):
                    continue
                normalized_item = item.strip()
                if normalized_item:
                    args.append(normalized_item)
        env: dict[str, str] | None = None
        raw_env = raw_entry.get("env")
        if isinstance(raw_env, dict):
            normalized_env = {
                key: value
                for key, value in raw_env.items()
                if isinstance(key, str) and isinstance(value, str)
            }
            if normalized_env:
                env = normalized_env
        cwd: str | None = None
        raw_cwd = raw_entry.get("cwd")
        if isinstance(raw_cwd, str):
            normalized_cwd = raw_cwd.strip()
            if normalized_cwd:
                cwd = normalized_cwd
        encoding = "utf-8"
        raw_encoding = raw_entry.get("encoding")
        if isinstance(raw_encoding, str):
            normalized_encoding = raw_encoding.strip()
            if normalized_encoding:
                encoding = normalized_encoding
        encoding_error_handler = "strict"
        raw_encoding_error_handler = raw_entry.get("encoding_error_handler")
        if isinstance(
            raw_encoding_error_handler, str
        ) and raw_encoding_error_handler in {"strict", "ignore", "replace"}:
            encoding_error_handler = raw_encoding_error_handler
        try:
            return MCPServerConfig(
                transport="stdio",
                command=command,
                args=args,
                env=env,
                cwd=cwd,
                encoding=encoding,
                encoding_error_handler=encoding_error_handler,
            )
        except ValueError:
            return None

    if url is not None:
        resolved_transport = "streamable_http"
        if transport in {"sse", "streamable_http"}:
            resolved_transport = transport
        try:
            return MCPServerConfig(
                transport=resolved_transport,
                url=url,
                http_headers=http_headers,
            )
        except ValueError:
            return None

    return None


def merge_chat_llm_configs(
    config: AllLLMConfigs,
    chat_metadata: Iterable[ChatMetadata],
) -> AllLLMConfigs:
    configs = dict(config.configs)
    seen_signatures: dict[str, str] = {
        _build_config_signature(entry): config_id
        for config_id, entry in configs.items()
    }
    for chat in chat_metadata:
        curr_config = chat.llmConfig
        signature = _build_config_signature(curr_config)
        if signature in seen_signatures:
            continue
        curr_config_id = curr_config.id
        if not curr_config_id or curr_config_id in configs:
            curr_config_id = generate_memorable_available_string(configs.keys())
        configs[curr_config_id] = curr_config.model_copy(
            update={"id": curr_config_id, "temporary": True}
        )
        seen_signatures[signature] = curr_config_id
    return AllLLMConfigs(
        configs=configs,
        mcpServers=config.mcpServers,
        defaultMcpServerIds=config.defaultMcpServerIds,
        default_config_id=config.default_config_id,
    )


def _build_config_signature(config: LLMConfig) -> str:
    """Create a stable fingerprint so we can deduplicate equivalent configs."""
    payload = config.model_dump(
        exclude={"id", "temporary"},
    )
    return json.dumps(
        payload,
        sort_keys=True,
        default=str,
        separators=(",", ":"),
    )

"""Helpers for persisting the LLM configuration file."""

import json
from typing import Any, Iterable

from setta.database.db_objs import DBE
from setta.mcp.codex_config import (
    load_codex_mcp_servers_from_config as load_codex_mcp_servers_from_user_config,
)
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.chat import ChatMetadata
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.utils import constants
from setta.utils.generate_memorable_string import generate_memorable_available_string
from setta.utils.network import format_host_for_url


def load_llm_config(dbe: DBE, *, allow_write: bool = True) -> AllLLMConfigs:
    raw = dbe.read_llm_config()
    raw_is_empty_payload = not raw or raw == {"configs": {}, "default_config_id": None}
    seeded_from_example: AllLLMConfigs | None = None
    if raw_is_empty_payload:
        example = dbe.read_llm_config_example()
        if example:
            config = AllLLMConfigs.model_validate(example)
            config = _ensure_setta_mcp_server_url(config)
            if allow_write:
                save_llm_config(config, dbe)
            seeded_from_example = config
    if seeded_from_example is not None:
        config = seeded_from_example
    elif raw:
        config = AllLLMConfigs.model_validate(raw)
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
    return load_codex_mcp_servers_from_user_config()


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

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCRIPTABLE_LLM_CONFIG_ID = "scriptable"


class MCPServerConfig(BaseModel):
    transport: Literal["sse", "streamable_http", "stdio"]
    url: str | None = None
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] | None = None
    cwd: str | None = None
    encoding: str = "utf-8"
    encoding_error_handler: Literal["strict", "ignore", "replace"] = "strict"

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_transport(self) -> "MCPServerConfig":
        normalized_url = self.url.strip() if isinstance(self.url, str) else ""
        normalized_command = (
            self.command.strip() if isinstance(self.command, str) else ""
        )
        if self.transport in {"sse", "streamable_http"}:
            if not normalized_url:
                raise ValueError(
                    f"MCP server transport '{self.transport}' requires a url"
                )
            if normalized_command:
                raise ValueError(
                    f"MCP server transport '{self.transport}' cannot declare command"
                )
        if self.transport == "stdio":
            if not normalized_command:
                raise ValueError("MCP stdio transport requires a command")
            if normalized_url:
                raise ValueError("MCP stdio transport cannot declare a url")
        return self


class LLMConfig(BaseModel):
    """Configuration for a single provider/model combination."""

    id: str
    model: str
    provider: str | None = None
    base_url: str | None = None
    api_key_env: str | None = None
    other_params: dict[str, Any] | None = None
    mcpServerIds: list[str] | None = None
    temporary: bool = False

    model_config = ConfigDict(extra="forbid")


def build_scriptable_llm_config() -> "LLMConfig":
    return LLMConfig(
        id=SCRIPTABLE_LLM_CONFIG_ID,
        model=SCRIPTABLE_LLM_CONFIG_ID,
        mcpServerIds=[],
        temporary=True,
    )


class AllLLMConfigs(BaseModel):
    """Top-level structure persisted in ``setta_files/llm_config.json``."""

    configs: dict[str, LLMConfig] = Field(default_factory=dict)
    mcpServers: dict[str, MCPServerConfig] = Field(default_factory=dict)
    defaultMcpServerIds: list[str] = Field(default_factory=list)
    default_config_id: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _derive_config_ids(cls, payload: Any) -> Any:
        if not isinstance(payload, dict):
            return payload
        raw_configs = payload.get("configs")
        if not isinstance(raw_configs, dict):
            return payload
        normalized_payload = dict(payload)
        normalized_payload["configs"] = {
            config_id: cls._normalize_config_entry(config_id, config)
            for config_id, config in raw_configs.items()
        }
        return normalized_payload

    @staticmethod
    def _normalize_config_entry(config_id: str, entry: Any) -> Any:
        if not isinstance(entry, dict):
            return entry
        if "id" in entry:
            raise ValueError(
                f"LLM config '{config_id}' cannot declare an id; use the key instead"
            )
        return {**entry, "id": config_id}

    @model_validator(mode="after")
    def _validate_configs(self) -> "AllLLMConfigs":
        normalized: dict[str, LLMConfig] = {}
        for config_id, config in self.configs.items():
            if config.id and config.id != config_id:
                raise ValueError(
                    f"LLM config '{config_id}' declared mismatched id '{config.id}'"
                )
            normalized[config_id] = config.model_copy(update={"id": config_id})
        self.configs = normalized
        if self.default_config_id and self.default_config_id not in normalized:
            self.default_config_id = None
        for server_id in self.mcpServers.keys():
            if "__" in server_id:
                raise ValueError(
                    f"MCP server id '{server_id}' cannot include '__' separators"
                )
        self._validate_mcp_server_ids(self.defaultMcpServerIds, "defaultMcpServerIds")
        for config in self.configs.values():
            if config.mcpServerIds is None:
                continue
            self._validate_mcp_server_ids(
                config.mcpServerIds,
                f"LLM config '{config.id}' mcpServerIds",
            )
        return self

    def resolve_mcp_server_ids(self, llm_config: LLMConfig) -> list[str]:
        server_ids = llm_config.mcpServerIds
        if server_ids is None:
            if self.defaultMcpServerIds:
                server_ids = self.defaultMcpServerIds
            else:
                server_ids = list(self.mcpServers.keys())
        self._validate_mcp_server_ids(server_ids, f"LLM config '{llm_config.id}'")
        return list(server_ids)

    def _validate_mcp_server_ids(self, server_ids: list[str], label: str) -> None:
        seen: set[str] = set()
        for server_id in server_ids:
            if server_id in seen:
                raise ValueError(f"{label} includes duplicate server id '{server_id}'")
            seen.add(server_id)
            if server_id not in self.mcpServers:
                raise KeyError(f"{label} references unknown MCP server '{server_id}'")

    def resolve_config(
        self,
        llm_config_id: str,
    ) -> LLMConfig:
        if not llm_config_id:
            raise ValueError("LLM config requires a provider id")
        config = self.configs.get(llm_config_id)
        if not config:
            raise ValueError(f"LLM config missing provider '{llm_config_id}'")
        return config

    def resolve_listener_config(
        self,
        llm_config_id: str,
    ) -> LLMConfig:
        if not llm_config_id:
            raise ValueError("Listener chat requires an LLM config id or 'scriptable'")
        if llm_config_id == SCRIPTABLE_LLM_CONFIG_ID:
            return build_scriptable_llm_config()
        return self.resolve_config(llm_config_id)

    def build_llm_params(
        self,
        llm_config: LLMConfig,
    ) -> tuple[dict[str, Any], str | None]:
        payload: dict[str, Any] = {"model": llm_config.model}
        if llm_config.provider:
            payload["custom_llm_provider"] = llm_config.provider
        if llm_config.base_url:
            payload["api_base"] = llm_config.base_url
        if llm_config.other_params:
            payload.update(llm_config.other_params)
        return payload, llm_config.api_key_env

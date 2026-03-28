"""Seed data for ``setta_files/llm_config.example.json``."""

from setta.database.db_objs import DBE
from setta.llm.config import save_llm_config
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig
from setta.utils.constants import C

DEFAULT_EXAMPLE_LLM_CONFIGS = AllLLMConfigs(
    configs={
        "claude-sonnet": LLMConfig(
            id="claude-sonnet",
            model="claude-sonnet-4-5-20250929",
            provider="anthropic",
            api_key_env="ANTHROPIC_API_KEY",
        ),
        "openai-whisper-1": LLMConfig(
            id="openai-whisper-1",
            model="whisper-1",
            provider="openai",
            api_key_env="OPENAI_API_KEY",
        ),
    },
    mcpServers={
        SETTA_MCP_SERVER_ID: MCPServerConfig(
            transport="sse",
            url=f"{C.BACKEND}/mcp",
        ),
    },
    default_config_id="claude-sonnet",
)


def seed_llm_config_example_file(
    dbe: DBE,
    config: AllLLMConfigs = DEFAULT_EXAMPLE_LLM_CONFIGS,
) -> None:
    """Create the example file if missing so users can copy configs by hand."""
    if dbe.llm_config_example.exists():
        return

    save_llm_config(config, dbe, is_example=True)

"""Seed data for ``setta_files/llm_config.example.json``."""

from setta.database.db_objs import DBE
from setta.llm.config import save_llm_config
from setta.types.llm_config import AllLLMConfigs, LLMConfig

DEFAULT_EXAMPLE_LLM_CONFIGS = AllLLMConfigs(
    configs={
        "claude-sonnet": LLMConfig(
            id="claude-sonnet",
            model="claude-3-5-sonnet-20240620",
            provider="anthropic",
            api_key_env="ANTHROPIC_API_KEY",
        ),
        "openai-compatible": LLMConfig(
            id="openai-compatible",
            model="gpt-4o-mini",
            provider="openai",
            api_key_env="OPENAI_API_KEY",
        ),
        "litellm-router": LLMConfig(
            id="litellm-router",
            model="claude-3-5-sonnet-20240620",
            provider="litellm",
            base_url="https://litellm-router.example.com",
            api_key_env="LITELLM_ROUTER_KEY",
            other_params={
                "timeout": 30,
                "metadata": {
                    "workspace": "setta",
                },
            },
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

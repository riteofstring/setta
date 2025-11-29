"""REST endpoints for managing the LiteLLM configuration file."""

from setta.llm.config import load_litellm_config, save_litellm_config
from setta.routers.dependencies import AppStateFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.llm_config import LiteLLMConfig
from setta.types.routes import Route

router = SettaAPIRouter()


@router.get(Route.LLM_CONFIG)
def route_get_llm_config(state: AppStateFromRequest) -> LiteLLMConfig:
    """Return the persisted LiteLLM configuration, initializing defaults if needed."""

    config = load_litellm_config()
    state.chat_manager.config = config
    return config


@router.put(Route.LLM_CONFIG)
def route_put_llm_config(
    config: LiteLLMConfig,
    state: AppStateFromRequest,
) -> LiteLLMConfig:
    """Validate and persist the LiteLLM configuration."""

    save_litellm_config(config)
    state.chat_manager.config = config
    return config

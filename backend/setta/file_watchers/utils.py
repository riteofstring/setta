from setta.utils.constants import C


def get_llm_api_keys_from_env_vars(env_vars: dict[str, str | None]):
    return {
        key: value
        for key, value in env_vars.items()
        if key in C.LLM_API_KEY_NAMES.values() and value
    }

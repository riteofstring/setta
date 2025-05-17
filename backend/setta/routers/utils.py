from io import StringIO

from dotenv import dotenv_values

from setta.utils.constants import C


def get_content_processor(file_watch_group_name):
    if file_watch_group_name == "genPythonCode":
        return content_processor_gen_python_code
    elif file_watch_group_name == "apiKeys":
        return content_processor_api_keys
    return None


def content_processor_gen_python_code(raw_content):
    return raw_content


def content_processor_api_keys(raw_content):
    env_vars = dotenv_values(stream=StringIO(raw_content))
    return get_llm_api_keys_from_env_vars(env_vars)


def get_llm_api_keys_from_env_vars(env_vars):
    return {
        key: value
        for key, value in env_vars.items()
        if key in C.LLM_API_KEY_NAMES.values()
    }

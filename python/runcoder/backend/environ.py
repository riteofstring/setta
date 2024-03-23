import os
import json

ENV_VAR_NAME = "RUNCODER_CLI_ARGS"

def set_cli_args(**kwargs):
    os.environ[ENV_VAR_NAME] = json.dumps(kwargs)

def get_cli_arg(key):
    return json.loads(os.environ[ENV_VAR_NAME])[key]
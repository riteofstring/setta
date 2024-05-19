import json
import os

ENV_VAR_NAME = "RUNCODER_CLI_ARGS"


def set_cli_args(**kwargs):
    os.environ[ENV_VAR_NAME] = json.dumps(kwargs)
    # os.environ["VITE_BACKEND_PORT"] = "DOGECOIN"


def get_cli_args():
    return json.loads(os.environ[ENV_VAR_NAME])

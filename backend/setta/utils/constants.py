import builtins
import json
from pathlib import Path

from .utils import get_absolute_path, is_dev_mode

CONSTANTS_FOLDER = (
    Path("../../../constants") if is_dev_mode() else Path("../static/constants")
)
SEED_FOLDER = Path("../../../seed") if is_dev_mode() else Path("../static/seed")
CODE_FOLDER = ".setta_code"
CODE_FOLDER_ENV_VARIABLE = "SETTA_CODE_FOLDER"
HOST_ENV_VARIABLE = "SETTA_HOST"
PORT_ENV_VARIABLE = "SETTA_PORT"
SEND_ARTIFACT_TO_ENV_VARIABLE = "SETTA_SEND_ARTIFACT_TO"
BUILT_INS = set(dir(builtins))


class Constants:
    @property
    def FRONTEND_ORIGINS(self):
        if is_dev_mode():
            output = [f"http://{self.HOST}:{self.DEV_MODE_FRONTEND_PORT}"]
        else:
            output = [self.BACKEND]
        if self.HOST == "127.0.0.1":
            output.append(output[0].replace("127.0.0.1", "localhost"))
        return output

    @property
    def BACKEND(self):
        return f"http://{self.HOST}:{self.PORT}"

    @property
    def WEBSOCKET(self):
        return f"ws://{self.HOST}:{self.PORT}{self.ROUTE_PREFIX}{self.ROUTE_WEBSOCKET_MANAGER}"


C = Constants()
USER_SETTINGS = {}


def set_constants(**kwargs):
    for k, v in kwargs.items():
        setattr(C, k.upper(), v)


def load_constants():
    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "constants.json"), "r"
    ) as f:
        constants = json.load(f)
    set_constants(**constants)

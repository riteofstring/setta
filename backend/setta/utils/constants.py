import json
import logging
from pathlib import Path

from .utils import get_absolute_path, is_dev_mode

logger = logging.getLogger(__name__)

CONSTANTS_FOLDER = (
    Path("../../../constants") if is_dev_mode() else Path("../static/constants")
)
SEED_FOLDER = Path("../../../seed") if is_dev_mode() else Path("../static/seed")
CWD = Path.cwd()
SETTA_FILES_FOLDER = CWD / "setta_files"
CODE_FOLDER = SETTA_FILES_FOLDER / "code"
DB_BACKUP_FOLDER = SETTA_FILES_FOLDER / "backups"
CODE_FOLDER_ENV_VARIABLE = "SETTA_CODE_FOLDER"


class Constants:
    def __init__(self):
        self._initialized = False

    def _ensure_initialized(self):
        if not self._initialized:
            load_constants()
            self._initialized = True

    def __getattr__(self, name):
        if name == "_initialized":
            return object.__getattribute__(self, name)
        self._ensure_initialized()
        return object.__getattribute__(self, name)

    @property
    def FRONTEND_ORIGINS(self):
        self._ensure_initialized()
        if is_dev_mode():
            output = [f"http://{self.HOST}:{self.DEV_MODE_FRONTEND_PORT}"]
        else:
            output = [self.BACKEND]
        if self.HOST == "127.0.0.1":
            output.append(output[0].replace("127.0.0.1", "localhost"))
        return output

    @property
    def BACKEND(self):
        self._ensure_initialized()
        return f"http://{self.HOST}:{self.PORT}"

    @property
    def WEBSOCKET(self):
        self._ensure_initialized()
        return f"ws://{self.HOST}:{self.PORT}{self.ROUTE_PREFIX}"


C = Constants()


def set_constants(**kwargs):
    for k, v in kwargs.items():
        setattr(C, k.upper(), v)


def load_constants():
    logger.debug("Loading constants")
    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "constants.json"), "r"
    ) as f:
        set_constants(**json.load(f))

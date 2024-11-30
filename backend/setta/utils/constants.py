import builtins
import json
from pathlib import Path

from .utils import get_absolute_path, is_dev_mode

CONSTANTS_FOLDER = (
    Path("../../../constants") if is_dev_mode() else Path("../static/constants")
)
SEED_FOLDER = Path("../../../seed") if is_dev_mode() else Path("../static/seed")
CODE_FOLDER = ".setta_code"
DB_BACKUP_FOLDER = ".setta_backups"
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
BASE_UI_TYPE_IDS = {}


def set_constants(**kwargs):
    for k, v in kwargs.items():
        setattr(C, k.upper(), v)


def load_constants():
    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "constants.json"), "r"
    ) as f:
        set_constants(**json.load(f))

    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "BaseUITypes.json"), "r"
    ) as f:
        for k, v in json.load(f).items():
            BASE_UI_TYPE_IDS[v["type"]] = k


def is_from_json_source(id):
    return id.startswith(C.JSON_SOURCE_PREFIX)


CODE_INFO_TABLE_DATA_JSON_FIELDS = set(
    (
        "name",
        "editable",
        "rcType",
        "defaultVal",
        "description",
        "positionalOnly",
        "isPinned",
        "isFrozen",
        "keywordPositions",
    )
)

SECTION_TABLE_DATA_JSON_FIELDS = set(
    (
        "name",
        "social",
        "codeLanguage",
        "configLanguage",
        "isFrozen",
        "jsonSource",
        "hideUnpinnedParams",
        "displayMode",
        "canvasSettings",
        "renderMarkdown",
    )
)

SECTION_CONFIG_TABLE_DATA_JSON_FIELDS = set(
    (
        "size",
        "isHorizontalOrientation",
        "pinnedAreaHeight",
        "isMinimized",
    )
)

SECTION_VARIANT_ID_TABLE_DATA_JSON_FIELDS = set(
    ["name", "code", "keywordPositions", "description", "isFrozen", "isDefault"]
)

SECTION_VARIANT_EV_TABLE_DATA_JSON_FIELDS = set(["value", "keywordPositions"])

UI_TYPE_TABLE_DATA_JSON_FIELDS = set(
    [
        "name",
        "type",
        "presetType",
        "config",
    ]
)

PROJECT_CONFIG_TABLE_DATA_JSON_FIELDS = set(
    ["viewport", "isDefault", "previewImgNodes", "previewImgColor"]
)

PROJECT_CONFIG_CHILDREN_TABLE_DATA_JSON_FIELDS = set(
    [
        "x",
        "y",
        "zIndex",
    ]
)

SECTION_ARTIFACTS_TABLE_DATA_JSON_FIELDS = set(
    [
        "value",
        "type",
        "displayName",
    ]
)

PARAM_SWEEP_ID_TABLE_DATA_JSON_FIELDS = set(
    [
        "name",
        "isFrozen",
    ]
)

PARAM_SWEEP_TABLE_DATA_JSON_FIELDS = set(["selectedItemGroupNum",
    "paramInfoGroupNum", "value"])

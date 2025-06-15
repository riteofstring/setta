from enum import Enum


class SectionType(Enum):
    CALLABLE = "CALLABLE"
    DICT = "DICT"
    LIST_ROOT = "LIST_ROOT"
    DICT_ROOT = "DICT_ROOT"
    GROUP = "GROUP"
    IMAGE = "IMAGE"
    CHART = "CHART"
    DRAW = "DRAW"
    TEXT_BLOCK = "TEXT_BLOCK"
    SOCIAL = "SOCIAL"
    GLOBAL_VARIABLES = "GLOBAL_VARIABLES"
    CODE = "CODE"
    GEN_PYTHON_CODE = "GEN_PYTHON_CODE"
    TERMINAL = "TERMINAL"
    IFRAME = "IFRAME"
    CHAT = "CHAT"
    BROWSER = "BROWSER"


class Size(Enum):
    auto = "auto"


class CodeLanguage(Enum):
    python = "python"
    bash = "bash"


class ConfigLanguage(Enum):
    python = "python"
    json = "json"
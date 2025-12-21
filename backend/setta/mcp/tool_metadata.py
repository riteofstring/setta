from enum import Enum

from mcp.types import ToolAnnotations


class SettaToolType(str, Enum):
    init = "init"
    discoverable = "discoverable"


class SettaToolAnnotations(ToolAnnotations):
    settaToolType: SettaToolType

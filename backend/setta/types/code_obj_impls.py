from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.id import ID
from setta.utils.generate_memorable_string import generate_memorable_string


class ParameterPassingStyle(str, Enum):
    DEFAULT = "DEFAULT"
    ARGS = "ARGS"
    KWARGS = "KWARGS"
    POSITIONAL_ONLY = "POSITIONAL_ONLY"
    KEYWORD_ONLY = "KEYWORD_ONLY"


class CodeObjType(str, Enum):
    CodeCallable = "CodeCallable"
    CodeParam = "CodeParam"
    TextParam = "TextParam"
    ButtonParam = "ButtonParam"
    SliderParam = "SliderParam"
    RotaryParam = "RotaryParam"
    SwitchParam = "SwitchParam"
    ColorPickerParam = "ColorPickerParam"
    DropdownParam = "DropdownParam"
    PasswordParam = "PasswordParam"
    TextAreaParam = "TextAreaParam"
    DropzoneParam = "DropzoneParam"
    NestedParam = "NestedParam"


class ParamNameType(str, Enum):
    CODE = "CODE"
    TEXT = "TEXT"


class ButtonActionMode(str, Enum):
    WEBSOCKET_LISTENER = "WEBSOCKET_LISTENER"
    HTTP_REQUEST = "HTTP_REQUEST"
    SETTA_API = "SETTA_API"


class HttpRequestMethod(str, Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


class ColorPickerChoice(BaseModel):
    color: str
    description: str


class BaseCodeObjImpl(BaseModel):
    type: Any
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    description: str = ""
    isPreset: bool = False


class BaseParamCodeObjImpl(BaseCodeObjImpl):
    coreNameType: ParamNameType = ParamNameType.TEXT
    coreNameEditable: bool = False
    passingStyle: ParameterPassingStyle = ParameterPassingStyle.DEFAULT


class BaseChildlessCodeObjImpl(BaseParamCodeObjImpl):
    defaultVal: str = ""
    value: str = ""


class BaseParentCodeObjImpl(BaseCodeObjImpl):
    children: list[ID] = Field(default_factory=list)


class CodeCallableCodeObjImpl(BaseParentCodeObjImpl):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable


class CodeParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam


class TextParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam


class ButtonParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.ButtonParam] = CodeObjType.ButtonParam
    label: str = "Trigger"
    actionMode: ButtonActionMode = ButtonActionMode.WEBSOCKET_LISTENER
    requestMethod: HttpRequestMethod = HttpRequestMethod.POST
    requestUrl: str = ""
    requestHeaderKey: str = ""
    requestHeaderValue: str = ""
    requestBody: str = ""


class SliderParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    min: int = 0
    max: int = 100
    step: int = 1
    value: str = "0"


class RotaryParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.RotaryParam] = CodeObjType.RotaryParam
    min: float = 0
    max: float = 1
    step: float = 0.1
    value: str = "0"


class SwitchParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    value: str = "false"


class ColorPickerParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    colorChoices: list[ColorPickerChoice] = Field(default_factory=list)
    value: str = "#ff0000"


class DropdownParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    choices: list[str] = Field(default_factory=list)


class PasswordParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam


class TextAreaParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.TextAreaParam] = CodeObjType.TextAreaParam


class DropzoneParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.DropzoneParam] = CodeObjType.DropzoneParam


class NestedParamCodeObjImpl(BaseParamCodeObjImpl, BaseParentCodeObjImpl):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam


ControlCodeObjTypeSet = frozenset(
    {
        CodeObjType.CodeParam,
        CodeObjType.TextParam,
        CodeObjType.ButtonParam,
        CodeObjType.SliderParam,
        CodeObjType.SwitchParam,
        CodeObjType.ColorPickerParam,
        CodeObjType.DropdownParam,
        CodeObjType.PasswordParam,
        CodeObjType.DropzoneParam,
    }
)

SectionParamCodeObjTypeSet = frozenset(
    {
        CodeObjType.CodeParam,
        CodeObjType.TextParam,
        CodeObjType.TextAreaParam,
        CodeObjType.SliderParam,
        CodeObjType.RotaryParam,
        CodeObjType.SwitchParam,
        CodeObjType.ColorPickerParam,
        CodeObjType.DropdownParam,
        CodeObjType.PasswordParam,
        CodeObjType.DropzoneParam,
        CodeObjType.NestedParam,
    }
)

from typing import Any, Literal, NotRequired, TypedDict

from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.modifiers import BaseCodeObjModifier, BaseSectionModifier
from setta.types.section_impls import SectionType


class BaseSectionCoreArgs(TypedDict):
    id: NotRequired[str]
    name: NotRequired[str]
    implLayerings: NotRequired[list[str]]
    defaultImplLayering: NotRequired[str | None]
    type: NotRequired[Any]
    sharedModifier: NotRequired[BaseSectionModifier]
    unsharedKeys: NotRequired[
        list[
            Literal[
                "aspectRatio",
                "aspectRatioExtraHeight",
                "aspectRatioExtraWidth",
                "isFrozen",
                "isInOtherProjectConfigs",
                "isMinimized",
                "parentId",
                "positionAndSizeLocked",
                "size",
                "visibility",
            ]
        ]
    ]


class BaseSectionWithParamsCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Any]


class BaseArtifactSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Any]


class BaseCanvasSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Any]


class BaseCodeSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Any]


class BaseParentSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Any]


class BaseDictSectionCoreArgs(BaseSectionWithParamsCoreArgs):
    type: NotRequired[Any]


class CallableSectionCoreArgs(BaseSectionWithParamsCoreArgs):
    type: NotRequired[Literal[SectionType.Callable]]


class DictSectionCoreArgs(BaseDictSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Dict]]


class ListRootSectionCoreArgs(BaseParentSectionCoreArgs):
    type: NotRequired[Literal[SectionType.ListRoot]]


class DictRootSectionCoreArgs(BaseParentSectionCoreArgs):
    type: NotRequired[Literal[SectionType.DictRoot]]


class GroupSectionCoreArgs(BaseParentSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Group]]


class ImageSectionCoreArgs(BaseArtifactSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Image]]


class ChartSectionCoreArgs(BaseArtifactSectionCoreArgs, BaseCanvasSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Chart]]


class DrawSectionCoreArgs(BaseArtifactSectionCoreArgs, BaseCanvasSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Draw]]


class TextBlockSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Literal[SectionType.TextBlock]]


class SocialSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Social]]


class GlobalVariablesSectionCoreArgs(BaseDictSectionCoreArgs):
    type: NotRequired[Literal[SectionType.GlobalVariables]]


class CodeSectionCoreArgs(BaseCodeSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Code]]


class GenPythonCodeSectionCoreArgs(BaseCodeSectionCoreArgs):
    type: NotRequired[Literal[SectionType.GenPythonCode]]


class TerminalSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Terminal]]


class IFrameSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Literal[SectionType.IFrame]]


class ChatSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Chat]]


class BrowserSectionCoreArgs(BaseSectionCoreArgs):
    type: NotRequired[Literal[SectionType.Browser]]


class BaseCodeObjCoreArgs(TypedDict):
    id: NotRequired[str]
    name: NotRequired[str]
    implLayerings: NotRequired[list[str]]
    defaultImplLayering: NotRequired[str | None]
    type: NotRequired[Any]
    sharedModifier: NotRequired[BaseCodeObjModifier]
    unsharedKeys: NotRequired[list[Literal["description"]]]


class BaseParamCodeObjCoreArgs(BaseCodeObjCoreArgs):
    type: NotRequired[Any]


class BaseChildlessCodeObjCoreArgs(BaseParamCodeObjCoreArgs):
    type: NotRequired[Any]


class BaseParentCodeObjCoreArgs(BaseCodeObjCoreArgs):
    type: NotRequired[Any]


class CodeCallableCodeObjCoreArgs(BaseParentCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.CodeCallable]]


class CodeParamCodeObjCoreArgs(BaseChildlessCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.CodeParam]]


class TextParamCodeObjCoreArgs(BaseChildlessCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.TextParam]]


class SliderParamCodeObjCoreArgs(BaseChildlessCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.SliderParam]]


class SwitchParamCodeObjCoreArgs(BaseChildlessCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.SwitchParam]]


class ColorPickerParamCodeObjCoreArgs(BaseChildlessCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.ColorPickerParam]]


class DropdownParamCodeObjCoreArgs(BaseChildlessCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.DropdownParam]]


class PasswordParamCodeObjCoreArgs(BaseChildlessCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.PasswordParam]]


class NestedParamCodeObjCoreArgs(BaseParamCodeObjCoreArgs, BaseParentCodeObjCoreArgs):
    type: NotRequired[Literal[CodeObjType.NestedParam]]

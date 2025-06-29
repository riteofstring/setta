from typing import Any, Literal, overload, set

from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
from setta.types.generated.code_obj_cores import (
    CodeCallableCodeObjCore,
    CodeParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    NestedParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    TextParamCodeObjCore,
)
from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.section_cores import (
    BrowserSectionCore,
    CallableSectionCore,
    ChartSectionCore,
    ChatSectionCore,
    CodeSectionCore,
    DictRootSectionCore,
    DictSectionCore,
    DrawSectionCore,
    GenPythonCodeSectionCore,
    GlobalVariablesSectionCore,
    GroupSectionCore,
    IFrameSectionCore,
    ImageSectionCore,
    ListRootSectionCore,
    SocialSectionCore,
    TerminalSectionCore,
    TextBlockSectionCore,
)
from setta.types.section_impls import SectionType


# Overloads for section type to core conversion
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Callable],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: CallableSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "callable",
            "codeObjImplLayeringMap",
            "columnWidth",
            "configLanguage",
            "hideParams",
            "hideUnpinnedParams",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> CallableSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Dict],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: DictSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "codeObjImplLayeringMap",
            "columnWidth",
            "configLanguage",
            "hideUnpinnedParams",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isJsonSource",
            "isMinimized",
            "jsonSourceKeys",
            "jsonSourceMissing",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "topLevelParamIds",
            "visibility",
        ]
    ]
    | None = None,
) -> DictSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.ListRoot],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: ListRootSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> ListRootSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.DictRoot],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: DictRootSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> DictRootSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Group],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: GroupSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "isFrozen",
            "isHorizontalOrientation",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> GroupSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Image],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: ImageSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
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
    | None = None,
) -> ImageSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Chart],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: ChartSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "chartSettings",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "renderedValue",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> ChartSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Draw],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: DrawSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "canvasSettings",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "renderedValue",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> DrawSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.TextBlock],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: TextBlockSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "displayMode",
            "format",
            "headingAsSectionName",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "text",
            "visibility",
        ]
    ]
    | None = None,
) -> TextBlockSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Social],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: SocialSectionImplModifier | None = None,
    unsharedKeys: set[
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
            "social",
            "visibility",
        ]
    ]
    | None = None,
) -> SocialSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.GlobalVariables],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: GlobalVariablesSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "codeObjImplLayeringMap",
            "columnWidth",
            "configLanguage",
            "hideUnpinnedParams",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isJsonSource",
            "isMinimized",
            "jsonSourceKeys",
            "jsonSourceMissing",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "topLevelParamIds",
            "visibility",
        ]
    ]
    | None = None,
) -> GlobalVariablesSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Code],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: CodeSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "code",
            "codeLanguage",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> CodeSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.GenPythonCode],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: GenPythonCodeSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "code",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> GenPythonCodeSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Terminal],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: TerminalSectionImplModifier | None = None,
    unsharedKeys: set[
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
    | None = None,
) -> TerminalSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.IFrame],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: IFrameSectionImplModifier | None = None,
    unsharedKeys: set[
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
    | None = None,
) -> IFrameSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Chat],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: ChatSectionImplModifier | None = None,
    unsharedKeys: set[
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
    | None = None,
) -> ChatSectionCore: ...
@overload
def create_core_for_section_type(
    type_: Literal[SectionType.Browser],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: BrowserSectionImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "hideColumn",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ]
    | None = None,
) -> BrowserSectionCore: ...
@overload
def create_core_for_section_type(
    type_: SectionType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None,
) -> BaseSectionCoreUnion: ...


def create_core_for_section_type(
    type_: SectionType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None,
) -> BaseSectionCoreUnion:
    """Create a SectionCore for the given SectionType.

    The overloaded signatures above provide full type checking for each specific
    SectionType with properly typed parameters.
    """
    # Build kwargs dict with only non-None values
    core_kwargs = {}
    if id is not None:
        core_kwargs["id"] = id
    if name is not None:
        core_kwargs["name"] = name
    if implLayerings is not None:
        core_kwargs["implLayerings"] = implLayerings
    if defaultImplLayering is not None:
        core_kwargs["defaultImplLayering"] = defaultImplLayering
    if sharedModifier is not None:
        core_kwargs["sharedModifier"] = sharedModifier
    if unsharedKeys is not None:
        core_kwargs["unsharedKeys"] = unsharedKeys

    if type_ == SectionType.Callable:
        return CallableSectionCore(**core_kwargs)
    elif type_ == SectionType.Dict:
        return DictSectionCore(**core_kwargs)
    elif type_ == SectionType.ListRoot:
        return ListRootSectionCore(**core_kwargs)
    elif type_ == SectionType.DictRoot:
        return DictRootSectionCore(**core_kwargs)
    elif type_ == SectionType.Group:
        return GroupSectionCore(**core_kwargs)
    elif type_ == SectionType.Image:
        return ImageSectionCore(**core_kwargs)
    elif type_ == SectionType.Chart:
        return ChartSectionCore(**core_kwargs)
    elif type_ == SectionType.Draw:
        return DrawSectionCore(**core_kwargs)
    elif type_ == SectionType.TextBlock:
        return TextBlockSectionCore(**core_kwargs)
    elif type_ == SectionType.Social:
        return SocialSectionCore(**core_kwargs)
    elif type_ == SectionType.GlobalVariables:
        return GlobalVariablesSectionCore(**core_kwargs)
    elif type_ == SectionType.Code:
        return CodeSectionCore(**core_kwargs)
    elif type_ == SectionType.GenPythonCode:
        return GenPythonCodeSectionCore(**core_kwargs)
    elif type_ == SectionType.Terminal:
        return TerminalSectionCore(**core_kwargs)
    elif type_ == SectionType.IFrame:
        return IFrameSectionCore(**core_kwargs)
    elif type_ == SectionType.Chat:
        return ChatSectionCore(**core_kwargs)
    elif type_ == SectionType.Browser:
        return BrowserSectionCore(**core_kwargs)
    else:
        raise ValueError(f"Unknown section type: {type_}")


# Overloads for code obj type to core conversion
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.CodeCallable],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: CodeCallableCodeObjImplModifier | None = None,
    unsharedKeys: set[Literal["children", "description"]] | None = None,
) -> CodeCallableCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.CodeParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: CodeParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ]
    | None = None,
) -> CodeParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.TextParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: TextParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ]
    | None = None,
) -> TextParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.SliderParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: SliderParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "max",
            "min",
            "passingStyle",
            "step",
            "value",
        ]
    ]
    | None = None,
) -> SliderParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.SwitchParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: SwitchParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ]
    | None = None,
) -> SwitchParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.ColorPickerParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: ColorPickerParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "choices",
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ]
    | None = None,
) -> ColorPickerParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.DropdownParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: DropdownParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "choices",
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ]
    | None = None,
) -> DropdownParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.PasswordParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: PasswordParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ]
    | None = None,
) -> PasswordParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: Literal[CodeObjType.NestedParam],
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: NestedParamCodeObjImplModifier | None = None,
    unsharedKeys: set[
        Literal[
            "children",
            "coreNameEditable",
            "coreNameType",
            "description",
            "passingStyle",
        ]
    ]
    | None = None,
) -> NestedParamCodeObjCore: ...
@overload
def create_core_for_code_obj_type(
    type_: CodeObjType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None,
) -> BaseCodeObjCoreUnion: ...


def create_core_for_code_obj_type(
    type_: CodeObjType,
    *,
    id: str | None = None,
    name: str | None = None,
    implLayerings: list[str] | None = None,
    defaultImplLayering: str | None = None,
    sharedModifier: Any | None = None,
    unsharedKeys: Any | None = None,
) -> BaseCodeObjCoreUnion:
    """Create a CodeObjCore for the given CodeObjType.

    The overloaded signatures above provide full type checking for each specific
    CodeObjType with properly typed parameters.
    """
    # Build kwargs dict with only non-None values
    core_kwargs = {}
    if id is not None:
        core_kwargs["id"] = id
    if name is not None:
        core_kwargs["name"] = name
    if implLayerings is not None:
        core_kwargs["implLayerings"] = implLayerings
    if defaultImplLayering is not None:
        core_kwargs["defaultImplLayering"] = defaultImplLayering
    if sharedModifier is not None:
        core_kwargs["sharedModifier"] = sharedModifier
    if unsharedKeys is not None:
        core_kwargs["unsharedKeys"] = unsharedKeys

    if type_ == CodeObjType.CodeCallable:
        return CodeCallableCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.CodeParam:
        return CodeParamCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.TextParam:
        return TextParamCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.SliderParam:
        return SliderParamCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.SwitchParam:
        return SwitchParamCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.ColorPickerParam:
        return ColorPickerParamCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.DropdownParam:
        return DropdownParamCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.PasswordParam:
        return PasswordParamCodeObjCore(**core_kwargs)
    elif type_ == CodeObjType.NestedParam:
        return NestedParamCodeObjCore(**core_kwargs)
    else:
        raise ValueError(f"Unknown code obj type: {type_}")

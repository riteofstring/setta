from typing import Any, Literal, overload

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
from setta.types.generated.impl_field_literals import (
    BrowserSectionImplFields,
    CallableSectionImplFields,
    ChartSectionImplFields,
    ChatSectionImplFields,
    CodeCallableCodeObjImplFields,
    CodeParamCodeObjImplFields,
    CodeSectionImplFields,
    ColorPickerParamCodeObjImplFields,
    DictRootSectionImplFields,
    DictSectionImplFields,
    DrawSectionImplFields,
    DropdownParamCodeObjImplFields,
    GenPythonCodeSectionImplFields,
    GlobalVariablesSectionImplFields,
    GroupSectionImplFields,
    IFrameSectionImplFields,
    ImageSectionImplFields,
    ListRootSectionImplFields,
    NestedParamCodeObjImplFields,
    PasswordParamCodeObjImplFields,
    SliderParamCodeObjImplFields,
    SocialSectionImplFields,
    SwitchParamCodeObjImplFields,
    TerminalSectionImplFields,
    TextBlockSectionImplFields,
    TextParamCodeObjImplFields,
)
from setta.types.generated.impl_modifiers import (
    BrowserSectionImplModifier,
    CallableSectionImplModifier,
    ChartSectionImplModifier,
    ChatSectionImplModifier,
    CodeCallableCodeObjImplModifier,
    CodeParamCodeObjImplModifier,
    CodeSectionImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DictRootSectionImplModifier,
    DictSectionImplModifier,
    DrawSectionImplModifier,
    DropdownParamCodeObjImplModifier,
    GenPythonCodeSectionImplModifier,
    GlobalVariablesSectionImplModifier,
    GroupSectionImplModifier,
    IFrameSectionImplModifier,
    ImageSectionImplModifier,
    ListRootSectionImplModifier,
    NestedParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SocialSectionImplModifier,
    SwitchParamCodeObjImplModifier,
    TerminalSectionImplModifier,
    TextBlockSectionImplModifier,
    TextParamCodeObjImplModifier,
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
    unsharedKeys: set[CallableSectionImplFields] | None = None,
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
    unsharedKeys: set[DictSectionImplFields] | None = None,
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
    unsharedKeys: set[ListRootSectionImplFields] | None = None,
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
    unsharedKeys: set[DictRootSectionImplFields] | None = None,
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
    unsharedKeys: set[GroupSectionImplFields] | None = None,
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
    unsharedKeys: set[ImageSectionImplFields] | None = None,
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
    unsharedKeys: set[ChartSectionImplFields] | None = None,
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
    unsharedKeys: set[DrawSectionImplFields] | None = None,
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
    unsharedKeys: set[TextBlockSectionImplFields] | None = None,
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
    unsharedKeys: set[SocialSectionImplFields] | None = None,
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
    unsharedKeys: set[GlobalVariablesSectionImplFields] | None = None,
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
    unsharedKeys: set[CodeSectionImplFields] | None = None,
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
    unsharedKeys: set[GenPythonCodeSectionImplFields] | None = None,
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
    unsharedKeys: set[TerminalSectionImplFields] | None = None,
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
    unsharedKeys: set[IFrameSectionImplFields] | None = None,
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
    unsharedKeys: set[ChatSectionImplFields] | None = None,
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
    unsharedKeys: set[BrowserSectionImplFields] | None = None,
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

    Args:
        type_: The SectionType enum value
        id: Optional custom ID for the core
        name: Optional custom name for the core
        implLayerings: Optional implementation layering IDs
        defaultImplLayering: Optional default layering ID
        sharedModifier: Optional modifier (must match the type)
        unsharedKeys: Optional set of keys to exclude from sharing

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
    unsharedKeys: set[CodeCallableCodeObjImplFields] | None = None,
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
    unsharedKeys: set[CodeParamCodeObjImplFields] | None = None,
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
    unsharedKeys: set[TextParamCodeObjImplFields] | None = None,
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
    unsharedKeys: set[SliderParamCodeObjImplFields] | None = None,
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
    unsharedKeys: set[SwitchParamCodeObjImplFields] | None = None,
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
    unsharedKeys: set[ColorPickerParamCodeObjImplFields] | None = None,
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
    unsharedKeys: set[DropdownParamCodeObjImplFields] | None = None,
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
    unsharedKeys: set[PasswordParamCodeObjImplFields] | None = None,
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
    unsharedKeys: set[NestedParamCodeObjImplFields] | None = None,
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

    Args:
        type_: The CodeObjType enum value
        id: Optional custom ID for the core
        name: Optional custom name for the core
        implLayerings: Optional implementation layering IDs
        defaultImplLayering: Optional default layering ID
        sharedModifier: Optional modifier (must match the type)
        unsharedKeys: Optional set of keys to exclude from sharing

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

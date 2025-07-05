from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_field_literals import (
    BaseArtifactSectionImplFields,
    BaseCanvasSectionImplFields,
    BaseChildlessCodeObjImplFields,
    BaseCodeObjImplFields,
    BaseCodeSectionImplFields,
    BaseDictSectionImplFields,
    BaseParamCodeObjImplFields,
    BaseParentCodeObjImplFields,
    BaseParentSectionImplFields,
    BaseSectionImplFields,
    BaseSectionWithParamsImplFields,
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
from setta.types.generated.modifiers import (
    BaseArtifactSectionModifier,
    BaseCanvasSectionModifier,
    BaseChildlessCodeObjModifier,
    BaseCodeObjModifier,
    BaseCodeSectionModifier,
    BaseDictSectionModifier,
    BaseParamCodeObjModifier,
    BaseParentCodeObjModifier,
    BaseParentSectionModifier,
    BaseSectionModifier,
    BaseSectionWithParamsModifier,
    BrowserSectionModifier,
    CallableSectionModifier,
    ChartSectionModifier,
    ChatSectionModifier,
    CodeCallableCodeObjModifier,
    CodeParamCodeObjModifier,
    CodeSectionModifier,
    ColorPickerParamCodeObjModifier,
    DictRootSectionModifier,
    DictSectionModifier,
    DrawSectionModifier,
    DropdownParamCodeObjModifier,
    GenPythonCodeSectionModifier,
    GlobalVariablesSectionModifier,
    GroupSectionModifier,
    IFrameSectionModifier,
    ImageSectionModifier,
    ListRootSectionModifier,
    NestedParamCodeObjModifier,
    PasswordParamCodeObjModifier,
    SliderParamCodeObjModifier,
    SocialSectionModifier,
    SwitchParamCodeObjModifier,
    TerminalSectionModifier,
    TextBlockSectionModifier,
    TextParamCodeObjModifier,
    create_modifier,
)
from setta.types.section_impls import SectionType
from setta.utils.generate_memorable_string import generate_memorable_string


class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: BaseSectionModifier
    unsharedKeys: BaseSectionImplFields


class BaseSectionWithParamsCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseSectionWithParamsModifier  # type: ignore
    unsharedKeys: set[BaseSectionWithParamsImplFields]  # type: ignore


class BaseArtifactSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseArtifactSectionModifier  # type: ignore
    unsharedKeys: set[BaseArtifactSectionImplFields]  # type: ignore


class BaseCanvasSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCanvasSectionModifier  # type: ignore
    unsharedKeys: set[BaseCanvasSectionImplFields]  # type: ignore


class BaseCodeSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCodeSectionModifier  # type: ignore
    unsharedKeys: set[BaseCodeSectionImplFields]  # type: ignore


class BaseParentSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseParentSectionModifier  # type: ignore
    unsharedKeys: set[BaseParentSectionImplFields]  # type: ignore


class BaseDictSectionCore(BaseSectionWithParamsCore):
    type: Any
    sharedModifier: BaseDictSectionModifier  # type: ignore
    unsharedKeys: set[BaseDictSectionImplFields]  # type: ignore


class CallableSectionCore(BaseSectionWithParamsCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Callable)
    )
    # type: ignore
    unsharedKeys: set[CallableSectionImplFields]  # type: ignore


class DictSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Dict)
    )
    # type: ignore
    unsharedKeys: set[DictSectionImplFields]  # type: ignore


class ListRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.ListRoot)
    )
    # type: ignore
    unsharedKeys: set[ListRootSectionImplFields]  # type: ignore


class DictRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.DictRoot)
    )
    # type: ignore
    unsharedKeys: set[DictRootSectionImplFields]  # type: ignore


class GroupSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Group)
    )
    # type: ignore
    unsharedKeys: set[GroupSectionImplFields]  # type: ignore


class ImageSectionCore(BaseArtifactSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Image)
    )
    # type: ignore
    unsharedKeys: set[ImageSectionImplFields]  # type: ignore


class ChartSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Chart)
    )
    # type: ignore
    unsharedKeys: set[ChartSectionImplFields]  # type: ignore


class DrawSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Draw)
    )
    # type: ignore
    unsharedKeys: set[DrawSectionImplFields]  # type: ignore


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.TextBlock)
    )
    # type: ignore
    unsharedKeys: set[TextBlockSectionImplFields]  # type: ignore


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Social)
    )
    # type: ignore
    unsharedKeys: set[SocialSectionImplFields]  # type: ignore


class GlobalVariablesSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.GlobalVariables)
    )
    # type: ignore
    unsharedKeys: set[GlobalVariablesSectionImplFields]  # type: ignore


class CodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Code)
    )
    # type: ignore
    unsharedKeys: set[CodeSectionImplFields]  # type: ignore


class GenPythonCodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.GenPythonCode)
    )
    # type: ignore
    unsharedKeys: set[GenPythonCodeSectionImplFields]  # type: ignore


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Terminal)
    )
    # type: ignore
    unsharedKeys: set[TerminalSectionImplFields]  # type: ignore


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.IFrame)
    )
    # type: ignore
    unsharedKeys: set[IFrameSectionImplFields]  # type: ignore


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Chat)
    )
    # type: ignore
    unsharedKeys: set[ChatSectionImplFields]  # type: ignore


class BrowserSectionCore(BaseSectionCore):
    type: Literal[SectionType.Browser] = SectionType.Browser
    sharedModifier: BrowserSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Browser)
    )
    # type: ignore
    unsharedKeys: set[BrowserSectionImplFields]  # type: ignore


class BaseCodeObjCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: BaseCodeObjModifier
    unsharedKeys: BaseCodeObjImplFields


class BaseParamCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParamCodeObjModifier  # type: ignore
    unsharedKeys: set[BaseParamCodeObjImplFields]  # type: ignore


class BaseChildlessCodeObjCore(BaseParamCodeObjCore):
    type: Any
    sharedModifier: BaseChildlessCodeObjModifier  # type: ignore
    unsharedKeys: set[BaseChildlessCodeObjImplFields]  # type: ignore


class BaseParentCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParentCodeObjModifier  # type: ignore
    unsharedKeys: set[BaseParentCodeObjImplFields]  # type: ignore


class CodeCallableCodeObjCore(BaseParentCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.CodeCallable)
    )
    # type: ignore
    unsharedKeys: set[CodeCallableCodeObjImplFields]  # type: ignore


class CodeParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.CodeParam)
    )
    # type: ignore
    unsharedKeys: set[CodeParamCodeObjImplFields]  # type: ignore


class TextParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.TextParam)
    )
    # type: ignore
    unsharedKeys: set[TextParamCodeObjImplFields]  # type: ignore


class SliderParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.SliderParam)
    )
    # type: ignore
    unsharedKeys: set[SliderParamCodeObjImplFields]  # type: ignore


class SwitchParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.SwitchParam)
    )
    # type: ignore
    unsharedKeys: set[SwitchParamCodeObjImplFields]  # type: ignore


class ColorPickerParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.ColorPickerParam)
    )
    # type: ignore
    unsharedKeys: set[ColorPickerParamCodeObjImplFields]  # type: ignore


class DropdownParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.DropdownParam)
    )
    # type: ignore
    unsharedKeys: set[DropdownParamCodeObjImplFields]  # type: ignore


class PasswordParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.PasswordParam)
    )
    # type: ignore
    unsharedKeys: set[PasswordParamCodeObjImplFields]  # type: ignore


class NestedParamCodeObjCore(BaseParamCodeObjCore, BaseParentCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.NestedParam)
    )
    # type: ignore
    unsharedKeys: set[NestedParamCodeObjImplFields]  # type: ignore

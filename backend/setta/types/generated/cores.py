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
    unsharedKeys: list[BaseSectionWithParamsImplFields]  # type: ignore


class BaseArtifactSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseArtifactSectionModifier  # type: ignore
    unsharedKeys: list[BaseArtifactSectionImplFields]  # type: ignore


class BaseCanvasSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCanvasSectionModifier  # type: ignore
    unsharedKeys: list[BaseCanvasSectionImplFields]  # type: ignore


class BaseCodeSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCodeSectionModifier  # type: ignore
    unsharedKeys: list[BaseCodeSectionImplFields]  # type: ignore


class BaseParentSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseParentSectionModifier  # type: ignore
    unsharedKeys: list[BaseParentSectionImplFields]  # type: ignore


class BaseDictSectionCore(BaseSectionWithParamsCore):
    type: Any
    sharedModifier: BaseDictSectionModifier  # type: ignore
    unsharedKeys: list[BaseDictSectionImplFields]  # type: ignore


class CallableSectionCore(BaseSectionWithParamsCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Callable)
    )

    unsharedKeys: list[CallableSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: ["codeObjImplLayeringMap", "callable"]
    )


class DictSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Dict)
    )

    unsharedKeys: list[DictSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: ["codeObjImplLayeringMap", "topLevelParamIds"]
    )


class ListRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.ListRoot)
    )

    unsharedKeys: list[ListRootSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class DictRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.DictRoot)
    )

    unsharedKeys: list[DictRootSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class GroupSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Group)
    )

    unsharedKeys: list[GroupSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class ImageSectionCore(BaseArtifactSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Image)
    )

    unsharedKeys: list[ImageSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class ChartSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Chart)
    )

    unsharedKeys: list[ChartSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class DrawSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Draw)
    )

    unsharedKeys: list[DrawSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.TextBlock)
    )

    unsharedKeys: list[TextBlockSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Social)
    )

    unsharedKeys: list[SocialSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class GlobalVariablesSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.GlobalVariables)
    )

    unsharedKeys: list[GlobalVariablesSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class CodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Code)
    )

    unsharedKeys: list[CodeSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class GenPythonCodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.GenPythonCode)
    )

    unsharedKeys: list[GenPythonCodeSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Terminal)
    )

    unsharedKeys: list[TerminalSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.IFrame)
    )

    unsharedKeys: list[IFrameSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Chat)
    )

    unsharedKeys: list[ChatSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class BrowserSectionCore(BaseSectionCore):
    type: Literal[SectionType.Browser] = SectionType.Browser
    sharedModifier: BrowserSectionModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(SectionType.Browser)
    )

    unsharedKeys: list[BrowserSectionImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


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
    unsharedKeys: list[BaseParamCodeObjImplFields]  # type: ignore


class BaseChildlessCodeObjCore(BaseParamCodeObjCore):
    type: Any
    sharedModifier: BaseChildlessCodeObjModifier  # type: ignore
    unsharedKeys: list[BaseChildlessCodeObjImplFields]  # type: ignore


class BaseParentCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParentCodeObjModifier  # type: ignore
    unsharedKeys: list[BaseParentCodeObjImplFields]  # type: ignore


class CodeCallableCodeObjCore(BaseParentCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.CodeCallable)
    )

    unsharedKeys: list[CodeCallableCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )


class CodeParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.CodeParam)
    )

    unsharedKeys: list[CodeParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: ["value"]
    )


class TextParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.TextParam)
    )

    unsharedKeys: list[TextParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: ["value"]
    )


class SliderParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.SliderParam)
    )

    unsharedKeys: list[SliderParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: ["value"]
    )


class SwitchParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.SwitchParam)
    )

    unsharedKeys: list[SwitchParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: ["value"]
    )


class ColorPickerParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.ColorPickerParam)
    )

    unsharedKeys: list[ColorPickerParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: ["value"]
    )


class DropdownParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.DropdownParam)
    )

    unsharedKeys: list[DropdownParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: ["value"]
    )


class PasswordParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.PasswordParam)
    )

    unsharedKeys: list[PasswordParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: ["value"]
    )


class NestedParamCodeObjCore(BaseParamCodeObjCore, BaseParentCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjModifier = Field(  # type: ignore
        default_factory=lambda: create_modifier(CodeObjType.NestedParam)
    )

    unsharedKeys: list[NestedParamCodeObjImplFields] = Field(  # type: ignore
        default_factory=lambda: []
    )

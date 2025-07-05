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
    unsharedKeys: BaseSectionWithParamsImplFields  # type: ignore


class BaseArtifactSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseArtifactSectionModifier  # type: ignore
    unsharedKeys: BaseArtifactSectionImplFields  # type: ignore


class BaseCanvasSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCanvasSectionModifier  # type: ignore
    unsharedKeys: BaseCanvasSectionImplFields  # type: ignore


class BaseCodeSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCodeSectionModifier  # type: ignore
    unsharedKeys: BaseCodeSectionImplFields  # type: ignore


class BaseParentSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseParentSectionModifier  # type: ignore
    unsharedKeys: BaseParentSectionImplFields  # type: ignore


class BaseDictSectionCore(BaseSectionWithParamsCore):
    type: Any
    sharedModifier: BaseDictSectionModifier  # type: ignore
    unsharedKeys: BaseDictSectionImplFields  # type: ignore


class CallableSectionCore(BaseSectionWithParamsCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionModifier  # type: ignore
    unsharedKeys: CallableSectionImplFields  # type: ignore


class DictSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionModifier  # type: ignore
    unsharedKeys: DictSectionImplFields  # type: ignore


class ListRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionModifier  # type: ignore
    unsharedKeys: ListRootSectionImplFields  # type: ignore


class DictRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionModifier  # type: ignore
    unsharedKeys: DictRootSectionImplFields  # type: ignore


class GroupSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionModifier  # type: ignore
    unsharedKeys: GroupSectionImplFields  # type: ignore


class ImageSectionCore(BaseArtifactSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionModifier  # type: ignore
    unsharedKeys: ImageSectionImplFields  # type: ignore


class ChartSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionModifier  # type: ignore
    unsharedKeys: ChartSectionImplFields  # type: ignore


class DrawSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionModifier  # type: ignore
    unsharedKeys: DrawSectionImplFields  # type: ignore


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionModifier  # type: ignore
    unsharedKeys: TextBlockSectionImplFields  # type: ignore


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionModifier  # type: ignore
    unsharedKeys: SocialSectionImplFields  # type: ignore


class GlobalVariablesSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionModifier  # type: ignore
    unsharedKeys: GlobalVariablesSectionImplFields  # type: ignore


class CodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionModifier  # type: ignore
    unsharedKeys: CodeSectionImplFields  # type: ignore


class GenPythonCodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionModifier  # type: ignore
    unsharedKeys: GenPythonCodeSectionImplFields  # type: ignore


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionModifier  # type: ignore
    unsharedKeys: TerminalSectionImplFields  # type: ignore


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionModifier  # type: ignore
    unsharedKeys: IFrameSectionImplFields  # type: ignore


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionModifier  # type: ignore
    unsharedKeys: ChatSectionImplFields  # type: ignore


class BrowserSectionCore(BaseSectionCore):
    type: Literal[SectionType.Browser] = SectionType.Browser
    sharedModifier: BrowserSectionModifier  # type: ignore
    unsharedKeys: BrowserSectionImplFields  # type: ignore


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
    unsharedKeys: BaseParamCodeObjImplFields  # type: ignore


class BaseChildlessCodeObjCore(BaseParamCodeObjCore):
    type: Any
    sharedModifier: BaseChildlessCodeObjModifier  # type: ignore
    unsharedKeys: BaseChildlessCodeObjImplFields  # type: ignore


class BaseParentCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParentCodeObjModifier  # type: ignore
    unsharedKeys: BaseParentCodeObjImplFields  # type: ignore


class CodeCallableCodeObjCore(BaseParentCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjModifier  # type: ignore
    unsharedKeys: CodeCallableCodeObjImplFields  # type: ignore


class CodeParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjModifier  # type: ignore
    unsharedKeys: CodeParamCodeObjImplFields  # type: ignore


class TextParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjModifier  # type: ignore
    unsharedKeys: TextParamCodeObjImplFields  # type: ignore


class SliderParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjModifier  # type: ignore
    unsharedKeys: SliderParamCodeObjImplFields  # type: ignore


class SwitchParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjModifier  # type: ignore
    unsharedKeys: SwitchParamCodeObjImplFields  # type: ignore


class ColorPickerParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjModifier  # type: ignore
    unsharedKeys: ColorPickerParamCodeObjImplFields  # type: ignore


class DropdownParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjModifier  # type: ignore
    unsharedKeys: DropdownParamCodeObjImplFields  # type: ignore


class PasswordParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjModifier  # type: ignore
    unsharedKeys: PasswordParamCodeObjImplFields  # type: ignore


class NestedParamCodeObjCore(BaseParamCodeObjCore, BaseParentCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjModifier  # type: ignore
    unsharedKeys: NestedParamCodeObjImplFields  # type: ignore

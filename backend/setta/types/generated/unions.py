from typing import Annotated

from pydantic import Field, TypeAdapter
from setta.types.artifact import (
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    FileArtifact,
    ImageArtifact,
)
from setta.types.code_obj_impls import (
    ButtonParamCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DateParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    DropzoneParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    RotaryParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextAreaParamCodeObjImpl,
    TextParamCodeObjImpl,
    TimeParamCodeObjImpl,
)
from setta.types.section_impls import (
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    CodeSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    GenPythonMetadataSectionImpl,
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    IFrameSectionImpl,
    ImageSectionImpl,
    ListRootSectionImpl,
    MetaControlSectionImpl,
    PluginSectionImpl,
    PromptSectionImpl,
    SocialSectionImpl,
    SpreadsheetSectionImpl,
    StateMachineEndSectionImpl,
    StateMachineGateSectionImpl,
    StateMachineStartSectionImpl,
    TaskBoardSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)

BaseSectionImplUnion = (
    CallableSectionImpl
    | DictSectionImpl
    | ListRootSectionImpl
    | GroupSectionImpl
    | StateMachineStartSectionImpl
    | StateMachineGateSectionImpl
    | StateMachineEndSectionImpl
    | ImageSectionImpl
    | ChartSectionImpl
    | DrawSectionImpl
    | TextBlockSectionImpl
    | PromptSectionImpl
    | MetaControlSectionImpl
    | SocialSectionImpl
    | GlobalVariablesSectionImpl
    | CodeSectionImpl
    | GenPythonCodeSectionImpl
    | GenPythonMetadataSectionImpl
    | TerminalSectionImpl
    | IFrameSectionImpl
    | ChatSectionImpl
    | BrowserSectionImpl
    | PluginSectionImpl
    | TaskBoardSectionImpl
    | SpreadsheetSectionImpl
)

BaseSectionImplUnionWithDiscriminator = Annotated[
    BaseSectionImplUnion, Field(discriminator="type")
]


BaseCodeObjImplUnion = (
    CodeCallableCodeObjImpl
    | CodeParamCodeObjImpl
    | TextParamCodeObjImpl
    | DateParamCodeObjImpl
    | TimeParamCodeObjImpl
    | ButtonParamCodeObjImpl
    | SliderParamCodeObjImpl
    | RotaryParamCodeObjImpl
    | SwitchParamCodeObjImpl
    | ColorPickerParamCodeObjImpl
    | DropdownParamCodeObjImpl
    | PasswordParamCodeObjImpl
    | TextAreaParamCodeObjImpl
    | DropzoneParamCodeObjImpl
    | NestedParamCodeObjImpl
)

BaseCodeObjImplUnionWithDiscriminator = Annotated[
    BaseCodeObjImplUnion, Field(discriminator="type")
]


BaseArtifactUnion = (
    ImageArtifact
    | BrushStrokeArtifact
    | DrawAreaLayerItemTransformArtifact
    | ChartDataArtifact
    | FileArtifact
)

BaseArtifactUnionWithDiscriminator = Annotated[
    BaseArtifactUnion, Field(discriminator="type")
]

BaseArtifactTypeAdapter = TypeAdapter(BaseArtifactUnionWithDiscriminator)

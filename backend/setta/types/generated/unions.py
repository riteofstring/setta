from typing import Annotated

from pydantic import Field, TypeAdapter

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

BaseSectionWithParamsImplUnion = (
    CallableSectionImpl | DictSectionImpl | GlobalVariablesSectionImpl
)

BaseCanvasSectionImplUnion = ChartSectionImpl | DrawSectionImpl

BaseParentSectionImplUnion = (
    ListRootSectionImpl
    | GroupSectionImpl
    | CodeSectionImpl
    | GenPythonCodeSectionImpl
    | GenPythonMetadataSectionImpl
)

BaseCodeSectionImplUnion = (
    CodeSectionImpl | GenPythonCodeSectionImpl | GenPythonMetadataSectionImpl
)

BaseDictSectionImplUnion = DictSectionImpl | GlobalVariablesSectionImpl

from typing import Annotated

from pydantic import Field

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

BaseParamCodeObjImplUnion = (
    CodeParamCodeObjImpl
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

BaseChildlessCodeObjImplUnion = (
    CodeParamCodeObjImpl
    | TextParamCodeObjImpl
    | DateParamCodeObjImpl
    | TimeParamCodeObjImpl
    | SliderParamCodeObjImpl
    | RotaryParamCodeObjImpl
    | SwitchParamCodeObjImpl
    | ColorPickerParamCodeObjImpl
    | DropdownParamCodeObjImpl
    | PasswordParamCodeObjImpl
    | TextAreaParamCodeObjImpl
    | DropzoneParamCodeObjImpl
)

BaseParentCodeObjImplUnion = CodeCallableCodeObjImpl | NestedParamCodeObjImpl

from typing import Annotated

from pydantic import Field

from setta.types.generated.impl_args_as_typed_dicts import (
    BrowserSectionImplArgs,
    CallableSectionImplArgs,
    ChartSectionImplArgs,
    ChatSectionImplArgs,
    CodeSectionImplArgs,
    DictSectionImplArgs,
    DrawSectionImplArgs,
    GenPythonCodeSectionImplArgs,
    GenPythonMetadataSectionImplArgs,
    GlobalVariablesSectionImplArgs,
    GroupSectionImplArgs,
    IFrameSectionImplArgs,
    ImageSectionImplArgs,
    ListRootSectionImplArgs,
    MetaControlSectionImplArgs,
    PluginSectionImplArgs,
    PromptSectionImplArgs,
    SocialSectionImplArgs,
    SpreadsheetSectionImplArgs,
    StateMachineEndSectionImplArgs,
    StateMachineGateSectionImplArgs,
    StateMachineStartSectionImplArgs,
    TaskBoardSectionImplArgs,
    TerminalSectionImplArgs,
    TextBlockSectionImplArgs,
)

BaseSectionImplArgsUnion = (
    CallableSectionImplArgs
    | DictSectionImplArgs
    | ListRootSectionImplArgs
    | GroupSectionImplArgs
    | StateMachineStartSectionImplArgs
    | StateMachineGateSectionImplArgs
    | StateMachineEndSectionImplArgs
    | ImageSectionImplArgs
    | ChartSectionImplArgs
    | DrawSectionImplArgs
    | TextBlockSectionImplArgs
    | PromptSectionImplArgs
    | MetaControlSectionImplArgs
    | SocialSectionImplArgs
    | GlobalVariablesSectionImplArgs
    | CodeSectionImplArgs
    | GenPythonCodeSectionImplArgs
    | GenPythonMetadataSectionImplArgs
    | TerminalSectionImplArgs
    | IFrameSectionImplArgs
    | ChatSectionImplArgs
    | BrowserSectionImplArgs
    | PluginSectionImplArgs
    | TaskBoardSectionImplArgs
    | SpreadsheetSectionImplArgs
)

BaseSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseSectionImplArgsUnion, Field(discriminator="type")
]

from typing import Annotated

from pydantic import Field

from setta.types.artifact import (
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    FileArtifact,
    ImageArtifact,
)

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

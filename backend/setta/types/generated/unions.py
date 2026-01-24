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
    SocialSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)

BaseSectionImplUnion = (
    CallableSectionImpl
    | DictSectionImpl
    | ListRootSectionImpl
    | GroupSectionImpl
    | ImageSectionImpl
    | ChartSectionImpl
    | DrawSectionImpl
    | TextBlockSectionImpl
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
)

BaseSectionImplUnionWithDiscriminator = Annotated[
    BaseSectionImplUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplUnion = (
    CallableSectionImpl | DictSectionImpl | GlobalVariablesSectionImpl
)

BaseCanvasSectionImplUnion = ChartSectionImpl | DrawSectionImpl

BaseCodeSectionImplUnion = (
    CodeSectionImpl | GenPythonCodeSectionImpl | GenPythonMetadataSectionImpl
)

BaseParentSectionImplUnion = ListRootSectionImpl | GroupSectionImpl

BaseDictSectionImplUnion = DictSectionImpl | GlobalVariablesSectionImpl

BaseDictSectionImplUnionWithDiscriminator = Annotated[
    BaseDictSectionImplUnion, Field(discriminator="type")
]

from typing import Annotated

from pydantic import Field

from setta.types.code_obj_impls import (
    ButtonParamCodeObjImpl,
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    DropzoneParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    RotaryParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextAreaParamCodeObjImpl,
    TextParamCodeObjImpl,
)

BaseCodeObjImplUnion = (
    CodeCallableCodeObjImpl
    | CodeParamCodeObjImpl
    | TextParamCodeObjImpl
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
    SocialSectionImplArgs,
    TerminalSectionImplArgs,
    TextBlockSectionImplArgs,
)

BaseSectionImplArgsUnion = (
    CallableSectionImplArgs
    | DictSectionImplArgs
    | ListRootSectionImplArgs
    | GroupSectionImplArgs
    | ImageSectionImplArgs
    | ChartSectionImplArgs
    | DrawSectionImplArgs
    | TextBlockSectionImplArgs
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

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
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    IFrameSectionImpl,
    ImageSectionImpl,
    ListRootSectionImpl,
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
    | SocialSectionImpl
    | GlobalVariablesSectionImpl
    | CodeSectionImpl
    | GenPythonCodeSectionImpl
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

BaseCodeSectionImplUnion = CodeSectionImpl | GenPythonCodeSectionImpl

BaseParentSectionImplUnion = ListRootSectionImpl | GroupSectionImpl

BaseDictSectionImplUnion = DictSectionImpl | GlobalVariablesSectionImpl

BaseDictSectionImplUnionWithDiscriminator = Annotated[
    BaseDictSectionImplUnion, Field(discriminator="type")
]

from typing import Annotated

from pydantic import Field

from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextParamCodeObjImpl,
)

BaseCodeObjImplUnion = (
    CodeCallableCodeObjImpl
    | CodeParamCodeObjImpl
    | TextParamCodeObjImpl
    | SliderParamCodeObjImpl
    | SwitchParamCodeObjImpl
    | ColorPickerParamCodeObjImpl
    | DropdownParamCodeObjImpl
    | PasswordParamCodeObjImpl
    | NestedParamCodeObjImpl
)

BaseCodeObjImplUnionWithDiscriminator = Annotated[
    BaseCodeObjImplUnion, Field(discriminator="type")
]

BaseParamCodeObjImplUnion = (
    CodeParamCodeObjImpl
    | TextParamCodeObjImpl
    | SliderParamCodeObjImpl
    | SwitchParamCodeObjImpl
    | ColorPickerParamCodeObjImpl
    | DropdownParamCodeObjImpl
    | PasswordParamCodeObjImpl
    | NestedParamCodeObjImpl
)

BaseChildlessCodeObjImplUnion = (
    CodeParamCodeObjImpl
    | TextParamCodeObjImpl
    | SliderParamCodeObjImpl
    | SwitchParamCodeObjImpl
    | ColorPickerParamCodeObjImpl
    | DropdownParamCodeObjImpl
    | PasswordParamCodeObjImpl
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
    GlobalVariablesSectionImplArgs,
    GroupSectionImplArgs,
    IFrameSectionImplArgs,
    ImageSectionImplArgs,
    ListRootSectionImplArgs,
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
    | SocialSectionImplArgs
    | GlobalVariablesSectionImplArgs
    | CodeSectionImplArgs
    | GenPythonCodeSectionImplArgs
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
    ImageArtifact,
)

BaseArtifactUnion = (
    ImageArtifact
    | BrushStrokeArtifact
    | DrawAreaLayerItemTransformArtifact
    | ChartDataArtifact
)

BaseArtifactUnionWithDiscriminator = Annotated[
    BaseArtifactUnion, Field(discriminator="type")
]

BaseArtifactTypeAdapter = TypeAdapter(BaseArtifactUnionWithDiscriminator)

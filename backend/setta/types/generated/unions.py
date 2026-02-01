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
    PromptSectionImpl,
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
)

BaseSectionImplUnionWithDiscriminator = Annotated[
    BaseSectionImplUnion, Field(discriminator="type")
]

BaseSectionImplTypeAdapter = TypeAdapter(BaseSectionImplUnionWithDiscriminator)

BaseSectionImplTypeSet = set(
    [
        "Callable",
        "Dict",
        "ListRoot",
        "Group",
        "Image",
        "Chart",
        "Draw",
        "TextBlock",
        "Prompt",
        "MetaControl",
        "Social",
        "GlobalVariables",
        "Code",
        "GenPythonCode",
        "GenPythonMetadata",
        "Terminal",
        "IFrame",
        "Chat",
        "Browser",
    ]
)

BaseSectionWithParamsImplUnion = (
    CallableSectionImpl | DictSectionImpl | GlobalVariablesSectionImpl
)

BaseSectionWithParamsImplUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsImplUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplTypeAdapter = TypeAdapter(
    BaseSectionWithParamsImplUnionWithDiscriminator
)

BaseSectionWithParamsImplTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseCanvasSectionImplUnion = ChartSectionImpl | DrawSectionImpl

BaseCanvasSectionImplUnionWithDiscriminator = Annotated[
    BaseCanvasSectionImplUnion, Field(discriminator="type")
]

BaseCanvasSectionImplTypeAdapter = TypeAdapter(
    BaseCanvasSectionImplUnionWithDiscriminator
)

BaseCanvasSectionImplTypeSet = set(["Chart", "Draw"])

BaseCodeSectionImplUnion = (
    CodeSectionImpl | GenPythonCodeSectionImpl | GenPythonMetadataSectionImpl
)

BaseCodeSectionImplUnionWithDiscriminator = Annotated[
    BaseCodeSectionImplUnion, Field(discriminator="type")
]

BaseCodeSectionImplTypeAdapter = TypeAdapter(BaseCodeSectionImplUnionWithDiscriminator)

BaseCodeSectionImplTypeSet = set(["Code", "GenPythonCode", "GenPythonMetadata"])

BaseParentSectionImplUnion = ListRootSectionImpl | GroupSectionImpl

BaseParentSectionImplUnionWithDiscriminator = Annotated[
    BaseParentSectionImplUnion, Field(discriminator="type")
]

BaseParentSectionImplTypeAdapter = TypeAdapter(
    BaseParentSectionImplUnionWithDiscriminator
)

BaseParentSectionImplTypeSet = set(["ListRoot", "Group"])

BaseDictSectionImplUnion = DictSectionImpl | GlobalVariablesSectionImpl

BaseDictSectionImplUnionWithDiscriminator = Annotated[
    BaseDictSectionImplUnion, Field(discriminator="type")
]

BaseDictSectionImplTypeAdapter = TypeAdapter(BaseDictSectionImplUnionWithDiscriminator)

BaseDictSectionImplTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated

from pydantic import Field, TypeAdapter

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

BaseCodeObjImplTypeAdapter = TypeAdapter(BaseCodeObjImplUnionWithDiscriminator)

BaseCodeObjImplTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "TextParam",
        "ButtonParam",
        "SliderParam",
        "RotaryParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "TextAreaParam",
        "DropzoneParam",
        "NestedParam",
    ]
)

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

BaseParamCodeObjImplUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplUnion, Field(discriminator="type")
]

BaseParamCodeObjImplTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplUnionWithDiscriminator
)

BaseParamCodeObjImplTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "ButtonParam",
        "SliderParam",
        "RotaryParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "TextAreaParam",
        "DropzoneParam",
        "NestedParam",
    ]
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

BaseChildlessCodeObjImplUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplUnionWithDiscriminator
)

BaseChildlessCodeObjImplTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "RotaryParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "TextAreaParam",
        "DropzoneParam",
    ]
)

BaseParentCodeObjImplUnion = CodeCallableCodeObjImpl | NestedParamCodeObjImpl

BaseParentCodeObjImplUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplUnion, Field(discriminator="type")
]

BaseParentCodeObjImplTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplUnionWithDiscriminator
)

BaseParentCodeObjImplTypeSet = set(["CodeCallable", "NestedParam"])


from typing import Annotated

from pydantic import Field, TypeAdapter

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
    PromptSectionImplArgs,
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
)

BaseSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseSectionImplArgsUnion, Field(discriminator="type")
]

BaseSectionImplArgsTypeAdapter = TypeAdapter(BaseSectionImplArgsUnionWithDiscriminator)

BaseSectionImplArgsTypeSet = set(
    [
        "Callable",
        "Dict",
        "ListRoot",
        "Group",
        "Image",
        "Chart",
        "Draw",
        "TextBlock",
        "Prompt",
        "MetaControl",
        "Social",
        "GlobalVariables",
        "Code",
        "GenPythonCode",
        "GenPythonMetadata",
        "Terminal",
        "IFrame",
        "Chat",
        "Browser",
    ]
)

BaseSectionWithParamsImplArgsUnion = (
    CallableSectionImplArgs | DictSectionImplArgs | GlobalVariablesSectionImplArgs
)

BaseSectionWithParamsImplArgsUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsImplArgsUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplArgsTypeAdapter = TypeAdapter(
    BaseSectionWithParamsImplArgsUnionWithDiscriminator
)

BaseSectionWithParamsImplArgsTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseCanvasSectionImplArgsUnion = ChartSectionImplArgs | DrawSectionImplArgs

BaseCanvasSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseCanvasSectionImplArgsUnion, Field(discriminator="type")
]

BaseCanvasSectionImplArgsTypeAdapter = TypeAdapter(
    BaseCanvasSectionImplArgsUnionWithDiscriminator
)

BaseCanvasSectionImplArgsTypeSet = set(["Chart", "Draw"])

BaseCodeSectionImplArgsUnion = (
    CodeSectionImplArgs
    | GenPythonCodeSectionImplArgs
    | GenPythonMetadataSectionImplArgs
)

BaseCodeSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseCodeSectionImplArgsUnion, Field(discriminator="type")
]

BaseCodeSectionImplArgsTypeAdapter = TypeAdapter(
    BaseCodeSectionImplArgsUnionWithDiscriminator
)

BaseCodeSectionImplArgsTypeSet = set(["Code", "GenPythonCode", "GenPythonMetadata"])

BaseParentSectionImplArgsUnion = ListRootSectionImplArgs | GroupSectionImplArgs

BaseParentSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseParentSectionImplArgsUnion, Field(discriminator="type")
]

BaseParentSectionImplArgsTypeAdapter = TypeAdapter(
    BaseParentSectionImplArgsUnionWithDiscriminator
)

BaseParentSectionImplArgsTypeSet = set(["ListRoot", "Group"])

BaseDictSectionImplArgsUnion = DictSectionImplArgs | GlobalVariablesSectionImplArgs

BaseDictSectionImplArgsUnionWithDiscriminator = Annotated[
    BaseDictSectionImplArgsUnion, Field(discriminator="type")
]

BaseDictSectionImplArgsTypeAdapter = TypeAdapter(
    BaseDictSectionImplArgsUnionWithDiscriminator
)

BaseDictSectionImplArgsTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.generated.impl_args_as_typed_dicts import (
    ButtonParamCodeObjImplArgs,
    CodeCallableCodeObjImplArgs,
    CodeParamCodeObjImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DropdownParamCodeObjImplArgs,
    DropzoneParamCodeObjImplArgs,
    NestedParamCodeObjImplArgs,
    PasswordParamCodeObjImplArgs,
    RotaryParamCodeObjImplArgs,
    SliderParamCodeObjImplArgs,
    SwitchParamCodeObjImplArgs,
    TextAreaParamCodeObjImplArgs,
    TextParamCodeObjImplArgs,
)

BaseCodeObjImplArgsUnion = (
    CodeCallableCodeObjImplArgs
    | CodeParamCodeObjImplArgs
    | TextParamCodeObjImplArgs
    | ButtonParamCodeObjImplArgs
    | SliderParamCodeObjImplArgs
    | RotaryParamCodeObjImplArgs
    | SwitchParamCodeObjImplArgs
    | ColorPickerParamCodeObjImplArgs
    | DropdownParamCodeObjImplArgs
    | PasswordParamCodeObjImplArgs
    | TextAreaParamCodeObjImplArgs
    | DropzoneParamCodeObjImplArgs
    | NestedParamCodeObjImplArgs
)

BaseCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseCodeObjImplArgsTypeAdapter = TypeAdapter(BaseCodeObjImplArgsUnionWithDiscriminator)

BaseCodeObjImplArgsTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "TextParam",
        "ButtonParam",
        "SliderParam",
        "RotaryParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "TextAreaParam",
        "DropzoneParam",
        "NestedParam",
    ]
)

BaseParamCodeObjImplArgsUnion = (
    CodeParamCodeObjImplArgs
    | TextParamCodeObjImplArgs
    | ButtonParamCodeObjImplArgs
    | SliderParamCodeObjImplArgs
    | RotaryParamCodeObjImplArgs
    | SwitchParamCodeObjImplArgs
    | ColorPickerParamCodeObjImplArgs
    | DropdownParamCodeObjImplArgs
    | PasswordParamCodeObjImplArgs
    | TextAreaParamCodeObjImplArgs
    | DropzoneParamCodeObjImplArgs
    | NestedParamCodeObjImplArgs
)

BaseParamCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseParamCodeObjImplArgsTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplArgsUnionWithDiscriminator
)

BaseParamCodeObjImplArgsTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "ButtonParam",
        "SliderParam",
        "RotaryParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "TextAreaParam",
        "DropzoneParam",
        "NestedParam",
    ]
)

BaseChildlessCodeObjImplArgsUnion = (
    CodeParamCodeObjImplArgs
    | TextParamCodeObjImplArgs
    | SliderParamCodeObjImplArgs
    | RotaryParamCodeObjImplArgs
    | SwitchParamCodeObjImplArgs
    | ColorPickerParamCodeObjImplArgs
    | DropdownParamCodeObjImplArgs
    | PasswordParamCodeObjImplArgs
    | TextAreaParamCodeObjImplArgs
    | DropzoneParamCodeObjImplArgs
)

BaseChildlessCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplArgsTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplArgsUnionWithDiscriminator
)

BaseChildlessCodeObjImplArgsTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "RotaryParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "TextAreaParam",
        "DropzoneParam",
    ]
)

BaseParentCodeObjImplArgsUnion = (
    CodeCallableCodeObjImplArgs | NestedParamCodeObjImplArgs
)

BaseParentCodeObjImplArgsUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplArgsUnion, Field(discriminator="type")
]

BaseParentCodeObjImplArgsTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplArgsUnionWithDiscriminator
)

BaseParentCodeObjImplArgsTypeSet = set(["CodeCallable", "NestedParam"])


from typing import Annotated

from pydantic import Field, TypeAdapter

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

BaseArtifactTypeSet = set(
    ["Image", "BrushStroke", "DrawAreaLayerItemTransform", "ChartData", "File"]
)

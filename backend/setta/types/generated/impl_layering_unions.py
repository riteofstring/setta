from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.impl_layerings import (
    BrowserSectionImplLayering,
    CallableSectionImplLayering,
    ChartSectionImplLayering,
    ChatSectionImplLayering,
    CodeSectionImplLayering,
    DictRootSectionImplLayering,
    DictSectionImplLayering,
    DrawSectionImplLayering,
    GenPythonCodeSectionImplLayering,
    GlobalVariablesSectionImplLayering,
    GroupSectionImplLayering,
    IFrameSectionImplLayering,
    ImageSectionImplLayering,
    ListRootSectionImplLayering,
    SocialSectionImplLayering,
    TerminalSectionImplLayering,
    TextBlockSectionImplLayering,
)

BaseSectionImplLayeringUnion = Union[
    BrowserSectionImplLayering,
    CallableSectionImplLayering,
    ChartSectionImplLayering,
    ChatSectionImplLayering,
    CodeSectionImplLayering,
    DictSectionImplLayering,
    DictRootSectionImplLayering,
    DrawSectionImplLayering,
    GenPythonCodeSectionImplLayering,
    GlobalVariablesSectionImplLayering,
    GroupSectionImplLayering,
    IFrameSectionImplLayering,
    ImageSectionImplLayering,
    ListRootSectionImplLayering,
    SocialSectionImplLayering,
    TerminalSectionImplLayering,
    TextBlockSectionImplLayering,
]

BaseSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseSectionImplLayeringUnion, Field(discriminator="type")
]

BaseSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseSectionImplLayeringUnionWithDiscriminator
)

BaseSectionImplLayeringTypeSet = set(
    [
        "Browser",
        "Callable",
        "Chart",
        "Chat",
        "Code",
        "Dict",
        "DictRoot",
        "Draw",
        "GenPythonCode",
        "GlobalVariables",
        "Group",
        "IFrame",
        "Image",
        "ListRoot",
        "Social",
        "Terminal",
        "TextBlock",
    ]
)

BaseSectionWithParamsImplLayeringUnion = Union[
    CallableSectionImplLayering,
    DictSectionImplLayering,
    GlobalVariablesSectionImplLayering,
]

BaseSectionWithParamsImplLayeringUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsImplLayeringUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplLayeringTypeAdapter = TypeAdapter(
    BaseSectionWithParamsImplLayeringUnionWithDiscriminator
)

BaseSectionWithParamsImplLayeringTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionImplLayeringUnion = Union[
    ChartSectionImplLayering, DrawSectionImplLayering, ImageSectionImplLayering
]

BaseArtifactSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseArtifactSectionImplLayeringUnion, Field(discriminator="type")
]

BaseArtifactSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseArtifactSectionImplLayeringUnionWithDiscriminator
)

BaseArtifactSectionImplLayeringTypeSet = set(["Chart", "Draw", "Image"])

BaseCanvasSectionImplLayeringUnion = Union[
    ChartSectionImplLayering, DrawSectionImplLayering
]

BaseCanvasSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseCanvasSectionImplLayeringUnion, Field(discriminator="type")
]

BaseCanvasSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseCanvasSectionImplLayeringUnionWithDiscriminator
)

BaseCanvasSectionImplLayeringTypeSet = set(["Chart", "Draw"])

BaseCodeSectionImplLayeringUnion = Union[
    CodeSectionImplLayering, GenPythonCodeSectionImplLayering
]

BaseCodeSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseCodeSectionImplLayeringUnion, Field(discriminator="type")
]

BaseCodeSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseCodeSectionImplLayeringUnionWithDiscriminator
)

BaseCodeSectionImplLayeringTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionImplLayeringUnion = Union[
    DictRootSectionImplLayering, GroupSectionImplLayering, ListRootSectionImplLayering
]

BaseParentSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseParentSectionImplLayeringUnion, Field(discriminator="type")
]

BaseParentSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseParentSectionImplLayeringUnionWithDiscriminator
)

BaseParentSectionImplLayeringTypeSet = set(["DictRoot", "Group", "ListRoot"])

BaseDictSectionImplLayeringUnion = Union[
    DictSectionImplLayering, GlobalVariablesSectionImplLayering
]

BaseDictSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseDictSectionImplLayeringUnion, Field(discriminator="type")
]

BaseDictSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseDictSectionImplLayeringUnionWithDiscriminator
)

BaseDictSectionImplLayeringTypeSet = set(["Dict", "GlobalVariables"])

from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.impl_layerings import (
    CodeCallableCodeObjImplLayering,
    CodeParamCodeObjImplLayering,
    ColorPickerParamCodeObjImplLayering,
    DropdownParamCodeObjImplLayering,
    NestedParamCodeObjImplLayering,
    PasswordParamCodeObjImplLayering,
    SliderParamCodeObjImplLayering,
    SwitchParamCodeObjImplLayering,
    TextParamCodeObjImplLayering,
)

BaseCodeObjImplLayeringUnion = Union[
    CodeCallableCodeObjImplLayering,
    CodeParamCodeObjImplLayering,
    ColorPickerParamCodeObjImplLayering,
    DropdownParamCodeObjImplLayering,
    NestedParamCodeObjImplLayering,
    PasswordParamCodeObjImplLayering,
    SliderParamCodeObjImplLayering,
    SwitchParamCodeObjImplLayering,
    TextParamCodeObjImplLayering,
]

BaseCodeObjImplLayeringUnionWithDiscriminator = Annotated[
    BaseCodeObjImplLayeringUnion, Field(discriminator="type")
]

BaseCodeObjImplLayeringTypeAdapter = TypeAdapter(
    BaseCodeObjImplLayeringUnionWithDiscriminator
)

BaseCodeObjImplLayeringTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "ColorPickerParam",
        "DropdownParam",
        "NestedParam",
        "PasswordParam",
        "SliderParam",
        "SwitchParam",
        "TextParam",
    ]
)

BaseParamCodeObjImplLayeringUnion = Union[
    CodeParamCodeObjImplLayering,
    ColorPickerParamCodeObjImplLayering,
    DropdownParamCodeObjImplLayering,
    NestedParamCodeObjImplLayering,
    PasswordParamCodeObjImplLayering,
    SliderParamCodeObjImplLayering,
    SwitchParamCodeObjImplLayering,
    TextParamCodeObjImplLayering,
]

BaseParamCodeObjImplLayeringUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplLayeringUnion, Field(discriminator="type")
]

BaseParamCodeObjImplLayeringTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplLayeringUnionWithDiscriminator
)

BaseParamCodeObjImplLayeringTypeSet = set(
    [
        "CodeParam",
        "ColorPickerParam",
        "DropdownParam",
        "NestedParam",
        "PasswordParam",
        "SliderParam",
        "SwitchParam",
        "TextParam",
    ]
)

BaseChildlessCodeObjImplLayeringUnion = Union[
    CodeParamCodeObjImplLayering,
    ColorPickerParamCodeObjImplLayering,
    DropdownParamCodeObjImplLayering,
    PasswordParamCodeObjImplLayering,
    SliderParamCodeObjImplLayering,
    SwitchParamCodeObjImplLayering,
    TextParamCodeObjImplLayering,
]

BaseChildlessCodeObjImplLayeringUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplLayeringUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplLayeringTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplLayeringUnionWithDiscriminator
)

BaseChildlessCodeObjImplLayeringTypeSet = set(
    [
        "CodeParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "SliderParam",
        "SwitchParam",
        "TextParam",
    ]
)

BaseParentCodeObjImplLayeringUnion = Union[
    CodeCallableCodeObjImplLayering, NestedParamCodeObjImplLayering
]

BaseParentCodeObjImplLayeringUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplLayeringUnion, Field(discriminator="type")
]

BaseParentCodeObjImplLayeringTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplLayeringUnionWithDiscriminator
)

BaseParentCodeObjImplLayeringTypeSet = set(["CodeCallable", "NestedParam"])

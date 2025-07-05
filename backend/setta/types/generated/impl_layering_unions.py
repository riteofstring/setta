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
    CallableSectionImplLayering,
    DictSectionImplLayering,
    ListRootSectionImplLayering,
    DictRootSectionImplLayering,
    GroupSectionImplLayering,
    ImageSectionImplLayering,
    ChartSectionImplLayering,
    DrawSectionImplLayering,
    TextBlockSectionImplLayering,
    SocialSectionImplLayering,
    GlobalVariablesSectionImplLayering,
    CodeSectionImplLayering,
    GenPythonCodeSectionImplLayering,
    TerminalSectionImplLayering,
    IFrameSectionImplLayering,
    ChatSectionImplLayering,
    BrowserSectionImplLayering,
]

BaseSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseSectionImplLayeringUnion, Field(discriminator="type")
]

BaseSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseSectionImplLayeringUnionWithDiscriminator
)

BaseSectionImplLayeringTypeSet = set(
    [
        "Callable",
        "Dict",
        "ListRoot",
        "DictRoot",
        "Group",
        "Image",
        "Chart",
        "Draw",
        "TextBlock",
        "Social",
        "GlobalVariables",
        "Code",
        "GenPythonCode",
        "Terminal",
        "IFrame",
        "Chat",
        "Browser",
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
    ImageSectionImplLayering, ChartSectionImplLayering, DrawSectionImplLayering
]

BaseArtifactSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseArtifactSectionImplLayeringUnion, Field(discriminator="type")
]

BaseArtifactSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseArtifactSectionImplLayeringUnionWithDiscriminator
)

BaseArtifactSectionImplLayeringTypeSet = set(["Image", "Chart", "Draw"])

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
    ListRootSectionImplLayering, DictRootSectionImplLayering, GroupSectionImplLayering
]

BaseParentSectionImplLayeringUnionWithDiscriminator = Annotated[
    BaseParentSectionImplLayeringUnion, Field(discriminator="type")
]

BaseParentSectionImplLayeringTypeAdapter = TypeAdapter(
    BaseParentSectionImplLayeringUnionWithDiscriminator
)

BaseParentSectionImplLayeringTypeSet = set(["ListRoot", "DictRoot", "Group"])

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
    TextParamCodeObjImplLayering,
    SliderParamCodeObjImplLayering,
    SwitchParamCodeObjImplLayering,
    ColorPickerParamCodeObjImplLayering,
    DropdownParamCodeObjImplLayering,
    PasswordParamCodeObjImplLayering,
    NestedParamCodeObjImplLayering,
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
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseParamCodeObjImplLayeringUnion = Union[
    CodeParamCodeObjImplLayering,
    TextParamCodeObjImplLayering,
    SliderParamCodeObjImplLayering,
    SwitchParamCodeObjImplLayering,
    ColorPickerParamCodeObjImplLayering,
    DropdownParamCodeObjImplLayering,
    PasswordParamCodeObjImplLayering,
    NestedParamCodeObjImplLayering,
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
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseChildlessCodeObjImplLayeringUnion = Union[
    CodeParamCodeObjImplLayering,
    TextParamCodeObjImplLayering,
    SliderParamCodeObjImplLayering,
    SwitchParamCodeObjImplLayering,
    ColorPickerParamCodeObjImplLayering,
    DropdownParamCodeObjImplLayering,
    PasswordParamCodeObjImplLayering,
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
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
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

from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.layerings import (
    BrowserSectionLayering,
    CallableSectionLayering,
    ChartSectionLayering,
    ChatSectionLayering,
    CodeSectionLayering,
    DictRootSectionLayering,
    DictSectionLayering,
    DrawSectionLayering,
    GenPythonCodeSectionLayering,
    GlobalVariablesSectionLayering,
    GroupSectionLayering,
    IFrameSectionLayering,
    ImageSectionLayering,
    ListRootSectionLayering,
    SocialSectionLayering,
    TerminalSectionLayering,
    TextBlockSectionLayering,
)

BaseSectionLayeringUnion = Union[
    CallableSectionLayering,
    DictSectionLayering,
    ListRootSectionLayering,
    DictRootSectionLayering,
    GroupSectionLayering,
    ImageSectionLayering,
    ChartSectionLayering,
    DrawSectionLayering,
    TextBlockSectionLayering,
    SocialSectionLayering,
    GlobalVariablesSectionLayering,
    CodeSectionLayering,
    GenPythonCodeSectionLayering,
    TerminalSectionLayering,
    IFrameSectionLayering,
    ChatSectionLayering,
    BrowserSectionLayering,
]

BaseSectionLayeringUnionWithDiscriminator = Annotated[
    BaseSectionLayeringUnion, Field(discriminator="type")
]

BaseSectionLayeringTypeAdapter = TypeAdapter(BaseSectionLayeringUnionWithDiscriminator)

BaseSectionLayeringTypeSet = set(
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

BaseSectionWithParamsLayeringUnion = Union[
    CallableSectionLayering, DictSectionLayering, GlobalVariablesSectionLayering
]

BaseSectionWithParamsLayeringUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsLayeringUnion, Field(discriminator="type")
]

BaseSectionWithParamsLayeringTypeAdapter = TypeAdapter(
    BaseSectionWithParamsLayeringUnionWithDiscriminator
)

BaseSectionWithParamsLayeringTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionLayeringUnion = Union[
    ImageSectionLayering, ChartSectionLayering, DrawSectionLayering
]

BaseArtifactSectionLayeringUnionWithDiscriminator = Annotated[
    BaseArtifactSectionLayeringUnion, Field(discriminator="type")
]

BaseArtifactSectionLayeringTypeAdapter = TypeAdapter(
    BaseArtifactSectionLayeringUnionWithDiscriminator
)

BaseArtifactSectionLayeringTypeSet = set(["Image", "Chart", "Draw"])

BaseCanvasSectionLayeringUnion = Union[ChartSectionLayering, DrawSectionLayering]

BaseCanvasSectionLayeringUnionWithDiscriminator = Annotated[
    BaseCanvasSectionLayeringUnion, Field(discriminator="type")
]

BaseCanvasSectionLayeringTypeAdapter = TypeAdapter(
    BaseCanvasSectionLayeringUnionWithDiscriminator
)

BaseCanvasSectionLayeringTypeSet = set(["Chart", "Draw"])

BaseCodeSectionLayeringUnion = Union[CodeSectionLayering, GenPythonCodeSectionLayering]

BaseCodeSectionLayeringUnionWithDiscriminator = Annotated[
    BaseCodeSectionLayeringUnion, Field(discriminator="type")
]

BaseCodeSectionLayeringTypeAdapter = TypeAdapter(
    BaseCodeSectionLayeringUnionWithDiscriminator
)

BaseCodeSectionLayeringTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionLayeringUnion = Union[
    ListRootSectionLayering, DictRootSectionLayering, GroupSectionLayering
]

BaseParentSectionLayeringUnionWithDiscriminator = Annotated[
    BaseParentSectionLayeringUnion, Field(discriminator="type")
]

BaseParentSectionLayeringTypeAdapter = TypeAdapter(
    BaseParentSectionLayeringUnionWithDiscriminator
)

BaseParentSectionLayeringTypeSet = set(["ListRoot", "DictRoot", "Group"])

BaseDictSectionLayeringUnion = Union[
    DictSectionLayering, GlobalVariablesSectionLayering
]

BaseDictSectionLayeringUnionWithDiscriminator = Annotated[
    BaseDictSectionLayeringUnion, Field(discriminator="type")
]

BaseDictSectionLayeringTypeAdapter = TypeAdapter(
    BaseDictSectionLayeringUnionWithDiscriminator
)

BaseDictSectionLayeringTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.generated.layerings import (
    CodeCallableCodeObjLayering,
    CodeParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    NestedParamCodeObjLayering,
    PasswordParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    TextParamCodeObjLayering,
)

BaseCodeObjLayeringUnion = Union[
    CodeCallableCodeObjLayering,
    CodeParamCodeObjLayering,
    TextParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    PasswordParamCodeObjLayering,
    NestedParamCodeObjLayering,
]

BaseCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseCodeObjLayeringUnion, Field(discriminator="type")
]

BaseCodeObjLayeringTypeAdapter = TypeAdapter(BaseCodeObjLayeringUnionWithDiscriminator)

BaseCodeObjLayeringTypeSet = set(
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

BaseParamCodeObjLayeringUnion = Union[
    CodeParamCodeObjLayering,
    TextParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    PasswordParamCodeObjLayering,
    NestedParamCodeObjLayering,
]

BaseParamCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseParamCodeObjLayeringUnion, Field(discriminator="type")
]

BaseParamCodeObjLayeringTypeAdapter = TypeAdapter(
    BaseParamCodeObjLayeringUnionWithDiscriminator
)

BaseParamCodeObjLayeringTypeSet = set(
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

BaseChildlessCodeObjLayeringUnion = Union[
    CodeParamCodeObjLayering,
    TextParamCodeObjLayering,
    SliderParamCodeObjLayering,
    SwitchParamCodeObjLayering,
    ColorPickerParamCodeObjLayering,
    DropdownParamCodeObjLayering,
    PasswordParamCodeObjLayering,
]

BaseChildlessCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjLayeringUnion, Field(discriminator="type")
]

BaseChildlessCodeObjLayeringTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjLayeringUnionWithDiscriminator
)

BaseChildlessCodeObjLayeringTypeSet = set(
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

BaseParentCodeObjLayeringUnion = Union[
    CodeCallableCodeObjLayering, NestedParamCodeObjLayering
]

BaseParentCodeObjLayeringUnionWithDiscriminator = Annotated[
    BaseParentCodeObjLayeringUnion, Field(discriminator="type")
]

BaseParentCodeObjLayeringTypeAdapter = TypeAdapter(
    BaseParentCodeObjLayeringUnionWithDiscriminator
)

BaseParentCodeObjLayeringTypeSet = set(["CodeCallable", "NestedParam"])

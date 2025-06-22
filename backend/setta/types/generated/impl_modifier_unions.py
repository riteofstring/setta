from typing import Annotated, TypeGuard, Union

from pydantic import Field, TypeAdapter
from setta.types.generated.impl_modifiers import (
    BaseArtifactSectionImplModifier,
    BaseCanvasSectionImplModifier,
    BaseCodeSectionImplModifier,
    BaseDictSectionImplModifier,
    BaseParentSectionImplModifier,
    BaseSectionImplModifier,
    BaseSectionWithParamsImplModifier,
    BrowserSectionImplModifier,
    CallableSectionImplModifier,
    ChartSectionImplModifier,
    ChatSectionImplModifier,
    CodeSectionImplModifier,
    DictRootSectionImplModifier,
    DictSectionImplModifier,
    DrawSectionImplModifier,
    GenPythonCodeSectionImplModifier,
    GlobalVariablesSectionImplModifier,
    GroupSectionImplModifier,
    IFrameSectionImplModifier,
    ImageSectionImplModifier,
    ListRootSectionImplModifier,
    SocialSectionImplModifier,
    TerminalSectionImplModifier,
    TextBlockSectionImplModifier,
)

BaseSectionImplModifierUnion = Union[
    CallableSectionImplModifier,
    DictSectionImplModifier,
    ListRootSectionImplModifier,
    DictRootSectionImplModifier,
    GroupSectionImplModifier,
    ImageSectionImplModifier,
    ChartSectionImplModifier,
    DrawSectionImplModifier,
    TextBlockSectionImplModifier,
    SocialSectionImplModifier,
    GlobalVariablesSectionImplModifier,
    CodeSectionImplModifier,
    GenPythonCodeSectionImplModifier,
    TerminalSectionImplModifier,
    IFrameSectionImplModifier,
    ChatSectionImplModifier,
    BrowserSectionImplModifier,
]

BaseSectionImplModifierUnionWithDiscriminator = Annotated[
    BaseSectionImplModifierUnion, Field(discriminator="type")
]

BaseSectionImplModifierTypeAdapter = TypeAdapter(
    BaseSectionImplModifierUnionWithDiscriminator
)

BaseSectionImplModifierTypeSet = set(
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

BaseSectionWithParamsImplModifierUnion = Union[
    CallableSectionImplModifier,
    DictSectionImplModifier,
    GlobalVariablesSectionImplModifier,
]

BaseSectionWithParamsImplModifierUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsImplModifierUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplModifierTypeAdapter = TypeAdapter(
    BaseSectionWithParamsImplModifierUnionWithDiscriminator
)

BaseSectionWithParamsImplModifierTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionImplModifierUnion = Union[
    ImageSectionImplModifier, ChartSectionImplModifier, DrawSectionImplModifier
]

BaseArtifactSectionImplModifierUnionWithDiscriminator = Annotated[
    BaseArtifactSectionImplModifierUnion, Field(discriminator="type")
]

BaseArtifactSectionImplModifierTypeAdapter = TypeAdapter(
    BaseArtifactSectionImplModifierUnionWithDiscriminator
)

BaseArtifactSectionImplModifierTypeSet = set(["Image", "Chart", "Draw"])

BaseCanvasSectionImplModifierUnion = Union[
    ChartSectionImplModifier, DrawSectionImplModifier
]

BaseCanvasSectionImplModifierUnionWithDiscriminator = Annotated[
    BaseCanvasSectionImplModifierUnion, Field(discriminator="type")
]

BaseCanvasSectionImplModifierTypeAdapter = TypeAdapter(
    BaseCanvasSectionImplModifierUnionWithDiscriminator
)

BaseCanvasSectionImplModifierTypeSet = set(["Chart", "Draw"])

BaseCodeSectionImplModifierUnion = Union[
    CodeSectionImplModifier, GenPythonCodeSectionImplModifier
]

BaseCodeSectionImplModifierUnionWithDiscriminator = Annotated[
    BaseCodeSectionImplModifierUnion, Field(discriminator="type")
]

BaseCodeSectionImplModifierTypeAdapter = TypeAdapter(
    BaseCodeSectionImplModifierUnionWithDiscriminator
)

BaseCodeSectionImplModifierTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionImplModifierUnion = Union[
    ListRootSectionImplModifier, DictRootSectionImplModifier, GroupSectionImplModifier
]

BaseParentSectionImplModifierUnionWithDiscriminator = Annotated[
    BaseParentSectionImplModifierUnion, Field(discriminator="type")
]

BaseParentSectionImplModifierTypeAdapter = TypeAdapter(
    BaseParentSectionImplModifierUnionWithDiscriminator
)

BaseParentSectionImplModifierTypeSet = set(["ListRoot", "DictRoot", "Group"])

BaseDictSectionImplModifierUnion = Union[
    DictSectionImplModifier, GlobalVariablesSectionImplModifier
]

BaseDictSectionImplModifierUnionWithDiscriminator = Annotated[
    BaseDictSectionImplModifierUnion, Field(discriminator="type")
]

BaseDictSectionImplModifierTypeAdapter = TypeAdapter(
    BaseDictSectionImplModifierUnionWithDiscriminator
)

BaseDictSectionImplModifierTypeSet = set(["Dict", "GlobalVariables"])


from typing import Annotated, Union

from pydantic import Field, TypeAdapter
from setta.types.generated.impl_modifiers import (
    BaseChildlessCodeObjImplModifier,
    BaseCodeObjImplModifier,
    BaseParamCodeObjImplModifier,
    BaseParentCodeObjImplModifier,
    CodeCallableCodeObjImplModifier,
    CodeParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    NestedParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
)

BaseCodeObjImplModifierUnion = Union[
    CodeCallableCodeObjImplModifier,
    CodeParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    NestedParamCodeObjImplModifier,
]

BaseCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseCodeObjImplModifierUnionWithDiscriminator
)

BaseCodeObjImplModifierTypeSet = set(
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

BaseParamCodeObjImplModifierUnion = Union[
    CodeParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    NestedParamCodeObjImplModifier,
]

BaseParamCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseParamCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplModifierUnionWithDiscriminator
)

BaseParamCodeObjImplModifierTypeSet = set(
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

BaseChildlessCodeObjImplModifierUnion = Union[
    CodeParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
]

BaseChildlessCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplModifierUnionWithDiscriminator
)

BaseChildlessCodeObjImplModifierTypeSet = set(
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

BaseParentCodeObjImplModifierUnion = Union[
    CodeCallableCodeObjImplModifier, NestedParamCodeObjImplModifier
]

BaseParentCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseParentCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplModifierUnionWithDiscriminator
)

BaseParentCodeObjImplModifierTypeSet = set(["CodeCallable", "NestedParam"])


AllImplModifierUnion = BaseSectionImplModifierUnion | BaseCodeObjImplModifierUnion

AllImplModifierUnionTypeAdapter = TypeAdapter(
    Annotated[AllImplModifierUnion, Field(discriminator="type")]
)


def isBaseSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseSectionImplModifier]:
    return x["type"] in BaseSectionImplModifierTypeSet


def isBaseSectionWithParamsImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseSectionWithParamsImplModifier]:
    return x["type"] in BaseSectionWithParamsImplModifierTypeSet


def isBaseArtifactSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseArtifactSectionImplModifier]:
    return x["type"] in BaseArtifactSectionImplModifierTypeSet


def isBaseCanvasSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseCanvasSectionImplModifier]:
    return x["type"] in BaseCanvasSectionImplModifierTypeSet


def isBaseCodeSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseCodeSectionImplModifier]:
    return x["type"] in BaseCodeSectionImplModifierTypeSet


def isBaseParentSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseParentSectionImplModifier]:
    return x["type"] in BaseParentSectionImplModifierTypeSet


def isBaseDictSectionImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseDictSectionImplModifier]:
    return x["type"] in BaseDictSectionImplModifierTypeSet


def isBaseCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseCodeObjImplModifier]:
    return x["type"] in BaseCodeObjImplModifierTypeSet


def isBaseParamCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseParamCodeObjImplModifier]:
    return x["type"] in BaseParamCodeObjImplModifierTypeSet


def isBaseChildlessCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseChildlessCodeObjImplModifier]:
    return x["type"] in BaseChildlessCodeObjImplModifierTypeSet


def isBaseParentCodeObjImplModifier(
    x: AllImplModifierUnion,
) -> TypeGuard[BaseParentCodeObjImplModifier]:
    return x["type"] in BaseParentCodeObjImplModifierTypeSet

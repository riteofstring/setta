from typing import Annotated, TypeGuard, Union

from pydantic import Field, TypeAdapter

from setta.types.section_impl_modifiers import (
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


def isBaseSectionImplModifier(
    x: BaseSectionImplModifier,
) -> TypeGuard[BaseSectionImplModifier]:
    return x["type"] in BaseSectionImplModifierTypeSet


def isBaseSectionWithParamsImplModifier(
    x: BaseSectionImplModifier,
) -> TypeGuard[BaseSectionWithParamsImplModifier]:
    return x["type"] in BaseSectionWithParamsImplModifierTypeSet


def isBaseArtifactSectionImplModifier(
    x: BaseSectionImplModifier,
) -> TypeGuard[BaseArtifactSectionImplModifier]:
    return x["type"] in BaseArtifactSectionImplModifierTypeSet


def isBaseCanvasSectionImplModifier(
    x: BaseSectionImplModifier,
) -> TypeGuard[BaseCanvasSectionImplModifier]:
    return x["type"] in BaseCanvasSectionImplModifierTypeSet


def isBaseCodeSectionImplModifier(
    x: BaseSectionImplModifier,
) -> TypeGuard[BaseCodeSectionImplModifier]:
    return x["type"] in BaseCodeSectionImplModifierTypeSet


def isBaseParentSectionImplModifier(
    x: BaseSectionImplModifier,
) -> TypeGuard[BaseParentSectionImplModifier]:
    return x["type"] in BaseParentSectionImplModifierTypeSet


def isBaseDictSectionImplModifier(
    x: BaseSectionImplModifier,
) -> TypeGuard[BaseDictSectionImplModifier]:
    return x["type"] in BaseDictSectionImplModifierTypeSet

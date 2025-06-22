from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.section_impl_modifiers import (
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

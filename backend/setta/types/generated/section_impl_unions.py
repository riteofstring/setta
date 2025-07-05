from typing import Annotated, Union

from pydantic import Field, TypeAdapter
from setta.types.section_impls import (
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    CodeSectionImpl,
    DictRootSectionImpl,
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

BaseSectionImplUnion = Union[
    CallableSectionImpl,
    DictSectionImpl,
    ListRootSectionImpl,
    DictRootSectionImpl,
    GroupSectionImpl,
    ImageSectionImpl,
    ChartSectionImpl,
    DrawSectionImpl,
    TextBlockSectionImpl,
    SocialSectionImpl,
    GlobalVariablesSectionImpl,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
    TerminalSectionImpl,
    IFrameSectionImpl,
    ChatSectionImpl,
    BrowserSectionImpl,
]

BaseSectionImplUnionWithDiscriminator = Annotated[
    BaseSectionImplUnion, Field(discriminator="type")
]

BaseSectionImplUnionTypeAdapter = TypeAdapter(BaseSectionImplUnionWithDiscriminator)

BaseSectionImplUnionTypeSet = set(
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


BaseSectionWithParamsImplUnion = Union[
    CallableSectionImpl, DictSectionImpl, GlobalVariablesSectionImpl
]

BaseSectionWithParamsImplUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsImplUnion, Field(discriminator="type")
]

BaseSectionWithParamsImplUnionTypeAdapter = TypeAdapter(
    BaseSectionWithParamsImplUnionWithDiscriminator
)

BaseSectionWithParamsImplUnionTypeSet = set(["Callable", "Dict", "GlobalVariables"])


BaseArtifactSectionImplUnion = Union[
    ImageSectionImpl, ChartSectionImpl, DrawSectionImpl
]

BaseArtifactSectionImplUnionWithDiscriminator = Annotated[
    BaseArtifactSectionImplUnion, Field(discriminator="type")
]

BaseArtifactSectionImplUnionTypeAdapter = TypeAdapter(
    BaseArtifactSectionImplUnionWithDiscriminator
)

BaseArtifactSectionImplUnionTypeSet = set(["Image", "Chart", "Draw"])


BaseCanvasSectionImplUnion = Union[ChartSectionImpl, DrawSectionImpl]

BaseCanvasSectionImplUnionWithDiscriminator = Annotated[
    BaseCanvasSectionImplUnion, Field(discriminator="type")
]

BaseCanvasSectionImplUnionTypeAdapter = TypeAdapter(
    BaseCanvasSectionImplUnionWithDiscriminator
)

BaseCanvasSectionImplUnionTypeSet = set(["Chart", "Draw"])


BaseCodeSectionImplUnion = Union[CodeSectionImpl, GenPythonCodeSectionImpl]

BaseCodeSectionImplUnionWithDiscriminator = Annotated[
    BaseCodeSectionImplUnion, Field(discriminator="type")
]

BaseCodeSectionImplUnionTypeAdapter = TypeAdapter(
    BaseCodeSectionImplUnionWithDiscriminator
)

BaseCodeSectionImplUnionTypeSet = set(["Code", "GenPythonCode"])


BaseParentSectionImplUnion = Union[
    ListRootSectionImpl, DictRootSectionImpl, GroupSectionImpl
]

BaseParentSectionImplUnionWithDiscriminator = Annotated[
    BaseParentSectionImplUnion, Field(discriminator="type")
]

BaseParentSectionImplUnionTypeAdapter = TypeAdapter(
    BaseParentSectionImplUnionWithDiscriminator
)

BaseParentSectionImplUnionTypeSet = set(["ListRoot", "DictRoot", "Group"])


BaseDictSectionImplUnion = Union[DictSectionImpl, GlobalVariablesSectionImpl]

BaseDictSectionImplUnionWithDiscriminator = Annotated[
    BaseDictSectionImplUnion, Field(discriminator="type")
]

BaseDictSectionImplUnionTypeAdapter = TypeAdapter(
    BaseDictSectionImplUnionWithDiscriminator
)

BaseDictSectionImplUnionTypeSet = set(["Dict", "GlobalVariables"])

from typing import Annotated, Union

from pydantic import Field, TypeAdapter
from setta.types.generated.section_cores import (
    BrowserSectionCore,
    CallableSectionCore,
    ChartSectionCore,
    ChatSectionCore,
    CodeSectionCore,
    DictRootSectionCore,
    DictSectionCore,
    DrawSectionCore,
    GenPythonCodeSectionCore,
    GlobalVariablesSectionCore,
    GroupSectionCore,
    IFrameSectionCore,
    ImageSectionCore,
    ListRootSectionCore,
    SocialSectionCore,
    TerminalSectionCore,
    TextBlockSectionCore,
)

BaseSectionCoreUnion = Union[
    CallableSectionCore,
    DictSectionCore,
    ListRootSectionCore,
    DictRootSectionCore,
    GroupSectionCore,
    ImageSectionCore,
    ChartSectionCore,
    DrawSectionCore,
    TextBlockSectionCore,
    SocialSectionCore,
    GlobalVariablesSectionCore,
    CodeSectionCore,
    GenPythonCodeSectionCore,
    TerminalSectionCore,
    IFrameSectionCore,
    ChatSectionCore,
    BrowserSectionCore,
]

BaseSectionCoreUnionWithDiscriminator = Annotated[
    BaseSectionCoreUnion, Field(discriminator="type")
]

BaseSectionCoreUnionTypeAdapter = TypeAdapter(BaseSectionCoreUnionWithDiscriminator)

BaseSectionCoreUnionTypeSet = set(
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


BaseSectionWithParamsSectionCoreUnion = Union[
    CallableSectionCore, DictSectionCore, GlobalVariablesSectionCore
]

BaseSectionWithParamsSectionCoreUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsSectionCoreUnion, Field(discriminator="type")
]

BaseSectionWithParamsSectionCoreUnionTypeAdapter = TypeAdapter(
    BaseSectionWithParamsSectionCoreUnionWithDiscriminator
)

BaseSectionWithParamsSectionCoreUnionTypeSet = set(
    ["Callable", "Dict", "GlobalVariables"]
)


BaseArtifactSectionCoreUnion = Union[
    ImageSectionCore, ChartSectionCore, DrawSectionCore
]

BaseArtifactSectionCoreUnionWithDiscriminator = Annotated[
    BaseArtifactSectionCoreUnion, Field(discriminator="type")
]

BaseArtifactSectionCoreUnionTypeAdapter = TypeAdapter(
    BaseArtifactSectionCoreUnionWithDiscriminator
)

BaseArtifactSectionCoreUnionTypeSet = set(["Image", "Chart", "Draw"])


BaseCanvasSectionCoreUnion = Union[ChartSectionCore, DrawSectionCore]

BaseCanvasSectionCoreUnionWithDiscriminator = Annotated[
    BaseCanvasSectionCoreUnion, Field(discriminator="type")
]

BaseCanvasSectionCoreUnionTypeAdapter = TypeAdapter(
    BaseCanvasSectionCoreUnionWithDiscriminator
)

BaseCanvasSectionCoreUnionTypeSet = set(["Chart", "Draw"])


BaseCodeSectionCoreUnion = Union[CodeSectionCore, GenPythonCodeSectionCore]

BaseCodeSectionCoreUnionWithDiscriminator = Annotated[
    BaseCodeSectionCoreUnion, Field(discriminator="type")
]

BaseCodeSectionCoreUnionTypeAdapter = TypeAdapter(
    BaseCodeSectionCoreUnionWithDiscriminator
)

BaseCodeSectionCoreUnionTypeSet = set(["Code", "GenPythonCode"])


BaseParentSectionCoreUnion = Union[
    ListRootSectionCore, DictRootSectionCore, GroupSectionCore
]

BaseParentSectionCoreUnionWithDiscriminator = Annotated[
    BaseParentSectionCoreUnion, Field(discriminator="type")
]

BaseParentSectionCoreUnionTypeAdapter = TypeAdapter(
    BaseParentSectionCoreUnionWithDiscriminator
)

BaseParentSectionCoreUnionTypeSet = set(["ListRoot", "DictRoot", "Group"])


BaseDictSectionCoreUnion = Union[DictSectionCore, GlobalVariablesSectionCore]

BaseDictSectionCoreUnionWithDiscriminator = Annotated[
    BaseDictSectionCoreUnion, Field(discriminator="type")
]

BaseDictSectionCoreUnionTypeAdapter = TypeAdapter(
    BaseDictSectionCoreUnionWithDiscriminator
)

BaseDictSectionCoreUnionTypeSet = set(["Dict", "GlobalVariables"])

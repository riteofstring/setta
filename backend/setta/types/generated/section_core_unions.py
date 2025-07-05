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
    BrowserSectionCore,
    CallableSectionCore,
    ChartSectionCore,
    ChatSectionCore,
    CodeSectionCore,
    DictSectionCore,
    DictRootSectionCore,
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
]

BaseSectionCoreUnionWithDiscriminator = Annotated[
    BaseSectionCoreUnion, Field(discriminator="type")
]

BaseSectionCoreTypeAdapter = TypeAdapter(BaseSectionCoreUnionWithDiscriminator)

BaseSectionCoreTypeSet = set(
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

BaseSectionWithParamsSectionCoreUnion = Union[
    CallableSectionCore, DictSectionCore, GlobalVariablesSectionCore
]

BaseSectionWithParamsSectionCoreUnionWithDiscriminator = Annotated[
    BaseSectionWithParamsSectionCoreUnion, Field(discriminator="type")
]

BaseSectionWithParamsSectionCoreTypeAdapter = TypeAdapter(
    BaseSectionWithParamsSectionCoreUnionWithDiscriminator
)

BaseSectionWithParamsSectionCoreTypeSet = set(["Callable", "Dict", "GlobalVariables"])

BaseArtifactSectionCoreUnion = Union[
    ChartSectionCore, DrawSectionCore, ImageSectionCore
]

BaseArtifactSectionCoreUnionWithDiscriminator = Annotated[
    BaseArtifactSectionCoreUnion, Field(discriminator="type")
]

BaseArtifactSectionCoreTypeAdapter = TypeAdapter(
    BaseArtifactSectionCoreUnionWithDiscriminator
)

BaseArtifactSectionCoreTypeSet = set(["Chart", "Draw", "Image"])

BaseCanvasSectionCoreUnion = Union[ChartSectionCore, DrawSectionCore]

BaseCanvasSectionCoreUnionWithDiscriminator = Annotated[
    BaseCanvasSectionCoreUnion, Field(discriminator="type")
]

BaseCanvasSectionCoreTypeAdapter = TypeAdapter(
    BaseCanvasSectionCoreUnionWithDiscriminator
)

BaseCanvasSectionCoreTypeSet = set(["Chart", "Draw"])

BaseCodeSectionCoreUnion = Union[CodeSectionCore, GenPythonCodeSectionCore]

BaseCodeSectionCoreUnionWithDiscriminator = Annotated[
    BaseCodeSectionCoreUnion, Field(discriminator="type")
]

BaseCodeSectionCoreTypeAdapter = TypeAdapter(BaseCodeSectionCoreUnionWithDiscriminator)

BaseCodeSectionCoreTypeSet = set(["Code", "GenPythonCode"])

BaseParentSectionCoreUnion = Union[
    DictRootSectionCore, GroupSectionCore, ListRootSectionCore
]

BaseParentSectionCoreUnionWithDiscriminator = Annotated[
    BaseParentSectionCoreUnion, Field(discriminator="type")
]

BaseParentSectionCoreTypeAdapter = TypeAdapter(
    BaseParentSectionCoreUnionWithDiscriminator
)

BaseParentSectionCoreTypeSet = set(["DictRoot", "Group", "ListRoot"])

BaseDictSectionCoreUnion = Union[DictSectionCore, GlobalVariablesSectionCore]

BaseDictSectionCoreUnionWithDiscriminator = Annotated[
    BaseDictSectionCoreUnion, Field(discriminator="type")
]

BaseDictSectionCoreTypeAdapter = TypeAdapter(BaseDictSectionCoreUnionWithDiscriminator)

BaseDictSectionCoreTypeSet = set(["Dict", "GlobalVariables"])

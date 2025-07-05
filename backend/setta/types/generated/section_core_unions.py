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

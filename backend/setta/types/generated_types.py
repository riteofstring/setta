from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.websocket import (
    WebsocketMsgCurrentAddressUpdate,
    WebsocketMsgUpdateBackendProjectState,
)

WebsocketMsgForBackendUnion = Annotated[
    Union[WebsocketMsgCurrentAddressUpdate, WebsocketMsgUpdateBackendProjectState],
    Field(discriminator="messageType"),
]

WebsocketMsgForBackendTypeAdapter = TypeAdapter(WebsocketMsgForBackendUnion)

from setta.types.sections import (
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

SectionImplUnion = Annotated[
    Union[
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
    ],
    Field(discriminator="type"),
]

SectionImplTypeAdapter = TypeAdapter(SectionImplUnion)

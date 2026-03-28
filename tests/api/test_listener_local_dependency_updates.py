import asyncio

import pytest

from setta.api import SettaListener, dep_id
from setta.api.listener import ListenerCallbackContext
from setta.types.chat import (
    AssistantChatMessage,
    ChatSectionState,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerDependencyMode,
    ListenerForceRefreshContent,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerRouterEndpointResultContent,
    ListenerSnapshot,
    PythonScriptWebsocketMsgTypeAdapter,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
)
from setta.types.generated.go_shared_types import SectionType
from setta.types.project_config import SectionRepresentationMode
from setta.types.protocol import LiteralDependencyValue, SectionDependencyKey
from tests.helpers.listener_runtime_state import (
    build_listener_runtime_state_from_catalog,
)


def _build_chat_catalog(section_id: ID) -> ListenerDependencyCatalog:
    return ListenerDependencyCatalog(
        entries=[
            ListenerDependencyCatalogEntry(
                dependencyKey=SectionDependencyKey(sectionId=section_id),
                name="Chat Section",
                fullPathName="Chat_Section",
                sectionType=SectionType.Chat,
                sectionRepresentation=SectionRepresentationMode.expression,
            )
        ]
    )


def _build_chat_snapshot(
    *,
    project_config_id: ID,
    section_id: ID,
    state: ChatSectionState,
) -> ListenerSnapshot:
    dependency_key = SectionDependencyKey(sectionId=section_id)
    return ListenerSnapshot(
        projectConfigId=project_config_id,
        dependencyCatalog=_build_chat_catalog(section_id),
        dependencyValues=ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=dependency_key,
                    renderedValue=repr(state.model_dump(mode="json")),
                )
            ]
        ),
    )


def _read_chat_state(
    ctx: ListenerCallbackContext,
    section_id: ID,
) -> ChatSectionState:
    raw_state = ctx.values.by_id(section_id)
    if isinstance(raw_state, str):
        return ChatSectionState.model_validate_json(raw_state)
    return ChatSectionState.model_validate(raw_state)


@pytest.mark.asyncio
async def test_chat_section_update_waits_for_authoritative_refresh() -> None:
    project_config_id = ID("proj-chat-sync")
    section_id = ID(f"{project_config_id}-chat")
    listener = SettaListener(project_name=f"Project {project_config_id}")
    router_result_sent = asyncio.Event()
    allow_force_refresh = asyncio.Event()

    async def capture(payload: str) -> None:
        message = PythonScriptWebsocketMsgTypeAdapter.validate_json(payload)
        if not isinstance(message, WebsocketMsgListenerRouterEndpointCall):
            return
        listener._handle_router_endpoint_result(
            WebsocketMsgListenerRouterEndpointResult(
                content=ListenerRouterEndpointResultContent(
                    projectConfigId=project_config_id,
                    callId=message.content.callId,
                    ok=True,
                    result={"ok": True},
                )
            )
        )
        router_result_sent.set()

        await allow_force_refresh.wait()
        await listener._handle_force_refresh(
            ListenerForceRefreshContent(
                callId=message.content.callId,
                snapshot=_build_chat_snapshot(
                    project_config_id=project_config_id,
                    section_id=section_id,
                    state=second_state,
                ),
            )
        )

    listener._send_websocket_payload = capture

    first_state = ChatSectionState(
        messages=[
            UserChatMessage(
                id=ID("msg-1"),
                content=[MessageTextContent(type="text", text="hi")],
            ),
            AssistantChatMessage(
                id=ID("msg-2"),
                content=[MessageTextContent(type="text", text="hello")],
            ),
        ],
    )
    second_state = ChatSectionState(
        messages=[
            UserChatMessage(
                id=ID("msg-1"),
                content=[MessageTextContent(type="text", text="hi")],
            ),
            AssistantChatMessage(
                id=ID("msg-2"),
                content=[MessageTextContent(type="text", text="hello")],
            ),
            UserChatMessage(
                id=ID("msg-3"),
                content=[MessageTextContent(type="text", text="more")],
            ),
            AssistantChatMessage(
                id=ID("msg-4"),
                content=[MessageTextContent(type="text", text="done")],
            ),
        ],
    )

    @listener.listen(
        deps=[dep_id(section_id)],
        dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
    )
    async def _noop(_state, _ctx) -> None:
        return None

    runtime_state = build_listener_runtime_state_from_catalog(
        _build_chat_catalog(section_id)
    )
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id
    listener._is_registered = True

    delta = ListenerRealtimeDelta(
        dependency=SectionDependencyKey(sectionId=section_id),
        value=LiteralDependencyValue(payload=repr(first_state.model_dump(mode="json"))),
    )
    await listener._handle_realtime_event(
        ListenerRealtimeEventContent(
            projectConfigId=project_config_id,
            deltas=[delta],
            sequence=1,
        )
    )
    callback_id = next(iter(listener._callbacks))
    spec = listener._callbacks[callback_id]
    dep_name = listener._build_callback_context(spec, {}).ids.dependency_name(
        section_id
    )
    ctx = listener._build_callback_context(spec, {dep_name: first_state})

    before = _read_chat_state(ctx, section_id)
    changed_state = ChatSectionState.model_validate(ctx.changed[dep_name])
    route_call = asyncio.create_task(
        ctx.project_manager.set_chat_section_state(
            {
                "projectConfigId": project_config_id,
                "sectionId": section_id,
                "state": second_state,
            }
        )
    )

    await asyncio.wait_for(router_result_sent.wait(), timeout=1)
    assert not route_call.done()
    allow_force_refresh.set()
    await route_call
    after = _read_chat_state(ctx, section_id)

    assert len(before.messages) == 2
    assert len(after.messages) == 4
    assert changed_state == first_state

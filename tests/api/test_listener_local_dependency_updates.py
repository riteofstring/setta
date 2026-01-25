import asyncio

import pytest

from setta.api import SettaListener, dep_id
from setta.api.listener import ListenerCallbackContext
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRouterEndpointResultContent,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
)
from setta.types.project_config import (
    ProjectConfig,
    SectionRepresentationMode,
    TopLevelSectionLayout,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import ChatSectionImpl, ChatSectionState, SectionType
from setta.types.websocket import (
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
)


def _build_chat_project_state(
    project_config_id: ID,
) -> tuple[ProjectStateSingleConfig, ID]:
    section_impl = ChatSectionImpl(
        id=ID(f"{project_config_id}-chat-impl"),
        name="Chat Section",
        chatId=ID(f"{project_config_id}-chat-id"),
    )
    section_variant = Variant(
        id=ID(f"{project_config_id}-chat-variant"),
        name="Chat Variant",
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=ID(f"{project_config_id}-chat"),
        name="Chat Section",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
        name=f"Project {project_config_id}",
        sectionVariantMap={section_core.id: section_variant.id},
        topLevelSections={section_core.id: TopLevelSectionLayout()},
    )
    python_target = project_config.codegenTargets[0]
    python_target.sectionPolicy.typePolicies[
        SectionType.Chat
    ].representation = SectionRepresentationMode.expression
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_core.id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
    )
    return project_state, section_core.id


def _read_chat_state(
    ctx: ListenerCallbackContext,
    section_id: ID,
) -> ChatSectionState:
    raw_state = ctx.values.by_id(section_id)
    if isinstance(raw_state, str):
        return ChatSectionState.model_validate_json(raw_state)
    return ChatSectionState.model_validate(raw_state)


@pytest.mark.asyncio
async def test_chat_section_update_refreshes_ctx_values() -> None:
    project_state, section_id = _build_chat_project_state(ID("proj-chat-sync"))
    listener = SettaListener(project_name=project_state.projectConfig.name)

    async def capture(payload: str) -> None:
        message = PythonScriptWebsocketMsgTypeAdapter.validate_json(payload)
        if not isinstance(message, WebsocketMsgListenerRouterEndpointCall):
            return
        listener._handle_router_endpoint_result(
            WebsocketMsgListenerRouterEndpointResult(
                content=ListenerRouterEndpointResultContent(
                    projectConfigId=project_state.projectConfig.id,
                    callId=message.content.callId,
                    ok=True,
                    result={"ok": True},
                )
            )
        )

    listener._send_websocket_payload = capture

    first_state = ChatSectionState(
        messages=[
            UserChatMessage(
                id=ID("msg-1"),
                content=[MessageTextContent(text="hi")],
            ),
            AssistantChatMessage(
                id=ID("msg-2"),
                content=[MessageTextContent(text="hello")],
            ),
        ],
    )
    second_state = ChatSectionState(
        messages=[
            UserChatMessage(
                id=ID("msg-1"),
                content=[MessageTextContent(text="hi")],
            ),
            AssistantChatMessage(
                id=ID("msg-2"),
                content=[MessageTextContent(text="hello")],
            ),
            UserChatMessage(
                id=ID("msg-3"),
                content=[MessageTextContent(text="more")],
            ),
            AssistantChatMessage(
                id=ID("msg-4"),
                content=[MessageTextContent(text="done")],
            ),
        ],
    )
    observed: list[tuple[ChatSectionState, ChatSectionState, ChatSectionState]] = []
    callback_done = asyncio.Event()

    @listener.listen(
        deps=[dep_id(section_id)],
        dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
    )
    async def on_chat_action(_state, ctx) -> None:
        before = _read_chat_state(ctx, section_id)
        dep_name = ctx.ids.dependency_name(section_id)
        changed_state = ChatSectionState.model_validate(ctx.changed[dep_name])
        await ctx.project_manager.set_chat_section_state(
            {
                "projectConfigId": project_state.projectConfig.id,
                "sectionId": section_id,
                "state": second_state,
            }
        )
        after = _read_chat_state(ctx, section_id)
        observed.append((before, after, changed_state))
        callback_done.set()

    runtime_state = listener._build_runtime_state(project_state)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_state.projectConfig.id
    listener._is_registered = True

    delta = ListenerRealtimeDelta(
        dependency=SectionDependencyKey(sectionId=section_id),
        value=LiteralDependencyValue(
            payload=repr(first_state.model_dump(mode="json"))
        ),
    )
    await listener._handle_realtime_event(
        ListenerRealtimeEventContent(
            projectConfigId=project_state.projectConfig.id,
            deltas=[delta],
            sequence=1,
        )
    )
    callback_id = next(iter(listener._callbacks))
    await listener._scheduler.flush(callback_id)
    await asyncio.wait_for(callback_done.wait(), timeout=1)

    assert len(observed) == 1
    first_seen, second_seen, callback_state = observed[0]
    assert len(first_seen.messages) == 2
    assert len(second_seen.messages) == 4
    assert callback_state == first_state

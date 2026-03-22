import asyncio

import pytest
from setta.api import SettaListener, dep_id
from setta.api.listener import ListenerCallbackContext
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.core import Core, Variant
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import set_chat_section_state
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

from tests.helpers.project_state_core import compute_initial_nonPresetImpls


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
async def test_chat_section_update_waits_for_authoritative_refresh() -> None:
    project_state, section_id = _build_chat_project_state(ID("proj-chat-sync"))
    listener = SettaListener(project_name=project_state.projectConfig.name)
    router_result_sent = asyncio.Event()
    allow_force_refresh = asyncio.Event()

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
        router_result_sent.set()

        refreshed_state = project_state.model_copy(deep=True)
        set_chat_section_state(refreshed_state, section_id, second_state)
        runtime_state = listener._build_runtime_state(refreshed_state)
        dependency_entry = runtime_state.dependency_metadata.entry_for_key(
            SectionDependencyKey(sectionId=section_id)
        )
        dependency_catalog = ListenerDependencyCatalog(
            entries=[
                ListenerDependencyCatalogEntry(
                    dependencyKey=dependency_entry.dependencyKey,
                    name=dependency_entry.name,
                    fullPathName=dependency_entry.fullPathName,
                    dependencies=list(dependency_entry.dependencies),
                    sectionType=dependency_entry.sectionType,
                    codeObjType=dependency_entry.codeObjType,
                    controlCodeObjId=dependency_entry.controlCodeObjId,
                    controlCodeObjType=dependency_entry.controlCodeObjType,
                    sectionRepresentation=dependency_entry.sectionRepresentation,
                    controlValueRepresentation=dependency_entry.controlValueRepresentation,
                    valueRepresentation=dependency_entry.valueRepresentation,
                )
            ]
        )
        refreshed_impl = get_curr_effective_section_impl_with_type_guard(
            refreshed_state,
            section_id,
            ChatSectionImpl,
        )
        dependency_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=dependency_entry.dependencyKey,
                    renderedValue=repr(
                        ChatSectionState(
                            messages=refreshed_impl.messages,
                            inputText=refreshed_impl.inputText,
                            waitingForResponse=refreshed_impl.waitingForResponse,
                            toolCallArguments=refreshed_impl.toolCallArguments,
                            activeBranchId=refreshed_impl.activeBranchId,
                            branches=refreshed_impl.branches,
                        ).model_dump(mode="json")
                    ),
                )
            ]
        )

        await allow_force_refresh.wait()
        await listener._handle_force_refresh(
            ListenerForceRefreshContent(
                callId=message.content.callId,
                snapshot=ListenerSnapshot(
                    projectConfigId=refreshed_state.projectConfig.id,
                    dependencyCatalog=dependency_catalog,
                    dependencyValues=dependency_values,
                ),
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

    @listener.listen(
        deps=[dep_id(section_id)],
        dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
    )
    async def _noop(_state, _ctx) -> None:
        return None

    runtime_state = listener._build_runtime_state(project_state)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_state.projectConfig.id
    listener._is_registered = True

    delta = ListenerRealtimeDelta(
        dependency=SectionDependencyKey(sectionId=section_id),
        value=LiteralDependencyValue(payload=repr(first_state.model_dump(mode="json"))),
    )
    await listener._handle_realtime_event(
        ListenerRealtimeEventContent(
            projectConfigId=project_state.projectConfig.id,
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
                "projectConfigId": project_state.projectConfig.id,
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

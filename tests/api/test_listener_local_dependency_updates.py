import unittest

from setta.api import SettaListener, dep_id
from setta.api.listener import ListenerCallbackContext
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRouterEndpointResultContent,
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


class ListenerLocalDependencyUpdateTests(unittest.IsolatedAsyncioTestCase):
    async def test_chat_section_update_refreshes_ctx_values(self) -> None:
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

        observed: list[tuple[ChatSectionState, ChatSectionState]] = []

        @listener.listen(
            deps=[dep_id(section_id)],
            dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
        )
        async def on_chat_action(state, ctx) -> None:
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
                inputText="",
                waitingForResponse=False,
                toolCallArguments={},
            )
            await ctx.project_manager.set_chat_section_state(
                {"sectionId": section_id, "state": first_state.model_dump()}
            )
            first_seen = _read_chat_state(ctx, section_id)

            second_state = ChatSectionState(
                messages=[
                    *first_seen.messages,
                    UserChatMessage(
                        id=ID("msg-3"),
                        content=[MessageTextContent(text="what?")],
                    ),
                    AssistantChatMessage(
                        id=ID("msg-4"),
                        content=[MessageTextContent(text="ok")],
                    ),
                ],
                inputText="",
                waitingForResponse=False,
                toolCallArguments={},
            )
            await ctx.project_manager.set_chat_section_state(
                {"sectionId": section_id, "state": second_state.model_dump()}
            )
            second_seen = _read_chat_state(ctx, section_id)
            observed.append((first_seen, second_seen))

        await listener._refresh_from_snapshot(project_state)
        spec = next(
            spec for spec in listener._callbacks.values() if spec.function is on_chat_action
        )
        ctx = listener._build_callback_context(spec, changed={}, events=[])
        runtime_state = listener._runtime_state
        if runtime_state is None or runtime_state.s_instance is None:
            raise AssertionError("Listener runtime state unavailable for test")
        await listener._invoke_callback(spec, runtime_state.s_instance, ctx)

        self.assertEqual(1, len(observed))
        first_seen, second_seen = observed[0]
        self.assertEqual(2, len(first_seen.messages))
        self.assertEqual(4, len(second_seen.messages))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

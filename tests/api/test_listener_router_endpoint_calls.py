import asyncio

import pytest

from setta.api.listener import ListenerRuntimeState, SettaListener
from setta.code_gen.dependency_graph import DependencyGraph
from setta.project_state.project_manager_types import GetChatSectionChatIdRequest
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.id import ID
from setta.types.listener import (
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerRouterEndpointResultContent,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl
from setta.types.websocket import (
    WebsocketMsgListenerError,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
)


def _build_project_state(project_config_id: ID) -> ProjectStateSingleConfig:
    section_impl_id = ID(f"{project_config_id}-section-impl")
    section_impl = TextBlockSectionImpl(
        id=section_impl_id,
        name="Section",
        text="Initial value",
    )
    section_variant_id = ID(f"{project_config_id}-section-variant")
    section_variant = Variant(
        id=section_variant_id,
        name="Variant",
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core_id = ID(f"{project_config_id}-section")
    section_core = Core(
        id=section_core_id,
        name="Section",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
        name=f"Project {project_config_id}",
        sectionVariantMap={section_core.id: section_variant.id},
        topLevelSections={section_core.id: TopLevelSectionLayout()},
    )
    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_core.id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
    )


def _build_listener(project_state: ProjectStateSingleConfig) -> SettaListener:
    listener = SettaListener(project_name=project_state.projectConfig.name)
    dependency_graph = DependencyGraph(project_state)
    listener._runtime_state = ListenerRuntimeState(
        project_state=project_state,
        dependency_graph=dependency_graph,
        s_instance=None,
    )
    listener._project_config_id = project_state.projectConfig.id
    listener._is_registered = True
    return listener


@pytest.mark.asyncio
class TestListenerRouterEndpointCall:
    async def test_call_router_endpoint_serializes_payload_and_returns_result(
        self,
    ) -> None:
        project_state = _build_project_state(ID("proj-router"))
        listener = _build_listener(project_state)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        request = GetChatSectionChatIdRequest(
            projectConfigId=project_state.projectConfig.id,
            sectionId=ID("chat-section"),
        )
        call_task = asyncio.create_task(
            listener._call_router_endpoint(
                "route_get_chat_section_chat_id",
                payload=request,
            )
        )

        await asyncio.sleep(0)

        assert len(sent_payloads) == 1
        parsed_message = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            sent_payloads[0]
        )
        assert isinstance(parsed_message, WebsocketMsgListenerRouterEndpointCall)
        assert parsed_message.content.endpointName == "route_get_chat_section_chat_id"
        assert parsed_message.content.payload == {
            "frontendOpId": None,
            "projectConfigId": project_state.projectConfig.id,
            "sectionId": "chat-section",
        }

        listener._handle_router_endpoint_result(
            WebsocketMsgListenerRouterEndpointResult(
                content=ListenerRouterEndpointResultContent(
                    projectConfigId=project_state.projectConfig.id,
                    callId=parsed_message.content.callId,
                    ok=True,
                    result={"status": "ok"},
                )
            )
        )

        result = await call_task
        assert result == {"status": "ok"}

    async def test_call_router_endpoint_surfaces_error_details(self) -> None:
        project_state = _build_project_state(ID("proj-router-error"))
        listener = _build_listener(project_state)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        call_task = asyncio.create_task(
            listener._call_router_endpoint(
                "route_get_chat_section_chat_id",
                payload={
                    "projectConfigId": project_state.projectConfig.id,
                    "sectionId": "chat-section",
                },
            )
        )

        await asyncio.sleep(0)

        parsed_message = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            sent_payloads[0]
        )
        assert isinstance(parsed_message, WebsocketMsgListenerRouterEndpointCall)

        listener._handle_router_endpoint_result(
            WebsocketMsgListenerRouterEndpointResult(
                content=ListenerRouterEndpointResultContent(
                    projectConfigId=project_state.projectConfig.id,
                    callId=parsed_message.content.callId,
                    ok=False,
                    error="listener_call_failed",
                    details={"message": "boom"},
                )
            )
        )

        with pytest.raises(RuntimeError) as ctx:
            await call_task
        assert "listener_call_failed" in str(ctx.value)
        assert "boom" in str(ctx.value)

    async def test_call_router_endpoint_waits_for_authoritative_force_refresh(
        self,
    ) -> None:
        project_state = _build_project_state(ID("proj-router-refresh"))
        listener = _build_listener(project_state)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        call_task = asyncio.create_task(
            listener._call_router_endpoint(
                "route_set_chat_section_state",
                payload={
                    "projectConfigId": project_state.projectConfig.id,
                    "sectionId": "section-1",
                    "state": {"messages": []},
                },
            )
        )

        await asyncio.sleep(0)

        parsed_message = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            sent_payloads[0]
        )
        assert isinstance(parsed_message, WebsocketMsgListenerRouterEndpointCall)

        listener._handle_router_endpoint_result(
            WebsocketMsgListenerRouterEndpointResult(
                content=ListenerRouterEndpointResultContent(
                    projectConfigId=project_state.projectConfig.id,
                    callId=parsed_message.content.callId,
                    ok=True,
                    result=None,
                )
            )
        )

        await asyncio.sleep(0)
        assert not call_task.done()

        await listener._handle_force_refresh(
            ListenerForceRefreshContent(
                callId=parsed_message.content.callId,
                projectState=project_state,
            )
        )

        assert await call_task is None

    async def test_call_router_endpoint_surfaces_authoritative_refresh_failure(
        self,
    ) -> None:
        project_state = _build_project_state(ID("proj-router-refresh-error"))
        listener = _build_listener(project_state)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        call_task = asyncio.create_task(
            listener._call_router_endpoint(
                "route_set_chat_section_state",
                payload={
                    "projectConfigId": project_state.projectConfig.id,
                    "sectionId": "section-1",
                    "state": {"messages": []},
                },
            )
        )

        await asyncio.sleep(0)

        parsed_message = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            sent_payloads[0]
        )
        assert isinstance(parsed_message, WebsocketMsgListenerRouterEndpointCall)

        listener._handle_router_endpoint_result(
            WebsocketMsgListenerRouterEndpointResult(
                content=ListenerRouterEndpointResultContent(
                    projectConfigId=project_state.projectConfig.id,
                    callId=parsed_message.content.callId,
                    ok=True,
                    result=None,
                )
            )
        )
        listener._handle_listener_error(
            WebsocketMsgListenerError(
                content=ListenerErrorContent(
                    error="listener_refresh_failed",
                    details={
                        "callId": parsed_message.content.callId,
                        "message": "snapshot rebuild failed",
                    },
                )
            )
        )

        with pytest.raises(RuntimeError) as ctx:
            await call_task
        assert "listener_refresh_failed" in str(ctx.value)
        assert "snapshot rebuild failed" in str(ctx.value)

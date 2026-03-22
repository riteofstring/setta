import asyncio

import pytest

from setta.api.listener import SettaListener
from setta.types.websocket import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyCatalog,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerRenderedDependencyValues,
    ListenerRouterEndpointResultContent,
    ListenerSnapshot,
)
from setta.types.websocket import (
    WebsocketMsgListenerError,
    WebsocketMsgListenerRouterEndpointCall,
    WebsocketMsgListenerRouterEndpointResult,
)
from tests.helpers.listener_runtime_state import (
    build_listener_runtime_state_from_catalog,
)


def _build_listener(project_config_id: ID) -> SettaListener:
    listener = SettaListener(project_name=f"Project {project_config_id}")
    listener._runtime_state = build_listener_runtime_state_from_catalog(
        ListenerDependencyCatalog(entries=[])
    )
    listener._project_config_id = project_config_id
    listener._is_registered = True
    return listener


@pytest.mark.asyncio
class TestListenerRouterEndpointCall:
    async def test_call_router_endpoint_serializes_payload_and_returns_result(
        self,
    ) -> None:
        project_config_id = ID("proj-router")
        listener = _build_listener(project_config_id)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        request = {
            "frontendOpId": None,
            "projectConfigId": project_config_id,
            "sectionId": ID("chat-section"),
        }
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
            "projectConfigId": project_config_id,
            "sectionId": "chat-section",
        }

        listener._handle_router_endpoint_result(
            WebsocketMsgListenerRouterEndpointResult(
                content=ListenerRouterEndpointResultContent(
                    projectConfigId=project_config_id,
                    callId=parsed_message.content.callId,
                    ok=True,
                    result={"status": "ok"},
                )
            )
        )

        result = await call_task
        assert result == {"status": "ok"}

    async def test_call_router_endpoint_surfaces_error_details(self) -> None:
        project_config_id = ID("proj-router-error")
        listener = _build_listener(project_config_id)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        call_task = asyncio.create_task(
            listener._call_router_endpoint(
                "route_get_chat_section_chat_id",
                payload={
                    "projectConfigId": project_config_id,
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
                    projectConfigId=project_config_id,
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
        project_config_id = ID("proj-router-refresh")
        listener = _build_listener(project_config_id)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        call_task = asyncio.create_task(
            listener._call_router_endpoint(
                "route_set_chat_section_state",
                payload={
                    "projectConfigId": project_config_id,
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
                    projectConfigId=project_config_id,
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
                snapshot=ListenerSnapshot(
                    projectConfigId=project_config_id,
                    dependencyCatalog=ListenerDependencyCatalog(entries=[]),
                    dependencyValues=ListenerRenderedDependencyValues(entries=[]),
                ),
            )
        )

        assert await call_task is None

    async def test_call_router_endpoint_surfaces_authoritative_refresh_failure(
        self,
    ) -> None:
        project_config_id = ID("proj-router-refresh-error")
        listener = _build_listener(project_config_id)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        call_task = asyncio.create_task(
            listener._call_router_endpoint(
                "route_set_chat_section_state",
                payload={
                    "projectConfigId": project_config_id,
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
                    projectConfigId=project_config_id,
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

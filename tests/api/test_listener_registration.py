import asyncio
import contextlib
import importlib.util
import pathlib
import sys
import types
from unittest.mock import call, patch

import pytest
from setta.sdk_contracts.generated import ListenerDependencyCatalog
from setta.types.generated.go_shared_types import (
    ListenerFrontendEmitMessage,
    ListenerMessageType,
    ListenerRegisterAckContent,
    ListenerRegisterAckMessage,
    ListenerRegisterAckStatus,
    ListenerRouterEndpointCallMessage,
    ListenerRouterEndpointResultContent,
    ListenerRouterEndpointResultMessage,
)
from setta.types.id import ID

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_BACKEND_ROOT = _REPO_ROOT / "backend"


@contextlib.contextmanager
def _loaded_listener_module() -> types.ModuleType:
    added_backend_path = False
    backend_path = str(_BACKEND_ROOT)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
        added_backend_path = True

    import setta  # noqa: F401

    previous_api_module = sys.modules.get("setta.api")
    previous_listener_module = sys.modules.get("setta.api.listener")
    previous_protocol_module = sys.modules.get("setta.types.protocol")

    protocol_stub = types.ModuleType("setta.types.protocol")
    protocol_stub.BaseDependencyKeyUnion = object
    protocol_stub.SectionDependencyKey = type("SectionDependencyKey", (), {})
    protocol_stub.SectionParamDependencyKey = type(
        "SectionParamDependencyKey", (), {}
    )
    protocol_stub.create_dep_key = lambda **kwargs: kwargs

    api_module = types.ModuleType("setta.api")
    api_module.__path__ = [str(_BACKEND_ROOT / "setta" / "api")]

    sys.modules["setta.api"] = api_module
    sys.modules["setta.types.protocol"] = protocol_stub

    spec = importlib.util.spec_from_file_location(
        "setta.api.listener",
        _BACKEND_ROOT / "setta" / "api" / "listener.py",
    )
    assert spec is not None and spec.loader is not None
    listener_module = importlib.util.module_from_spec(spec)
    sys.modules["setta.api.listener"] = listener_module
    try:
        spec.loader.exec_module(listener_module)
        yield listener_module
    finally:
        if previous_listener_module is None:
            sys.modules.pop("setta.api.listener", None)
        else:
            sys.modules["setta.api.listener"] = previous_listener_module
        if previous_api_module is None:
            sys.modules.pop("setta.api", None)
        else:
            sys.modules["setta.api"] = previous_api_module
        if previous_protocol_module is None:
            sys.modules.pop("setta.types.protocol", None)
        else:
            sys.modules["setta.types.protocol"] = previous_protocol_module
        if added_backend_path:
            sys.path.remove(backend_path)


def _build_register_ack_message(
    *,
    project_config_id: ID,
    callbacks: dict[str, ListenerRegisterAckStatus],
) -> ListenerRegisterAckMessage:
    return ListenerRegisterAckMessage(
        messageType=ListenerMessageType.ListenerRegisterAck,
        content=ListenerRegisterAckContent(
            projectConfigId=project_config_id,
            shareSessionId="share-session-1",
            callbacks=callbacks,
        ),
    )


def _build_runtime_state(listener_module: types.ModuleType):
    dependency_catalog = ListenerDependencyCatalog(entries=[])
    return listener_module.ListenerRuntimeState(
        dependency_metadata=listener_module.ListenerDependencyMetadata.from_catalog(
            dependency_catalog
        ),
        dependency_catalog=dependency_catalog,
    )


def test_handle_register_ack_sets_project_id_and_marks_listener_registered() -> None:
    with _loaded_listener_module() as listener_module:
        listener = listener_module.SettaListener(project_name="Ack Success")
        listener._registration_pending = True
        listener._expected_ack_callback_ids = {"cb-1", "cb-2"}

        listener._handle_register_ack(
            _build_register_ack_message(
                project_config_id=ID("project-1"),
                callbacks={
                    "cb-1": ListenerRegisterAckStatus(status="accepted", message=""),
                    "cb-2": ListenerRegisterAckStatus(status="accepted", message=""),
                },
            )
        )

        assert listener._project_config_id == ID("project-1")
        assert listener._registration_pending is False
        assert listener._expected_ack_callback_ids == set()
        assert listener._is_registered is True


def test_handle_register_ack_logs_mismatched_callback_sets() -> None:
    with _loaded_listener_module() as listener_module:
        listener = listener_module.SettaListener(project_name="Ack Mismatch")
        listener._project_config_id = ID("project-expected")
        listener._expected_ack_callback_ids = {"cb-expected"}

        with (
            patch.object(listener_module.logger, "debug") as debug_mock,
            patch.object(listener_module.logger, "warning") as warning_mock,
        ):
            listener._handle_register_ack(
                _build_register_ack_message(
                    project_config_id=ID("project-actual"),
                    callbacks={
                        "cb-unknown": ListenerRegisterAckStatus(
                            status="accepted",
                            message="",
                        )
                    },
                )
            )

        assert listener._registration_pending is False
        assert listener._expected_ack_callback_ids == set()
        assert listener._is_registered is True
        debug_mock.assert_called_once_with(
            "Listener %s received register ack without pending registration",
            "project-expected",
        )
        warning_mock.assert_has_calls(
            [
                call(
                    "Listener %s received register ack for unexpected project %s",
                    "project-expected",
                    ID("project-actual"),
                ),
                call(
                    "Listener %s missing register ack for callbacks: %s",
                    "project-expected",
                    "cb-expected",
                ),
                call(
                    "Listener %s received register ack for unknown callback %s",
                    "project-expected",
                    "cb-unknown",
                ),
            ]
        )


def test_handle_register_ack_raises_for_rejected_callbacks() -> None:
    with _loaded_listener_module() as listener_module:
        listener = listener_module.SettaListener(project_name="Ack Rejected")
        listener._registration_pending = True
        listener._expected_ack_callback_ids = {"cb-accepted", "cb-rejected"}

        with pytest.raises(
            RuntimeError,
            match=r"Listener registration rejected: cb-rejected \(not allowed\)",
        ):
            listener._handle_register_ack(
                _build_register_ack_message(
                    project_config_id=ID("project-1"),
                    callbacks={
                        "cb-accepted": ListenerRegisterAckStatus(
                            status="accepted",
                            message="",
                        ),
                        "cb-rejected": ListenerRegisterAckStatus(
                            status="rejected",
                            message="not allowed",
                        ),
                    },
                )
            )

        assert listener._registration_pending is False
        assert listener._expected_ack_callback_ids == {"cb-accepted", "cb-rejected"}
        assert listener._is_registered is False


def test_emit_to_frontend_requires_update_content() -> None:
    with _loaded_listener_module() as listener_module:
        listener = listener_module.SettaListener(project_name="Emit Empty")
        listener._runtime_state = _build_runtime_state(listener_module)
        listener._project_config_id = ID("project-emit")
        listener._is_registered = True

        async def run() -> None:
            with pytest.raises(
                ValueError,
                match="emit_to_frontend requires at least one dependency value or artifact update",
            ):
                await listener.emit_to_frontend()

        asyncio.run(run())


def test_emit_to_frontend_serializes_artifact_update_dicts() -> None:
    with _loaded_listener_module() as listener_module:
        listener = listener_module.SettaListener(project_name="Emit Artifact")
        listener._runtime_state = _build_runtime_state(listener_module)
        listener._project_config_id = ID("project-emit-artifact")
        listener._is_registered = True
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        async def run() -> None:
            listener._send_websocket_payload = capture
            await listener.emit_to_frontend(
                artifact_updates=[
                    {
                        "type": "Image",
                        "id": "listener/new-image.png",
                        "value": {
                            "contentId": "listener-image",
                            "byteLength": 3,
                            "mimeType": "image/png",
                            "sha256": "abc123",
                        },
                    }
                ]
            )

        asyncio.run(run())

        assert len(sent_payloads) == 1
        parsed_message = ListenerFrontendEmitMessage.model_validate_json(
            sent_payloads[0]
        )
        assert isinstance(parsed_message, ListenerFrontendEmitMessage)
        assert parsed_message.content.dependencyValues == {}
        assert len(parsed_message.content.artifactUpdates) == 1
        assert parsed_message.content.artifactUpdates[0].id == "listener/new-image.png"


def test_call_router_endpoint_rejects_invalid_payload_type() -> None:
    with _loaded_listener_module() as listener_module:
        listener = listener_module.SettaListener(project_name="Router Payload")
        listener._runtime_state = _build_runtime_state(listener_module)
        listener._project_config_id = ID("project-router-invalid")
        listener._is_registered = True

        async def run() -> None:
            with pytest.raises(
                ValueError,
                match="router endpoint payload must be a dict or pydantic model",
            ):
                await listener._call_router_endpoint(
                    "route_get_chat_section_chat_id",
                    payload="invalid",  # type: ignore[arg-type]
                )

        asyncio.run(run())


def test_call_router_endpoint_serializes_payload() -> None:
    with _loaded_listener_module() as listener_module:
        listener = listener_module.SettaListener(project_name="Router Payload")
        listener._runtime_state = _build_runtime_state(listener_module)
        listener._project_config_id = ID("project-router")
        listener._is_registered = True
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        async def run() -> None:
            listener._send_websocket_payload = capture
            call_task = asyncio.create_task(
                listener._call_router_endpoint(
                    "route_get_chat_section_chat_id",
                    payload={
                        "projectConfigId": ID("project-router"),
                        "sectionId": ID("chat-section"),
                    },
                )
            )
            await asyncio.sleep(0)
            parsed_message = ListenerRouterEndpointCallMessage.model_validate_json(
                sent_payloads[0]
            )
            listener._handle_router_endpoint_result(
                ListenerRouterEndpointResultMessage(
                    messageType=ListenerMessageType.ListenerRouterEndpointResult,
                    content=ListenerRouterEndpointResultContent(
                        projectConfigId=ID("project-router"),
                        callId=parsed_message.content.callId,
                        ok=True,
                        result={"status": "ok"},
                        error="",
                        details={},
                    ),
                )
            )
            result = await call_task
            assert result == {"status": "ok"}

        asyncio.run(run())

        parsed_message = ListenerRouterEndpointCallMessage.model_validate_json(
            sent_payloads[0]
        )
        assert parsed_message.content.payload == {
            "projectConfigId": "project-router",
            "sectionId": "chat-section",
        }

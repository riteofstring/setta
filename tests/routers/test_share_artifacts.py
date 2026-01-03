import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from setta.database.db_objs import DBE
from setta.routers.artifact import UpdateArtifactsRequest, route_update_artifacts
from setta.server_state import SettaFastAPIState
from setta.types.artifact import BrushStroke, BrushStrokeArtifact, DrawAreaBrushShape
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest
from setta.types.websocket import WebsocketConnectionType


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "share_deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> None:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    manifest = ShareDeploymentManifest(
        version=1,
        projectConfigId=project_config.id,
        projectConfigName=project_config.name,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())


async def _build_websocket(messages: list[Message]) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.receive"}

    async def send(message: Message) -> None:
        messages.append(message)

    scope: Scope = {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "scheme": "ws",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 0),
        "server": ("testserver", 80),
        "subprotocols": [],
    }
    return WebSocket(scope=scope, receive=receive, send=send)


def _sent_text_messages(messages: list[Message]) -> list[str]:
    return [
        message["text"]
        for message in messages
        if message.get("type") == "websocket.send" and "text" in message
    ]


class ShareArtifactRouteTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_share_updates_are_in_memory_only(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-artifacts-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            artifact_path = root / "artifacts" / "stroke.json"
            artifact = BrushStrokeArtifact(
                id=str(artifact_path),
                value=BrushStroke(
                    strokeStyle="#000000",
                    lineWidth=2.0,
                    lineCap=DrawAreaBrushShape.butt,
                ),
            )
            request = UpdateArtifactsRequest(artifacts=[artifact])

            results = await route_update_artifacts(request, state, session.id)

            self.assertEqual(1, len(results))
            self.assertEqual("saved", results[0].status)
            self.assertFalse(artifact_path.exists())

            cached = state.share_project_manager.get_session_artifacts(
                session.id
            ).get_cached_brush_stroke(artifact_path)
            self.assertIsNotNone(cached)

    async def test_share_updates_broadcast_to_session(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-artifacts-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            (root / "artifacts").mkdir(parents=True, exist_ok=True)
            state = await self._build_state(root)
            session_a = state.share_session_store.create_session()
            session_b = state.share_session_store.create_session()

            messages_a: list[Message] = []
            messages_b: list[Message] = []
            websocket_a = await _build_websocket(messages_a)
            websocket_b = await _build_websocket(messages_b)

            await state.websocket_manager.on_connect(
                websocket_a,
                WebsocketConnectionType.FRONTEND,
                id="frontend-a",
                shareSessionId=session_a.id,
            )
            await state.websocket_manager.on_connect(
                websocket_b,
                WebsocketConnectionType.FRONTEND,
                id="frontend-b",
                shareSessionId=session_b.id,
            )
            messages_a.clear()
            messages_b.clear()

            artifact_path = root / "artifacts" / "stroke.json"
            artifact = BrushStrokeArtifact(
                id=str(artifact_path),
                value=BrushStroke(
                    strokeStyle="#000000",
                    lineWidth=2.0,
                    lineCap=DrawAreaBrushShape.butt,
                ),
            )
            request = UpdateArtifactsRequest(artifacts=[artifact])

            await route_update_artifacts(request, state, session_a.id)

            types_a = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(messages_a)
            ]
            types_b = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(messages_b)
            ]
            self.assertIn("UpdateArtifacts", types_a)
            self.assertNotIn("UpdateArtifacts", types_b)

            await websocket_a.close()
            await websocket_b.close()


if __name__ == "__main__":
    unittest.main()

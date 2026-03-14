import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlparse

import pytest
from setta.share.listener_runtime import ShareListenerRuntime
from setta.types.id import ID
from setta.types.share_deployment import (
    DeploymentListenerConfig,
    DeploymentType,
    DeploymentManifest,
)

def _write_listener_entrypoint(root: Path) -> None:
    entrypoint = root / "listener.py"
    entrypoint.write_text(
        "\n".join(
            [
                "BUILT = []",
                "",
                "def build_listener(listener):",
                "    BUILT.append(listener._share_session_id)",
                "",
            ]
        ),
        encoding="utf-8",
    )


def _build_manifest(
    project_config_id: ID, *, entrypoint: str
) -> DeploymentManifest:
    return DeploymentManifest(
        version=1,
        deploymentName=str(project_config_id),
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config_id,
        deploymentVersion="v1",
        listener=DeploymentListenerConfig(entrypoint=entrypoint),
    )


@pytest.mark.asyncio
class TestShareListenerRuntime:
    async def test_missing_entrypoint_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = ID("proj-missing")
            manifest = _build_manifest(
                project_config_id,
                entrypoint="listener.py",
            )

            with pytest.raises(FileNotFoundError):
                ShareListenerRuntime(
                    deployment_root=root,
                    manifest=manifest,
                )

    async def test_requires_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_listener_entrypoint(root)
            project_config_id = ID("proj-per-viewer")
            manifest = _build_manifest(
                project_config_id,
                entrypoint="listener.py",
            )
            runtime = ShareListenerRuntime(
                deployment_root=root,
                manifest=manifest,
            )

            with pytest.raises(KeyError):
                await runtime.ensure_listener_for_session(None, project_config_id)

    async def test_share_runtime_uses_go_listener_websocket_route(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_listener_entrypoint(root)
            project_config_id = ID("proj-share-route")
            manifest = _build_manifest(
                project_config_id,
                entrypoint="listener.py",
            )
            runtime = ShareListenerRuntime(
                deployment_root=root,
                manifest=manifest,
            )

            await runtime.ensure_listener_for_session(
                "session-a",
                project_config_id,
            )

            handle = runtime._session_handles.get(("session-a", project_config_id))
            if handle is None:
                raise AssertionError("expected share listener handle")

            parsed = urlparse(handle.listener.websocket_endpoint)
            params = parse_qs(parsed.query)

            assert parsed.path == f"/ws/listeners/{handle.listener._socket_id}"
            assert params.get("shareSessionId") == ["session-a"]

            runtime.stop_all()
            await asyncio.gather(handle.task, return_exceptions=True)

    async def test_stop_session_listener_and_stop_all(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_listener_entrypoint(root)
            project_config_id = ID("proj-stop")
            manifest = _build_manifest(
                project_config_id,
                entrypoint="listener.py",
            )
            runtime = ShareListenerRuntime(
                deployment_root=root,
                manifest=manifest,
            )

            await runtime.ensure_listener_for_session("session-a", project_config_id)
            await runtime.ensure_listener_for_session("session-b", project_config_id)

            handle_a = runtime._session_handles.get(("session-a", project_config_id))
            handle_b = runtime._session_handles.get(("session-b", project_config_id))
            if handle_a is None or handle_b is None:
                raise AssertionError("expected session listener handles")
            assert handle_a.module.BUILT == ["session-a"]
            assert handle_b.module.BUILT == ["session-b"]

            runtime.stop_session_listener("session-a", project_config_id)
            assert ("session-a", project_config_id) not in runtime._session_handles

            runtime.stop_all()
            assert not runtime._session_handles

            await asyncio.gather(
                handle_a.task,
                handle_b.task,
                return_exceptions=True,
            )

    async def test_session_handles_are_scoped_by_config(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_listener_entrypoint(root)
            config_a = ID("proj-a")
            config_b = ID("proj-b")
            manifest = _build_manifest(
                config_a,
                entrypoint="listener.py",
            )
            runtime = ShareListenerRuntime(
                deployment_root=root,
                manifest=manifest,
            )

            await runtime.ensure_listener_for_session("session-a", config_a)
            await runtime.ensure_listener_for_session("session-a", config_b)

            handle_a = runtime._session_handles.get(("session-a", config_a))
            handle_b = runtime._session_handles.get(("session-a", config_b))
            if handle_a is None or handle_b is None:
                raise AssertionError("expected session listener handles")
            assert handle_a.module.BUILT == ["session-a"]
            assert handle_b.module.BUILT == ["session-a"]

            runtime.drop_session_listener("session-a")
            assert not runtime._session_handles

            await asyncio.gather(
                handle_a.task,
                handle_b.task,
                return_exceptions=True,
            )

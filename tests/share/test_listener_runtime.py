import asyncio
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.share.listener_runtime import ShareListenerRuntime
from setta.types.id import ID
from setta.types.share_deployment import (
    ListenerIsolationMode,
    ShareDeploymentListenerConfig,
    ShareDeploymentManifest,
    SharePolicy,
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
) -> ShareDeploymentManifest:
    return ShareDeploymentManifest(
        version=1,
        projectConfigId=project_config_id,
        listener=ShareDeploymentListenerConfig(entrypoint=entrypoint),
    )


class ShareListenerRuntimeTests(unittest.IsolatedAsyncioTestCase):
    def test_missing_entrypoint_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = ID("proj-missing")
            manifest = _build_manifest(
                project_config_id,
                entrypoint="listener.py",
            )

            with self.assertRaises(FileNotFoundError):
                ShareListenerRuntime(
                    deployment_root=root,
                    manifest=manifest,
                    policy=SharePolicy(),
                    project_config_id=project_config_id,
                )

    async def test_per_viewer_requires_session_id(self) -> None:
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
                policy=SharePolicy(
                    listenerIsolation=ListenerIsolationMode.per_viewer
                ),
                project_config_id=project_config_id,
            )

            with self.assertRaises(KeyError):
                await runtime.ensure_listener_for_session(None)

    async def test_shared_listener_reuses_handle(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_listener_entrypoint(root)
            project_config_id = ID("proj-shared")
            manifest = _build_manifest(
                project_config_id,
                entrypoint="listener.py",
            )
            runtime = ShareListenerRuntime(
                deployment_root=root,
                manifest=manifest,
                policy=SharePolicy(listenerIsolation=ListenerIsolationMode.shared),
                project_config_id=project_config_id,
            )

            await runtime.ensure_listener_for_session(None)
            handle = runtime._shared_handle
            if handle is None:
                raise AssertionError("expected shared listener handle")
            self.assertEqual([None], handle.module.BUILT)

            await runtime.ensure_listener_for_session(None)
            self.assertIs(handle, runtime._shared_handle)
            self.assertEqual([None], handle.module.BUILT)

            runtime.stop_shared_listener()
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
                policy=SharePolicy(
                    listenerIsolation=ListenerIsolationMode.per_viewer
                ),
                project_config_id=project_config_id,
            )

            await runtime.ensure_listener_for_session("session-a")
            await runtime.ensure_listener_for_session("session-b")

            handle_a = runtime._session_handles.get("session-a")
            handle_b = runtime._session_handles.get("session-b")
            if handle_a is None or handle_b is None:
                raise AssertionError("expected session listener handles")
            self.assertEqual(["session-a"], handle_a.module.BUILT)
            self.assertEqual(["session-b"], handle_b.module.BUILT)

            runtime.stop_session_listener("session-a")
            self.assertNotIn("session-a", runtime._session_handles)

            runtime.stop_all()
            self.assertFalse(runtime._session_handles)
            self.assertIsNone(runtime._shared_handle)

            await asyncio.gather(
                handle_a.task,
                handle_b.task,
                return_exceptions=True,
            )

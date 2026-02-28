import json
import os
import signal
import socket
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from setta import trusted_frontend_origins as trusted_frontend_origins_module
from setta.launch import LaunchError
from setta.launch_intent_store import (
    WorkspaceLaunchIntentStore,
    WorkspaceLaunchIntentStoreCapacityError,
    WorkspaceLaunchIntentStoreStateError,
    WorkspaceLaunchIntentStoreUnavailableError,
)
from setta.launcher_metadata import LauncherMetadataError
from setta.routers.launch import (
    CreateWorkspaceLaunchIntentRequest,
    LaunchRequest,
    _WORKSPACE_LAUNCH_INTENT_STORE,
    normalize_setta_files_location_for_launch,
    route_create_workspace_launch_intent,
    route_launch,
    router as launch_router,
)
from setta.routers.launcher_home import (
    normalize_setta_files_location_for_launch as normalize_setta_files_location_for_launcher_home,
)
from setta.ssh_common import RemoteSessionSummary
from setta.ssh_connect import RemoteConnectResult
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStore,
    TrustedFrontendOriginStoreError,
    trust_frontend_origin,
)
from setta.types.routes import Route
from setta.utils.paths import (
    build_files_root_from_base,
    clear_setta_paths_cache,
    resolve_setta_paths,
)
from tests.utils.setta_paths import temporary_setta_paths


class TestLaunchRoutes:
    def test_launch_local_profile_preserves_omitted_setta_files_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] is None

    def test_launch_local_without_profile_defaults_to_auto_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] == "auto"

    def test_launch_uses_origin_header_for_return_url_when_available(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_launch_workspace_session(**_kwargs):
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        with TestClient(app, base_url="http://backend.example") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.LAUNCH.value}",
                headers={"origin": "http://frontend.example"},
                json={"workspaceRoot": "/tmp/workspace"},
            )

        response.raise_for_status()
        payload = response.json()
        assert payload["ok"] is False
        assert payload["error"]["code"] == "Captured"
        assert payload["returnUrl"] == "http://frontend.example/home"

    def test_launch_intent_roundtrip_uses_server_stored_request(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _WORKSPACE_LAUNCH_INTENT_STORE.clear()
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured.update(kwargs)
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        create_response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(
                    workspaceRoot="/tmp/workspace",
                    settaHome="/tmp/setta-home",
                    settaFilesLocation="global",
                ),
                returnUrl="http://localhost/home",
            )
        )

        assert create_response.ok is True
        assert create_response.launchIntentToken is not None

        response = route_launch(
            LaunchRequest(launchIntentToken=create_response.launchIntentToken)
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert response.returnUrl == "http://localhost/home"
        assert captured["workspace_root"] == "/tmp/workspace"
        assert captured["setta_files_location"] == "global"
        assert create_response.launchIntentToken is not None
        assert not _WORKSPACE_LAUNCH_INTENT_STORE.contains(
            create_response.launchIntentToken
        )

    def test_launch_intent_roundtrip_survives_store_reinitialization(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        store_path = tmp_path / "launch-intents.json"
        store_a = WorkspaceLaunchIntentStore(storage_path=store_path)
        store_b = WorkspaceLaunchIntentStore(storage_path=store_path)
        monkeypatch.setattr(
            "setta.routers.launch._WORKSPACE_LAUNCH_INTENT_STORE",
            store_a,
        )
        store_a.clear()
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured.update(kwargs)
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        create_response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(
                    workspaceRoot="/tmp/workspace",
                    settaHome="/tmp/setta-home",
                    settaFilesLocation="global",
                ),
                returnUrl="http://localhost/home",
            )
        )

        assert create_response.ok is True
        assert create_response.launchIntentToken is not None

        # Rebind the module-global store to simulate request handling in a new process.
        monkeypatch.setattr(
            "setta.routers.launch._WORKSPACE_LAUNCH_INTENT_STORE",
            store_b,
        )
        response = route_launch(
            LaunchRequest(launchIntentToken=create_response.launchIntentToken)
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert response.returnUrl == "http://localhost/home"
        assert captured["workspace_root"] == "/tmp/workspace"
        assert captured["setta_files_location"] == "global"
        assert not store_b.contains(create_response.launchIntentToken)

    def test_launch_intent_rejects_tampered_token(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _WORKSPACE_LAUNCH_INTENT_STORE.clear()
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        create_response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(
                    workspaceRoot="/tmp/workspace",
                    settaHome="/tmp/setta-home",
                ),
                returnUrl="http://localhost/home",
            )
        )
        assert create_response.ok is True
        assert create_response.launchIntentToken is not None
        token = create_response.launchIntentToken
        tampered_suffix = "a" if token[-1] != "a" else "b"
        tampered_token = f"{token[:-1]}{tampered_suffix}"

        response = route_launch(LaunchRequest(launchIntentToken=tampered_token))

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "InvalidLaunchIntent"

    def test_launch_intent_rejects_replay(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _WORKSPACE_LAUNCH_INTENT_STORE.clear()

        def fake_launch_workspace_session(**_kwargs):
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        create_response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(
                    workspaceRoot="/tmp/workspace",
                    settaHome="/tmp/setta-home",
                ),
                returnUrl="http://localhost/home",
            )
        )
        assert create_response.ok is True
        assert create_response.launchIntentToken is not None
        token = create_response.launchIntentToken

        first = route_launch(LaunchRequest(launchIntentToken=token))
        second = route_launch(LaunchRequest(launchIntentToken=token))

        assert first.ok is False
        assert first.error is not None
        assert first.error.code == "Captured"
        assert second.ok is False
        assert second.error is not None
        assert second.error.code == "InvalidLaunchIntent"

    def test_launch_intent_rejects_expired_token(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _WORKSPACE_LAUNCH_INTENT_STORE.clear()
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch.LAUNCH_INTENT_TOKEN_MANAGER.validate",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(
                ValueError("Token has expired")
            ),
        )

        response = route_launch(LaunchRequest(launchIntentToken="expired-token"))

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "InvalidLaunchIntent"
        assert "expired" in response.error.message

    def test_create_launch_intent_returns_typed_store_unavailable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch._store_workspace_launch_intent",
            lambda **_kwargs: (_ for _ in ()).throw(
                WorkspaceLaunchIntentStoreUnavailableError("store unavailable")
            ),
        )

        response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(workspaceRoot="/tmp/workspace"),
                returnUrl="http://localhost/home",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "LaunchIntentStoreUnavailable"

    def test_create_launch_intent_returns_store_unavailable_when_lock_path_is_invalid(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        lock_parent = tmp_path / "lock-parent-as-file"
        lock_parent.write_text("not-a-directory", encoding="utf-8")
        broken_store = WorkspaceLaunchIntentStore(
            storage_path=lock_parent / "workspace_launch_intents.json"
        )
        monkeypatch.setattr(
            "setta.routers.launch._WORKSPACE_LAUNCH_INTENT_STORE",
            broken_store,
        )
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )

        # A malformed lock parent must fail as LaunchIntentStoreUnavailable.
        response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(workspaceRoot="/tmp/workspace"),
                returnUrl="http://localhost/home",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "LaunchIntentStoreUnavailable"

    def test_create_launch_intent_returns_typed_store_state_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch._store_workspace_launch_intent",
            lambda **_kwargs: (_ for _ in ()).throw(
                WorkspaceLaunchIntentStoreStateError("store invalid")
            ),
        )

        response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(workspaceRoot="/tmp/workspace"),
                returnUrl="http://localhost/home",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "LaunchIntentStoreInvalid"

    def test_create_launch_intent_returns_typed_capacity_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch._store_workspace_launch_intent",
            lambda **_kwargs: (_ for _ in ()).throw(
                WorkspaceLaunchIntentStoreCapacityError("capacity exceeded")
            ),
        )

        response = route_create_workspace_launch_intent(
            CreateWorkspaceLaunchIntentRequest(
                launchRequest=LaunchRequest(workspaceRoot="/tmp/workspace"),
                returnUrl="http://localhost/home",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "LaunchIntentStoreCapacityExceeded"

    def test_launch_intent_returns_typed_store_unavailable_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch._consume_workspace_launch_intent",
            lambda **_kwargs: (_ for _ in ()).throw(
                WorkspaceLaunchIntentStoreUnavailableError("store unavailable")
            ),
        )

        response = route_launch(LaunchRequest(launchIntentToken="token"))

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "LaunchIntentStoreUnavailable"

    def test_launch_intent_returns_store_unavailable_when_lock_path_is_invalid(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        lock_parent = tmp_path / "lock-parent-as-file"
        lock_parent.write_text("not-a-directory", encoding="utf-8")
        broken_store = WorkspaceLaunchIntentStore(
            storage_path=lock_parent / "workspace_launch_intents.json"
        )
        monkeypatch.setattr(
            "setta.routers.launch._WORKSPACE_LAUNCH_INTENT_STORE",
            broken_store,
        )
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch.LAUNCH_INTENT_TOKEN_MANAGER.validate",
            lambda *_args, **_kwargs: SimpleNamespace(sessionId="session-1"),
        )

        # Consuming a launch intent must return a typed unavailable error instead of
        # leaking an unhandled filesystem exception from lock setup.
        response = route_launch(LaunchRequest(launchIntentToken="token"))

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "LaunchIntentStoreUnavailable"

    def test_create_launch_intent_rejects_disallowed_return_url_origin(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _WORKSPACE_LAUNCH_INTENT_STORE.clear()
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        with TestClient(app, base_url="http://launcher.example") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
                json={
                    "launchRequest": {"workspaceRoot": "/tmp/workspace"},
                    "returnUrl": "https://evil.example/phish",
                },
            )

        response.raise_for_status()
        payload = response.json()
        assert payload["ok"] is False
        assert payload["error"]["code"] == "BadRequest"
        assert "origin is not allowed" in payload["error"]["message"]

    def test_create_launch_intent_rejects_forged_origin_header_return_url(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _WORKSPACE_LAUNCH_INTENT_STORE.clear()
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        with TestClient(app, base_url="http://launcher.example") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
                headers={"origin": "http://backend.example"},
                json={
                    "launchRequest": {"workspaceRoot": "/tmp/workspace"},
                    "returnUrl": "http://backend.example/home",
                },
            )

        response.raise_for_status()
        payload = response.json()
        # Caller-controlled Origin headers must not expand the return-url allowlist.
        assert payload["ok"] is False
        assert payload["error"]["code"] == "BadRequest"
        assert "origin is not allowed" in payload["error"]["message"]

    def test_create_launch_intent_allows_session_trusted_return_url_origin(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        _WORKSPACE_LAUNCH_INTENT_STORE.clear()
        store = TrustedFrontendOriginStore(
            storage_path=tmp_path / "trusted_frontend_origins.json"
        )
        monkeypatch.setattr(
            trusted_frontend_origins_module,
            "_TRUSTED_FRONTEND_ORIGIN_STORE",
            store,
        )
        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="session-1"), b"secret"),
        )
        trust_frontend_origin(
            "http://backend.example",
            session_id="session-1",
            exp=9999999999,
            now=100,
        )
        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        with TestClient(app, base_url="http://launcher.example") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.CREATE_WORKSPACE_LAUNCH_INTENT.value}",
                headers={"origin": "http://backend.example"},
                json={
                    "launchRequest": {"workspaceRoot": "/tmp/workspace"},
                    "returnUrl": "http://backend.example/home",
                },
            )

        response.raise_for_status()
        payload = response.json()
        assert payload["ok"] is True
        assert payload["launchIntentToken"]

    def test_launch_and_launcher_home_share_setta_files_location_resolution(
        self,
    ) -> None:
        shared_cases = [
            {
                "setta_files_location": None,
                "setta_files_location_provided": False,
                "setta_files_root": None,
                "profile": None,
                "expected": "auto",
            },
            {
                "setta_files_location": None,
                "setta_files_location_provided": False,
                "setta_files_root": None,
                "profile": "dev",
                "expected": None,
            },
            {
                "setta_files_location": "auto",
                "setta_files_location_provided": True,
                "setta_files_root": None,
                "profile": "dev",
                "expected": "auto",
            },
            {
                "setta_files_location": "auto",
                "setta_files_location_provided": True,
                "setta_files_root": "/tmp/setta-files",
                "profile": None,
                "expected": None,
            },
            {
                "setta_files_location": "global",
                "setta_files_location_provided": True,
                "setta_files_root": None,
                "profile": None,
                "expected": "global",
            },
        ]

        for case in shared_cases:
            launch_value = normalize_setta_files_location_for_launch(
                setta_files_location=case["setta_files_location"],
                setta_files_location_provided=case["setta_files_location_provided"],
                setta_files_root=case["setta_files_root"],
                profile=case["profile"],
            )
            launcher_home_value = normalize_setta_files_location_for_launcher_home(
                setta_files_location=case["setta_files_location"],
                setta_files_location_provided=case["setta_files_location_provided"],
                setta_files_root=case["setta_files_root"],
                profile=case["profile"],
            )
            assert launch_value == case["expected"]
            assert launcher_home_value == case["expected"]

    def test_launch_local_profile_without_setta_home_uses_runtime_and_lookup_homes(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            captured["profile_lookup_home"] = kwargs.get("profile_lookup_home")
            raise LaunchError("Captured", "intentional capture")

        class _Paths:
            setta_home = Path("/tmp/runtime/.setta-development")
            profile_lookup_home = Path("/tmp/lookup/.setta")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr(
            "setta.routers.launch.get_setta_paths_without_profile_env",
            lambda: _Paths(),
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == str(_Paths.setta_home)
        assert captured["profile_lookup_home"] == str(_Paths.profile_lookup_home)

    def test_launch_local_without_profile_uses_runtime_setta_home_default(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            raise LaunchError("Captured", "intentional capture")

        class _Paths:
            setta_home = Path("/tmp/runtime/.setta-development")
            profile_lookup_home = Path("/tmp/lookup/.setta")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr(
            "setta.routers.launch.get_setta_paths_without_profile_env",
            lambda: _Paths(),
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == str(_Paths.setta_home)

    def test_launch_local_without_profile_does_not_mutate_profile_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            raise LaunchError("Captured", "intentional capture")

        class _Paths:
            setta_home = Path("/tmp/runtime/.setta-development")
            profile_lookup_home = Path("/tmp/lookup/.setta")

        def fake_get_setta_paths_without_profile_env() -> _Paths:
            captured["profile_env_seen"] = os.environ.get("SETTA_PROFILE")
            return _Paths()

        monkeypatch.setenv("SETTA_PROFILE", "missing-profile")
        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr(
            "setta.routers.launch.get_setta_paths_without_profile_env",
            fake_get_setta_paths_without_profile_env,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == str(_Paths.setta_home)
        assert captured["profile_env_seen"] == "missing-profile"
        assert os.environ.get("SETTA_PROFILE") == "missing-profile"

    def test_launch_local_whitespace_profile_is_treated_as_omitted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            captured["profile"] = kwargs.get("profile")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="   ",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] == "auto"
        assert captured["profile"] is None

    def test_launch_local_normalizes_optional_path_arguments(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_home"] = kwargs.get("setta_home")
            captured["setta_files_root"] = kwargs.get("setta_files_root")
            captured["runtime_root"] = kwargs.get("runtime_root")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr(
            "setta.routers.launch.get_setta_paths_without_profile_env",
            lambda: type(
                "_Paths",
                (),
                {
                    "setta_home": Path("/tmp/runtime/.setta-development"),
                    "profile_lookup_home": Path("/tmp/lookup/.setta"),
                },
            )(),
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
                settaHome="   ",
                settaFilesRoot="\t",
                runtimeRoot="\n",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_home"] == "/tmp/runtime/.setta-development"
        assert captured["setta_files_root"] is None
        assert captured["runtime_root"] is None

    def test_launch_local_explicit_root_preserves_omitted_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                settaFilesRoot="/tmp/workspace/setta_files_dev",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] is None

    def test_launch_local_profile_with_auto_keeps_explicit_auto_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                profile="dev",
                settaFilesLocation="auto",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] == "auto"

    def test_launch_local_explicit_root_with_auto_keeps_explicit_auto_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                settaFilesRoot="/tmp/workspace/setta_files_dev",
                settaFilesLocation="auto",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["setta_files_location"] is None

    def test_launch_local_explicit_root_with_auto_surfaces_workspace_validation(
        self,
    ) -> None:
        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
                settaFilesRoot="/tmp/workspace/setta_files_dev",
                settaFilesLocation="auto",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "InvalidWorkspace"
        assert "Workspace root does not exist" in response.error.message

    def test_launch_local_disables_all_env_overrides(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_launch_workspace_session(**kwargs):
            captured["allow_env_files_overrides"] = kwargs.get(
                "allow_env_files_overrides"
            )
            captured["allow_env_non_files_overrides"] = kwargs.get(
                "allow_env_non_files_overrides"
            )
            raise LaunchError("Captured", "intentional capture")

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/tmp/workspace",
            )
        )

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "Captured"
        assert captured["allow_env_files_overrides"] is False
        assert captured["allow_env_non_files_overrides"] is False

    def test_launch_local_updates_launcher_last_used_workspace(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}
        workspace_root = Path("/tmp/workspace").resolve(strict=False)
        setta_home = Path("/tmp/.setta").resolve(strict=False)
        setta_files_root = (workspace_root / "setta_files").resolve(strict=False)
        runtime_root = (setta_files_root / "runtime").resolve(strict=False)

        result = SimpleNamespace(
            session=SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            registry=SimpleNamespace(load_secret=lambda _session: b"secret"),
            paths=SimpleNamespace(
                workspace_root=workspace_root,
                setta_files_location="local",
                setta_files_root=setta_files_root,
                runtime_root=runtime_root,
                setta_home=setta_home,
                profile_name=None,
            ),
            started_new=False,
        )

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session", lambda **_k: result
        )
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **kwargs: captured.update(kwargs) or True,
        )
        monkeypatch.setattr(
            "setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok"
        )
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )

        response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))

        assert response.ok is True
        assert captured["setta_home"] == setta_home
        assert captured["workspace_root"] == workspace_root

    @pytest.mark.parametrize(
        "raised_error",
        [
            LauncherMetadataError("invalid launcher metadata"),
            OSError("disk full"),
        ],
    )
    def test_launch_local_ignores_launcher_metadata_update_errors(
        self,
        monkeypatch: pytest.MonkeyPatch,
        raised_error: Exception,
    ) -> None:
        workspace_root = Path("/tmp/workspace").resolve(strict=False)
        setta_home = Path("/tmp/.setta").resolve(strict=False)
        setta_files_root = (workspace_root / "setta_files").resolve(strict=False)
        runtime_root = (setta_files_root / "runtime").resolve(strict=False)

        result = SimpleNamespace(
            session=SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            registry=SimpleNamespace(load_secret=lambda _session: b"secret"),
            paths=SimpleNamespace(
                workspace_root=workspace_root,
                setta_files_location="local",
                setta_files_root=setta_files_root,
                runtime_root=runtime_root,
                setta_home=setta_home,
                profile_name=None,
            ),
            started_new=False,
        )

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session", lambda **_k: result
        )
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **_kwargs: (_ for _ in ()).throw(raised_error),
        )
        monkeypatch.setattr(
            "setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok"
        )
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )

        response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))

        assert response.ok is True

    def test_launch_ssh_profile_preserves_omitted_setta_files_location(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_connect_remote_workspace_session(**kwargs) -> RemoteConnectResult:
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    server_mode="ide",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="local",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile="dev",
                launcher_origin=None,
                launcher_origin_proof=None,
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/requested/workspace",
                sshTarget="user@host",
                profile="dev",
            )
        )

        assert response.ok is True
        assert captured["setta_files_location"] is None

    def test_launch_ssh_whitespace_profile_is_treated_as_omitted(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict[str, object] = {}

        def fake_connect_remote_workspace_session(**kwargs) -> RemoteConnectResult:
            captured["setta_files_location"] = kwargs.get("setta_files_location")
            captured["profile"] = kwargs.get("profile")
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    server_mode="ide",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="local",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile=None,
                launcher_origin=None,
                launcher_origin_proof=None,
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/requested/workspace",
                sshTarget="user@host",
                profile="   ",
            )
        )

        assert response.ok is True
        assert captured["setta_files_location"] == "auto"
        assert captured["profile"] is None

    def test_launch_returns_structured_error_for_value_error(self) -> None:
        response = route_launch(LaunchRequest(workspaceRoot="bad\u0000path"))
        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "BadRequest"

    def test_launch_returns_structured_error_for_invalid_runtime_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            runtime_root_file = tmp_path / "runtime-root-file"
            runtime_root_file.write_text("not a directory", encoding="utf-8")

            response = route_launch(
                LaunchRequest(
                    workspaceRoot=str(workspace_root),
                    runtimeRoot=str(runtime_root_file),
                )
            )
            assert response.ok is False
            assert response.error is not None
            assert response.error.code == "InvalidRuntimeRoot"
            assert "runtime root is not a directory" in response.error.message

    def test_launch_returns_structured_error_for_invalid_setta_home(self) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            invalid_setta_home = tmp_path / "custom-home"

            response = route_launch(
                LaunchRequest(
                    workspaceRoot=str(workspace_root),
                    settaHome=str(invalid_setta_home),
                )
            )
            assert response.ok is False
            assert response.error is not None
            assert response.error.code == "InvalidSettaHome"
            assert "must end with one of" in response.error.message

    def test_launch_returns_structured_error_for_runtime_root_matching_workspace(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            response = route_launch(
                LaunchRequest(
                    workspaceRoot=str(workspace_root),
                    runtimeRoot=str(workspace_root),
                )
            )
            assert response.ok is False
            assert response.error is not None
            assert response.error.code == "InvalidRuntimeRoot"
            assert "Runtime root cannot be the workspace root" in response.error.message

    def test_launch_over_ssh_returns_bootstrap_url(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        ssh_stub_dir = repo_root / "scripts" / "test"
        assert (ssh_stub_dir / "ssh").exists()

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            paths = resolve_setta_paths(workspace_root=workspace_root)
            sessions_root = paths.runtime_sessions_root
            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=paths.workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )

            pid_file = tmp_path / "ssh_tunnel_pid.txt"
            old_path = os.environ.get("PATH", "")

            try:
                os.environ["PATH"] = f"{ssh_stub_dir.as_posix()}:{old_path}"
                os.environ["SETTA_SSH_BIN"] = (ssh_stub_dir / "ssh").as_posix()
                os.environ["SETTA_SSH_STUB_PID_FILE"] = pid_file.as_posix()
                os.environ["SETTA_SSH_STUB_DISABLE_FORWARD"] = "1"
                os.environ["SETTA_SESSION_ID"] = session.id
                os.environ["SETTA_SESSIONS_ROOT"] = sessions_root.as_posix()

                with temporary_setta_paths(
                    workspace_root=paths.workspace_root,
                    runtime_root=paths.runtime_root,
                    setta_files_location="local",
                ):
                    response = route_launch(
                        LaunchRequest(
                            workspaceRoot="/remote/workspace",
                            sshTarget="user@host",
                            localPort=61000,
                        )
                    )
                assert response.ok is True
                assert response.bootstrapUrlFragment is not None
                assert "/__setta__/bootstrap#token=" in response.bootstrapUrlFragment
                assert response.sessionId == session.id
                assert response.settaFilesLocation == "local"
            finally:
                if pid_file.exists():
                    pid_str = pid_file.read_text(encoding="utf-8").strip()
                    if pid_str:
                        pid = int(pid_str)
                        try:
                            os.kill(pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                        else:
                            try:
                                os.waitpid(pid, 0)
                            except ChildProcessError:
                                pass
                os.environ.pop("SETTA_SSH_STUB_PID_FILE", None)
                os.environ.pop("SETTA_SSH_STUB_DISABLE_FORWARD", None)
                os.environ.pop("SETTA_SSH_BIN", None)
                os.environ.pop("SETTA_SESSION_ID", None)
                os.environ.pop("SETTA_SESSIONS_ROOT", None)
                os.environ["PATH"] = old_path

    def test_launch_over_ssh_reuses_existing_tunnel(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        ssh_stub_dir = repo_root / "scripts" / "test"
        assert (ssh_stub_dir / "ssh").exists()

        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            paths = resolve_setta_paths(workspace_root=workspace_root)
            sessions_root = paths.runtime_sessions_root
            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=paths.workspace_root,
                host="127.0.0.1",
                port=61234,
                pid=os.getpid(),
            )

            pid_file = tmp_path / "ssh_tunnel_pid.txt"
            old_path = os.environ.get("PATH", "")

            try:
                os.environ["PATH"] = f"{ssh_stub_dir.as_posix()}:{old_path}"
                os.environ["SETTA_SSH_BIN"] = (ssh_stub_dir / "ssh").as_posix()
                os.environ["SETTA_SSH_STUB_PID_FILE"] = pid_file.as_posix()
                os.environ["SETTA_SSH_STUB_DISABLE_FORWARD"] = "1"
                os.environ["SETTA_SESSION_ID"] = session.id
                os.environ["SETTA_SESSIONS_ROOT"] = sessions_root.as_posix()

                request = LaunchRequest(
                    workspaceRoot="/remote/workspace",
                    sshTarget="user@host",
                    localPort=61000,
                )

                with temporary_setta_paths(
                    workspace_root=paths.workspace_root,
                    runtime_root=paths.runtime_root,
                    setta_files_location="local",
                ):
                    response1 = route_launch(request)
                    assert response1.ok is True
                    pid1 = int(pid_file.read_text(encoding="utf-8").strip())
                    assert pid1 > 0

                    response2 = route_launch(request)
                    assert response2.ok is True
                    pid2 = int(pid_file.read_text(encoding="utf-8").strip())
                    assert pid1 == pid2
                    assert response2.settaFilesLocation == "local"
            finally:
                if pid_file.exists():
                    pid_str = pid_file.read_text(encoding="utf-8").strip()
                    if pid_str:
                        pid = int(pid_str)
                        try:
                            os.kill(pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                        else:
                            try:
                                os.waitpid(pid, 0)
                            except ChildProcessError:
                                pass
                os.environ.pop("SETTA_SSH_STUB_PID_FILE", None)
                os.environ.pop("SETTA_SSH_STUB_DISABLE_FORWARD", None)
                os.environ.pop("SETTA_SSH_BIN", None)
                os.environ.pop("SETTA_SESSION_ID", None)
                os.environ.pop("SETTA_SESSIONS_ROOT", None)
                os.environ["PATH"] = old_path

    def test_launch_over_ssh_returns_resolved_remote_paths(self, monkeypatch) -> None:
        def fake_connect_remote_workspace_session(**_kwargs) -> RemoteConnectResult:
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    server_mode="ide",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="global",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile="dev",
                launcher_origin=None,
                launcher_origin_proof=None,
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        response = route_launch(
            LaunchRequest(
                workspaceRoot="/requested/workspace",
                sshTarget="user@host",
            )
        )

        assert response.ok is True
        assert response.settaFilesLocation == "global"
        assert response.settaFilesRoot == "/remote/state"
        assert response.runtimeRoot == "/remote/runtime"
        assert response.settaHome == "/remote/home/.setta"
        assert response.profile == "dev"
        assert response.remoteCmdResolved == "setta"

    def test_launch_over_ssh_requires_remote_launcher_origin_proof(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        def fake_connect_remote_workspace_session(**_kwargs) -> RemoteConnectResult:
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    server_mode="ide",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="global",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile="dev",
                launcher_origin="http://launcher.example:7999",
                launcher_origin_proof=None,
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        with TestClient(app, base_url="http://launcher.example:7999") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.LAUNCH.value}",
                json={
                    "workspaceRoot": "/requested/workspace",
                    "sshTarget": "user@host",
                },
            )

        response.raise_for_status()
        payload = response.json()
        assert payload["ok"] is False
        assert payload["error"]["code"] == "RemoteConnectInfo"

    def test_launch_over_ssh_uses_request_origin_for_handoff(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        def fake_connect_remote_workspace_session(**_kwargs) -> RemoteConnectResult:
            return RemoteConnectResult(
                bootstrap_url_fragment="http://127.0.0.1:61000/__setta__/bootstrap#token=x",
                session=RemoteSessionSummary(
                    id="remote-session-id",
                    workspace_path="/remote/workspace",
                    workspace_path_canonical="/remote/workspace",
                    server_mode="ide",
                    host="127.0.0.1",
                    port=61234,
                    pid=12345,
                    started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
                ),
                started_new=False,
                remote_cmd_resolved="setta",
                setta_files_location="global",
                setta_files_root="/remote/state",
                runtime_root="/remote/runtime",
                setta_home="/remote/home/.setta",
                profile="dev",
                launcher_origin="https://evil.example",
                launcher_origin_proof="proof",
            )

        monkeypatch.setattr(
            "setta.routers.launch.connect_remote_workspace_session",
            fake_connect_remote_workspace_session,
        )

        with TestClient(app, base_url="http://launcher.example:7999") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.LAUNCH.value}",
                json={
                    "workspaceRoot": "/requested/workspace",
                    "sshTarget": "user@host",
                },
            )

        response.raise_for_status()
        payload = response.json()
        assert payload["ok"] is True
        hash_params = parse_qs(urlsplit(payload["bootstrapUrlFragment"]).fragment)
        assert hash_params.get("lo") == ["http://launcher.example:7999"]

    def test_launch_local_does_not_inherit_server_files_location_env(
        self, monkeypatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
            global_base = (setta_home / "setta_files").resolve(strict=False)
            global_root = build_files_root_from_base(
                global_base, workspace_root
            ).resolve(strict=False)

            local_sessions_root = (
                workspace_root / "setta_files" / "runtime" / "sessions"
            )
            local_sessions_root.mkdir(parents=True, exist_ok=True)
            local_setta_files_root = (workspace_root / "setta_files").resolve(
                strict=False
            )
            local_runtime_root = (local_setta_files_root / "runtime").resolve(
                strict=False
            )
            global_sessions_root = global_root / "runtime" / "sessions"
            global_sessions_root.mkdir(parents=True, exist_ok=True)
            global_runtime_root = (global_root / "runtime").resolve(strict=False)

            server_socket_local = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server_socket_global = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket_local.bind(("127.0.0.1", 0))
                server_socket_local.listen(1)
                local_port = server_socket_local.getsockname()[1]
                server_socket_global.bind(("127.0.0.1", 0))
                server_socket_global.listen(1)
                global_port = server_socket_global.getsockname()[1]
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")

            local_registry = SessionRegistry(sessions_root=local_sessions_root)
            local_session = local_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=local_port,
                pid=os.getpid(),
                setta_files_location="local",
                setta_files_root=str(local_setta_files_root),
                runtime_root=str(local_runtime_root),
                setta_home=str(setta_home),
                profile=None,
            )

            global_registry = SessionRegistry(sessions_root=global_sessions_root)
            global_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=global_port,
                pid=os.getpid(),
                setta_files_location="global",
                setta_files_root=str(global_root),
                runtime_root=str(global_runtime_root),
                setta_home=str(setta_home),
                profile=None,
            )

            # Simulate the running server process having a global override.
            monkeypatch.setenv("SETTA_FILES_LOCATION", "global")

            try:
                response = route_launch(
                    LaunchRequest(workspaceRoot=str(workspace_root))
                )
            finally:
                server_socket_local.close()
                server_socket_global.close()

            assert response.ok is True
            assert response.sessionId == local_session.id
            assert response.settaFilesLocation == "local"

    def test_launch_profile_does_not_inherit_server_files_root_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)
            env_state_root = tmp_path / "env_state" / "setta_files_dev"
            env_sessions_root = env_state_root / "runtime" / "sessions"
            env_sessions_root.mkdir(parents=True, exist_ok=True)
            env_runtime_root = (env_state_root / "runtime").resolve(strict=False)
            local_sessions_root = (
                workspace_root / "setta_files" / "runtime" / "sessions"
            )
            local_sessions_root.mkdir(parents=True, exist_ok=True)
            local_setta_files_root = (workspace_root / "setta_files").resolve(
                strict=False
            )
            local_runtime_root = (local_setta_files_root / "runtime").resolve(
                strict=False
            )

            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
            profiles_dir = setta_home / "profiles"
            profiles_dir.mkdir(parents=True, exist_ok=True)
            (profiles_dir / "dev.json").write_text(
                json.dumps(
                    {
                        "name": "dev",
                        "workspaceRoot": str(workspace_root),
                    },
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )
            clear_setta_paths_cache()

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            monkeypatch.setenv("SETTA_FILES_ROOT", str(env_state_root))

            local_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            env_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                local_socket.bind(("127.0.0.1", 0))
                local_socket.listen(1)
                local_port = local_socket.getsockname()[1]
                env_socket.bind(("127.0.0.1", 0))
                env_socket.listen(1)
                env_port = env_socket.getsockname()[1]
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")

            local_registry = SessionRegistry(sessions_root=local_sessions_root)
            local_session = local_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=local_port,
                pid=os.getpid(),
                setta_files_location="local",
                setta_files_root=str(local_setta_files_root),
                runtime_root=str(local_runtime_root),
                setta_home=str(setta_home),
                profile="dev",
            )

            env_registry = SessionRegistry(sessions_root=env_sessions_root)
            env_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=env_port,
                pid=os.getpid(),
                setta_files_location=None,
                setta_files_root=str(env_state_root.resolve(strict=False)),
                runtime_root=str(env_runtime_root),
                setta_home=str(setta_home),
                profile="dev",
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        profile="dev",
                    )
                )
            finally:
                local_socket.close()
                env_socket.close()

            assert response.ok is True
            assert response.sessionId == local_session.id
            assert response.settaFilesLocation == "local"
            assert response.settaFilesRoot == str(
                (workspace_root / "setta_files").resolve(strict=False)
            )

    def test_launch_profile_uses_profile_setta_home_for_runtime_roots(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)

            lookup_home = tmp_path / "lookup" / ".setta"
            runtime_home = tmp_path / "runtime" / ".setta-development"
            profiles_dir = lookup_home / "profiles"
            profiles_dir.mkdir(parents=True, exist_ok=True)
            (profiles_dir / "dev.json").write_text(
                json.dumps(
                    {
                        "name": "dev",
                        "workspaceRoot": str(workspace_root),
                        "settaHome": str(runtime_home),
                        "settaFilesLocation": "global",
                    },
                    indent=2,
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )

            class _Paths:
                setta_home = runtime_home.resolve(strict=False)
                profile_lookup_home = lookup_home.resolve(strict=False)

            monkeypatch.setattr(
                "setta.routers.launch.get_setta_paths_without_profile_env",
                lambda: _Paths(),
            )
            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")

            global_base = (runtime_home / "setta_files").resolve(strict=False)
            global_root = build_files_root_from_base(
                global_base, workspace_root
            ).resolve(strict=False)
            sessions_root = global_root / "runtime" / "sessions"
            sessions_root.mkdir(parents=True, exist_ok=True)

            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
                setta_files_location="global",
                setta_files_root=str(global_root),
                runtime_root=str((global_root / "runtime").resolve(strict=False)),
                setta_home=str(runtime_home.resolve(strict=False)),
                profile="dev",
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        profile="dev",
                    )
                )
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.settaHome == str(runtime_home.resolve(strict=False))
            assert response.settaFilesLocation == "global"
            assert response.settaFilesRoot == str(global_root)

    def test_launch_does_not_inherit_server_runtime_root_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)

            local_runtime_root = workspace_root / "setta_files" / "runtime"
            local_sessions_root = local_runtime_root / "sessions"
            local_sessions_root.mkdir(parents=True, exist_ok=True)

            env_runtime_root = tmp_path / "env_runtime_root"
            env_sessions_root = env_runtime_root / "sessions"
            env_sessions_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            monkeypatch.setenv("SETTA_RUNTIME_ROOT", str(env_runtime_root))

            local_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            env_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                local_socket.bind(("127.0.0.1", 0))
                local_socket.listen(1)
                local_port = local_socket.getsockname()[1]
                env_socket.bind(("127.0.0.1", 0))
                env_socket.listen(1)
                env_port = env_socket.getsockname()[1]
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")

            local_registry = SessionRegistry(sessions_root=local_sessions_root)
            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
            local_session = local_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=local_port,
                pid=os.getpid(),
                setta_files_location="local",
                setta_files_root=str(
                    (workspace_root / "setta_files").resolve(strict=False)
                ),
                runtime_root=str(local_runtime_root.resolve(strict=False)),
                setta_home=str(setta_home),
                profile=None,
            )

            env_registry = SessionRegistry(sessions_root=env_sessions_root)
            env_registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=env_port,
                pid=os.getpid(),
                setta_files_location="local",
                setta_files_root=str(
                    (workspace_root / "setta_files").resolve(strict=False)
                ),
                runtime_root=str(env_runtime_root.resolve(strict=False)),
                setta_home=str(setta_home),
                profile=None,
            )

            try:
                response = route_launch(
                    LaunchRequest(workspaceRoot=str(workspace_root))
                )
            finally:
                local_socket.close()
                env_socket.close()

            assert response.ok is True
            assert response.sessionId == local_session.id
            assert response.runtimeRoot == str(local_runtime_root.resolve(strict=False))

    def test_launch_does_not_inherit_server_profile_env(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)
            sessions_root = workspace_root / "setta_files" / "runtime" / "sessions"
            sessions_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            monkeypatch.setenv("SETTA_PROFILE", "missing-profile")
            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
                setta_files_location="local",
                setta_files_root=str(
                    (workspace_root / "setta_files").resolve(strict=False)
                ),
                runtime_root=str(
                    (workspace_root / "setta_files" / "runtime").resolve(strict=False)
                ),
                setta_home=str(setta_home),
                profile=None,
            )

            try:
                response = route_launch(
                    LaunchRequest(workspaceRoot=str(workspace_root))
                )
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.profile is None

    def test_launch_local_always_wins_even_when_global_requested(
        self, monkeypatch
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)
            local_setta_files_root = (workspace_root / "setta_files").resolve(
                strict=False
            )
            local_runtime_root = (local_setta_files_root / "runtime").resolve(
                strict=False
            )
            sessions_root = local_runtime_root / "sessions"
            sessions_root.mkdir(parents=True, exist_ok=True)

            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
                setta_files_location="local",
                setta_files_root=str(local_setta_files_root),
                runtime_root=str(local_runtime_root),
                setta_home=str(setta_home),
                profile=None,
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        settaFilesLocation="global",
                    )
                )
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.settaFilesLocation == "local"
            assert response.settaFilesRoot == str(local_setta_files_root)

    def test_launch_local_with_explicit_setta_files_root(self, monkeypatch) -> None:
        with TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            workspace_root = tmp_path / "workspace"
            workspace_root.mkdir(parents=True, exist_ok=True)
            (workspace_root / "setta_files").mkdir(parents=True, exist_ok=True)
            explicit_root = tmp_path / "explicit_state" / "setta_files_dev"
            sessions_root = explicit_root / "runtime" / "sessions"
            sessions_root.mkdir(parents=True, exist_ok=True)

            monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
            setta_home = Path(os.environ["SETTA_HOME"]).resolve(strict=False)

            server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                server_socket.bind(("127.0.0.1", 0))
            except OSError:
                pytest.skip("Socket binds are not permitted in this test environment.")
            server_socket.listen(1)
            port = server_socket.getsockname()[1]

            registry = SessionRegistry(sessions_root=sessions_root)
            session = registry.create_session(
                workspace_path=workspace_root,
                host="127.0.0.1",
                port=port,
                pid=os.getpid(),
                setta_files_location=None,
                setta_files_root=str(explicit_root.resolve(strict=False)),
                runtime_root=str((explicit_root / "runtime").resolve(strict=False)),
                setta_home=str(setta_home),
                profile=None,
            )

            try:
                response = route_launch(
                    LaunchRequest(
                        workspaceRoot=str(workspace_root),
                        settaFilesRoot=str(explicit_root),
                    )
                )
            finally:
                server_socket.close()

            assert response.ok is True
            assert response.sessionId == session.id
            assert response.settaFilesLocation is None
            assert response.settaFilesRoot == str(explicit_root.resolve(strict=False))

    def test_launch_route_appends_signed_launcher_origin_to_bootstrap_url(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        def fake_launch_workspace_session(**_kwargs):
            session = SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime.now(timezone.utc),
            )
            paths = SimpleNamespace(
                workspace_root=workspace_root.resolve(strict=False),
                setta_files_location="local",
                setta_files_root=(workspace_root / "setta_files").resolve(strict=False),
                runtime_root=(workspace_root / "setta_files" / "runtime").resolve(
                    strict=False
                ),
                setta_home=Path(os.environ["SETTA_HOME"]).resolve(strict=False),
                profile_name=None,
            )
            registry = SimpleNamespace(load_secret=lambda _session: b"secret")
            return SimpleNamespace(
                session=session,
                paths=paths,
                registry=registry,
                started_new=True,
            )

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **_kwargs: None,
        )
        monkeypatch.setattr(
            "setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint",
            lambda *_a, **_k: "tok",
        )
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )

        with TestClient(app, base_url="http://launcher.example:7999") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.LAUNCH.value}",
                json={"workspaceRoot": str(workspace_root)},
            )

        response.raise_for_status()
        payload = response.json()
        assert payload["ok"] is True
        hash_params = parse_qs(urlsplit(payload["bootstrapUrlFragment"]).fragment)
        assert hash_params.get("token") == ["tok"]
        assert hash_params.get("lo") == ["http://launcher.example:7999"]
        assert len(hash_params.get("lop", [""])) == 1
        assert hash_params["lop"][0]

    def test_launch_route_trusts_launched_workspace_origin_for_launcher_session(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        trusted_origin_store = TrustedFrontendOriginStore(
            storage_path=tmp_path / "trusted_frontend_origins.json"
        )
        monkeypatch.setattr(
            trusted_frontend_origins_module,
            "_TRUSTED_FRONTEND_ORIGIN_STORE",
            trusted_origin_store,
        )
        workspace_root = tmp_path / "workspace"
        workspace_root.mkdir(parents=True, exist_ok=True)
        app = FastAPI()
        app.state.setta = SimpleNamespace(
            deployment_mode=False,
            launcher_mode=False,
            share_mode=False,
            app_mode=False,
        )
        app.include_router(launch_router, prefix=Route.PREFIX.value)

        def fake_launch_workspace_session(**_kwargs):
            session = SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime.now(timezone.utc),
            )
            paths = SimpleNamespace(
                workspace_root=workspace_root.resolve(strict=False),
                setta_files_location="local",
                setta_files_root=(workspace_root / "setta_files").resolve(strict=False),
                runtime_root=(workspace_root / "setta_files" / "runtime").resolve(
                    strict=False
                ),
                setta_home=Path(os.environ["SETTA_HOME"]).resolve(strict=False),
                profile_name=None,
            )
            registry = SimpleNamespace(load_secret=lambda _session: b"secret")
            return SimpleNamespace(
                session=session,
                paths=paths,
                registry=registry,
                started_new=True,
            )

        monkeypatch.setattr(
            "setta.routers.launch.load_current_session_secret",
            lambda: (SimpleNamespace(id="launcher-session"), b"launcher-secret"),
        )
        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session",
            fake_launch_workspace_session,
        )
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **_kwargs: None,
        )
        monkeypatch.setattr(
            "setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint",
            lambda *_a, **_k: "tok",
        )
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )

        with TestClient(app, base_url="http://launcher.example:7999") as client:
            response = client.post(
                f"{Route.PREFIX.value}{Route.LAUNCH.value}",
                json={"workspaceRoot": str(workspace_root)},
            )

        response.raise_for_status()
        payload = response.json()
        assert payload["ok"] is True
        # The launcher session should trust the launched workspace origin for follow-up calls.
        assert (
            trusted_origin_store.is_trusted(
                session_id="launcher-session",
                origin="http://127.0.0.1:61234",
                now=0,
            )
            is True
        )
        assert (
            trusted_origin_store.is_trusted(
                session_id="launcher-session",
                origin="http://127.0.0.1:61235",
                now=0,
            )
            is False
        )

    def test_launch_route_rolls_back_new_session_when_trust_persistence_fails(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        workspace_root = Path("/tmp/workspace").resolve(strict=False)
        setta_home = Path("/tmp/.setta").resolve(strict=False)
        setta_files_root = (workspace_root / "setta_files").resolve(strict=False)
        runtime_root = (setta_files_root / "runtime").resolve(strict=False)
        removed_sessions: list[str] = []
        kill_calls: list[tuple[int, int]] = []

        class _Registry:
            def load_secret(self, _session: object) -> bytes:
                return b"secret"

            def delete_session(self, session_id: str) -> None:
                removed_sessions.append(session_id)

        result = SimpleNamespace(
            session=SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            registry=_Registry(),
            paths=SimpleNamespace(
                workspace_root=workspace_root,
                setta_files_location="local",
                setta_files_root=setta_files_root,
                runtime_root=runtime_root,
                setta_home=setta_home,
                profile_name=None,
            ),
            started_new=True,
        )

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session", lambda **_k: result
        )
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **_kwargs: None,
        )
        monkeypatch.setattr(
            "setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok"
        )
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )
        monkeypatch.setattr(
            "setta.routers.launch.trust_launched_workspace_origin_for_launcher_session",
            lambda **_kwargs: (_ for _ in ()).throw(
                TrustedFrontendOriginStoreError("store unavailable")
            ),
        )
        monkeypatch.setattr(
            "setta.routers.launch.os.kill",
            lambda pid, sig: kill_calls.append((pid, sig)),
        )

        response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "TrustedFrontendOriginStoreUnavailable"
        assert kill_calls == [(12345, signal.SIGTERM)]
        assert removed_sessions == ["session-1"]

    def test_launch_route_does_not_rollback_reused_session_when_trust_persistence_fails(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        workspace_root = Path("/tmp/workspace").resolve(strict=False)
        setta_home = Path("/tmp/.setta").resolve(strict=False)
        setta_files_root = (workspace_root / "setta_files").resolve(strict=False)
        runtime_root = (setta_files_root / "runtime").resolve(strict=False)
        removed_sessions: list[str] = []
        kill_calls: list[tuple[int, int]] = []

        class _Registry:
            def load_secret(self, _session: object) -> bytes:
                return b"secret"

            def delete_session(self, session_id: str) -> None:
                removed_sessions.append(session_id)

        result = SimpleNamespace(
            session=SimpleNamespace(
                id="session-1",
                workspacePath=str(workspace_root),
                workspacePathCanonical=str(workspace_root),
                host="127.0.0.1",
                port=61234,
                pid=12345,
                startedAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            registry=_Registry(),
            paths=SimpleNamespace(
                workspace_root=workspace_root,
                setta_files_location="local",
                setta_files_root=setta_files_root,
                runtime_root=runtime_root,
                setta_home=setta_home,
                profile_name=None,
            ),
            started_new=False,
        )

        monkeypatch.setattr(
            "setta.routers.launch.launch_workspace_session", lambda **_k: result
        )
        monkeypatch.setattr(
            "setta.routers.launch.update_launcher_last_used_workspace_if_installed",
            lambda **_kwargs: None,
        )
        monkeypatch.setattr(
            "setta.routers.launch.BOOTSTRAP_TOKEN_MANAGER.mint", lambda *_a, **_k: "tok"
        )
        monkeypatch.setattr(
            "setta.routers.launch.build_bootstrap_urls",
            lambda host, port, token: (
                f"http://{host}:{port}/__setta__/bootstrap#token={token}",
                f"http://{host}:{port}/__setta__/bootstrap",
            ),
        )
        monkeypatch.setattr(
            "setta.routers.launch.trust_launched_workspace_origin_for_launcher_session",
            lambda **_kwargs: (_ for _ in ()).throw(
                TrustedFrontendOriginStoreError("store unavailable")
            ),
        )
        monkeypatch.setattr(
            "setta.routers.launch.os.kill",
            lambda pid, sig: kill_calls.append((pid, sig)),
        )

        response = route_launch(LaunchRequest(workspaceRoot=str(workspace_root)))

        assert response.ok is False
        assert response.error is not None
        assert response.error.code == "TrustedFrontendOriginStoreUnavailable"
        assert kill_calls == []
        assert removed_sessions == []

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from setta.auth.cookies import (
    auth_cookie_name,
    list_stale_auth_cookie_names,
    set_auth_cookie,
)
from setta.utils.constants import C
from setta.utils.env_vars import WORKSPACE_ROOT_ENV
from setta.utils.paths import clear_setta_paths_cache


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()

    @app.get("/set-cookie")
    async def set_cookie(request: Request):
        response = JSONResponse({"ok": True})
        set_auth_cookie(
            response,
            "token-value",
            session_id="test-session",
            request=request,
        )
        return response

    return app


@pytest.mark.parametrize(
    ("base_url", "expect_secure"),
    [
        ("https://testserver", True),
        ("http://testserver", False),
    ],
)
def test_set_auth_cookie_secure_flags(
    app: FastAPI,
    base_url: str,
    expect_secure: bool,
) -> None:
    with TestClient(app, base_url=base_url) as client:
        response = client.get("/set-cookie")

    assert response.status_code == 200
    cookie_header = response.headers.get("set-cookie", "")
    if expect_secure:
        assert "Secure" in cookie_header
    else:
        assert "Secure" not in cookie_header


def test_auth_cookie_name_requires_non_empty_session_id() -> None:
    with pytest.raises(ValueError):
        auth_cookie_name("  ")


def test_list_stale_auth_cookie_names_only_targets_same_prefix() -> None:
    current_cookie_name = auth_cookie_name("active-session")
    stale_cookie_name = f"{C.AUTH_COOKIE_NAME}_abc123"
    legacy_cookie_name = C.AUTH_COOKIE_NAME

    assert list_stale_auth_cookie_names(
        [
            current_cookie_name,
            stale_cookie_name,
            legacy_cookie_name,
            "other_prefix_cookie",
        ],
        session_id="active-session",
    ) == [stale_cookie_name, legacy_cookie_name]


def test_list_stale_auth_cookie_names_prunes_legacy_generic_namespace_only(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    workspace_cookie_base = "setta_auth_deadbeefcafe"
    current_cookie_name = f"{workspace_cookie_base}_active1"
    stale_workspace_cookie_name = f"{workspace_cookie_base}_stale999"
    legacy_session_cookie_name = "setta_auth_abc123"
    legacy_instance_cookie_name = "setta_auth_workspace_123abc"
    unrelated_workspace_cookie_name = "setta_auth_feedfacecafe_123abc"
    monkeypatch.setattr(C, "AUTH_COOKIE_NAME", workspace_cookie_base)
    monkeypatch.setenv(WORKSPACE_ROOT_ENV, str(tmp_path / "workspace"))
    clear_setta_paths_cache()

    # Workspace-scoped cleanup should also prune the old generic cookie names
    # and the prior ai.sh namespace for the same workspace without touching
    # other workspace namespaces that happen to share the root.
    try:
        assert list_stale_auth_cookie_names(
            [
                current_cookie_name,
                workspace_cookie_base,
                stale_workspace_cookie_name,
                "setta_auth",
                legacy_session_cookie_name,
                legacy_instance_cookie_name,
                unrelated_workspace_cookie_name,
            ],
            session_id="active1",
        ) == [
            workspace_cookie_base,
            stale_workspace_cookie_name,
            "setta_auth",
            legacy_session_cookie_name,
            legacy_instance_cookie_name,
        ]
    finally:
        clear_setta_paths_cache()

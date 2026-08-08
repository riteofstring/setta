import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from setta.auth.cookies import auth_cookie_name, set_auth_cookie


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

from setta.mcp import client as mcp_client_mod
from setta.utils.constants import C


def test_select_auth_cookie_name_prefers_session_cookie() -> None:
    prefix = f"{C.AUTH_COOKIE_NAME}_"
    selected = mcp_client_mod._select_auth_cookie_name(
        ["other", f"{prefix}session123", C.AUTH_COOKIE_NAME]
    )
    assert selected == f"{prefix}session123"


def test_select_auth_cookie_name_falls_back_to_base_cookie() -> None:
    selected = mcp_client_mod._select_auth_cookie_name(["other", C.AUTH_COOKIE_NAME])
    assert selected == C.AUTH_COOKIE_NAME


def test_select_auth_cookie_name_returns_none_when_missing() -> None:
    assert mcp_client_mod._select_auth_cookie_name(["other", "another"]) is None


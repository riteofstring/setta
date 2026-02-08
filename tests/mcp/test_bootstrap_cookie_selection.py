from setta.auth import bootstrap as bootstrap_mod
from setta.utils.constants import C


def test_select_auth_cookie_name_prefers_session_cookie() -> None:
    prefix = f"{C.AUTH_COOKIE_NAME}_"
    selected = bootstrap_mod.select_auth_cookie_name(
        ["other", f"{prefix}session123", C.AUTH_COOKIE_NAME]
    )
    assert selected == f"{prefix}session123"


def test_select_auth_cookie_name_does_not_accept_base_cookie() -> None:
    selected = bootstrap_mod.select_auth_cookie_name(["other", C.AUTH_COOKIE_NAME])
    assert selected is None


def test_select_auth_cookie_name_returns_none_when_missing() -> None:
    assert bootstrap_mod.select_auth_cookie_name(["other", "another"]) is None

from setta.api import runner as runner_mod
from setta.utils.constants import C


def test_select_auth_cookie_name_prefers_session_cookie() -> None:
    prefix = f"{C.AUTH_COOKIE_NAME}_"
    selected = runner_mod._select_auth_cookie_name(
        ["other", f"{prefix}session123", C.AUTH_COOKIE_NAME]
    )
    assert selected == f"{prefix}session123"


def test_select_auth_cookie_name_falls_back_to_base_cookie() -> None:
    selected = runner_mod._select_auth_cookie_name(["other", C.AUTH_COOKIE_NAME])
    assert selected == C.AUTH_COOKIE_NAME


def test_select_auth_cookie_name_returns_none_when_missing() -> None:
    assert runner_mod._select_auth_cookie_name(["other", "another"]) is None


import pytest

from setta.auth.cookies import auth_cookie_name


def test_auth_cookie_name_requires_non_empty_session_id() -> None:
    with pytest.raises(ValueError):
        auth_cookie_name("  ")

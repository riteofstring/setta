from setta.utils.constants import normalize_cookie_name


def test_normalize_cookie_name_defaults_when_missing() -> None:
    assert normalize_cookie_name(None) == "setta_auth"
    assert normalize_cookie_name("") == "setta_auth"
    assert normalize_cookie_name("   ") == "setta_auth"


def test_normalize_cookie_name_sanitizes_to_http_token() -> None:
    assert normalize_cookie_name(" setta_auth ") == "setta_auth"
    assert normalize_cookie_name("setta auth") == "setta_auth"
    assert normalize_cookie_name("setta;auth") == "setta_auth"
    assert normalize_cookie_name("setta\\auth") == "setta_auth"
    assert normalize_cookie_name("setta_auth-1") == "setta_auth-1"

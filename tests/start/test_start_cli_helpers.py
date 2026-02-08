import io
import os
import tempfile
from pathlib import Path

import click
import pytest

from setta.mcp.namespacing import MCP_TOOL_NAME_SEPARATOR
from setta.launch import LaunchError
from setta.start import (
    _base_url_from_auth_payload,
    _build_tool_call_url,
    _cookie_header_from_auth_payload,
    _load_auth_payload,
    _load_json_payload,
    _normalize_base_url,
    _normalize_tool_name,
    _resolve_remote_workspace,
    _strip_cookie_header_prefix,
)
from setta.types.routes import Route


@pytest.fixture
def stdin_reader(monkeypatch):
    def _set(value: str) -> None:
        import sys

        monkeypatch.setattr(sys, "stdin", io.StringIO(value))

    return _set


def test_normalize_base_url_strips_api() -> None:
    result = _normalize_base_url("example.com:1234/api")
    assert result == "http://example.com:1234"


def test_normalize_base_url_adds_scheme() -> None:
    result = _normalize_base_url("localhost:8000")
    assert result == "http://localhost:8000"


def test_normalize_base_url_rejects_empty() -> None:
    with pytest.raises(click.ClickException):
        _normalize_base_url("   ")


def test_build_tool_call_url_uses_tools_call_route() -> None:
    result = _build_tool_call_url("example.com:1234/api/")
    assert result == f"http://example.com:1234{Route.TOOLS_CALL.value}"


def test_load_json_payload_inline() -> None:
    payload = _load_json_payload('{"a": 1}', False, None)
    assert payload == {"a": 1}


def test_load_json_payload_file() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / "payload.json"
        path.write_text('{"ok": true}', encoding="utf-8")
        payload = _load_json_payload(None, False, path)
    assert payload == {"ok": True}


def test_load_json_payload_stdin(stdin_reader) -> None:
    stdin_reader("{}")
    payload = _load_json_payload(None, True, None)
    assert payload == {}


def test_load_json_payload_rejects_multiple_sources() -> None:
    with pytest.raises(click.ClickException):
        _load_json_payload("{}", True, None)


def test_load_auth_payload_from_file() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / "auth.json"
        path.write_text('{"cookieHeader": "Cookie: name=value"}', encoding="utf-8")
        payload = _load_auth_payload(path, False)
    assert payload["cookieHeader"] == "Cookie: name=value"


def test_load_auth_payload_empty_rejected() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / "auth.json"
        path.write_text("   ", encoding="utf-8")
        with pytest.raises(click.ClickException):
            _load_auth_payload(path, False)


def test_load_auth_payload_requires_object() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / "auth.json"
        path.write_text("[]", encoding="utf-8")
        with pytest.raises(click.ClickException):
            _load_auth_payload(path, False)


def test_strip_cookie_header_prefix() -> None:
    assert _strip_cookie_header_prefix("Cookie: foo=bar") == "foo=bar"
    assert _strip_cookie_header_prefix("cookie: foo=bar") == "foo=bar"
    assert _strip_cookie_header_prefix("foo=bar") == "foo=bar"


def test_cookie_header_from_auth_payload_prefers_header() -> None:
    payload = {"cookieHeader": "Cookie: name=value", "cookie": "ignored=1"}
    assert _cookie_header_from_auth_payload(payload) == "name=value"


def test_cookie_header_from_auth_payload_adds_name() -> None:
    payload = {"cookie": "tokenvalue", "cookieName": "settaAuth"}
    assert _cookie_header_from_auth_payload(payload) == "settaAuth=tokenvalue"


def test_cookie_header_from_auth_payload_missing() -> None:
    with pytest.raises(click.ClickException):
        _cookie_header_from_auth_payload({})


def test_base_url_from_auth_payload() -> None:
    payload = {"baseUrl": "example.com:9999/api"}
    assert _base_url_from_auth_payload(payload) == "http://example.com:9999"
    payload = {"apiBaseUrl": "http://127.0.0.1:8000/api"}
    assert _base_url_from_auth_payload(payload) == "http://127.0.0.1:8000"
    assert _base_url_from_auth_payload({}) is None


def test_normalize_tool_name() -> None:
    assert _normalize_tool_name(" getProjectConfig ") == "getProjectConfig"
    with pytest.raises(click.ClickException):
        _normalize_tool_name("")
    with pytest.raises(click.ClickException):
        _normalize_tool_name("/path")
    with pytest.raises(click.ClickException):
        _normalize_tool_name(f"setta{MCP_TOOL_NAME_SEPARATOR}tool")


def test_resolve_remote_workspace_adds_hint_for_local_tilde_expansion(monkeypatch) -> None:
    import setta.start as start_module

    def fake_resolve_remote_workspace(*_args, **_kwargs):
        raise LaunchError("RemoteWorkspace", "Failed to resolve remote workspace.")

    monkeypatch.setattr(
        start_module.ssh_common,
        "resolve_remote_workspace",
        fake_resolve_remote_workspace,
    )

    home = os.path.expanduser("~")
    if not home:
        pytest.skip("Missing local home directory for tilde-expansion hint test.")
    workspace = f"{home.rstrip('/\\\\')}/repo"

    with pytest.raises(click.ClickException) as excinfo:
        _resolve_remote_workspace("user@host", [], "bash", workspace)
    message = str(excinfo.value)
    assert "expanded '~'" in message
    assert "--workspace" in message

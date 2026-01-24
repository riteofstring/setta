import io
import tempfile
import unittest
from pathlib import Path

import click

from setta.mcp.namespacing import MCP_TOOL_NAME_SEPARATOR
from setta.start import (
    _base_url_from_auth_payload,
    _build_tool_call_url,
    _cookie_header_from_auth_payload,
    _load_auth_payload,
    _load_json_payload,
    _normalize_base_url,
    _normalize_tool_name,
    _strip_cookie_header_prefix,
)
from setta.types.routes import Route


class StartCliHelperTests(unittest.TestCase):
    def setUp(self) -> None:
        import sys

        self._original_stdin = sys.stdin
        self._stdin_ref = None
        self.addCleanup(self._restore_stdin)

    def _set_stdin(self, value: str) -> None:
        self._stdin_ref = io.StringIO(value)
        import sys

        self._original_stdin = sys.stdin
        sys.stdin = self._stdin_ref

    def _restore_stdin(self) -> None:
        if self._stdin_ref is None:
            return
        import sys

        sys.stdin = self._original_stdin
        self._stdin_ref = None

    def test_normalize_base_url_strips_api(self) -> None:
        result = _normalize_base_url("example.com:1234/api")
        self.assertEqual(result, "http://example.com:1234")

    def test_normalize_base_url_adds_scheme(self) -> None:
        result = _normalize_base_url("localhost:8000")
        self.assertEqual(result, "http://localhost:8000")

    def test_normalize_base_url_rejects_empty(self) -> None:
        with self.assertRaises(click.ClickException):
            _normalize_base_url("   ")

    def test_build_tool_call_url_uses_tools_call_route(self) -> None:
        result = _build_tool_call_url("example.com:1234/api/")
        self.assertEqual(result, f"http://example.com:1234{Route.TOOLS_CALL.value}")

    def test_load_json_payload_inline(self) -> None:
        payload = _load_json_payload('{"a": 1}', False, None)
        self.assertEqual(payload, {"a": 1})

    def test_load_json_payload_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "payload.json"
            path.write_text('{"ok": true}', encoding="utf-8")
            payload = _load_json_payload(None, False, path)
        self.assertEqual(payload, {"ok": True})

    def test_load_json_payload_stdin(self) -> None:
        self._set_stdin("{}")
        payload = _load_json_payload(None, True, None)
        self.assertEqual(payload, {})

    def test_load_json_payload_rejects_multiple_sources(self) -> None:
        with self.assertRaises(click.ClickException):
            _load_json_payload("{}", True, None)

    def test_load_auth_payload_from_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "auth.json"
            path.write_text('{"cookieHeader": "Cookie: name=value"}', encoding="utf-8")
            payload = _load_auth_payload(path, False)
        self.assertEqual(payload["cookieHeader"], "Cookie: name=value")

    def test_load_auth_payload_empty_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "auth.json"
            path.write_text("   ", encoding="utf-8")
            with self.assertRaises(click.ClickException):
                _load_auth_payload(path, False)

    def test_load_auth_payload_requires_object(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "auth.json"
            path.write_text("[]", encoding="utf-8")
            with self.assertRaises(click.ClickException):
                _load_auth_payload(path, False)

    def test_strip_cookie_header_prefix(self) -> None:
        self.assertEqual(_strip_cookie_header_prefix("Cookie: foo=bar"), "foo=bar")
        self.assertEqual(_strip_cookie_header_prefix("cookie: foo=bar"), "foo=bar")
        self.assertEqual(_strip_cookie_header_prefix("foo=bar"), "foo=bar")

    def test_cookie_header_from_auth_payload_prefers_header(self) -> None:
        payload = {"cookieHeader": "Cookie: name=value", "cookie": "ignored=1"}
        self.assertEqual(_cookie_header_from_auth_payload(payload), "name=value")

    def test_cookie_header_from_auth_payload_adds_name(self) -> None:
        payload = {"cookie": "tokenvalue", "cookieName": "settaAuth"}
        self.assertEqual(
            _cookie_header_from_auth_payload(payload), "settaAuth=tokenvalue"
        )

    def test_cookie_header_from_auth_payload_missing(self) -> None:
        with self.assertRaises(click.ClickException):
            _cookie_header_from_auth_payload({})

    def test_base_url_from_auth_payload(self) -> None:
        payload = {"baseUrl": "example.com:9999/api"}
        self.assertEqual(_base_url_from_auth_payload(payload), "http://example.com:9999")
        payload = {"apiBaseUrl": "http://127.0.0.1:8000/api"}
        self.assertEqual(_base_url_from_auth_payload(payload), "http://127.0.0.1:8000")
        self.assertIsNone(_base_url_from_auth_payload({}))

    def test_normalize_tool_name(self) -> None:
        self.assertEqual(_normalize_tool_name(" getProjectConfig "), "getProjectConfig")
        with self.assertRaises(click.ClickException):
            _normalize_tool_name("")
        with self.assertRaises(click.ClickException):
            _normalize_tool_name("/path")
        with self.assertRaises(click.ClickException):
            _normalize_tool_name(f"setta{MCP_TOOL_NAME_SEPARATOR}tool")


if __name__ == "__main__":
    unittest.main()

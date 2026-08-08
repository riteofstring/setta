import asyncio
import json
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import SimpleNamespace

import pytest

import setta.agentic.external_adapters.opencode_sdk as opencode_sdk_module
from setta.agentic.external_adapters.opencode_sdk import (
    OpenCodeSdkAdapter,
    _OPENCODE_STDERR_MAX_LINES,
)


class _DelayedMcpStatusHandler(BaseHTTPRequestHandler):
    delay_seconds = 0.0

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path != "/mcp":
            self.send_response(404)
            self.end_headers()
            return
        time.sleep(self.delay_seconds)
        body = json.dumps(
            {
                "servers": [
                    {
                        "id": "setta",
                        "connected": True,
                        "transport": "sse",
                        "endpoint": "http://127.0.0.1:8000/mcp",
                    }
                ]
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args) -> None:
        return


@contextmanager
def _run_delayed_mcp_status_server(*, delay_seconds: float):
    _DelayedMcpStatusHandler.delay_seconds = delay_seconds
    server = ThreadingHTTPServer(("127.0.0.1", 0), _DelayedMcpStatusHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


class TestOpenCodeSdkEnv:
    def test_build_env_does_not_force_debug(self) -> None:
        env = OpenCodeSdkAdapter._build_env({})
        assert "SETTA_OPENCODE_DEBUG" not in env
        assert "SETTA_OPENCODE_DEBUG_RAW" not in env

    def test_build_env_enables_debug_when_requested(self) -> None:
        env = OpenCodeSdkAdapter._build_env({"SETTA_OPENCODE_DEBUG": "1"})
        assert env.get("SETTA_OPENCODE_DEBUG") == "1"
        assert env.get("SETTA_OPENCODE_DEBUG_RAW") == "1"


class TestOpenCodeSdkStderr:
    @pytest.mark.asyncio
    async def test_stream_stderr_caps_lines(self) -> None:
        reader = asyncio.StreamReader()
        stderr_lines: list[str] = []
        total_lines = _OPENCODE_STDERR_MAX_LINES + 5
        for idx in range(total_lines):
            reader.feed_data(f"line-{idx}\n".encode("utf-8"))
        reader.feed_eof()

        await OpenCodeSdkAdapter._stream_stderr(reader, stderr_lines)

        assert len(stderr_lines) == _OPENCODE_STDERR_MAX_LINES
        expected_start = f"line-{total_lines - _OPENCODE_STDERR_MAX_LINES}"
        assert stderr_lines[0] == expected_start


class TestOpenCodeSdkMcpStatusProbe:
    @pytest.mark.asyncio
    async def test_fetch_mcp_status_payload_returns_payload_when_server_is_fast(
        self,
    ) -> None:
        with _run_delayed_mcp_status_server(delay_seconds=0.0) as base_url:
            context = SimpleNamespace(config=SimpleNamespace(baseUrl=base_url))
            payload = await OpenCodeSdkAdapter._fetch_mcp_server_status_payload(
                context
            )

            # A healthy MCP endpoint should be parsed into a payload dict.
            assert isinstance(payload, dict)
            if isinstance(payload, dict):
                servers = payload.get("servers")
                assert isinstance(servers, list)
                if isinstance(servers, list):
                    assert servers[0]["id"] == "setta"

    @pytest.mark.asyncio
    async def test_fetch_mcp_status_payload_uses_short_timeout(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        with _run_delayed_mcp_status_server(delay_seconds=0.25) as base_url:
            context = SimpleNamespace(config=SimpleNamespace(baseUrl=base_url))
            monkeypatch.setattr(
                opencode_sdk_module,
                "_MCP_STATUS_HTTP_TIMEOUT_SECONDS",
                0.05,
            )

            start = time.monotonic()
            payload = await OpenCodeSdkAdapter._fetch_mcp_server_status_payload(
                context
            )
            elapsed_seconds = time.monotonic() - start

            # Status fetch should fail quickly instead of blocking run startup.
            assert payload is None
            assert elapsed_seconds < 0.2

import asyncio

import pytest

from setta.agentic.external_adapters.opencode_sdk import (
    OpenCodeSdkAdapter,
    _OPENCODE_STDERR_MAX_LINES,
)


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

import asyncio
import unittest

from setta.agentic.external_adapters.opencode_sdk import (
    OpenCodeSdkAdapter,
    _OPENCODE_STDERR_MAX_LINES,
)


class OpenCodeSdkEnvTests(unittest.TestCase):
    def test_build_env_does_not_force_debug(self) -> None:
        env = OpenCodeSdkAdapter._build_env({})
        self.assertNotIn("SETTA_OPENCODE_DEBUG", env)
        self.assertNotIn("SETTA_OPENCODE_DEBUG_RAW", env)

    def test_build_env_enables_debug_when_requested(self) -> None:
        env = OpenCodeSdkAdapter._build_env({"SETTA_OPENCODE_DEBUG": "1"})
        self.assertEqual(env.get("SETTA_OPENCODE_DEBUG"), "1")
        self.assertEqual(env.get("SETTA_OPENCODE_DEBUG_RAW"), "1")


class OpenCodeSdkStderrTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_stderr_caps_lines(self) -> None:
        reader = asyncio.StreamReader()
        stderr_lines: list[str] = []
        queue: asyncio.Queue[str] = asyncio.Queue()
        total_lines = _OPENCODE_STDERR_MAX_LINES + 5
        for idx in range(total_lines):
            reader.feed_data(f"line-{idx}\n".encode("utf-8"))
        reader.feed_eof()

        await OpenCodeSdkAdapter._stream_stderr(reader, queue, stderr_lines)

        self.assertEqual(len(stderr_lines), _OPENCODE_STDERR_MAX_LINES)
        expected_start = f"line-{total_lines - _OPENCODE_STDERR_MAX_LINES}"
        self.assertEqual(stderr_lines[0], expected_start)


if __name__ == "__main__":
    unittest.main()

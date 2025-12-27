import logging
import sys
import unittest

from setta.mcp.client import configure_stdio_bridge_logging


class StdioBridgeLoggingTests(unittest.TestCase):
    def test_stdio_bridge_logs_to_stderr(self) -> None:
        configure_stdio_bridge_logging(verbose=False)
        handlers = [
            handler
            for handler in logging.getLogger().handlers
            if hasattr(handler, "stream")
        ]
        self.assertTrue(handlers, "Expected stream handlers on root logger")
        streams = {handler.stream for handler in handlers}
        self.assertIn(sys.stderr, streams)
        self.assertNotIn(sys.stdout, streams)

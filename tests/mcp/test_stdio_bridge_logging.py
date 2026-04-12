import logging
import sys

from setta.mcp.client import configure_stdio_bridge_logging


class TestStdioBridgeLogging:
    def test_stdio_bridge_logs_to_stderr(self) -> None:
        configure_stdio_bridge_logging(verbose=False)
        handlers = [
            handler
            for handler in logging.getLogger().handlers
            if hasattr(handler, "stream")
        ]
        assert handlers, "Expected stream handlers on root logger"
        streams = {handler.stream for handler in handlers}
        assert sys.stderr in streams
        assert sys.stdout not in streams

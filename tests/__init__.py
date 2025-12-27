import logging


class _IgnoreAsyncioSlowCallback(logging.Filter):
    """Filter out asyncio slow-callback warnings during tests."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "Executing <Task" not in record.getMessage()


logging.getLogger("asyncio").addFilter(_IgnoreAsyncioSlowCallback())

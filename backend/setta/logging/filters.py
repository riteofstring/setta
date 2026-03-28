"""Logging filters used by Setta."""

import asyncio
import logging


def _is_cancelled_exception(exc: BaseException) -> bool:
    if isinstance(exc, asyncio.CancelledError):
        return True
    if isinstance(exc, BaseExceptionGroup):
        return all(_is_cancelled_exception(item) for item in exc.exceptions)
    return False


class SuppressCancelledErrorFilter(logging.Filter):
    """Drop log records that only contain cancellation exceptions."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401 (logging signature)
        exc_info = record.exc_info
        if not exc_info:
            return True
        exc = exc_info[1]
        if exc is None:
            return True
        return not _is_cancelled_exception(exc)

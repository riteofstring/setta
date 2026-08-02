import logging

from setta.logging.context import (
    LoggingContextFilter,
    push_logging_context,
    reset_logging_context,
)


class TestLoggingContextFormatting:
    def test_formats_as_logfmt_and_quotes_spaces(self) -> None:
        token = push_logging_context(values={"path": "/Users/kevin/My Project"})
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname=__file__,
                lineno=1,
                msg="hello",
                args=(),
                exc_info=None,
            )
            LoggingContextFilter().filter(record)
        finally:
            reset_logging_context(token)

        assert record.setta_context == 'path="/Users/kevin/My Project"'

    def test_formats_as_logfmt_and_escapes_quotes_and_backslashes(self) -> None:
        token = push_logging_context(values={"value": 'a "quote" and a \\\\ slash'})
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname=__file__,
                lineno=1,
                msg="hello",
                args=(),
                exc_info=None,
            )
            LoggingContextFilter().filter(record)
        finally:
            reset_logging_context(token)

        assert (
            record.setta_context == 'value="a \\"quote\\" and a \\\\\\\\ slash"'
        )

    def test_leaves_safe_values_unquoted(self) -> None:
        token = push_logging_context(values={"request_id": "abc-123_DEF"})
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname=__file__,
                lineno=1,
                msg="hello",
                args=(),
                exc_info=None,
            )
            LoggingContextFilter().filter(record)
        finally:
            reset_logging_context(token)

        assert record.setta_context == "request_id=abc-123_DEF"

    def test_quotes_empty_string(self) -> None:
        token = push_logging_context(values={"empty": ""})
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname=__file__,
                lineno=1,
                msg="hello",
                args=(),
                exc_info=None,
            )
            LoggingContextFilter().filter(record)
        finally:
            reset_logging_context(token)

        assert record.setta_context == 'empty=""'

    def test_quotes_values_with_equals(self) -> None:
        token = push_logging_context(values={"query": "a=b"})
        try:
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname=__file__,
                lineno=1,
                msg="hello",
                args=(),
                exc_info=None,
            )
            LoggingContextFilter().filter(record)
        finally:
            reset_logging_context(token)

        assert record.setta_context == 'query="a=b"'

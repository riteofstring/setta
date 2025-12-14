import logging
import unittest

from setta.logging.context import (
    LoggingContextFilter,
    clear_logging_context,
    get_logging_context,
    logging_context,
    push_logging_context,
)


class LoggingContextTests(unittest.TestCase):
    def setUp(self) -> None:
        clear_logging_context()

    def tearDown(self) -> None:
        clear_logging_context()

    def test_push_logging_context_merges_and_clears(self) -> None:
        push_logging_context(request_id=4, project_id="alpha")
        self.assertEqual(
            get_logging_context(),
            {"project_id": "alpha", "request_id": "4"},
        )

        push_logging_context(project_id=None, websocket_id="ws-7")
        self.assertEqual(
            get_logging_context(),
            {"request_id": "4", "websocket_id": "ws-7"},
        )

    def test_logging_context_manager_restores_previous_values(self) -> None:
        push_logging_context(project_id="alpha")
        with logging_context(request_id="inner"):
            self.assertEqual(
                get_logging_context(),
                {"project_id": "alpha", "request_id": "inner"},
            )
        self.assertEqual(get_logging_context(), {"project_id": "alpha"})

    def test_logging_context_filter_adds_attributes(self) -> None:
        push_logging_context(request_id="abc", project_id="xyz")
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname=__file__,
            lineno=12,
            msg="hello",
            args=(),
            exc_info=None,
        )
        logging_filter = LoggingContextFilter()
        self.assertTrue(logging_filter.filter(record))
        self.assertEqual(record.request_id, "abc")
        self.assertEqual(record.project_id, "xyz")
        self.assertEqual(record.setta_context, "project_id=xyz request_id=abc")


if __name__ == "__main__":
    unittest.main()

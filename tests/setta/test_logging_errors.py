import asyncio
import logging
import unittest

from setta.logging.context import (
    LoggingContextFilter,
    push_logging_context,
)
from setta.logging.errors import log_route_failure, run_safely


class _RecordingHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


class LoggingErrorHelpersTests(unittest.TestCase):
    def setUp(self) -> None:
        push_logging_context(replace=True)
        self.logger = logging.getLogger("tests.logging.errors")
        self.logger.setLevel(logging.DEBUG)
        self.handler = _RecordingHandler()
        self.handler.addFilter(LoggingContextFilter())
        self.logger.addHandler(self.handler)

    def tearDown(self) -> None:
        self.logger.removeHandler(self.handler)
        push_logging_context(replace=True)

    def test_log_route_failure_attaches_context(self) -> None:
        push_logging_context(project_config_id="alpha", request_id="req-9")
        exc = RuntimeError("boom")
        log_route_failure(
            exc,
            label="save-project",
            logger=self.logger,
            context={"task": "autosave"},
        )
        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.ERROR)
        self.assertEqual(record.request_id, "req-9")
        self.assertEqual(record.project_config_id, "alpha")
        self.assertEqual(record.failure_label, "save-project")
        self.assertEqual(record.failure_handled, "false")
        self.assertEqual(record.task, "autosave")
        self.assertIn("failure_label=save-project", record.setta_context)
        self.assertIn("task=autosave", record.setta_context)
        self.assertIn("project_config_id=alpha", record.setta_context)

    def test_run_safely_logs_warning_on_handled_failure(self) -> None:
        async def _failing() -> None:
            raise ValueError("nope")

        async def _invoke() -> None:
            result = await run_safely(
                _failing(),
                label="terminal-run",
                logger=self.logger,
            )
            self.assertIsNone(result)

        asyncio.run(_invoke())
        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.WARNING)
        self.assertEqual(record.failure_label, "terminal-run")
        self.assertEqual(record.failure_handled, "true")

    def test_run_safely_reraises_and_logs_error(self) -> None:
        async def _failing() -> None:
            raise RuntimeError("explode")

        async def _invoke() -> None:
            with self.assertRaises(RuntimeError):
                await run_safely(
                    _failing(),
                    label="llm-task",
                    logger=self.logger,
                    re_raise=True,
                )

        asyncio.run(_invoke())
        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.ERROR)
        self.assertEqual(record.failure_handled, "false")

    def test_run_safely_requires_awaitable(self) -> None:
        async def _invoke() -> None:
            with self.assertRaises(TypeError):
                await run_safely(lambda: 42, label="bad")

        asyncio.run(_invoke())
        self.assertEqual(len(self.handler.records), 0)


if __name__ == "__main__":
    unittest.main()

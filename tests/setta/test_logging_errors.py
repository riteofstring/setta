import asyncio
import logging
import os
import unittest

from setta.logging.context import (
    LoggingContextFilter,
    push_logging_context,
)
from setta.logging.errors import log_failure, run_safely


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
        log_failure(
            exc,
            label="save-project",
            logger=self.logger,
            context={"task": "autosave"},
        )
        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.ERROR)
        self.assertIn("request_id=req-9", record.setta_context)
        self.assertIn("project_config_id=alpha", record.setta_context)
        self.assertIn("failure_label=save-project", record.setta_context)
        self.assertIn("failure_handled=false", record.setta_context)
        self.assertIn("task=autosave", record.setta_context)

    def test_run_safely_logs_warning_on_handled_failure(self) -> None:
        async def _failing() -> None:
            raise ValueError("nope")

        async def _invoke() -> None:
            result = await run_safely(
                _failing(),
                label="terminal-run",
                logger=self.logger,
                handled=True,
            )
            self.assertIsNone(result)

        asyncio.run(_invoke())
        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.WARNING)
        self.assertIn("failure_label=terminal-run", record.setta_context)
        self.assertIn("failure_handled=true", record.setta_context)

    def test_log_failure_omits_traceback_for_handled_when_not_debug(self) -> None:
        original = os.environ.pop("SETTA_HANDLED_TRACEBACKS", None)
        try:
            self.logger.setLevel(logging.INFO)
            exc = ValueError("nope")
            log_failure(
                exc,
                label="handled-http",
                logger=self.logger,
                handled=True,
            )
        finally:
            if original is not None:
                os.environ["SETTA_HANDLED_TRACEBACKS"] = original

        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.WARNING)
        self.assertIsNone(record.exc_info)
        self.assertIn("ValueError: nope", record.getMessage())

    def test_log_failure_can_force_traceback_for_handled_via_env(self) -> None:
        original = os.environ.get("SETTA_HANDLED_TRACEBACKS")
        os.environ["SETTA_HANDLED_TRACEBACKS"] = "1"
        try:
            self.logger.setLevel(logging.INFO)
            exc = ValueError("nope")
            log_failure(
                exc,
                label="handled-http",
                logger=self.logger,
                handled=True,
            )
        finally:
            if original is None:
                os.environ.pop("SETTA_HANDLED_TRACEBACKS", None)
            else:
                os.environ["SETTA_HANDLED_TRACEBACKS"] = original

        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.WARNING)
        self.assertIsNotNone(record.exc_info)

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
        self.assertIn("failure_handled=false", record.setta_context)

    def test_run_safely_logs_sync_factory_exception(self) -> None:
        def _factory() -> asyncio.Future[None]:
            raise ValueError("factory boom")

        async def _invoke() -> None:
            result = await run_safely(
                _factory,
                label="sync-factory",
                logger=self.logger,
                handled=True,
            )
            self.assertIsNone(result)

        asyncio.run(_invoke())
        self.assertEqual(len(self.handler.records), 1)
        record = self.handler.records[0]
        self.assertEqual(record.levelno, logging.WARNING)
        self.assertIn("failure_label=sync-factory", record.setta_context)
        self.assertIn("failure_handled=true", record.setta_context)

    def test_run_safely_requires_awaitable(self) -> None:
        async def _invoke() -> None:
            with self.assertRaises(TypeError):
                await run_safely(lambda: 42, label="bad")

        asyncio.run(_invoke())
        self.assertEqual(len(self.handler.records), 0)


if __name__ == "__main__":
    unittest.main()

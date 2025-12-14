import asyncio
import logging
import unittest
from typing import Annotated

from pydantic import BaseModel, Field
from setta.logging.context import (
    LoggingContextFilter,
    clear_logging_context,
    push_logging_context,
)
from setta.logging.context_models import SensitiveLoggingField
from setta.logging.errors import log_route_failure, run_safely


class _RecordingHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


class LoggingErrorHelpersTests(unittest.TestCase):
    def setUp(self) -> None:
        clear_logging_context()
        self.logger = logging.getLogger("tests.logging.errors")
        self.logger.setLevel(logging.DEBUG)
        self.handler = _RecordingHandler()
        self.handler.addFilter(LoggingContextFilter())
        self.logger.addHandler(self.handler)

    def tearDown(self) -> None:
        self.logger.removeHandler(self.handler)
        clear_logging_context()

    def test_log_route_failure_attaches_context(self) -> None:
        push_logging_context(project_id="alpha", request_id="req-9")
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
        self.assertEqual(record.project_id, "alpha")
        self.assertEqual(record.failure_label, "save-project")
        self.assertEqual(record.failure_handled, "false")
        self.assertEqual(record.task, "autosave")
        self.assertIn("failure_label=save-project", record.setta_context)
        self.assertIn("task=autosave", record.setta_context)
        self.assertIn("project_id=alpha", record.setta_context)

    def test_log_route_failure_serializes_request_models(self) -> None:
        class ExampleRequest(BaseModel):
            projectId: str
            sectionId: int
            token: Annotated[str, SensitiveLoggingField()]
            apiKey: str = Field(..., json_schema_extra={"setta_sensitive": True})

        req = ExampleRequest(
            projectId="proj-7",
            sectionId=42,
            token="secret-token",
            apiKey="abc",
        )
        exc = RuntimeError("boom")
        log_route_failure(exc, req, label="example", logger=self.logger)
        record = self.handler.records[-1]
        self.assertEqual(record.example_request_projectId, "proj-7")
        self.assertEqual(record.example_request_sectionId, "42")
        self.assertFalse(hasattr(record, "example_request_token"))
        self.assertFalse(hasattr(record, "example_request_apiKey"))
        self.assertIn("example_request_projectId=proj-7", record.setta_context)
        self.assertNotIn("token", record.setta_context)

    def test_log_route_failure_handles_multiple_models(self) -> None:
        class ExampleRequest(BaseModel):
            projectId: str

        req_one = ExampleRequest(projectId="proj-7")
        req_two = ExampleRequest(projectId="proj-8")
        exc = ValueError("boom")
        log_route_failure(exc, req_one, req_two, label="dup", logger=self.logger)
        record = self.handler.records[-1]
        self.assertEqual(record.example_request_projectId, "proj-7")
        self.assertEqual(record.example_request_2_projectId, "proj-8")

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

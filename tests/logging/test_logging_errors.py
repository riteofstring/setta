import logging

import pytest

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


@pytest.fixture
def logging_setup():
    push_logging_context(replace=True)
    logger = logging.getLogger("tests.logging.errors")
    logger.setLevel(logging.DEBUG)
    handler = _RecordingHandler()
    handler.addFilter(LoggingContextFilter())
    logger.addHandler(handler)
    yield logger, handler
    logger.removeHandler(handler)
    push_logging_context(replace=True)


def test_log_route_failure_attaches_context(logging_setup) -> None:
    logger, handler = logging_setup
    push_logging_context(project_config_id="alpha", request_id="req-9")
    exc = RuntimeError("boom")
    log_failure(
        exc,
        label="save-project",
        logger=logger,
        context={"task": "autosave"},
    )
    assert len(handler.records) == 1
    record = handler.records[0]
    assert record.levelno == logging.ERROR
    assert "request_id=req-9" in record.setta_context
    assert "project_config_id=alpha" in record.setta_context
    assert "failure_label=save-project" in record.setta_context
    assert "failure_handled=false" in record.setta_context
    assert "task=autosave" in record.setta_context


@pytest.mark.asyncio
async def test_run_safely_logs_warning_on_handled_failure(logging_setup) -> None:
    logger, handler = logging_setup

    async def _failing() -> None:
        raise ValueError("nope")

    result = await run_safely(
        _failing(),
        label="terminal-run",
        logger=logger,
        handled=True,
    )
    assert result is None
    assert len(handler.records) == 1
    record = handler.records[0]
    assert record.levelno == logging.WARNING
    assert "failure_label=terminal-run" in record.setta_context
    assert "failure_handled=true" in record.setta_context


def test_log_failure_omits_traceback_for_handled_when_not_debug(
    logging_setup, monkeypatch
) -> None:
    logger, handler = logging_setup
    monkeypatch.delenv("SETTA_HANDLED_TRACEBACKS", raising=False)
    logger.setLevel(logging.INFO)
    exc = ValueError("nope")
    log_failure(
        exc,
        label="handled-http",
        logger=logger,
        handled=True,
    )

    assert len(handler.records) == 1
    record = handler.records[0]
    assert record.levelno == logging.WARNING
    assert record.exc_info is None
    assert "ValueError: nope" in record.getMessage()


def test_log_failure_can_force_traceback_for_handled_via_env(
    logging_setup, monkeypatch
) -> None:
    logger, handler = logging_setup
    monkeypatch.setenv("SETTA_HANDLED_TRACEBACKS", "1")
    logger.setLevel(logging.INFO)
    exc = ValueError("nope")
    log_failure(
        exc,
        label="handled-http",
        logger=logger,
        handled=True,
    )

    assert len(handler.records) == 1
    record = handler.records[0]
    assert record.levelno == logging.WARNING
    assert record.exc_info is not None


@pytest.mark.asyncio
async def test_run_safely_reraises_and_logs_error(logging_setup) -> None:
    logger, handler = logging_setup

    async def _failing() -> None:
        raise RuntimeError("explode")

    with pytest.raises(RuntimeError):
        await run_safely(
            _failing(),
            label="llm-task",
            logger=logger,
            re_raise=True,
        )

    assert len(handler.records) == 1
    record = handler.records[0]
    assert record.levelno == logging.ERROR
    assert "failure_handled=false" in record.setta_context


@pytest.mark.asyncio
async def test_run_safely_logs_sync_factory_exception(logging_setup) -> None:
    logger, handler = logging_setup

    def _factory():
        raise ValueError("factory boom")

    result = await run_safely(
        _factory,
        label="sync-factory",
        logger=logger,
        handled=True,
    )
    assert result is None
    assert len(handler.records) == 1
    record = handler.records[0]
    assert record.levelno == logging.WARNING
    assert "failure_label=sync-factory" in record.setta_context
    assert "failure_handled=true" in record.setta_context


@pytest.mark.asyncio
async def test_run_safely_logs_sync_factory_type_error(logging_setup) -> None:
    logger, handler = logging_setup

    def _factory():
        raise TypeError("factory boom")

    result = await run_safely(
        _factory,
        label="sync-factory-type-error",
        logger=logger,
    )
    assert result is None
    assert len(handler.records) == 1
    record = handler.records[0]
    assert record.levelno == logging.ERROR
    assert "failure_label=sync-factory-type-error" in record.setta_context
    assert "failure_handled=false" in record.setta_context


@pytest.mark.asyncio
async def test_run_safely_requires_awaitable(logging_setup) -> None:
    logger, handler = logging_setup

    with pytest.raises(TypeError):
        await run_safely(lambda: 42, label="bad")

    assert len(handler.records) == 0

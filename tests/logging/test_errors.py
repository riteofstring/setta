import gc
import logging
import warnings
from contextlib import contextmanager

import pytest

from setta.logging import context as logging_context_module
from setta.logging.context import push_logging_context, reset_logging_context
from setta.logging.errors import run_safely
from setta.logging.tasks import spawn_background_task


def _current_context() -> dict[str, str]:
    return dict(logging_context_module._LOGGING_CONTEXT_VAR.get().data)


@contextmanager
def _capture_logger(
    caplog: pytest.LogCaptureFixture, logger: logging.Logger, level: int
):
    handler = caplog.handler
    added = False
    previous_level = logger.level
    if handler not in logger.handlers:
        logger.addHandler(handler)
        added = True
    caplog.set_level(level, logger=logger.name)
    try:
        yield
    finally:
        if added:
            logger.removeHandler(handler)
        logger.setLevel(previous_level)


@pytest.mark.asyncio
async def test_run_safely_swallow_defaults_to_unhandled(caplog) -> None:
    async def boom() -> None:
        raise ValueError("nope")

    logger_name = "setta.tests.logging.errors.default_unhandled"
    logger = logging.getLogger(logger_name)

    with _capture_logger(caplog, logger, logging.ERROR):
        result = await run_safely(boom(), label="boom-test", logger=logger)

    assert result is None
    assert any(
        "Unhandled failure in boom-test" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_run_safely_handled_is_warning_even_when_swallowed(caplog) -> None:
    async def boom() -> None:
        raise ValueError("nope")

    logger_name = "setta.tests.logging.errors.handled_warning"
    logger = logging.getLogger(logger_name)

    with _capture_logger(caplog, logger, logging.WARNING):
        result = await run_safely(
            boom(),
            label="boom-test",
            logger=logger,
            handled=True,
        )

    assert result is None
    assert any(record.levelno == logging.WARNING for record in caplog.records)
    assert any(
        "Handled failure in boom-test" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_run_safely_re_raise_severity_decoupled(caplog) -> None:
    async def boom() -> None:
        raise ValueError("nope")

    logger_name = "setta.tests.logging.errors.reraise"
    logger = logging.getLogger(logger_name)

    with _capture_logger(caplog, logger, logging.ERROR):
        with pytest.raises(ValueError):
            await run_safely(
                boom(),
                label="boom-test",
                logger=logger,
                re_raise=True,
            )

    assert any(
        "Unhandled failure in boom-test" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_spawn_background_task_defaults_to_unhandled(caplog) -> None:
    async def boom() -> None:
        raise ValueError("nope")

    logger_name = "setta.tests.logging.errors.spawn_default_unhandled"
    logger = logging.getLogger(logger_name)

    with _capture_logger(caplog, logger, logging.ERROR):
        task = spawn_background_task(boom(), label="bg-test", logger=logger)
        result = await task

    assert result is None
    assert any(
        "Unhandled failure in bg-test" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_spawn_background_task_sets_context() -> None:
    token = push_logging_context(replace=True)
    try:
        async def capture_context() -> dict[str, str]:
            return _current_context()

        task = spawn_background_task(
            capture_context(),
            label="manual-task",
            request_id="req-123",
        )
        result = await task
    finally:
        reset_logging_context(token)

    assert result is not None
    assert result["task"] == "manual-task"
    assert result["request_id"] == "req-123"


@pytest.mark.asyncio
async def test_spawn_background_task_can_mark_failures_handled(caplog) -> None:
    async def boom() -> None:
        raise ValueError("nope")

    logger_name = "setta.tests.logging.errors.spawn_handled"
    logger = logging.getLogger(logger_name)

    with _capture_logger(caplog, logger, logging.WARNING):
        task = spawn_background_task(
            boom(),
            label="bg-test",
            logger=logger,
            handled=True,
        )
        result = await task

    assert result is None
    assert any(
        "Handled failure in bg-test" in record.getMessage()
        for record in caplog.records
    )


def test_spawn_background_task_closes_runner_when_loop_create_task_fails() -> None:
    class _FakeLoop:
        def create_task(self, _coro, *, name: str | None = None):  # noqa: ANN001
            assert name == "bg-test"
            raise RuntimeError("loop closed")

    async def noop() -> None:
        return None

    loop = _FakeLoop()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", category=RuntimeWarning)
        with pytest.raises(RuntimeError):
            spawn_background_task(lambda: noop(), label="bg-test", loop=loop)
        gc.collect()

    assert not any(
        "was never awaited" in str(warning.message) for warning in caught
    )


def test_spawn_background_task_closes_input_coroutine_when_loop_create_task_fails() -> None:
    class _FakeLoop:
        def create_task(self, _coro, *, name: str | None = None):  # noqa: ANN001
            assert name == "bg-test"
            raise RuntimeError("loop closed")

    async def noop() -> None:
        return None

    loop = _FakeLoop()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", category=RuntimeWarning)
        with pytest.raises(RuntimeError):
            spawn_background_task(noop(), label="bg-test", loop=loop)
        gc.collect()

    assert not any(
        "was never awaited" in str(warning.message) for warning in caught
    )

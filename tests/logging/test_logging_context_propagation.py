import asyncio

import pytest

from setta.logging.context import (
    get_logging_context,
    push_logging_context,
    reset_logging_context,
)
from setta.utils.async_debouncer import AsyncDebouncer


@pytest.mark.asyncio
async def test_trigger_runs_job_with_current_context() -> None:
    contexts: list[dict[str, str]] = []
    done = asyncio.Event()

    async def _job() -> None:
        contexts.append(get_logging_context())
        done.set()

    debouncer = AsyncDebouncer(_job, wait=0.01, label="debounce-test")
    token = push_logging_context(project_config_id="proj-ctx", request_id="req-ctx")
    try:
        debouncer.trigger()
        await asyncio.wait_for(done.wait(), timeout=1)
    finally:
        reset_logging_context(token)

    assert contexts[0]["task"] == "debounce-test"
    assert contexts[0]["project_config_id"] == "proj-ctx"
    assert contexts[0]["request_id"] == "req-ctx"

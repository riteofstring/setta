import logging

from setta.logging.context import (
    LoggingContextFilter,
    get_logging_context,
    logging_context,
    push_logging_context,
)

import pytest

@pytest.fixture(autouse=True)
def reset_logging_context_fixture() -> None:
    push_logging_context(replace=True)
    yield
    push_logging_context(replace=True)


def test_push_logging_context_merges_and_clears() -> None:
    push_logging_context(request_id=4, project_config_id="alpha")
    assert get_logging_context() == {
        "project_config_id": "alpha",
        "request_id": "4",
    }

    push_logging_context(project_config_id=None, websocket_id="ws-7")
    assert get_logging_context() == {
        "request_id": "4",
        "websocket_id": "ws-7",
    }


def test_logging_context_manager_restores_previous_values() -> None:
    push_logging_context(project_config_id="alpha")
    with logging_context(request_id="inner"):
        assert get_logging_context() == {
            "project_config_id": "alpha",
            "request_id": "inner",
        }
    assert get_logging_context() == {"project_config_id": "alpha"}


def test_logging_context_filter_adds_attributes() -> None:
    push_logging_context(request_id="abc", project_config_id="xyz")
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
    assert logging_filter.filter(record)
    assert record.setta_context == "project_config_id=xyz request_id=abc"

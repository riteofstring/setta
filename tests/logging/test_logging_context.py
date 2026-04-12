import logging

import pytest
from setta.logging import context as logging_context_module
from setta.logging.context import LoggingContextFilter, logging_context, push_logging_context


def _current_context() -> dict[str, str]:
    return dict(logging_context_module._LOGGING_CONTEXT_VAR.get().data)

@pytest.fixture(autouse=True)
def reset_logging_context_fixture() -> None:
    push_logging_context(replace=True)
    yield
    push_logging_context(replace=True)


def test_push_logging_context_merges_and_clears() -> None:
    push_logging_context(request_id=4, project_config_id="alpha")
    assert _current_context() == {
        "project_config_id": "alpha",
        "request_id": "4",
    }

    push_logging_context(project_config_id=None, websocket_id="ws-7")
    assert _current_context() == {
        "request_id": "4",
        "websocket_id": "ws-7",
    }


def test_logging_context_manager_restores_previous_values() -> None:
    push_logging_context(project_config_id="alpha")
    with logging_context(request_id="inner"):
        assert _current_context() == {
            "project_config_id": "alpha",
            "request_id": "inner",
        }
    assert _current_context() == {"project_config_id": "alpha"}


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


def test_normalize_value_formats_scalar_types() -> None:
    assert logging_context_module._normalize_value(True) == "true"
    assert logging_context_module._normalize_value(False) == "false"
    assert logging_context_module._normalize_value(7) == "7"
    assert logging_context_module._normalize_value(2.5) == "2.5"
    assert logging_context_module._normalize_value("alpha") == "alpha"


def test_normalize_value_rejects_none() -> None:
    with pytest.raises(ValueError, match="cannot be None"):
        logging_context_module._normalize_value(None)

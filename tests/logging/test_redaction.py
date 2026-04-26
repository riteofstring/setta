import json
from typing import Annotated

from pydantic import BaseModel, SecretStr
from setta.logging import context as logging_context_module
from setta.logging.context import push_logging_context, reset_logging_context
from setta.logging.redaction import (
    REDACTED_VALUE,
    Sensitive,
    sanitize_for_logging_context,
)


def _current_context() -> dict[str, str]:
    return dict(logging_context_module._LOGGING_CONTEXT_VAR.get().data)


class TestLoggingRedaction:
    def test_redacts_sensitive_annotated_fields_in_pydantic_models(self) -> None:
        class Payload(BaseModel):
            api_key: Annotated[str, Sensitive()]
            message: str

        token = push_logging_context(
            values={
                "payload": Payload(api_key="secret", message="hello world"),
            }
        )
        try:
            context = _current_context()
        finally:
            reset_logging_context(token)

        raw_payload = context["payload"]
        parsed = json.loads(raw_payload)
        assert parsed["api_key"] == REDACTED_VALUE
        assert parsed["message"] == "hello world"

    def test_summarizes_large_collections(self) -> None:
        values = [f"value-{i}" for i in range(50)]
        token = push_logging_context(values={"big_list": values})
        try:
            context = _current_context()
        finally:
            reset_logging_context(token)

        parsed = json.loads(context["big_list"])
        assert parsed["len"] == 50
        assert parsed["truncated"]
        assert len(parsed["sample"]) == 25

    def test_sanitize_handles_scalar_and_fallback_types(self) -> None:
        class Stringable:
            def __str__(self) -> str:
                return "line1\nline2"

        sanitized = sanitize_for_logging_context(
            {
                "secret": SecretStr("token"),
                "payload": b"abc",
                "error": ValueError("boom"),
                "custom": Stringable(),
            },
            max_string_len=8,
        )

        assert sanitized == {
            "secret": REDACTED_VALUE,
            "payload": "bytes(len=3)",
            "error": "ValueError('boom')",
            "custom": "line1\\nl...(+4)",
        }

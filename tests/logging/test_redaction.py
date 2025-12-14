import json
import unittest
from typing import Annotated

from pydantic import BaseModel
from setta.logging.context import (
    get_logging_context,
    push_logging_context,
    reset_logging_context,
)
from setta.logging.redaction import REDACTED_VALUE, Sensitive


class LoggingRedactionTests(unittest.TestCase):
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
            context = get_logging_context()
        finally:
            reset_logging_context(token)

        raw_payload = context["payload"]
        self.assertIn("\\u0020", raw_payload)
        parsed = json.loads(raw_payload)
        self.assertEqual(parsed["api_key"], REDACTED_VALUE)
        self.assertEqual(parsed["message"], "hello world")

    def test_summarizes_large_collections(self) -> None:
        values = [f"value-{i}" for i in range(50)]
        token = push_logging_context(values={"big_list": values})
        try:
            context = get_logging_context()
        finally:
            reset_logging_context(token)

        parsed = json.loads(context["big_list"])
        self.assertEqual(parsed["len"], 50)
        self.assertTrue(parsed["truncated"])
        self.assertEqual(len(parsed["sample"]), 25)


if __name__ == "__main__":
    unittest.main()

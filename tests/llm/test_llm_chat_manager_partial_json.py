import unittest

from setta.llm.chat_toolkit.managed.tool_argument_preview import (
    extract_preview_value_from_tokens,
    extract_stream_ids_by_type_from_tokens,
    scan_partial_json_strings,
)
from setta.types.id import ID


class LLMChatManagerPartialJsonTests(unittest.TestCase):
    def test_extract_ids_from_arrays_and_object_keys(self) -> None:
        buffer = (
            '{"sectionId":"temp-1","sectionIds":["temp-2","temp-3"],'
            '"sectionsById":{"temp-4":true,"temp-5":false}}'
        )
        tokens = scan_partial_json_strings(buffer)
        ids_by_type = extract_stream_ids_by_type_from_tokens(
            tokens,
            {"section": ["sectionId", "sectionIds", "sectionsById"]},
        )
        self.assertIn("section", ids_by_type)
        self.assertEqual(
            {
                ID("temp-1"),
                ID("temp-2"),
                ID("temp-3"),
                ID("temp-4"),
                ID("temp-5"),
            },
            ids_by_type["section"],
        )

    def test_extract_preview_value_from_partial_string(self) -> None:
        buffer = '{"code":"print('
        tokens = scan_partial_json_strings(buffer)
        preview = extract_preview_value_from_tokens(tokens, "code")
        self.assertEqual("print(", preview)

    def test_extract_preview_value_handles_escapes(self) -> None:
        buffer = '{"code":"line1\\nline2\\u003a"}'
        tokens = scan_partial_json_strings(buffer)
        preview = extract_preview_value_from_tokens(tokens, "code")
        self.assertEqual("line1\nline2:", preview)

    def test_preview_value_uses_latest_token(self) -> None:
        buffer = '{"code":"first","code":"second"}'
        tokens = scan_partial_json_strings(buffer)
        preview = extract_preview_value_from_tokens(tokens, "code")
        self.assertEqual("second", preview)


if __name__ == "__main__":
    unittest.main()

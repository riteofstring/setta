from setta.llm.chat_toolkit.managed.tool_argument_preview import (
    extract_preview_value_from_tokens,
    extract_stream_ids_by_type_from_tokens,
    scan_partial_json_strings,
)
from setta.types.id import ID


class TestLLMChatManagerPartialJson:
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
        assert "section" in ids_by_type
        assert ids_by_type["section"] == {
            ID("temp-1"),
            ID("temp-2"),
            ID("temp-3"),
            ID("temp-4"),
            ID("temp-5"),
        }

    def test_extract_preview_value_from_partial_string(self) -> None:
        buffer = '{"code":"print('
        tokens = scan_partial_json_strings(buffer)
        preview = extract_preview_value_from_tokens(tokens, "code")
        assert preview == "print("

    def test_extract_preview_value_handles_escapes(self) -> None:
        buffer = '{"code":"line1\\nline2\\u003a"}'
        tokens = scan_partial_json_strings(buffer)
        preview = extract_preview_value_from_tokens(tokens, "code")
        assert preview == "line1\nline2:"

    def test_preview_value_uses_latest_token(self) -> None:
        buffer = '{"code":"first","code":"second"}'
        tokens = scan_partial_json_strings(buffer)
        preview = extract_preview_value_from_tokens(tokens, "code")
        assert preview == "second"

from setta.routers.app_spec_streaming import _parse_patch_line


class TestAppSpecStreamingPatchParsing:
    def test_parses_valid_root_patch(self) -> None:
        patch = _parse_patch_line('{"op":"set","path":"/root","value":"app-root"}')
        assert patch == {"op": "set", "path": "/root", "value": "app-root"}

    def test_parses_valid_element_patch(self) -> None:
        patch = _parse_patch_line(
            '{"op":"set","path":"/elements/app-root","value":{"key":"app-root","type":"Card"}}'
        )
        assert patch == {
            "op": "set",
            "path": "/elements/app-root",
            "value": {"key": "app-root", "type": "Card"},
        }

    def test_parses_valid_nested_element_patch(self) -> None:
        patch = _parse_patch_line(
            '{"op":"set","path":"/elements/app-root/props/title","value":"Hello"}'
        )
        assert patch == {
            "op": "set",
            "path": "/elements/app-root/props/title",
            "value": "Hello",
        }

    def test_parses_valid_remove_patch(self) -> None:
        patch = _parse_patch_line('{"op":"remove","path":"/elements/old"}')
        assert patch == {"op": "remove", "path": "/elements/old"}

    def test_ignores_blank_and_comments(self) -> None:
        assert _parse_patch_line("") is None
        assert _parse_patch_line("   ") is None
        assert _parse_patch_line("// keepalive") is None

    def test_rejects_invalid_payloads(self) -> None:
        assert _parse_patch_line("not json") is None
        assert _parse_patch_line("```json") is None
        assert _parse_patch_line('{"op":"set"}') is None
        assert _parse_patch_line('{"op":"nope","path":"/root","value":"x"}') is None
        assert _parse_patch_line('{"op":"set","path":"/nope","value":"x"}') is None
        assert _parse_patch_line('{"op":"set","path":"/root"}') is None


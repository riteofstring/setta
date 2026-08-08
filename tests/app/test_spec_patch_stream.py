import pytest

from setta.app.spec_patch_stream import apply_patch_ops, parse_patch_lines


class TestSpecPatchStream:
    def test_parses_jsonl_patches_ignoring_comments(self) -> None:
        patches = "\n".join(
            [
                "",
                "// comment",
                '{"op":"set","path":"/root","value":"app-root"}',
                '{"op":"set","path":"/elements/app-root","value":{"key":"app-root","type":"Card"}}',
                "",
            ]
        )
        ops = parse_patch_lines(patches)
        assert len(ops) == 2
        assert ops[0]["path"] == "/root"
        assert ops[1]["path"] == "/elements/app-root"

    def test_rejects_invalid_patch_line(self) -> None:
        with pytest.raises(ValueError):
            parse_patch_lines('{"op":"set","path":"/not-allowed","value":1}')

    def test_applies_root_and_element_set(self) -> None:
        patches = "\n".join(
            [
                '{"op":"set","path":"/root","value":"app-root"}',
                '{"op":"set","path":"/elements/app-root","value":{"key":"app-root","type":"Card","props":{"title":"Hello"},"children":[]}}',
            ]
        )
        ops = parse_patch_lines(patches)
        spec = apply_patch_ops(ops)
        assert spec["root"] == "app-root"
        assert spec["elements"]["app-root"]["type"] == "Card"

    def test_removes_element(self) -> None:
        patches = "\n".join(
            [
                '{"op":"set","path":"/root","value":"app-root"}',
                '{"op":"set","path":"/elements/app-root","value":{"key":"app-root","type":"Card"}}',
                '{"op":"remove","path":"/elements/app-root"}',
            ]
        )
        spec = apply_patch_ops(parse_patch_lines(patches))
        assert "app-root" not in spec["elements"]

    def test_apply_patch_ops_does_not_mutate_initial_spec(self) -> None:
        initial = {
            "root": "app-root",
            "elements": {
                "app-root": {
                    "key": "app-root",
                    "type": "Card",
                    "props": {"title": "Hello"},
                }
            },
        }
        ops = parse_patch_lines(
            '{"op":"set","path":"/elements/app-root/props/title","value":"Updated"}'
        )
        updated = apply_patch_ops(ops, initial_spec=initial)
        assert updated["elements"]["app-root"]["props"]["title"] == "Updated"
        assert initial["elements"]["app-root"]["props"]["title"] == "Hello"

    def test_nested_patch_requires_existing_element(self) -> None:
        patches = '{"op":"set","path":"/elements/missing/props/title","value":"Hello"}'
        with pytest.raises(KeyError):
            apply_patch_ops(parse_patch_lines(patches))

    def test_list_replace_rejects_index_equal_length(self) -> None:
        patches = "\n".join(
            [
                '{"op":"set","path":"/elements/root","value":{"key":"root","type":"Stack","children":["a"]}}',
                '{"op":"replace","path":"/elements/root/children/1","value":"b"}',
            ]
        )
        with pytest.raises(IndexError):
            apply_patch_ops(parse_patch_lines(patches))

    def test_list_set_allows_append_at_index_equal_length(self) -> None:
        patches = "\n".join(
            [
                '{"op":"set","path":"/elements/root","value":{"key":"root","type":"Stack","children":["a"]}}',
                '{"op":"set","path":"/elements/root/children/1","value":"b"}',
            ]
        )
        spec = apply_patch_ops(parse_patch_lines(patches))
        assert ["a", "b"] == spec["elements"]["root"]["children"]

    def test_list_add_allows_append_at_index_equal_length(self) -> None:
        patches = "\n".join(
            [
                '{"op":"set","path":"/elements/root","value":{"key":"root","type":"Stack","children":["a"]}}',
                '{"op":"add","path":"/elements/root/children/1","value":"b"}',
            ]
        )
        spec = apply_patch_ops(parse_patch_lines(patches))
        assert ["a", "b"] == spec["elements"]["root"]["children"]

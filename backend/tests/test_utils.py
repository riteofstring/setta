import json
import os
import re
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch, mock_open

# Try both absolute and relative imports to make the tests more robust
try:
    # This is the preferred way when running tests from the project root
    from backend.setta.utils.utils import (
        get_absolute_path,
        is_dev_mode,
        multireplace,
        QuoteInsensitiveDict,
        nested_access,
        recursive_dict_merge,
        try_json,
        replace_null_keys_with_none,
        filter_dict,
        replace_at_positions,
        save_json_to_file,
        prune_dict,
    )
except ImportError:
    # This is a fallback for when the project root is not in the Python path
    from setta.utils.utils import (
        get_absolute_path,
        is_dev_mode,
        multireplace,
        QuoteInsensitiveDict,
        nested_access,
        recursive_dict_merge,
        try_json,
        replace_null_keys_with_none,
        filter_dict,
        replace_at_positions,
        save_json_to_file,
        prune_dict,
    )


class TestGetAbsolutePath(unittest.TestCase):
    def test_get_absolute_path(self):
        # Test case with relative path
        src_path = "/path/to/source.py"
        file_path = "relative/path/file.txt"
        expected = Path("/path/to/relative/path/file.txt").resolve()
        self.assertEqual(get_absolute_path(src_path, file_path), expected)

        # Test case with absolute path
        src_path = "/path/to/source.py"
        file_path = "/absolute/path/file.txt"
        expected = Path("/absolute/path/file.txt").resolve()
        self.assertEqual(get_absolute_path(src_path, file_path), expected)


class TestIsDevMode(unittest.TestCase):
    @patch.dict(os.environ, {"SETTA_DEV_MODE": "1"})
    def test_is_dev_mode_true(self):
        self.assertEqual(is_dev_mode(), "1")

    @patch.dict(os.environ, {})
    def test_is_dev_mode_false(self):
        self.assertIsNone(is_dev_mode())


class TestMultireplace(unittest.TestCase):
    def test_multireplace_basic(self):
        # Test with basic replacements
        original = "hello world"
        replacements = {"hello": "hi", "world": "universe"}
        expected = "hi universe"
        self.assertEqual(multireplace(original, replacements), expected)

    def test_multireplace_overlapping(self):
        # Test with overlapping replacements (longer strings should be replaced first)
        original = "abc abcd"
        replacements = {"ab": "AB", "abc": "ABC"}
        expected = "ABC ABCd"
        self.assertEqual(multireplace(original, replacements), expected)

    def test_multireplace_empty_replacements(self):
        # Test with empty replacements dict
        original = "test string"
        replacements = {}
        expected = "test string"
        self.assertEqual(multireplace(original, replacements), expected)

    def test_multireplace_no_match(self):
        # Test with replacements that don't match anything in the string
        original = "test string"
        replacements = {"xyz": "XYZ"}
        expected = "test string"
        self.assertEqual(multireplace(original, replacements), expected)

    def test_multireplace_with_special_chars(self):
        # Test with special regex characters in the replacements
        original = "a.b*c+d"
        replacements = {".": "_", "*": "_", "+": "_"}
        expected = "a_b_c_d"
        self.assertEqual(multireplace(original, replacements), expected)


class TestQuoteInsensitiveDict(unittest.TestCase):
    def test_get_item(self):
        # Test accessing items with different quote styles
        d = QuoteInsensitiveDict()
        d["key"] = "value"
        self.assertEqual(d["key"], "value")
        self.assertEqual(d['"key"'], "value")
        self.assertEqual(d["'key'"], "value")

    def test_set_item(self):
        # Test setting items with different quote styles
        d = QuoteInsensitiveDict()
        d['"key"'] = "value1"
        self.assertEqual(d["key"], "value1")
        d["'key'"] = "value2"
        self.assertEqual(d["key"], "value2")

    def test_contains(self):
        # Test membership check with different quote styles
        d = QuoteInsensitiveDict()
        d["key"] = "value"
        self.assertTrue("key" in d)
        self.assertTrue('"key"' in d)
        self.assertTrue("'key'" in d)
        self.assertFalse("other" in d)

    def test_normalize_key(self):
        # Test key normalization
        d = QuoteInsensitiveDict()
        self.assertEqual(d.normalize_key('"key"'), "key")
        self.assertEqual(d.normalize_key("'key'"), "key")
        self.assertEqual(d.normalize_key("key"), "key")
        self.assertEqual(
            d.normalize_key('key with "quotes" inside'), 'key with "quotes" inside'
        )

    def test_mixed_quote_styles(self):
        # Test with mixed quote styles
        d = QuoteInsensitiveDict()
        d['key"with"quotes'] = "value1"
        self.assertEqual(d['"key"with"quotes"'], "value1")
        self.assertEqual(d["'key\"with\"quotes'"], "value1")

    def test_empty_key(self):
        # Test with empty key
        d = QuoteInsensitiveDict()
        d[""] = "empty key value"
        self.assertEqual(d[""], "empty key value")
        self.assertEqual(d['""'], "empty key value")
        self.assertEqual(d["''"], "empty key value")


class TestNestedAccess(unittest.TestCase):
    def test_dict_access(self):
        # Test dictionary access
        data = {"a": {"b": {"c": 42}}}
        result, key = nested_access(data, "a[b][c]")
        self.assertEqual(result, {"c": 42})
        self.assertEqual(key, "c")

    def test_list_access(self):
        # Test list access
        data = {"a": [1, 2, {"b": 3}]}
        result, key = nested_access(data, "a[2][b]")
        self.assertEqual(result, {"b": 3})
        self.assertEqual(key, "b")

    def test_quoted_keys(self):
        # Test access with quoted keys
        data = {"a": {"key with spaces": 42}}
        result, key = nested_access(data, 'a["key with spaces"]')
        self.assertEqual(result, {"key with spaces": 42})
        self.assertEqual(key, "key with spaces")


class TestRecursiveDictMerge(unittest.TestCase):
    def test_basic_merge(self):
        # Test basic dictionary merge
        d1 = {"a": 1, "b": 2}
        d2 = {"b": 3, "c": 4}
        expected = {"a": 1, "b": 3, "c": 4}
        self.assertEqual(recursive_dict_merge(d1, d2), expected)

    def test_nested_merge(self):
        # Test merge with nested dictionaries
        d1 = {"a": 1, "b": {"c": 2, "d": 3}}
        d2 = {"b": {"c": 4, "e": 5}, "f": 6}
        expected = {"a": 1, "b": {"c": 4, "d": 3, "e": 5}, "f": 6}
        self.assertEqual(recursive_dict_merge(d1, d2), expected)

    def test_list_merge(self):
        # Test merge with lists
        d1 = {"a": [1, 2], "b": 3}
        d2 = {"a": [3, 4], "c": 5}
        expected = {"a": [1, 2, 3, 4], "b": 3, "c": 5}
        self.assertEqual(recursive_dict_merge(d1, d2), expected)

    def test_strict_top_level_keys(self):
        # Test merge with strict_top_level_keys=True
        d1 = {"a": 1, "b": 2}
        d2 = {"b": 3, "c": 4}
        expected = {"a": 1, "b": 3}
        self.assertEqual(
            recursive_dict_merge(d1, d2, strict_top_level_keys=True), expected
        )


class TestTryJson(unittest.TestCase):
    def test_valid_json(self):
        # Test with valid JSON
        json_str = '{"a": 1, "b": 2}'
        expected = {"a": 1, "b": 2}
        self.assertEqual(try_json(json_str), expected)

    def test_invalid_json(self):
        # Test with invalid JSON
        invalid_json = "{a: 1, b: 2}"
        self.assertEqual(try_json(invalid_json), invalid_json)

    def test_non_string_input(self):
        # Test with non-string input
        non_string = 123
        self.assertEqual(try_json(non_string), non_string)


class TestReplaceNullKeysWithNone(unittest.TestCase):
    def test_simple_dict(self):
        # Test with simple dictionary
        data = {"null": "value", "key": "value"}
        expected = {None: "value", "key": "value"}
        self.assertEqual(replace_null_keys_with_none(data), expected)

    def test_nested_dict(self):
        # Test with nested dictionary
        data = {"key1": {"null": "value"}, "null": {"key2": "value"}}
        expected = {"key1": {None: "value"}, None: {"key2": "value"}}
        self.assertEqual(replace_null_keys_with_none(data), expected)

    def test_dict_in_list(self):
        # Test with dictionary in list
        data = {"key": [{"null": "value"}, {"key2": "value"}]}
        expected = {"key": [{None: "value"}, {"key2": "value"}]}
        self.assertEqual(replace_null_keys_with_none(data), expected)

    def test_non_dict_input(self):
        # Test with non-dictionary input
        data = "not a dict"
        self.assertEqual(replace_null_keys_with_none(data), data)


class TestFilterDict(unittest.TestCase):
    def test_keep_keys(self):
        # Test filtering with keep_keys
        data = {"a": 1, "b": 2, "c": 3}
        keep_keys = ["a", "c"]
        expected = {"a": 1, "c": 3}
        self.assertEqual(filter_dict(data, keep_keys), expected)

    def test_default_vals(self):
        # Test filtering with default_vals
        data = {"a": 1, "b": 2, "c": 0}
        default_vals = {"c": 0}
        expected = {"a": 1, "b": 2}
        self.assertEqual(filter_dict(data, None, default_vals), expected)

    def test_both_filters(self):
        # Test with both keep_keys and default_vals
        data = {"a": 1, "b": 2, "c": 0, "d": 3}
        keep_keys = ["a", "c", "d"]
        default_vals = {"c": 0}
        expected = {"a": 1, "d": 3}
        self.assertEqual(filter_dict(data, keep_keys, default_vals), expected)

    def test_non_dict_input(self):
        # Test with non-dictionary input
        data = "not a dict"
        self.assertEqual(filter_dict(data), data)


class TestReplaceAtPositions(unittest.TestCase):
    def test_basic_replace(self):
        # Test basic replacement
        input_string = "hello world"
        replacements = [(0, "hello", "hi"), (6, "world", "universe")]
        expected = "hi universe"
        self.assertEqual(replace_at_positions(input_string, replacements), expected)

    def test_overlapping_replace(self):
        # Test overlapping replacements (handled by sorting by position in descending order)
        input_string = "abcdef"
        replacements = [(0, "abc", "ABC"), (2, "cde", "CDE")]
        expected = "ABCDEf"
        self.assertEqual(replace_at_positions(input_string, replacements), expected)

    def test_return_positions(self):
        # Test with return_positions=True
        input_string = "hello"
        replacements = [(0, "h", "H")]
        expected_string = "Hello"
        expected_positions = [(0, 0, "H")]
        result = replace_at_positions(input_string, replacements, return_positions=True)
        self.assertEqual(result[0], expected_string)
        self.assertEqual(result[1], expected_positions)

    def test_invalid_position(self):
        # Test with invalid position
        input_string = "hello"
        replacements = [(10, "o", "O")]
        with self.assertRaises(ValueError):
            replace_at_positions(input_string, replacements)

    def test_mismatched_old_value(self):
        # Test with mismatched old value
        input_string = "hello"
        replacements = [(0, "x", "H")]
        with self.assertRaises(ValueError):
            replace_at_positions(input_string, replacements)


class TestSaveJsonToFile(unittest.TestCase):
    @patch("builtins.open", new_callable=mock_open)
    def test_save_json_to_file(self, mock_file):
        # Test saving JSON to a file
        data = {"a": 1, "b": 2}
        path = "test.json"
        save_json_to_file(path, data)

        # Check that open was called with the right parameters
        mock_file.assert_called_once_with(path, "w")

        # Check that json.dump was called with the right parameters
        mock_file().write.assert_called()


class TestPruneDict(unittest.TestCase):
    def test_basic_prune(self):
        # Test basic dictionary pruning
        id_to_children = {
            "root": ["child1", "child2"],
            "child1": ["grandchild1"],
            "child2": ["grandchild2"],
            "grandchild1": [],
            "grandchild2": [],
            "other": ["other_child"],
        }
        keep_ids = ["root"]
        expected = {
            "root": ["child1", "child2"],
            "child1": ["grandchild1"],
            "child2": ["grandchild2"],
            "grandchild1": [],
            "grandchild2": [],
        }
        self.assertEqual(prune_dict(id_to_children, keep_ids), expected)

    def test_multiple_roots(self):
        # Test pruning with multiple roots
        id_to_children = {
            "root1": ["child1"],
            "root2": ["child2"],
            "child1": [],
            "child2": [],
            "other": ["other_child"],
        }
        keep_ids = ["root1", "child2"]
        expected = {"root1": ["child1"], "child1": [], "child2": []}
        self.assertEqual(prune_dict(id_to_children, keep_ids), expected)

    def test_cyclic_references(self):
        # Test pruning with cyclic references
        id_to_children = {"root": ["child"], "child": ["root"]}  # Cyclic reference
        keep_ids = ["root"]
        expected = {"root": ["child"], "child": ["root"]}
        self.assertEqual(prune_dict(id_to_children, keep_ids), expected)


if __name__ == "__main__":
    unittest.main()

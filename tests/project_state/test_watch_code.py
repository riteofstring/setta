import unittest
from pathlib import Path

from setta.project_state.watch_code import parse_tagged_callables


class TestWatchCodeParsing(unittest.TestCase):
    def test_tagged_function_sections(self) -> None:
        source = """# setta-auto-detect sections=2
def my_func(a, b=1, *, c=None):
    return a + b
"""
        callables = parse_tagged_callables(
            source,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        self.assertEqual(len(callables), 1)
        tagged = callables[0]
        self.assertEqual(tagged.callable_name, "my_pkg.module.my_func")
        self.assertEqual(tagged.sections_count, 2)

    def test_default_sections_count_is_one(self) -> None:
        source = """# setta-auto-detect
def my_func(a):
    return a
"""
        callables = parse_tagged_callables(
            source,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        self.assertEqual(len(callables), 1)
        self.assertEqual(callables[0].sections_count, 1)

    def test_tag_requires_previous_line_comment(self) -> None:
        source = """# setta-auto-detect

def my_func(a):
    return a
"""
        callables = parse_tagged_callables(
            source,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        self.assertEqual(callables, [])

    def test_inline_comment_is_ignored(self) -> None:
        source = """def my_func(a):  # setta-auto-detect
    return a
"""
        callables = parse_tagged_callables(
            source,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        self.assertEqual(callables, [])

    def test_unmarked_comment_is_ignored(self) -> None:
        source = """# just a comment
def my_func(a):
    return a
"""
        callables = parse_tagged_callables(
            source,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        self.assertEqual(callables, [])

    def test_tagged_class_signature_changes(self) -> None:
        source_a = """# setta-auto-detect
class MyClass:
    def __init__(self, x, y=3):
        self.x = x
        self.y = y
"""
        source_b = """# setta-auto-detect
class MyClass:
    def __init__(self, x, y=4):
        self.x = x
        self.y = y
"""
        callables_a = parse_tagged_callables(
            source_a,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        callables_b = parse_tagged_callables(
            source_b,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        self.assertEqual(len(callables_a), 1)
        self.assertEqual(len(callables_b), 1)
        self.assertEqual(callables_a[0].callable_name, "my_pkg.module.MyClass")
        self.assertNotEqual(callables_a[0].signature_hash, callables_b[0].signature_hash)

    def test_function_signature_hash_changes(self) -> None:
        source_a = """# setta-auto-detect
def my_func(a):
    return a
"""
        source_b = """# setta-auto-detect
def my_func(a, b=2):
    return a + b
"""
        callables_a = parse_tagged_callables(
            source_a,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        callables_b = parse_tagged_callables(
            source_b,
            module_path="my_pkg.module",
            source_path=Path("src/example.py"),
        )
        self.assertEqual(len(callables_a), 1)
        self.assertEqual(len(callables_b), 1)
        self.assertNotEqual(callables_a[0].signature_hash, callables_b[0].signature_hash)


if __name__ == "__main__":
    unittest.main()

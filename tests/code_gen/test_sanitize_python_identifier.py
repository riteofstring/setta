import unittest

from setta.code_gen.utils import sanitize_python_identifier


class SanitizePythonIdentifierTests(unittest.TestCase):
    def test_preserves_simple_identifiers(self) -> None:
        self.assertEqual("alpha", sanitize_python_identifier("alpha"))
        self.assertEqual("_alpha1", sanitize_python_identifier("_alpha1"))

    def test_replaces_invalid_characters(self) -> None:
        self.assertEqual("user_id", sanitize_python_identifier("user-id"))
        self.assertEqual("white_space", sanitize_python_identifier("white space"))

    def test_prefixes_leading_digits(self) -> None:
        self.assertEqual("_123", sanitize_python_identifier("123"))
        self.assertEqual("_123_abc", sanitize_python_identifier("123 abc"))

    def test_avoids_keywords(self) -> None:
        self.assertEqual("_class", sanitize_python_identifier("class"))
        self.assertEqual("_for", sanitize_python_identifier("for"))

    def test_empty_string_falls_back_to_underscore(self) -> None:
        self.assertEqual("_", sanitize_python_identifier(""))


if __name__ == "__main__":
    unittest.main()

from setta.code_gen.utils import sanitize_python_identifier


class TestSanitizePythonIdentifier:
    def test_preserves_simple_identifiers(self) -> None:
        assert sanitize_python_identifier("alpha") == "alpha"
        assert sanitize_python_identifier("_alpha1") == "_alpha1"

    def test_replaces_invalid_characters(self) -> None:
        assert sanitize_python_identifier("user-id") == "user_id"
        assert sanitize_python_identifier("white space") == "white_space"

    def test_prefixes_leading_digits(self) -> None:
        assert sanitize_python_identifier("123") == "_123"
        assert sanitize_python_identifier("123 abc") == "_123_abc"

    def test_avoids_keywords(self) -> None:
        assert sanitize_python_identifier("class") == "_class"
        assert sanitize_python_identifier("for") == "_for"

    def test_empty_string_falls_back_to_underscore(self) -> None:
        assert sanitize_python_identifier("") == "_"

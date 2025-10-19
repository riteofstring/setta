import unittest
from typing import cast

from setta.project_state.utils import get_code_extension
from setta.types.section_impls import CodeLanguage


class TestCodeLanguageExtensions(unittest.TestCase):
    def test_known_language_extensions(self):
        self.assertEqual(get_code_extension(CodeLanguage.python), "py")
        self.assertEqual(get_code_extension(CodeLanguage.bash), "sh")

    def test_unknown_language_raises_key_error(self):
        with self.assertRaises(KeyError):
            get_code_extension(cast("CodeLanguage", "fake"))

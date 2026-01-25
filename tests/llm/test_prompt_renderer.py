import unittest

from setta.llm.prompt_renderer import render_prompt


class PromptRendererTests(unittest.TestCase):
    def test_renders_template(self) -> None:
        result = render_prompt("Hello {{ name }}", {"name": "Ada"})

        self.assertEqual(result.rendered_text, "Hello Ada")
        self.assertEqual(result.missing_variables, [])
        self.assertIsNone(result.render_error)

    def test_reports_missing_variables(self) -> None:
        result = render_prompt("Hello {{ name }} {{ title }}", {"name": "Ada"})

        self.assertEqual(result.rendered_text, "")
        self.assertEqual(result.missing_variables, ["title"])
        self.assertEqual(result.render_error, "Missing variables: title")

    def test_reports_syntax_errors(self) -> None:
        result = render_prompt("Hello {{ name ", {"name": "Ada"})

        self.assertEqual(result.rendered_text, "")
        self.assertEqual(result.missing_variables, [])
        self.assertIsNotNone(result.render_error)

    def test_reports_render_errors(self) -> None:
        result = render_prompt(
            "Hello {{ name | missing_filter }}",
            {"name": "Ada"},
        )

        self.assertEqual(result.rendered_text, "")
        self.assertEqual(result.missing_variables, [])
        self.assertIsNotNone(result.render_error)

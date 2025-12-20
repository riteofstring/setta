import unittest

from setta.project_state.lsp_response_handlers.completion import (
    process_completion_response,
)


class CompletionResponseTests(unittest.TestCase):
    def test_missing_kind_defaults_to_text(self) -> None:
        response = {"result": {"items": [{"label": "alpha"}]}}
        completions = process_completion_response(response)
        self.assertEqual(len(completions), 1)
        self.assertEqual(completions[0].label, "alpha")
        self.assertEqual(completions[0].type, "Text")

    def test_list_result_missing_kind_defaults_to_text(self) -> None:
        response = {"result": [{"label": "beta"}]}
        completions = process_completion_response(response)
        self.assertEqual(len(completions), 1)
        self.assertEqual(completions[0].label, "beta")
        self.assertEqual(completions[0].type, "Text")


if __name__ == "__main__":
    unittest.main()

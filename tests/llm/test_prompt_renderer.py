from setta.llm.prompt_renderer import render_prompt


class TestPromptRenderer:
    def test_renders_template(self) -> None:
        result = render_prompt("Hello {{ name }}", {"name": "Ada"})

        assert result.rendered_text == "Hello Ada"
        assert result.missing_variables == []
        assert result.render_error is None

    def test_reports_missing_variables(self) -> None:
        result = render_prompt("Hello {{ name }} {{ title }}", {"name": "Ada"})

        assert result.rendered_text == ""
        assert result.missing_variables == ["title"]
        assert result.render_error == "Missing variables: title"

    def test_reports_syntax_errors(self) -> None:
        result = render_prompt("Hello {{ name ", {"name": "Ada"})

        assert result.rendered_text == ""
        assert result.missing_variables == []
        assert result.render_error is not None

    def test_reports_render_errors(self) -> None:
        result = render_prompt(
            "Hello {{ name | missing_filter }}",
            {"name": "Ada"},
        )

        assert result.rendered_text == ""
        assert result.missing_variables == []
        assert result.render_error is not None

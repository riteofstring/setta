from setta.llm.prompt_renderer import PromptRenderResult, render_prompt
from setta.types.prompt import PromptFormat


def build_prompt_section_preview(
    template: str,
    format: PromptFormat,
) -> PromptRenderResult:
    if format != PromptFormat.Jinja:
        return PromptRenderResult(
            rendered_text=template,
            missing_variables=[],
            render_error=None,
        )

    return render_prompt(template, {})

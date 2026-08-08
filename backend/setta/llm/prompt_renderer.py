from dataclasses import dataclass
from typing import Any

from jinja2 import (
    Environment,
    StrictUndefined,
    TemplateError,
    TemplateSyntaxError,
    meta,
)


@dataclass(frozen=True)
class PromptRenderResult:
    rendered_text: str
    missing_variables: list[str]
    render_error: str | None


_PROMPT_ENV = Environment(undefined=StrictUndefined)


def render_prompt(template: str, inputs: dict[str, Any]) -> PromptRenderResult:
    try:
        parsed = _PROMPT_ENV.parse(template)
    except TemplateSyntaxError as exc:
        return PromptRenderResult(
            rendered_text="",
            missing_variables=[],
            render_error=str(exc),
        )

    try:
        missing = sorted(
            name
            for name in meta.find_undeclared_variables(parsed)
            if name not in inputs
        )
    except TemplateError as exc:
        return PromptRenderResult(
            rendered_text="",
            missing_variables=[],
            render_error=str(exc),
        )
    if missing:
        return PromptRenderResult(
            rendered_text="",
            missing_variables=missing,
            render_error=f"Missing variables: {', '.join(missing)}",
        )

    try:
        rendered = _PROMPT_ENV.from_string(template).render(**inputs)
    except TemplateError as exc:
        return PromptRenderResult(
            rendered_text="",
            missing_variables=[],
            render_error=str(exc),
        )

    return PromptRenderResult(
        rendered_text=rendered,
        missing_variables=[],
        render_error=None,
    )

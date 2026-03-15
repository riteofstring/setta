from dataclasses import dataclass
from typing import TYPE_CHECKING

from setta.llm.prompt_renderer import PromptRenderResult, render_prompt
from setta.types.id import ID
from setta.types.prompt import PromptFormat, PromptTemplate
from setta.types.section_impls import PromptSectionImpl

if TYPE_CHECKING:
    from setta.database.db_objs import DBE


@dataclass(frozen=True)
class ResolvedPromptSectionSource:
    template: str
    format: PromptFormat
    prompt_template_id: ID | None
    prompt_template_name: str | None


def load_prompt_template(dbe: "DBE", prompt_id: ID) -> PromptTemplate | None:
    payload = dbe.read_prompt(prompt_id)
    if payload is None:
        return None
    return PromptTemplate.model_validate(payload)


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


def resolve_prompt_section_source(
    dbe: "DBE",
    prompt_impl: PromptSectionImpl,
) -> ResolvedPromptSectionSource:
    prompt_template_id = prompt_impl.promptTemplateId
    if prompt_template_id is None:
        return ResolvedPromptSectionSource(
            template=prompt_impl.template,
            format=prompt_impl.format,
            prompt_template_id=None,
            prompt_template_name=None,
        )

    prompt_template = load_prompt_template(dbe, prompt_template_id)
    if prompt_template is None:
        raise KeyError(
            f"Prompt template {prompt_template_id} not found for prompt section {prompt_impl.id}."
        )

    return ResolvedPromptSectionSource(
        template=prompt_template.template,
        format=prompt_template.format,
        prompt_template_id=prompt_template.id,
        prompt_template_name=prompt_template.name,
    )

from collections.abc import Callable
from dataclasses import dataclass

from setta.agentic.agentic_scope import resolve_context_edges
from setta.types.agentic_edges import AgenticEdgeContextMode
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl3 import build_project_state_summary
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BrowserSectionImpl,
    PromptSectionImpl,
    SocialSectionImpl,
    TextBlockSectionImpl,
)

MAX_INLINE_LINES = 160
MAX_SUMMARY_LINES = 32


@dataclass(frozen=True)
class AgenticContextPayload:
    text: str
    section_ids: list[ID]


def build_agentic_context_payload(
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID,
    *,
    format_section_id: Callable[[ID], str] | None = None,
) -> AgenticContextPayload:
    context_edges = resolve_context_edges(project_state, chat_section_id)
    if not context_edges:
        return AgenticContextPayload(text="", section_ids=[])

    summary = build_project_state_summary(project_state)
    summary_by_section = {entry.sectionId: entry for entry in summary.sections}

    blocks: list[str] = []
    section_ids: list[ID] = []
    for section_id, context_mode in context_edges:
        if section_id not in project_state.sections:
            continue
        block = _build_context_block(
            project_state,
            summary_by_section,
            section_id,
            context_mode,
            format_section_id=format_section_id,
        )
        if not block:
            continue
        blocks.append(block)
        section_ids.append(section_id)

    combined = "\n\n".join(blocks).strip()
    if not combined:
        return AgenticContextPayload(text="", section_ids=section_ids)
    header = "## Agentic Context\nThese sections are in scope via agentic edges.\n"
    return AgenticContextPayload(text=f"{header}\n{combined}".strip(), section_ids=section_ids)


def _build_context_block(
    project_state: ProjectStateSingleConfig,
    summary_by_section: dict[ID, object],
    section_id: ID,
    context_mode: AgenticEdgeContextMode,
    *,
    format_section_id: Callable[[ID], str] | None,
) -> str:
    section = project_state.sections[section_id]
    display_name = (section.displayName or "").strip()
    label = display_name if display_name else section.name or str(section_id)
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    section_type = section_impl.type.value

    rendered_id = format_section_id(section_id) if format_section_id else str(section_id)
    if context_mode == AgenticEdgeContextMode.reference_only:
        return f"- {label} ({section_type}) [id: {rendered_id}]"

    raw_text = _extract_section_text(
        project_state,
        summary_by_section,
        section_id,
    )
    if not raw_text:
        return f"- {label} ({section_type}) [id: {rendered_id}]"

    max_lines = (
        MAX_SUMMARY_LINES
        if context_mode == AgenticEdgeContextMode.summary
        else MAX_INLINE_LINES
    )
    truncated = _truncate_lines(raw_text, max_lines)
    mode_label = "summary" if context_mode == AgenticEdgeContextMode.summary else "inline"
    return (
        f"### {label} ({section_type}) [id: {rendered_id} | {mode_label}]\n"
        f"{truncated}".strip()
    )


def _extract_section_text(
    project_state: ProjectStateSingleConfig,
    summary_by_section: dict[ID, object],
    section_id: ID,
) -> str:
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    if isinstance(section_impl, TextBlockSectionImpl):
        return section_impl.text or ""
    if isinstance(section_impl, BaseCodeSectionImpl):
        return section_impl.code or ""
    if isinstance(section_impl, PromptSectionImpl):
        return section_impl.renderedText or section_impl.template or ""
    if isinstance(section_impl, SocialSectionImpl):
        return section_impl.url or ""
    if isinstance(section_impl, BrowserSectionImpl):
        folder = section_impl.folder or ""
        view_mode = section_impl.viewMode.value if section_impl.viewMode else ""
        return f"folder: {folder}\nview: {view_mode}".strip()

    summary_entry = summary_by_section.get(section_id)
    if summary_entry is None:
        return ""
    params = getattr(summary_entry, "parameters", None)
    if not params:
        return ""
    lines: list[str] = []
    for param in params:
        name = getattr(param, "name", "") or str(getattr(param, "paramId", ""))
        preview = getattr(param, "valuePreview", None)
        if preview:
            lines.append(f"- {name}: {preview}")
        else:
            lines.append(f"- {name}")
    return "\n".join(lines)


def _truncate_lines(text: str, max_lines: int) -> str:
    if not text:
        return ""
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return text.strip()
    clipped = "\n".join(lines[:max_lines]).strip()
    remainder = len(lines) - max_lines
    return f"{clipped}\n... ({remainder} more lines)"

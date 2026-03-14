import hashlib
from collections.abc import Callable
from dataclasses import dataclass

from setta.agentic.agentic_scope import resolve_context_edges
from setta.agentic.linked_chat_targets import is_executable_linked_chat_target
from setta.database.db_objs import DBE
from setta.types.agentic_edges import AgenticEdgeContextMode, AgenticEdgeKind
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.helpers_lvl3 import build_project_state_summary_section_index
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.prompt_section_resolution import resolve_prompt_section_source
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
    PromptSectionImpl,
    SocialSectionImpl,
    TextBlockSectionImpl,
)

MAX_INLINE_LINES = 160
MAX_SUMMARY_LINES = 32
MAX_SUMMARY_PROMPT_CHARS = 18_000


@dataclass(frozen=True)
class AgenticContextPayload:
    text: str
    section_ids: list[ID]


@dataclass(frozen=True)
class AgenticSectionSummarySource:
    """Deterministic summary inputs derived from a single section.

    `content_hash` should change whenever the semantic summary source changes.
    `prompt_text` is a bounded excerpt suitable for sending to an LLM.
    """

    section_id: ID
    label: str
    section_type: str
    raw_text: str
    prompt_text: str
    content_hash: str


def build_agentic_context_payload(
    dbe: DBE,
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID,
    *,
    llm_configs: AllLLMConfigs | None,
    format_section_id: Callable[[ID], str] | None = None,
    summary_text_by_section_id: dict[ID, str] | None = None,
    summary_by_section: dict[ID, object] | None = None,
) -> AgenticContextPayload:
    context_edges = resolve_context_edges(project_state, chat_section_id)
    linked_chat_section_ids = _resolve_linked_chat_section_ids(
        dbe,
        project_state,
        chat_section_id,
        llm_configs=llm_configs,
    )
    if not context_edges and not linked_chat_section_ids:
        return AgenticContextPayload(text="", section_ids=[])

    resolved_summary_by_section: dict[ID, object] = (
        dict(summary_by_section) if summary_by_section else {}
    )
    needed_section_ids: set[ID] = set()
    for section_id, context_mode in context_edges:
        if section_id not in project_state.sections:
            continue
        if context_mode == AgenticEdgeContextMode.reference_only:
            continue
        if (
            section_id in resolved_summary_by_section
            and resolved_summary_by_section.get(section_id) is not None
        ):
            continue
        if context_mode == AgenticEdgeContextMode.summary:
            cached = (
                summary_text_by_section_id.get(section_id)
                if summary_text_by_section_id is not None
                else None
            )
            if isinstance(cached, str) and cached.strip():
                continue
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if isinstance(section_impl, (CallableSectionImpl, DrawSectionImpl)):
            needed_section_ids.add(section_id)
        elif not isinstance(
            section_impl,
            (
                TextBlockSectionImpl,
                ImageSectionImpl,
                BaseCodeSectionImpl,
                ChartSectionImpl,
                PromptSectionImpl,
                SocialSectionImpl,
                BrowserSectionImpl,
            ),
        ):
            needed_section_ids.add(section_id)
    if needed_section_ids:
        resolved_summary_by_section.update(
            build_project_state_summary_section_index(
                project_state,
                needed_section_ids,
            )
        )

    blocks: list[str] = []
    section_ids: list[ID] = []
    for section_id, context_mode in context_edges:
        if section_id not in project_state.sections:
            continue
        block = _build_context_block(
            dbe,
            project_state,
            resolved_summary_by_section,
            section_id,
            context_mode,
            format_section_id=format_section_id,
            summary_text_by_section_id=summary_text_by_section_id,
        )
        if not block:
            continue
        blocks.append(block)
        section_ids.append(section_id)

    linked_chat_block = _build_linked_chat_block(
        project_state,
        linked_chat_section_ids,
        format_section_id=format_section_id,
    )
    if linked_chat_block:
        blocks.append(linked_chat_block)
        section_ids.extend(
            section_id
            for section_id in linked_chat_section_ids
            if section_id in project_state.sections
        )

    combined = "\n\n".join(blocks).strip()
    if not combined:
        return AgenticContextPayload(text="", section_ids=section_ids)
    header = (
        "## Agentic Context\n"
        "These sections and linked chats are in scope via agentic edges.\n"
    )
    return AgenticContextPayload(
        text=f"{header}\n{combined}".strip(), section_ids=section_ids
    )


def _resolve_linked_chat_section_ids(
    dbe: DBE,
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID,
    *,
    llm_configs: AllLLMConfigs | None,
) -> list[ID]:
    if llm_configs is None:
        return []
    linked_chat_section_ids: list[ID] = []
    for edge in project_state.projectConfig.agenticEdges:
        if edge.kind != AgenticEdgeKind.chat_chat:
            continue
        if edge.sourceSectionId != chat_section_id:
            continue
        if not is_executable_linked_chat_target(
            project_state,
            edge.targetSectionId,
            dbe=dbe,
            llm_configs=llm_configs,
        ):
            continue
        linked_chat_section_ids.append(edge.targetSectionId)
    linked_chat_section_ids.sort(key=str)
    return linked_chat_section_ids


def _build_linked_chat_block(
    project_state: ProjectStateSingleConfig,
    linked_chat_section_ids: list[ID],
    *,
    format_section_id: Callable[[ID], str] | None,
) -> str:
    if not linked_chat_section_ids:
        return ""
    lines = [
        "## Linked Chats",
        "These direct chat links can be invoked with the `invoke_linked_chat` tool.",
    ]
    for section_id in linked_chat_section_ids:
        if section_id not in project_state.sections:
            continue
        section = project_state.sections[section_id]
        display_name = (section.displayName or "").strip()
        label = display_name if display_name else section.name or str(section_id)
        rendered_id = (
            format_section_id(section_id) if format_section_id else str(section_id)
        )
        lines.append(f"- {label} [id: {rendered_id}]")
    return "\n".join(lines).strip()


def _build_context_block(
    dbe: DBE,
    project_state: ProjectStateSingleConfig,
    summary_by_section: dict[ID, object],
    section_id: ID,
    context_mode: AgenticEdgeContextMode,
    *,
    format_section_id: Callable[[ID], str] | None,
    summary_text_by_section_id: dict[ID, str] | None,
) -> str:
    section = project_state.sections[section_id]
    display_name = (section.displayName or "").strip()
    label = display_name if display_name else section.name or str(section_id)
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    section_type = section_impl.type.value

    rendered_id = (
        format_section_id(section_id) if format_section_id else str(section_id)
    )
    if context_mode == AgenticEdgeContextMode.reference_only:
        return f"- {label} ({section_type}) [id: {rendered_id}]"

    if context_mode == AgenticEdgeContextMode.summary:
        cached = (
            summary_text_by_section_id.get(section_id)
            if summary_text_by_section_id is not None
            else None
        )
        if isinstance(cached, str) and cached.strip():
            return (
                f"### {label} ({section_type}) [id: {rendered_id} | summary | cached]\n"
                f"{cached.strip()}".strip()
            )
    raw_text = _extract_section_text(
        dbe,
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
    mode_label = "inline"
    if context_mode == AgenticEdgeContextMode.summary:
        mode_label = "summary | fallback"
    return (
        f"### {label} ({section_type}) [id: {rendered_id} | {mode_label}]\n"
        f"{truncated}".strip()
    )


def _extract_section_text(
    dbe: DBE,
    project_state: ProjectStateSingleConfig,
    summary_by_section: dict[ID, object],
    section_id: ID,
) -> str:
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    if isinstance(section_impl, TextBlockSectionImpl):
        return section_impl.text or ""
    if isinstance(section_impl, ImageSectionImpl):
        image_path = (section_impl.imagePath or "").strip()
        return f"imagePath: {image_path}".strip() if image_path else ""
    if isinstance(section_impl, BaseCodeSectionImpl):
        return section_impl.code or ""
    if isinstance(section_impl, CallableSectionImpl):
        callable_id = section_impl.callable
        callable_line = f"callable: {callable_id}" if callable_id is not None else ""
        summary_entry = summary_by_section.get(section_id)
        param_lines = _extract_summary_params(summary_entry)
        combined = "\n".join([line for line in (callable_line, param_lines) if line])
        return combined.strip()
    if isinstance(section_impl, ChartSectionImpl):
        lines: list[str] = []
        data_path = (section_impl.dataPath or "").strip()
        if data_path:
            lines.append(f"dataPath: {data_path}")
        chart_settings = getattr(section_impl, "chartSettings", None)
        chart_type = getattr(chart_settings, "type", None)
        if chart_type is not None:
            value = (
                chart_type.value if hasattr(chart_type, "value") else str(chart_type)
            )
            value = value.strip()
            if value:
                lines.append(f"chartType: {value}")
        x_axis_column = getattr(chart_settings, "xAxisColumn", None)
        if isinstance(x_axis_column, str) and x_axis_column.strip():
            lines.append(f"xAxisColumn: {x_axis_column.strip()}")
        return "\n".join(lines).strip()
    if isinstance(section_impl, DrawSectionImpl):
        lines: list[str] = [f"layerCount: {len(section_impl.layers)}"]
        rendered_path = section_impl.renderedImagePath
        if isinstance(rendered_path, str) and rendered_path.strip():
            lines.append(f"renderedImagePath: {rendered_path.strip()}")
        layer_names = [layer.name for layer in section_impl.layers if layer.name]
        if layer_names:
            lines.append("layers:")
            for name in layer_names[:8]:
                lines.append(f"- {name}")
            if len(layer_names) > 8:
                lines.append(f"... ({len(layer_names) - 8} more)")
        summary_entry = summary_by_section.get(section_id)
        draw_paths = getattr(summary_entry, "drawLayerAssetPaths", None)
        if isinstance(draw_paths, list) and draw_paths:
            lines.append("assetPaths:")
            for entry in draw_paths[:8]:
                if isinstance(entry, str) and entry.strip():
                    lines.append(f"- {entry.strip()}")
            if len(draw_paths) > 8:
                lines.append(f"... ({len(draw_paths) - 8} more)")
        return "\n".join(lines).strip()
    if isinstance(section_impl, PromptSectionImpl):
        prompt_source = resolve_prompt_section_source(dbe, section_impl)
        return prompt_source.template
    if isinstance(section_impl, SocialSectionImpl):
        return section_impl.url or ""
    if isinstance(section_impl, BrowserSectionImpl):
        folder = section_impl.folder or ""
        view_mode = section_impl.viewMode.value if section_impl.viewMode else ""
        return f"folder: {folder}\nview: {view_mode}".strip()

    summary_entry = summary_by_section.get(section_id)
    return _extract_summary_params(summary_entry)


def _extract_summary_params(summary_entry: object | None) -> str:
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
    return "\n".join(lines).strip()


def _truncate_lines(text: str, max_lines: int) -> str:
    if not text:
        return ""
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return text.strip()
    clipped = "\n".join(lines[:max_lines]).strip()
    remainder = len(lines) - max_lines
    return f"{clipped}\n... ({remainder} more lines)"


def build_agentic_section_summary_source(
    project_state: ProjectStateSingleConfig,
    section_id: ID,
    *,
    summary_by_section: dict[ID, object] | None = None,
) -> AgenticSectionSummarySource:
    if section_id not in project_state.sections:
        raise KeyError(f"Section {section_id} not found in project state.")

    section = project_state.sections[section_id]
    display_name = (section.displayName or "").strip()
    label = display_name if display_name else section.name or str(section_id)
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    section_type = section_impl.type.value

    resolved_summary_by_section = summary_by_section
    if resolved_summary_by_section is None:
        resolved_summary_by_section = build_project_state_summary_section_index(
            project_state,
            {section_id},
        )
    raw_text = _extract_section_text(
        project_state, resolved_summary_by_section, section_id
    )

    prompt_body = raw_text
    if len(prompt_body) > MAX_SUMMARY_PROMPT_CHARS:
        prompt_body = (
            prompt_body[:MAX_SUMMARY_PROMPT_CHARS].rstrip() + "\n\n[...truncated...]"
        )

    # Cache keys should reflect the *actual* summarization input. The prompt body
    # is bounded, so edits beyond the truncation window should not thrash the
    # summary cache.
    hashed_payload = f"{section_type}\n{prompt_body}".encode("utf-8")
    content_hash = hashlib.sha256(hashed_payload).hexdigest()
    prompt_text = (
        f"Section: {label}\nType: {section_type}\n\nContent:\n{prompt_body}".strip()
    )
    return AgenticSectionSummarySource(
        section_id=section_id,
        label=label,
        section_type=section_type,
        raw_text=raw_text,
        prompt_text=prompt_text,
        content_hash=content_hash,
    )

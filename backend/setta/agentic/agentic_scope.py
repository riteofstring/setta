import logging
from dataclasses import dataclass, field
from typing import Any

from mcp.types import CallToolResult, TextContent

from setta.mcp.id_path_utils import collect_ai_follow_ids_from_paths
from setta.mcp.namespacing import split_namespaced_tool_name
from setta.mcp.tool_metadata import SettaToolAnnotations, ToolAccessType
from setta.types.agentic_edges import AgenticEdgeContextMode, AgenticEdgeKind
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import (
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    MetaControlSectionImpl,
    SectionType,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AgenticContext:
    project_config_id: ID
    chat_id: ID | None
    section_id: ID | None


@dataclass(frozen=True)
class AgenticScope:
    read_section_ids: set[ID] = field(default_factory=set)
    write_section_ids: set[ID] = field(default_factory=set)
    context_section_ids: set[ID] = field(default_factory=set)
    peer_chat_section_ids: set[ID] = field(default_factory=set)
    structural_allowed: bool = False

    def effective_read_section_ids(self) -> set[ID]:
        return set(self.read_section_ids) | set(self.peer_chat_section_ids)


@dataclass(frozen=True)
class AgenticScopeCheck:
    allowed: bool
    access_type: ToolAccessType
    target_section_ids: set[ID]
    blocked_section_ids: set[ID]
    unmapped_code_obj_ids: set[ID]
    reason: str


def resolve_agentic_scope(
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID | None,
) -> AgenticScope:
    if chat_section_id is None:
        all_section_ids = set(project_state.sections.keys())
        peer_chat_ids = _collect_chat_section_ids(project_state)
        return AgenticScope(
            read_section_ids=set(all_section_ids),
            write_section_ids=set(all_section_ids),
            context_section_ids=set(all_section_ids),
            peer_chat_section_ids=set(peer_chat_ids),
            structural_allowed=True,
        )
    if chat_section_id not in project_state.sections:
        raise KeyError(f"Chat section {chat_section_id} not found in project state.")

    read_section_ids: set[ID] = set()
    write_section_ids: set[ID] = set()
    context_section_ids: set[ID] = set()
    peer_chat_section_ids: set[ID] = set()

    for edge in project_state.projectConfig.agenticEdges:
        if edge.kind == AgenticEdgeKind.section_chat:
            if edge.targetSectionId != chat_section_id:
                continue
            read_section_ids.add(edge.sourceSectionId)
            context_section_ids.add(edge.sourceSectionId)
            continue
        if edge.kind == AgenticEdgeKind.chat_section:
            if edge.sourceSectionId != chat_section_id:
                continue
            read_section_ids.add(edge.targetSectionId)
            write_section_ids.add(edge.targetSectionId)
            continue
        if edge.kind == AgenticEdgeKind.chat_chat:
            if edge.sourceSectionId == chat_section_id:
                peer_chat_section_ids.add(edge.targetSectionId)
            elif edge.targetSectionId == chat_section_id:
                peer_chat_section_ids.add(edge.sourceSectionId)

    return AgenticScope(
        read_section_ids=read_section_ids,
        write_section_ids=write_section_ids,
        context_section_ids=context_section_ids,
        peer_chat_section_ids=peer_chat_section_ids,
        structural_allowed=False,
    )


def resolve_context_edges(
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID,
) -> list[tuple[ID, AgenticEdgeContextMode]]:
    edges: list[tuple[ID, AgenticEdgeContextMode]] = []
    for edge in project_state.projectConfig.agenticEdges:
        if edge.kind != AgenticEdgeKind.section_chat:
            continue
        if edge.targetSectionId != chat_section_id:
            continue
        edges.append((edge.sourceSectionId, edge.contextMode))
    edges.sort(key=lambda entry: (str(entry[0]), entry[1].value))
    return edges


def check_agentic_scope_for_tool(
    *,
    tool_name: str | None = None,
    tool_args: dict[str, Any],
    annotations: SettaToolAnnotations | None,
    project_state: ProjectStateSingleConfig,
    scope: AgenticScope,
    temporary_to_canonical: dict[ID, ID] | None = None,
) -> AgenticScopeCheck:
    access_type: ToolAccessType = "structural"
    id_paths_by_type: dict[str, list[str]] = {}
    if annotations is not None:
        access_type = annotations.accessType
        id_paths_by_type = dict(annotations.idPathsByType or {})

    ids_by_type, _ = collect_ai_follow_ids_from_paths(
        tool_args,
        id_paths_by_type,
        allow_dict_keys=True,
    )
    if temporary_to_canonical:
        ids_by_type = {
            id_type: {temporary_to_canonical.get(entry, entry) for entry in ids}
            for id_type, ids in ids_by_type.items()
        }
    section_ids = set(ids_by_type.get("section", set()))
    code_obj_ids = set(ids_by_type.get("codeObj", set()))
    mapped_sections, unmapped_code_objs = _map_code_obj_ids_to_sections(
        project_state,
        code_obj_ids,
    )
    target_section_ids = section_ids | mapped_sections
    if not target_section_ids and access_type == "write":
        tool_basename = _normalize_tool_name_for_scope_check(tool_name)
        if tool_basename in {"set_gen_code_prefix", "set_gen_code_suffix"}:
            gen_section_id = project_state.singletonSections.GenPythonCode
            if gen_section_id is not None:
                target_section_ids = {gen_section_id}

    if access_type == "structural":
        allowed = scope.structural_allowed
        return AgenticScopeCheck(
            allowed=allowed,
            access_type=access_type,
            target_section_ids=target_section_ids,
            blocked_section_ids=set() if allowed else set(target_section_ids),
            unmapped_code_obj_ids=unmapped_code_objs,
            reason="structural" if allowed else "structural_denied",
        )

    allowed_ids = (
        scope.effective_read_section_ids()
        if access_type == "read"
        else set(scope.write_section_ids)
    )
    if not allowed_ids:
        return AgenticScopeCheck(
            allowed=False,
            access_type=access_type,
            target_section_ids=target_section_ids,
            blocked_section_ids=set(target_section_ids),
            unmapped_code_obj_ids=unmapped_code_objs,
            reason="empty_scope",
        )
    if not target_section_ids:
        if access_type == "write":
            return AgenticScopeCheck(
                allowed=scope.structural_allowed,
                access_type=access_type,
                target_section_ids=target_section_ids,
                blocked_section_ids=set() if scope.structural_allowed else set(),
                unmapped_code_obj_ids=unmapped_code_objs,
                reason="write_without_targets"
                if not scope.structural_allowed
                else "write_without_targets_allowed",
            )
        return AgenticScopeCheck(
            allowed=True,
            access_type=access_type,
            target_section_ids=target_section_ids,
            blocked_section_ids=set(),
            unmapped_code_obj_ids=unmapped_code_objs,
            reason="read_without_targets",
        )

    blocked = target_section_ids - allowed_ids
    if unmapped_code_objs:
        blocked = set(blocked) | set(target_section_ids)
    allowed = not blocked
    return AgenticScopeCheck(
        allowed=allowed,
        access_type=access_type,
        target_section_ids=target_section_ids,
        blocked_section_ids=blocked,
        unmapped_code_obj_ids=unmapped_code_objs,
        reason="allowed" if allowed else "out_of_scope",
    )


def _normalize_tool_name_for_scope_check(tool_name: str | None) -> str | None:
    if tool_name is None:
        return None
    normalized = tool_name.strip()
    if not normalized:
        return None
    if normalized.startswith("mcp__"):
        normalized = normalized[len("mcp__") :]
    _, base_name = split_namespaced_tool_name(normalized)
    return base_name


def build_missing_edge_hints(
    *,
    chat_section_id: ID | None,
    blocked_section_ids: set[ID],
    access_type: ToolAccessType,
    project_state: ProjectStateSingleConfig,
) -> list[dict[str, str]]:
    if chat_section_id is None:
        return []
    hints: list[dict[str, str]] = []
    for section_id in sorted(blocked_section_ids, key=lambda entry: str(entry)):
        kind = _resolve_missing_edge_kind(
            project_state,
            section_id,
            access_type,
        )
        if kind is None:
            continue
        if kind == AgenticEdgeKind.chat_chat:
            hints.append(
                {
                    "sourceSectionId": chat_section_id,
                    "targetSectionId": section_id,
                    "kind": kind.value,
                }
            )
            continue
        if kind == AgenticEdgeKind.chat_section:
            hints.append(
                {
                    "sourceSectionId": chat_section_id,
                    "targetSectionId": section_id,
                    "kind": kind.value,
                }
            )
            continue
        hints.append(
            {
                "sourceSectionId": section_id,
                "targetSectionId": chat_section_id,
                "kind": kind.value,
            }
        )
    return hints


def build_scope_blocked_tool_result(
    *,
    tool_name: str,
    scope_check: AgenticScopeCheck,
    agentic_context: AgenticContext | None,
    missing_edges: list[dict[str, str]],
) -> CallToolResult:
    blocked = ", ".join(str(entry) for entry in scope_check.blocked_section_ids)
    message = (
        f"Tool '{tool_name}' blocked by agentic scope "
        f"(access={scope_check.access_type}, blocked=[{blocked}])."
    )
    structured = {
        "error": "ScopeViolation",
        "message": message,
        "toolName": tool_name,
        "accessType": scope_check.access_type,
        "blockedSectionIds": list(scope_check.blocked_section_ids),
        "targetSectionIds": list(scope_check.target_section_ids),
        "unmappedCodeObjIds": list(scope_check.unmapped_code_obj_ids),
        "reason": scope_check.reason,
        "missingEdges": missing_edges,
    }
    if agentic_context is not None:
        structured["projectConfigId"] = agentic_context.project_config_id
        structured["chatId"] = agentic_context.chat_id
        structured["sectionId"] = agentic_context.section_id
    return CallToolResult(
        content=[TextContent(type="text", text=message)],
        structuredContent=structured,
        isError=True,
    )


def _resolve_missing_edge_kind(
    project_state: ProjectStateSingleConfig,
    section_id: ID,
    access_type: ToolAccessType,
) -> AgenticEdgeKind | None:
    if access_type == "structural":
        return None
    if _is_chat_section(project_state, section_id) and access_type == "read":
        return AgenticEdgeKind.chat_chat
    if access_type == "write":
        return AgenticEdgeKind.chat_section
    return AgenticEdgeKind.section_chat


def _collect_chat_section_ids(project_state: ProjectStateSingleConfig) -> set[ID]:
    chat_ids: set[ID] = set()
    for section_id in project_state.sections:
        if _is_chat_section(project_state, section_id):
            chat_ids.add(section_id)
    return chat_ids


def _is_chat_section(
    project_state: ProjectStateSingleConfig,
    section_id: ID,
) -> bool:
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    return section_impl.type == SectionType.Chat


def _map_code_obj_ids_to_sections(
    project_state: ProjectStateSingleConfig,
    code_obj_ids: set[ID],
) -> tuple[set[ID], set[ID]]:
    if not code_obj_ids:
        return set(), set()
    mapping: dict[ID, set[ID]] = {}
    for section_id in project_state.sections:
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if isinstance(section_impl, BaseSectionWithParamsImpl):
            for code_obj_id in section_impl.codeObjVariantMap:
                if code_obj_id in code_obj_ids:
                    mapping.setdefault(code_obj_id, set()).add(section_id)
        elif isinstance(section_impl, MetaControlSectionImpl):
            for code_obj_id in section_impl.codeObjVariantMap:
                if code_obj_id in code_obj_ids:
                    mapping.setdefault(code_obj_id, set()).add(section_id)
        if isinstance(section_impl, CallableSectionImpl):
            if (
                section_impl.callable is not None
                and section_impl.callable in code_obj_ids
            ):
                mapping.setdefault(section_impl.callable, set()).add(section_id)
    mapped_sections: set[ID] = set()
    for sections in mapping.values():
        mapped_sections.update(sections)
    unmapped = {
        code_obj_id for code_obj_id in code_obj_ids if code_obj_id not in mapping
    }
    return mapped_sections, unmapped

from dataclasses import dataclass, field
from typing import Any

from mcp.types import CallToolResult, TextContent

from setta.mcp.id_path_utils import collect_ai_follow_ids_from_paths
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


@dataclass(frozen=True)
class AgenticContext:
    project_config_id: ID
    chat_id: ID | None
    section_id: ID | None
    frontend_affinity_token: str | None = None
    allow_unscoped: bool = False
    linked_chat_invocation_depth: int = 0
    linked_chat_invocation_chain_section_ids: tuple[ID, ...] = field(
        default_factory=tuple
    )


@dataclass(frozen=True)
class AgenticScope:
    read_section_ids: set[ID] = field(default_factory=set)
    write_section_ids: set[ID] = field(default_factory=set)
    context_section_ids: set[ID] = field(default_factory=set)
    peer_chat_section_ids: set[ID] = field(default_factory=set)
    structural_allowed: bool = False

    def effective_read_section_ids(self) -> set[ID]:
        return set(self.read_section_ids)


@dataclass(frozen=True)
class AgenticScopeCheck:
    allowed: bool
    access_type: ToolAccessType
    target_section_ids: set[ID]
    blocked_section_ids: set[ID]
    unmapped_code_obj_ids: set[ID]
    reason: str


def normalize_linked_chat_invocation_depth(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        raise TypeError("linkedChatInvocationDepth must be an integer")
    if isinstance(value, int):
        depth = value
    elif isinstance(value, str):
        normalized = value.strip()
        if normalized == "":
            return 0
        try:
            depth = int(normalized)
        except ValueError as exc:
            raise TypeError("linkedChatInvocationDepth must be an integer") from exc
    else:
        raise TypeError("linkedChatInvocationDepth must be an integer")
    if depth < 0:
        raise ValueError("linkedChatInvocationDepth must be non-negative")
    return depth


def normalize_linked_chat_invocation_chain_section_ids(
    value: Any,
) -> tuple[ID, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        normalized = value.strip()
        if normalized == "":
            return ()
        raw_entries: list[Any] = [entry for entry in normalized.split(",")]
    elif isinstance(value, (list, tuple)):
        raw_entries = list(value)
    else:
        raise TypeError(
            "linkedChatInvocationChainSectionIds must be a list of section ids"
        )

    chain: list[ID] = []
    for raw_entry in raw_entries:
        if isinstance(raw_entry, ID):
            chain.append(raw_entry)
            continue
        if not isinstance(raw_entry, str):
            raise TypeError(
                "linkedChatInvocationChainSectionIds must be a list of section ids"
            )
        normalized_entry = raw_entry.strip()
        if normalized_entry == "":
            raise ValueError(
                "linkedChatInvocationChainSectionIds cannot contain empty values"
            )
        chain.append(ID(normalized_entry))
    return tuple(chain)


def resolve_agentic_scope(
    project_state: ProjectStateSingleConfig,
    chat_section_id: ID | None,
    *,
    allow_unscoped: bool = False,
) -> AgenticScope:
    if chat_section_id is None:
        if not allow_unscoped:
            return AgenticScope()
        all_section_ids = set(project_state.sections.keys())
        return AgenticScope(
            read_section_ids=set(all_section_ids),
            write_section_ids=set(all_section_ids),
            context_section_ids=set(all_section_ids),
            peer_chat_section_ids=set(),
            structural_allowed=True,
        )
    if chat_section_id not in project_state.sections:
        raise KeyError(f"Chat section {chat_section_id} not found in project state.")

    read_section_ids: set[ID] = set()
    write_section_ids: set[ID] = set()
    context_section_ids: set[ID] = set()
    peer_chat_section_ids: set[ID] = set()

    for edge in project_state.projectConfig.agenticEdges:
        if edge.sourceSectionId != chat_section_id:
            continue
        if edge.kind == AgenticEdgeKind.chat_section:
            read_section_ids.add(edge.targetSectionId)
            write_section_ids.add(edge.targetSectionId)
            context_section_ids.add(edge.targetSectionId)
            continue
        if edge.kind == AgenticEdgeKind.chat_chat:
            peer_chat_section_ids.add(edge.targetSectionId)

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
        if edge.kind != AgenticEdgeKind.chat_section:
            continue
        if edge.sourceSectionId != chat_section_id:
            continue
        edges.append((edge.targetSectionId, edge.contextMode))
    edges.sort(key=lambda entry: (str(entry[0]), entry[1].value))
    return edges


def check_agentic_scope_for_tool(
    *,
    tool_args: dict[str, Any],
    annotations: SettaToolAnnotations | None,
    project_state: ProjectStateSingleConfig,
    scope: AgenticScope,
    temporary_to_canonical: dict[ID, ID] | None = None,
    code_obj_id_to_section_ids: dict[ID, set[ID]] | None = None,
    precomputed_ids_by_type: dict[str, set[ID]] | None = None,
) -> AgenticScopeCheck:
    access_type: ToolAccessType = "structural"
    id_paths_by_type: dict[str, list[str]] = {}
    if annotations is not None:
        access_type = annotations.accessType
        id_paths_by_type = dict(annotations.idPathsByType or {})

    if precomputed_ids_by_type is None:
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
    else:
        ids_by_type = precomputed_ids_by_type
    section_ids = set(ids_by_type.get("section", set()))
    code_obj_ids = set(ids_by_type.get("codeObj", set()))
    mapped_sections, unmapped_code_objs = _map_code_obj_ids_to_sections(
        project_state,
        code_obj_ids,
        code_obj_id_to_section_ids=code_obj_id_to_section_ids,
    )
    target_section_ids = section_ids | mapped_sections
    if not target_section_ids and access_type == "write":
        if unmapped_code_objs:
            return AgenticScopeCheck(
                allowed=False,
                access_type=access_type,
                target_section_ids=target_section_ids,
                blocked_section_ids=set(),
                unmapped_code_obj_ids=unmapped_code_objs,
                reason="unmapped_code_obj",
            )
        default_singleton = (
            getattr(annotations, "defaultTargetSingletonSection", None)
            if annotations is not None
            else None
        )
        if isinstance(default_singleton, str) and default_singleton:
            resolved = getattr(project_state.singletonSections, default_singleton, None)
            if resolved is not None:
                target_section_ids = {resolved}

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

    if access_type == "read":
        allowed_ids = scope.effective_read_section_ids()
    elif access_type == "peer_chat":
        allowed_ids = set(scope.peer_chat_section_ids)
    else:
        allowed_ids = set(scope.write_section_ids)
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
        if unmapped_code_objs:
            return AgenticScopeCheck(
                allowed=False,
                access_type=access_type,
                target_section_ids=target_section_ids,
                blocked_section_ids=set(),
                unmapped_code_obj_ids=unmapped_code_objs,
                reason="unmapped_code_obj",
            )
        if access_type == "write":
            return AgenticScopeCheck(
                allowed=scope.structural_allowed,
                access_type=access_type,
                target_section_ids=target_section_ids,
                blocked_section_ids=set(),
                unmapped_code_obj_ids=unmapped_code_objs,
                reason="write_without_targets"
                if not scope.structural_allowed
                else "write_without_targets_allowed",
            )
        if access_type == "peer_chat":
            return AgenticScopeCheck(
                allowed=False,
                access_type=access_type,
                target_section_ids=target_section_ids,
                blocked_section_ids=set(),
                unmapped_code_obj_ids=unmapped_code_objs,
                reason="peer_chat_without_targets",
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
    allowed = not blocked and not unmapped_code_objs
    reason = "allowed" if allowed else "out_of_scope"
    if not allowed and unmapped_code_objs:
        reason = (
            "out_of_scope_and_unmapped_code_obj" if blocked else "unmapped_code_obj"
        )
    return AgenticScopeCheck(
        allowed=allowed,
        access_type=access_type,
        target_section_ids=target_section_ids,
        blocked_section_ids=blocked,
        unmapped_code_obj_ids=unmapped_code_objs,
        reason=reason,
    )


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
    blocked_sorted = sorted(
        scope_check.blocked_section_ids, key=lambda entry: str(entry)
    )
    target_sorted = sorted(scope_check.target_section_ids, key=lambda entry: str(entry))
    unmapped_sorted = sorted(
        scope_check.unmapped_code_obj_ids, key=lambda entry: str(entry)
    )

    def _render_missing_edges_canonical() -> list[dict[str, str]]:
        canonical: list[dict[str, str]] = []
        for edge in missing_edges:
            if not isinstance(edge, dict):
                continue
            source = edge.get("sourceSectionId")
            target = edge.get("targetSectionId")
            kind = edge.get("kind")
            if (
                not isinstance(source, str)
                or not isinstance(target, str)
                or not isinstance(kind, str)
            ):
                continue
            canonical.append(
                {
                    # Keep canonical IDs for UI; these should not be rewritten by
                    # convert_canonical_ids_to_temporary().
                    "sourceSectionId": str(source),
                    "targetSectionId": str(target),
                    "kind": kind,
                }
            )
        return canonical

    if scope_check.reason == "missing_context":
        message = (
            f"Tool '{tool_name}' blocked: missing agentic context. "
            "Provide agentic context via MCP meta (projectConfigId/chatId/sectionId), "
            "request headers (x-setta-project-config-id/x-setta-chat-id/x-setta-section-id), "
            "the /__setta__/tools/call request body (agenticContext), "
            "or call 'set_agentic_context' first."
        )
    elif scope_check.reason == "missing_section_id":
        message = (
            f"Tool '{tool_name}' blocked: missing sectionId in agentic context. "
            "Provide a chat section id via MCP meta (sectionId) or request headers (x-setta-section-id). "
            "If you intend an unscoped/project-level run, set allowUnscoped=true "
            "(MCP meta allowUnscoped, header x-setta-allow-unscoped, /__setta__/tools/call agenticContext.allowUnscoped, "
            "or call 'set_agentic_context' with allowUnscoped=true)."
        )
    elif scope_check.reason in {
        "unmapped_code_obj",
        "out_of_scope_and_unmapped_code_obj",
    }:
        message = (
            f"Tool '{tool_name}' blocked: unknown code objects. "
            "See structuredContent.unmappedCodeObjIds."
        )
        if blocked_sorted:
            message = (
                f"{message} Tool is also out of scope "
                f"(access={scope_check.access_type}). See structuredContent.blockedSectionIds."
            )
    elif scope_check.reason == "write_without_targets":
        message = (
            f"Tool '{tool_name}' blocked by agentic scope "
            "(access=write, reason=write_without_targets). "
            "Include target section/code-object ids in the tool arguments."
        )
    else:
        message = (
            f"Tool '{tool_name}' blocked by agentic scope "
            f"(access={scope_check.access_type}, reason={scope_check.reason}). "
            "See structuredContent.blockedSectionIds/targetSectionIds."
        )
    structured = {
        "error": "ScopeViolation",
        "message": message,
        "toolName": tool_name,
        "accessType": scope_check.access_type,
        "blockedSectionIds": blocked_sorted,
        "targetSectionIds": target_sorted,
        "unmappedCodeObjIds": unmapped_sorted,
        "reason": scope_check.reason,
        "missingEdgesCanonical": _render_missing_edges_canonical(),
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
    if _is_chat_section(project_state, section_id) and access_type == "peer_chat":
        return AgenticEdgeKind.chat_chat
    return AgenticEdgeKind.chat_section


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
    *,
    code_obj_id_to_section_ids: dict[ID, set[ID]] | None = None,
) -> tuple[set[ID], set[ID]]:
    if not code_obj_ids:
        return set(), set()
    resolved = code_obj_id_to_section_ids or build_code_obj_id_to_section_ids_index(
        project_state
    )
    mapped_sections: set[ID] = set()
    for code_obj_id in code_obj_ids:
        sections = resolved.get(code_obj_id)
        if sections:
            mapped_sections.update(sections)
    unmapped = {
        code_obj_id for code_obj_id in code_obj_ids if code_obj_id not in resolved
    }
    return mapped_sections, unmapped


def build_code_obj_id_to_section_ids_index(
    project_state: ProjectStateSingleConfig,
) -> dict[ID, set[ID]]:
    mapping: dict[ID, set[ID]] = {}
    for section_id in project_state.sections:
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if isinstance(
            section_impl, (BaseSectionWithParamsImpl, MetaControlSectionImpl)
        ):
            for code_obj_id in section_impl.codeObjVariantMap:
                mapping.setdefault(code_obj_id, set()).add(section_id)
        if isinstance(section_impl, CallableSectionImpl):
            callable_id = section_impl.callable
            if callable_id is not None:
                mapping.setdefault(callable_id, set()).add(section_id)
    return mapping

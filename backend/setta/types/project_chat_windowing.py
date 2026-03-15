from typing import TYPE_CHECKING

from setta.types.id import ID

if TYPE_CHECKING:
    from setta.types.project_state import (
        ProjectChatWindowingState,
        ProjectChatWindowInstance,
    )


def _get_section_binding_placement_priority(placement: object) -> int:
    if placement == "canvas_section":
        return 4
    if placement == "floating":
        return 3
    if placement == "maximized":
        return 2
    return 1


def _is_project_chat_window_visible(instance: "ProjectChatWindowInstance") -> bool:
    return not instance.isClosed and not instance.isMinimized


def _enum_value(value: object) -> object:
    return getattr(value, "value", value)


def validate_project_chat_window_owner(
    *,
    mode: object,
    placement: object,
    section_id: ID | None,
) -> None:
    mode_value = _enum_value(mode)
    placement_value = _enum_value(placement)
    if mode_value == "section_mode" and section_id is None:
        raise ValueError("Project chat section_mode windows require sectionIdOrNull.")
    if mode_value == "git_graph_mode" and section_id is not None:
        raise ValueError(
            "Project chat git_graph_mode windows cannot carry sectionIdOrNull."
        )
    if mode_value == "git_graph_mode" and placement_value == "canvas_section":
        raise ValueError(
            "Project chat git_graph_mode windows cannot use canvas_section placement."
        )


def validate_window_space_window_owner(
    *,
    surface_kind: object,
    mode: object,
    section_id: ID | None,
    chat_id: ID | None,
) -> None:
    surface_kind_value = _enum_value(surface_kind)
    mode_value = _enum_value(mode)
    if surface_kind_value == "section" and section_id is None:
        raise ValueError("Section window-space windows require sectionIdOrNull.")
    if surface_kind_value == "project_chat" and section_id is not None:
        raise ValueError(
            "Project-chat window-space windows cannot carry sectionIdOrNull."
        )
    if surface_kind_value == "section" and mode_value == "git_graph_mode":
        raise ValueError("Section window-space windows cannot use git_graph_mode.")
    if surface_kind_value == "project_chat" and mode_value == "section_mode":
        raise ValueError("Project-chat window-space windows cannot use section_mode.")
    if mode_value != "project_ai_mode" and chat_id is not None:
        raise ValueError(
            "Window-space windows must use project_ai_mode to bind chatId."
        )


def _should_prefer_section_binding_candidate(
    candidate: "ProjectChatWindowInstance",
    current_best: "ProjectChatWindowInstance | None",
    candidate_instance_id: ID,
    current_best_instance_id: ID | None,
) -> bool:
    if current_best is None or current_best_instance_id is None:
        return True
    candidate_priority = _get_section_binding_placement_priority(candidate.placement)
    current_best_priority = _get_section_binding_placement_priority(
        current_best.placement
    )
    if candidate_priority != current_best_priority:
        return candidate_priority > current_best_priority
    candidate_visible = _is_project_chat_window_visible(candidate)
    current_best_visible = _is_project_chat_window_visible(current_best)
    if candidate_visible != current_best_visible:
        return candidate_visible
    if candidate.zIndex != current_best.zIndex:
        return candidate.zIndex > current_best.zIndex
    if candidate.lastFocusedAt != current_best.lastFocusedAt:
        return candidate.lastFocusedAt > current_best.lastFocusedAt
    return str(candidate_instance_id) > str(current_best_instance_id)


def normalize_project_chat_windowing(
    project_chat_windowing: "ProjectChatWindowingState",
    section_ids: set[ID],
) -> None:
    winning_instance_id_by_section_id: dict[ID, ID] = {}
    next_instances_by_id: dict[ID, "ProjectChatWindowInstance"] = {}
    for instance_id, instance in project_chat_windowing.instancesById.items():
        section_id = instance.sectionIdOrNull
        validate_project_chat_window_owner(
            mode=instance.mode,
            placement=instance.placement,
            section_id=section_id,
        )
        if (
            _enum_value(instance.mode) in {"section_mode", "git_graph_mode"}
            and instance.chatId is not None
        ):
            instance.chatId = None
        if section_id is not None and section_id not in section_ids:
            continue
        if section_id is not None and instance.title is not None:
            instance.title = None
        if section_id is not None:
            current_best_instance_id = winning_instance_id_by_section_id.get(section_id)
            current_best_instance = (
                None
                if current_best_instance_id is None
                else next_instances_by_id[current_best_instance_id]
            )
            if _should_prefer_section_binding_candidate(
                instance,
                current_best_instance,
                instance_id,
                current_best_instance_id,
            ):
                if current_best_instance_id is not None:
                    del next_instances_by_id[current_best_instance_id]
                winning_instance_id_by_section_id[section_id] = instance_id
            else:
                continue
        next_instances_by_id[instance_id] = instance
    if len(next_instances_by_id) != len(project_chat_windowing.instancesById):
        project_chat_windowing.instancesById = next_instances_by_id

    next_order: list[ID] = []
    seen: set[ID] = set()
    for instance_id in project_chat_windowing.order:
        if (
            instance_id not in project_chat_windowing.instancesById
            or instance_id in seen
        ):
            continue
        seen.add(instance_id)
        next_order.append(instance_id)
    for instance_id in project_chat_windowing.instancesById.keys():
        if instance_id in seen:
            continue
        seen.add(instance_id)
        next_order.append(instance_id)
    project_chat_windowing.order = next_order

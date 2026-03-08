from typing import TYPE_CHECKING

from setta.types.id import ID

if TYPE_CHECKING:
    from setta.types.project_state import (
        ProjectChatWindowingState,
        ProjectChatWindowInstance,
    )


def normalize_project_chat_windowing(
    project_chat_windowing: "ProjectChatWindowingState",
    section_ids: set[ID],
) -> None:
    next_instances_by_id: dict[ID, "ProjectChatWindowInstance"] = {}
    for instance_id, instance in project_chat_windowing.instancesById.items():
        section_id = instance.sectionIdOrNull
        if section_id is not None and section_id not in section_ids:
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

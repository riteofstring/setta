from setta.types.id import ID


def _enum_value(value: object) -> object:
    return getattr(value, "value", value)


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

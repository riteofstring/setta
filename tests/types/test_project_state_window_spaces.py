from setta.types.helpers_lvl3 import copy_project_config
from setta.types.project_config import (
    ProjectConfig,
    WindowSpaceConfig,
    WindowSpaceSurfaceKind,
    WindowSpaceWindow,
)
from setta.types.project_state import ProjectStateSingleConfig


def test_project_state_window_spaces_drop_stale_section_windows_and_normalize_order():
    project_state = ProjectStateSingleConfig(
        projectConfig=ProjectConfig(
            name="test-project",
            windowSpaces={
                "space-id": WindowSpaceConfig(
                    id="space-id",
                    name="Research Board",
                    sortIndex=0,
                    windowsById={
                        "chat-window": WindowSpaceWindow(
                            surfaceKind=WindowSpaceSurfaceKind.project_chat,
                            title="Research Chat",
                        ),
                        "missing-section-window": WindowSpaceWindow(
                            surfaceKind=WindowSpaceSurfaceKind.section,
                            sectionIdOrNull="missing-section",
                        ),
                    },
                    order=[
                        "missing-section-window",
                        "chat-window",
                        "chat-window",
                        "ghost-window",
                    ],
                )
            },
        )
    )

    window_space = project_state.projectConfig.windowSpaces["space-id"]
    assert set(window_space.windowsById.keys()) == {"chat-window"}
    assert window_space.order == ["chat-window"]


def test_copy_project_config_remaps_window_space_section_ids():
    source_section_id = "section-old"
    target_section_id = "section-new"
    project_config = ProjectConfig(
        name="test-project",
        windowSpaces={
            "space-id": WindowSpaceConfig(
                id="space-id",
                name="Research Board",
                sortIndex=0,
                windowsById={
                    "section-window": WindowSpaceWindow(
                        surfaceKind=WindowSpaceSurfaceKind.section,
                        sectionIdOrNull=source_section_id,
                    ),
                    "chat-window": WindowSpaceWindow(
                        surfaceKind=WindowSpaceSurfaceKind.project_chat,
                        title="Research Chat",
                    ),
                },
                order=["section-window", "chat-window"],
            )
        },
    )

    copied = copy_project_config(
        project_config,
        section_id_map={source_section_id: target_section_id},
        section_variant_id_map={},
        code_obj_id_map={},
    )

    copied_window_space = copied.windowSpaces["space-id"]
    assert (
        copied_window_space.windowsById["section-window"].sectionIdOrNull
        == target_section_id
    )
    assert copied_window_space.windowsById["chat-window"].sectionIdOrNull is None

from setta.database.utils import create_new_id
from setta.project_state.base_ui_types import (
    BASE_UI_TYPE_IDS,
    UIType,
    UITypeName,
    UITypePresetType,
)
from setta.project_state.project_state import (
    ConfigLanguage,
    ProjectConfig,
    ProjectConfigChild,
    ProjectState,
    Section,
    SectionSize,
    SectionVariant,
)
from setta.project_state.settings_state import (
    SettingsBackend,
    SettingsGUI,
)


def create_settings_code_info_with_ui_types(section_names):
    grid_dropdown = UIType(
        type=UITypeName.DROPDOWN,
        name="Grid Patterns",
        presetType=UITypePresetType.USER,
        config={
            "choices": [
                {"id": '"Dots"', "name": '"Dots"'},
                {"id": '"Lines"', "name": '"Lines"'},
                {"id": '"Cross"', "name": '"Cross"'},
            ]
        },
    )

    selection_dropdown = UIType(
        type=UITypeName.DROPDOWN,
        name="Selection Modes",
        presetType=UITypePresetType.USER,
        config={
            "choices": [
                {"id": '"partial"', "name": '"partial"'},
                {"id": '"full"', "name": '"full"'},
            ]
        },
    )

    pan_dropdown = UIType(
        type=UITypeName.DROPDOWN,
        name="Pan-On-Scroll Modes",
        presetType=UITypePresetType.USER,
        config={
            "choices": [
                {"id": '"free"', "name": '"free"'},
                {"id": '"vertical"', "name": '"vertical"'},
                {"id": '"horizontal"', "name": '"horizontal"'},
            ]
        },
    )

    codeInfoPathToUITypeId: dict[str, dict[tuple[str], str]] = {
        s: {} for s in section_names
    }
    codeInfoPathToUITypeId["gui"] = {}

    codeInfoPathToUITypeId["gui"][("selectionMode",)] = selection_dropdown.id
    codeInfoPathToUITypeId["gui"][("gridPattern",)] = grid_dropdown.id
    codeInfoPathToUITypeId["gui"][("panOnScrollMode",)] = pan_dropdown.id
    codeInfoPathToUITypeId["gui"].update(
        {
            (n,): BASE_UI_TYPE_IDS[UITypeName.COLOR_PICKER]
            for n in [
                "gridColor",
                "gridColorDarkMode",
            ]
        }
    )
    codeInfoPathToUITypeId["gui"].update(
        {
            (n,): BASE_UI_TYPE_IDS[UITypeName.SWITCH]
            for n in [
                "showGridLines",
                "leftSidePaneShiftsMap",
                "panOnDrag",
                "panOnScroll",
                "zoomOnScroll",
                "zoomOnPinch",
                "zoomOnDoubleClick",
            ]
        }
    )

    codeInfoPathToUITypeId["backend"].update(
        {
            (n,): BASE_UI_TYPE_IDS[UITypeName.SWITCH]
            for n in [
                "showDefaultConfigOnLoad",
                "autosave",
                "autobackup",
                "clearTerminalBeforeMarkingAsReady",
                "exportDbRawOnSave",
                "exportDbReadableOnSave",
                "exportDbReadableWithVariantsOnSave",
                "saveRenderedValues",
            ]
        }
    )

    settings_fields = {
        "gui": SettingsGUI.model_fields.keys(),
        "backend": SettingsBackend.model_fields.keys(),
    }

    for k, v in settings_fields.items():
        diff = set(c[0] for c in codeInfoPathToUITypeId[k].keys()) - v
        if len(diff) > 0:
            raise KeyError(
                f"Settings project construction error: codeInfoPathToUITypeId key not valid: {diff}"
            )

    return codeInfoPathToUITypeId, {
        u.id: u for u in [grid_dropdown, selection_dropdown, pan_dropdown]
    }


def create_settings_project_state(settings_path: str):
    section_names = ["shortcuts", "gui", "backend", "languageServer", "sections"]
    codeInfoPathToUITypeId, uiTypes = create_settings_code_info_with_ui_types(
        section_names
    )
    sections = {}
    variants = {}
    for k in section_names:
        section = Section(
            name=k,
            size=SectionSize(width=550),
            variantId=create_new_id(),
        )
        sections[section.id] = section
        variant = SectionVariant(
            name=settings_path,
            codeInfoColId=create_new_id(),
            isJsonSource=True,
            jsonSourceKeys=[k],
            jsonSourceCodeInfoPathToUITypeId=codeInfoPathToUITypeId[section.name],
            configLanguage=ConfigLanguage.JSON,
        )
        variants[section.variantId] = variant

    projectConfigChildren = {
        k: ProjectConfigChild(x=idx * 600) for idx, k in enumerate(sections.keys())
    }
    projectConfig = ProjectConfig(name="settings", children=projectConfigChildren)
    projectConfigId = projectConfig.id

    return ProjectState(
        projectConfigs={projectConfigId: projectConfig},
        sections=sections,
        variants=variants,
        uiTypes=uiTypes,
    )

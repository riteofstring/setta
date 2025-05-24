from setta.database.utils import create_new_id
from setta.project_state.base_ui_types import (
    BASE_UI_TYPE_IDS,
    UIType,
    UITypeName,
    UITypePresetType,
)
from setta.project_state.project_state import (
    CodeInfo,
    CodeInfoCol,
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
    SettingsShortcuts,
)


def create_settings_code_info_with_ui_types():
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

    codeInfoWithUIType: list[tuple[CodeInfo, str]] = []
    codeInfoWithUIType.append((CodeInfo(name="selectionMode"), selection_dropdown.id))
    codeInfoWithUIType.append((CodeInfo(name="gridPattern"), grid_dropdown.id))
    codeInfoWithUIType.append((CodeInfo(name="panOnScrollMode"), pan_dropdown.id))
    codeInfoWithUIType.extend(
        (CodeInfo(name=n), BASE_UI_TYPE_IDS[UITypeName.COLOR_PICKER])
        for n in [
            "gridColor",
            "gridColorDarkMode",
        ]
    )
    codeInfoWithUIType.extend(
        (CodeInfo(name=n), BASE_UI_TYPE_IDS[UITypeName.SWITCH])
        for n in [
            "showGridLines",
            "showDefaultConfigOnLoad",
            "autosave",
            "autobackup",
            "leftSidePaneShiftsMap",
            "panOnDrag",
            "panOnScroll",
            "zoomOnScroll",
            "zoomOnPinch",
            "zoomOnDoubleClick",
            "clearTerminalBeforeMarkingAsReady",
            "exportDbRawOnSave",
            "exportDbReadableOnSave",
            "exportDbReadableWithVariantsOnSave",
            "saveRenderedValues",
        ]
    )

    for c, _ in codeInfoWithUIType:
        if (
            c.name not in SettingsShortcuts.model_fields.keys()
            and c.name not in SettingsGUI.model_fields.keys()
            and c.name not in SettingsBackend.model_fields.keys()
        ):
            raise KeyError

    return codeInfoWithUIType, {
        u.id: u for u in [grid_dropdown, selection_dropdown, pan_dropdown]
    }


def create_settings_project_state():
    codeInfoWithUIType, uiTypes = create_settings_code_info_with_ui_types()

    section_names = ["shortcuts", "gui", "backend", "languageServer", "sections"]
    sections = {}
    variants = {}
    codeInfoCols = {}
    for k in section_names:
        section = Section(
            name=k,
            size=SectionSize(width=550),
            variantId=create_new_id(),
        )
        sections[section.id] = section
        variant = SectionVariant(
            name="setta_files/setta-settings.json",
            codeInfoColId=create_new_id(),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.JSON,
        )
        codeInfoCols[variant.codeInfoColId] = CodeInfoCol()
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


SETTINGS_PROJECT = create_settings_project_state()

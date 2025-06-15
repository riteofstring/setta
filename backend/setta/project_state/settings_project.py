from setta.database.utils import create_new_id
from setta.types.code_objs import BaseCodeObjImpl, CodeObjCore
from setta.types.project_state import (
    ProjectConfig,
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
)
from setta.types.sections import (
    BaseSectionImpl,
    ConfigLanguage,
    DictSectionImpl,
    SectionCore,
    SectionSize,
)
from setta.types.settings_state import (
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

    codeInfoWithUIType: dict[str, list[tuple[CodeInfo, str]]] = {
        s: [] for s in section_names
    }
    codeInfoWithUIType["gui"].append(
        (CodeInfo(name="selectionMode"), selection_dropdown.id)
    )
    codeInfoWithUIType["gui"].append((CodeInfo(name="gridPattern"), grid_dropdown.id))
    codeInfoWithUIType["gui"].append(
        (CodeInfo(name="panOnScrollMode"), pan_dropdown.id)
    )
    codeInfoWithUIType["gui"].extend(
        (CodeInfo(name=n), BASE_UI_TYPE_IDS[UITypeName.COLOR_PICKER])
        for n in [
            "gridColor",
            "gridColorDarkMode",
        ]
    )
    codeInfoWithUIType["gui"].extend(
        (CodeInfo(name=n), BASE_UI_TYPE_IDS[UITypeName.SWITCH])
        for n in [
            "showGridLines",
            "leftSidePaneShiftsMap",
            "panOnDrag",
            "panOnScroll",
            "zoomOnScroll",
            "zoomOnPinch",
            "zoomOnDoubleClick",
        ]
    )

    codeInfoWithUIType["backend"].extend(
        (CodeInfo(name=n), BASE_UI_TYPE_IDS[UITypeName.SWITCH])
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
    )

    settings_fields = {
        "gui": SettingsGUI.model_fields.keys(),
        "backend": SettingsBackend.model_fields.keys(),
    }

    for k, v in settings_fields.items():
        diff = set(c[0].name for c in codeInfoWithUIType[k]) - v
        if len(diff) > 0:
            raise KeyError(
                f"Settings project construction error: codeInfoPathToUITypeId key not valid: {diff}"
            )

    uiTypes = {u.id: u for u in [grid_dropdown, selection_dropdown, pan_dropdown]}

    return codeInfoWithUIType, uiTypes


def create_settings_project_state(settings_path: str):
    section_names = ["shortcuts", "gui", "backend", "languageServer", "sections"]
    codeInfoWithUIType, uiTypes = create_settings_code_info_with_ui_types(section_names)

    sections: dict[str, SectionCore] = {}
    sectionImpls: dict[str, BaseSectionImpl] = {}
    sectionImplMap: dict[str, str] = {}
    codeObjs: dict[str, CodeObjCore] = {}
    codeObjImpls: dict[str, BaseCodeObjImpl] = {}
    for k in section_names:
        section = SectionCore(name=k)
        sections[section.id] = section
        sectionImpl = DictSectionImpl(
            name=settings_path,
            size=SectionSize(width=550),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.json,
        )
        sectionImpls[sectionImpl.id] = sectionImpl
        sectionImplMap[section.id] = sectionImpl.id

        uiTypeCols[uiTypeColId] = {}
        codeInfoCols[codeInfoColId] = CodeInfoCol(children={None: []})
        for c in codeInfoWithUIType[k]:
            codeInfo[c[0].id] = c[0]
            uiTypeCols[uiTypeColId][c[0].id] = UITypeColEntry(uiTypeId=c[1])
            codeInfoCols[codeInfoColId].children[None].append(c[0].id)
            codeInfoCols[codeInfoColId].children[c[0].id] = []

    projectConfigChildren = {
        k: TopLevelSectionLayout(x=idx * 600) for idx, k in enumerate(sections.keys())
    }
    projectConfig = ProjectConfig(
        name="settings",
        topLevelSections=projectConfigChildren,
        sectionImplMap=sectionImplMap,
    )

    return ProjectStateSingleConfig(
        projectConfig=projectConfig,
        sections=sections,
        sectionImpls=sectionImpls,
        codeObjs=codeInfo,
        codeObjImpls=codeInfoCols,
    )

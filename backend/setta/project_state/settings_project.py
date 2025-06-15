from setta.database.utils import create_new_id
from setta.types.code_objs import (
    BaseCodeObjImpl,
    BaseParamCodeObjImpl,
    CodeObjCore,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    ValueModifier,
)
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


def create_settings_code_objs(section_names):
    grid_dropdown = DropdownParamCodeObjImpl(
        name="Grid Patterns", choices=['"Dots"', '"Lines"', '"Cross"'], isPreset=True
    )

    selection_dropdown = DropdownParamCodeObjImpl(
        name="Selection Modes", choices=['"partial"', '"full"'], isPreset=True
    )

    pan_dropdown = DropdownParamCodeObjImpl(
        name="Pan-On-Scroll Modes",
        choices=['"free"', '"vertical"', '"horizontal"'],
        isPreset=True,
    )

    codeObjsAndImpls: dict[str, list[tuple[CodeObjCore, BaseParamCodeObjImpl]]] = {
        s: [] for s in section_names
    }
    codeObjsAndImpls["gui"].append(
        (CodeObjCore(name="selectionMode"), selection_dropdown)
    )
    codeObjsAndImpls["gui"].append((CodeObjCore(name="gridPattern"), grid_dropdown))
    codeObjsAndImpls["gui"].append(
        (CodeObjCore(name="panOnScrollMode"), pan_dropdown)
    )
    codeObjsAndImpls["gui"].extend(
        (CodeObjCore(name=n), ColorPickerParamCodeObjImpl())
        for n in [
            "gridColor",
            "gridColorDarkMode",
        ]
    )
    codeObjsAndImpls["gui"].extend(
        (CodeObjCore(name=n), SwitchParamCodeObjImpl())
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

    codeObjsAndImpls["backend"].extend(
        (CodeObjCore(name=n), SwitchParamCodeObjImpl())
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
        diff = set(c[0].name for c in codeObjsAndImpls[k]) - v
        if len(diff) > 0:
            raise KeyError(
                f"Settings project construction error: codeInfoPathToUITypeId key not valid: {diff}"
            )

    return codeObjsAndImpls


def create_settings_project_state(settings_path: str):
    section_names = ["shortcuts", "gui", "backend", "languageServer", "sections"]
    codeObjsAndImpls = create_settings_code_objs(section_names)

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

        for c in codeObjsAndImpls[k]:
            codeObjs[c[0].id] = c[0]
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

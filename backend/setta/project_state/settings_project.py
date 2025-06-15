from setta.types.code_obj_impl_modifiers import ParamCodeObjModifier
from setta.types.code_objs import (
    CodeObjImplLayering,
    BaseCodeObjImpl,
    CodeObjCore,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    SwitchParamCodeObjImpl,
)
from setta.types.project_state import (
    ProjectConfig,
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
)
from setta.types.sections import (
    SectionImplLayering,
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

    color_picker = ColorPickerParamCodeObjImpl()

    switch = SwitchParamCodeObjImpl()

    codeObjsAndImpls: dict[str, list[tuple[CodeObjCore, CodeObjImplLayering]]] = {
        s: [] for s in section_names
    }
    codeObjsAndImpls["gui"].append(
        (
            CodeObjCore(name="selectionMode"),
            CodeObjImplLayering(impls=[selection_dropdown.id, ParamCodeObjModifier()]),
        )
    )
    codeObjsAndImpls["gui"].append(
        (
            CodeObjCore(name="gridPattern"),
            CodeObjImplLayering(impls=[grid_dropdown.id, ParamCodeObjModifier()]),
        )
    )
    codeObjsAndImpls["gui"].append(
        (
            CodeObjCore(name="panOnScrollMode"),
            CodeObjImplLayering(impls=[pan_dropdown.id, ParamCodeObjModifier()]),
        )
    )
    codeObjsAndImpls["gui"].extend(
        (
            CodeObjCore(name=n),
            CodeObjImplLayering(impls=[color_picker.id, ParamCodeObjModifier()]),
        )
        for n in [
            "gridColor",
            "gridColorDarkMode",
        ]
    )
    codeObjsAndImpls["gui"].extend(
        (
            CodeObjCore(name=n),
            CodeObjImplLayering(impls=[switch.id, ParamCodeObjModifier()]),
        )
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
        (
            CodeObjCore(name=n),
            CodeObjImplLayering(impls=[switch.id, ParamCodeObjModifier()]),
        )
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
    sectionImplLayerings: dict[str, SectionImplLayering] = {}
    sectionImplLayeringMap: dict[str, str] = {}
    codeObjs: dict[str, CodeObjCore] = {}
    codeObjImpls: dict[str, BaseCodeObjImpl] = {}
    codeObjImplLayerings: dict[str, CodeObjImplLayering] = {}
    for k in section_names:
        sectionImpl = DictSectionImpl(
            name=settings_path,
            size=SectionSize(width=550),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.json,
        )
        appliedSectionImpl = SectionImplLayering(impls=[sectionImpl.id])
        section = SectionCore(
            name=k,
            implLayerings=[appliedSectionImpl.id],
            defaultImplLayering=appliedSectionImpl.id,
        )

        sectionImpls[sectionImpl.id] = sectionImpl
        sectionImplLayerings[appliedSectionImpl.id] = appliedSectionImpl
        sectionImplLayeringMap[section.id] = appliedSectionImpl.id
        sections[section.id] = section

        for codeObj, appliedImpls in codeObjsAndImpls[k]:
            codeObjs[codeObj.id] = codeObj
            for impl in appliedImpls.impls:
                if isinstance(impl, BaseCodeObjImpl):
                    codeObjImpls[impl.id] = impl
            codeObjImplLayerings[appliedImpls.id] = appliedImpls

    projectConfigChildren = {
        k: TopLevelSectionLayout(x=idx * 600) for idx, k in enumerate(sections.keys())
    }
    projectConfig = ProjectConfig(
        name="settings",
        topLevelSections=projectConfigChildren,
        sectionImplLayeringMap=sectionImplLayeringMap,
    )

    return ProjectStateSingleConfig(
        projectConfig=projectConfig,
        sections=sections,
        sectionImpls=sectionImpls,
        sectionImplLayerings=sectionImplLayerings,
        codeObjs=codeObjs,
        codeObjImpls=codeObjImpls,
        codeObjImplLayerings=codeObjImplLayerings,
    )

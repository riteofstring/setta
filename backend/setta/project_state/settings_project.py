from pathlib import Path

from setta.types.code_objs import (
    CodeObjCore,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    SwitchParamCodeObjImpl,
)
from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
    BaseParamCodeObjImplUnion,
)
from setta.types.generated.impl_to_modifier import create_modifier_for_impl
from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
)
from setta.types.impl_layering import ImplLayering
from setta.types.project_state import (
    ProjectConfig,
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
)
from setta.types.sections import (
    ConfigLanguage,
    DictSectionImpl,
    SectionCore,
    SectionSize,
)
from setta.types.settings_state import (
    BackgroundVariant,
    SettingsBackend,
    SettingsGUI,
)
from setta.utils.constants import CWD


def create_settings_code_objs(section_names):
    grid_dropdown = DropdownParamCodeObjImpl(
        name="Grid Patterns",
        choices=[b.value for b in BackgroundVariant],
        isPreset=True,
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

    codeObjsAndImpls: dict[str, list[tuple[str, BaseParamCodeObjImplUnion]]] = {
        s: [] for s in section_names
    }
    codeObjsAndImpls["gui"].append(
        (
            "selectionMode",
            selection_dropdown,
        )
    )
    codeObjsAndImpls["gui"].append(
        (
            "gridPattern",
            grid_dropdown,
        )
    )
    codeObjsAndImpls["gui"].append(
        (
            "panOnScrollMode",
            pan_dropdown,
        )
    )
    codeObjsAndImpls["gui"].extend(
        (
            n,
            color_picker,
        )
        for n in [
            "gridColor",
            "gridColorDarkMode",
        ]
    )
    codeObjsAndImpls["gui"].extend(
        (
            n,
            switch,
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
            n,
            switch,
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
        diff = set(c[0] for c in codeObjsAndImpls[k]) - v
        if len(diff) > 0:
            raise KeyError(
                f"Settings project construction error: codeObjsAndImpls key not valid: {diff}"
            )

    return codeObjsAndImpls


def create_settings_project_state(settings_path: Path):
    section_names = ["shortcuts", "gui", "backend", "languageServer", "sections"]
    codeObjsAndImpls = create_settings_code_objs(section_names)

    sections: dict[str, SectionCore] = {}
    sectionImpls: dict[str, BaseSectionImplUnion] = {}
    sectionImplLayerings: dict[str, ImplLayering] = {}
    sectionImplLayeringMap: dict[str, str] = {}
    codeObjs: dict[str, CodeObjCore] = {}
    codeObjImpls: dict[str, BaseCodeObjImplUnion] = {}
    codeObjImplLayerings: dict[str, ImplLayering] = {}
    for k in section_names:
        codeObjImplLayeringMap = {}
        for codeObjName, codeObjImpl in codeObjsAndImpls[k]:
            codeObjImplLayering = ImplLayering(
                impl=codeObjImpl.id, modifier=create_modifier_for_impl(codeObjImpl)
            )
            codeObjImplLayerings[codeObjImplLayering.id] = codeObjImplLayering
            codeObjImpls[codeObjImpl.id] = codeObjImpl

            codeObj = CodeObjCore(
                name=codeObjName,
                implLayerings=[codeObjImplLayering.id],
                defaultImplLayering=codeObjImplLayering.id,
            )
            codeObjs[codeObj.id] = codeObj
            codeObjImplLayeringMap[codeObj.id] = codeObjImplLayering.id

        sectionImpl = DictSectionImpl(
            name=str(settings_path.relative_to(CWD)),
            size=SectionSize(width=550),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.json,
            codeObjImplLayeringMap=codeObjImplLayeringMap,
        )
        sectionImplLayering = ImplLayering(
            impl=sectionImpl.id, modifier=create_modifier_for_impl(sectionImpl)
        )
        section = SectionCore(
            name=k,
            implLayerings=[sectionImplLayering.id],
            defaultImplLayering=sectionImplLayering.id,
        )

        sectionImpls[sectionImpl.id] = sectionImpl
        sectionImplLayerings[sectionImplLayering.id] = sectionImplLayering
        sectionImplLayeringMap[section.id] = sectionImplLayering.id
        sections[section.id] = section

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

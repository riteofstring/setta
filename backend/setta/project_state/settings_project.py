from enum import Enum
from inspect import isclass
import re
from pathlib import Path

from pydantic import BaseModel

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
from setta.types.generated.settings_state import SettingsState
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
    PanOnScrollMode,
    SelectionMode,
)
from setta.utils.constants import CWD


def is_color_hex(string):
    pattern = r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
    return bool(re.match(pattern, string))


def create_settings_code_objs(section_names):
    color_picker = ColorPickerParamCodeObjImpl()
    switch = SwitchParamCodeObjImpl()

    codeObjsAndImpls: dict[str, list[tuple[str, BaseParamCodeObjImplUnion]]] = {
        s: [] for s in section_names
    }

    for s in section_names:
        d = SettingsState.model_fields[s].default_factory
        if issubclass(d, BaseModel):  # type: ignore
            for k, v in d.model_fields.items():
                if v.annotation is bool:
                    codeObjsAndImpls[s].append((k, switch))
                elif isclass(v.annotation) and issubclass(v.annotation, Enum):
                    preset_impl = DropdownParamCodeObjImpl(
                        name=v.annotation.__name__,
                        choices=[f'"{b.value}"' for b in v.annotation],
                        isPreset=True,
                    )
                    codeObjsAndImpls[s].append((k, preset_impl))
                elif isinstance(v.default, str) and is_color_hex(v.default):
                    codeObjsAndImpls[s].append((k, color_picker))

    return codeObjsAndImpls


def create_settings_project_state(settings_path: Path):
    section_names = SettingsState.model_fields.keys()
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
            size=SectionSize(width=550),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.json,
            codeObjImplLayeringMap=codeObjImplLayeringMap,
            topLevelParamIds=list(codeObjImplLayeringMap.keys()),
        )
        sectionImplLayering = ImplLayering(
            name=str(settings_path.relative_to(CWD)),
            impl=sectionImpl.id,
            modifier=create_modifier_for_impl(sectionImpl),
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
        k: TopLevelSectionLayout(x=(idx % 3) * 600, y=(idx // 3) * 600)
        for idx, k in enumerate(sections.keys())
    }
    projectConfig = ProjectConfig(
        name="settings",
        topLevelSections=projectConfigChildren,
        sectionImplLayeringMap=sectionImplLayeringMap,
        viewport=None,
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

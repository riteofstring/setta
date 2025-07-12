import re
from enum import Enum
from inspect import isclass
from pathlib import Path

from pydantic import BaseModel

from setta.types.code_obj_impls import (
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
    SwitchParamCodeObjImpl,
)
from setta.types.generated.cores import DictSectionCore, create_code_obj_core
from setta.types.generated.layerings import (
    DictSectionLayering,
    create_code_obj_layering,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseCodeObjCoreUnion,
    BaseCodeObjImplUnion,
    BaseCodeObjLayeringUnion,
    BaseSectionCoreUnion,
    BaseSectionImplUnion,
    BaseSectionLayeringUnion,
)
from setta.types.project_state import (
    ProjectConfig,
    ProjectStateSingleConfig,
    TopLevelSectionLayout,
)
from setta.types.section_impls import (
    ConfigLanguage,
    DictSectionImpl,
    SectionSize,
)
from setta.utils.constants import CWD


def is_color_hex(string):
    pattern = r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
    return bool(re.match(pattern, string))


def add_code_obj_details(
    codeObjName: str,
    codeObjImpl: BaseCodeObjImplUnion,
    codeObjs: dict[str, BaseCodeObjCoreUnion],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjImplLayerings: dict[str, BaseCodeObjLayeringUnion],
):
    codeObjImplLayering = create_code_obj_layering(
        type=codeObjImpl.type,
        impl=codeObjImpl.id,
    )
    codeObjImplLayerings[codeObjImplLayering.id] = codeObjImplLayering
    codeObjImpls[codeObjImpl.id] = codeObjImpl

    codeObj = create_code_obj_core(
        codeObjImpl.type,
        {
            "name": codeObjName,
            "implLayerings": [codeObjImplLayering.id],
            "defaultImplLayering": codeObjImplLayering.id,
        },
    )
    codeObjs[codeObj.id] = codeObj
    return codeObj.id


def process_model_fields(
    model_class: type[BaseModel],
    codeObjs: dict[str, BaseCodeObjCoreUnion],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjImplLayerings: dict[str, BaseCodeObjLayeringUnion],
):
    child_ids: list[str] = []
    codeObjImplLayeringMap: dict[str, str] = {}
    for k, v in model_class.model_fields.items():
        codeObjName, codeObjImpl = None, None
        if isclass(v.annotation) and issubclass(v.annotation, BaseModel):
            nested_child_ids, nestedCodeObjImplLayeringMap = process_model_fields(
                v.annotation, codeObjs, codeObjImpls, codeObjImplLayerings
            )
            codeObjName, codeObjImpl = (
                k,
                NestedParamCodeObjImpl(children=nested_child_ids),
            )
            codeObjImplLayeringMap.update(nestedCodeObjImplLayeringMap)
        elif v.annotation is bool:
            codeObjName, codeObjImpl = k, SwitchParamCodeObjImpl()
        elif isclass(v.annotation) and issubclass(v.annotation, Enum):
            codeObjName, codeObjImpl = (
                k,
                DropdownParamCodeObjImpl(
                    name=v.annotation.__name__,
                    choices=[f'"{b.value}"' for b in v.annotation],
                    isPreset=True,
                ),
            )
        elif isinstance(v.default, str) and is_color_hex(v.default):
            codeObjName, codeObjImpl = k, ColorPickerParamCodeObjImpl()

        if codeObjName and codeObjImpl:
            codeObjId = add_code_obj_details(
                codeObjName, codeObjImpl, codeObjs, codeObjImpls, codeObjImplLayerings
            )
            child_ids.append(codeObjId)
            defaultImplLayering = codeObjs[codeObjId].defaultImplLayering
            if defaultImplLayering:
                codeObjImplLayeringMap[codeObjId] = defaultImplLayering

    return child_ids, codeObjImplLayeringMap


def create_settings_code_objs(section_names):
    sectionToTopLevelIds: dict[str, list[str]] = {}
    codeObjs: dict[str, BaseCodeObjCoreUnion] = {}
    codeObjImpls: dict[str, BaseCodeObjImplUnion] = {}
    codeObjImplLayerings: dict[str, BaseCodeObjLayeringUnion] = {}
    codeObjImplLayeringMaps: dict[str, dict[str, str]] = {}

    for s in section_names:
        d = SettingsState.model_fields[s].default_factory
        if isclass(d) and issubclass(d, BaseModel):
            sectionToTopLevelIds[s], codeObjImplLayeringMaps[s] = process_model_fields(
                d,
                codeObjs,
                codeObjImpls,
                codeObjImplLayerings,
            )
        else:
            sectionToTopLevelIds[s] = []
            codeObjImplLayeringMaps[s] = {}

    return (
        sectionToTopLevelIds,
        codeObjs,
        codeObjImpls,
        codeObjImplLayerings,
        codeObjImplLayeringMaps,
    )


def create_settings_project_state(settings_path: Path):
    section_names = SettingsState.model_fields.keys()
    (
        sectionToTopLevelIds,
        codeObjs,
        codeObjImpls,
        codeObjImplLayerings,
        codeObjImplLayeringMaps,
    ) = create_settings_code_objs(section_names)

    sections: dict[str, BaseSectionCoreUnion] = {}
    sectionImpls: dict[str, BaseSectionImplUnion] = {}
    sectionImplLayerings: dict[str, BaseSectionLayeringUnion] = {}
    sectionImplLayeringMap: dict[str, str] = {}
    for k in section_names:
        sectionImpl = DictSectionImpl(
            size=SectionSize(width=550),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.json,
            codeObjImplLayeringMap=codeObjImplLayeringMaps[k],
            topLevelParamIds=sectionToTopLevelIds[k],
        )
        sectionImplLayering = DictSectionLayering(
            name=str(settings_path.relative_to(CWD)),
            impl=sectionImpl.id,
        )
        section = DictSectionCore(
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

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
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseCodeObjImplUnion,
    BaseSectionImplUnion,
)
from setta.types.helpers import is_color_hex
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


def add_code_obj_details(
    codeObjName: str,
    codeObjImpl: BaseCodeObjImplUnion,
    codeObjs: dict[str, Core],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjVariants: dict[str, Variant],
):
    codeObjVariant = Variant(
        impl=codeObjImpl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(codeObjImpl),
    )
    codeObjVariants[codeObjVariant.id] = codeObjVariant
    codeObjImpls[codeObjImpl.id] = codeObjImpl

    codeObj = Core(
        name=codeObjName,
        variants=[codeObjVariant.id],
        defaultVariant=codeObjVariant.id,
    )
    codeObjs[codeObj.id] = codeObj
    return codeObj.id


def process_model_fields(
    model_class: type[BaseModel],
    codeObjs: dict[str, Core],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjVariants: dict[str, Variant],
    presetCodeObjImplNames: dict[str, BaseCodeObjImplUnion],
):
    child_ids: list[str] = []
    codeObjVariantMap: dict[str, str] = {}
    for k, v in model_class.model_fields.items():
        codeObjName, codeObjImpl = None, None
        if isclass(v.annotation) and issubclass(v.annotation, BaseModel):
            nested_child_ids, nestedCodeObjVariantMap = process_model_fields(
                v.annotation,
                codeObjs,
                codeObjImpls,
                codeObjVariants,
                presetCodeObjImplNames,
            )
            codeObjName, codeObjImpl = (
                k,
                NestedParamCodeObjImpl(children=nested_child_ids),
            )
            codeObjVariantMap.update(nestedCodeObjVariantMap)
        elif v.annotation is bool:
            codeObjName, codeObjImpl = k, SwitchParamCodeObjImpl()
        elif isclass(v.annotation) and issubclass(v.annotation, Enum):
            # The assumption here is that we only automatically create presets
            # for enums, and each enum should have a unique name,
            # therefore the presets should all have unique names.
            presetName = v.annotation.__name__
            codeObjName = k
            codeObjImpl = presetCodeObjImplNames.get(presetName, None)
            if not codeObjImpl:
                codeObjImpl = DropdownParamCodeObjImpl(
                    name=presetName,
                    choices=[f'"{b.value}"' for b in v.annotation],
                    isPreset=True,
                )
                presetCodeObjImplNames[presetName] = codeObjImpl

        elif isinstance(v.default, str) and is_color_hex(v.default):
            codeObjName, codeObjImpl = k, ColorPickerParamCodeObjImpl()

        if codeObjName and codeObjImpl:
            codeObjId = add_code_obj_details(
                codeObjName, codeObjImpl, codeObjs, codeObjImpls, codeObjVariants
            )
            child_ids.append(codeObjId)
            defaultVariant = codeObjs[codeObjId].defaultVariant
            if defaultVariant:
                codeObjVariantMap[codeObjId] = defaultVariant

    return child_ids, codeObjVariantMap


def create_settings_code_objs(section_names):
    sectionToTopLevelIds: dict[str, list[str]] = {}
    codeObjs: dict[str, Core] = {}
    codeObjImpls: dict[str, BaseCodeObjImplUnion] = {}
    codeObjVariants: dict[str, Variant] = {}
    codeObjVariantMaps: dict[str, dict[str, str]] = {}
    presetCodeObjImplNames: dict[str, BaseCodeObjImplUnion] = {}

    for s in section_names:
        d = SettingsState.model_fields[s].default_factory
        if isclass(d) and issubclass(d, BaseModel):
            sectionToTopLevelIds[s], codeObjVariantMaps[s] = process_model_fields(
                d,
                codeObjs,
                codeObjImpls,
                codeObjVariants,
                presetCodeObjImplNames,
            )
        else:
            sectionToTopLevelIds[s] = []
            codeObjVariantMaps[s] = {}

    return (
        sectionToTopLevelIds,
        codeObjs,
        codeObjImpls,
        codeObjVariants,
        codeObjVariantMaps,
    )


def create_settings_project_state(settings_path: Path):
    section_names = SettingsState.model_fields.keys()
    (
        sectionToTopLevelIds,
        codeObjs,
        codeObjImpls,
        codeObjVariants,
        codeObjVariantMaps,
    ) = create_settings_code_objs(section_names)

    sections: dict[str, Core] = {}
    sectionImpls: dict[str, BaseSectionImplUnion] = {}
    sectionVariants: dict[str, Variant] = {}
    sectionVariantMap: dict[str, str] = {}
    for k in section_names:
        sectionImpl = DictSectionImpl(
            size=SectionSize(width=550),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.json,
            codeObjVariantMap=codeObjVariantMaps[k],
            topLevelParamIds=sectionToTopLevelIds[k],
        )
        sectionVariant = Variant(
            name=str(settings_path.relative_to(CWD)),
            impl=sectionImpl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(sectionImpl),
        )
        section = Core(
            name=k,
            variants=[sectionVariant.id],
            defaultVariant=sectionVariant.id,
        )

        sectionImpls[sectionImpl.id] = sectionImpl
        sectionVariants[sectionVariant.id] = sectionVariant
        sectionVariantMap[section.id] = sectionVariant.id
        sections[section.id] = section

    projectConfigChildren = {
        k: TopLevelSectionLayout(x=(idx % 3) * 600, y=(idx // 3) * 600)
        for idx, k in enumerate(sections.keys())
    }
    projectConfig = ProjectConfig(
        name="settings",
        topLevelSections=projectConfigChildren,
        sectionVariantMap=sectionVariantMap,
        viewport=None,
        genCodeSpecs=None,
    )

    return ProjectStateSingleConfig(
        projectConfig=projectConfig,
        sections=sections,
        sectionImpls=sectionImpls,
        sectionVariants=sectionVariants,
        codeObjs=codeObjs,
        codeObjImpls=codeObjImpls,
        codeObjVariants=codeObjVariants,
    )

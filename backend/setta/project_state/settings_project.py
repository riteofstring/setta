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
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseCodeObjImplUnion,
    BaseSectionImplUnion,
)
from setta.types.helpers_lvl2 import is_color_hex
from setta.types.id import ID
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    ViewModeConfig,
)
from setta.types.project_state import (
    ProjectStateCore,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    ConfigLanguage,
    DictSectionImpl,
    SectionSize,
)
from setta.utils.utils import normalize_path

_CAMEL_CASE_PATTERN = re.compile(r"[A-Z]+(?=[A-Z][a-z]|[0-9]|$)|[A-Z]?[a-z]+|[0-9]+")
_ACRONYM_TOKENS = {
    "API",
    "CPU",
    "CSS",
    "CSV",
    "DB",
    "GPU",
    "GUI",
    "HTML",
    "HTTP",
    "HTTPS",
    "ID",
    "IO",
    "JSON",
    "JS",
    "LSP",
    "PDF",
    "SQL",
    "SVG",
    "UI",
    "URL",
    "XML",
    "YAML",
}


def _split_identifier(identifier: str) -> list[str]:
    tokens: list[str] = []
    for chunk in identifier.replace("-", "_").split("_"):
        if not chunk:
            continue
        tokens.extend(_CAMEL_CASE_PATTERN.findall(chunk))
    return tokens


def _merge_display_name_tokens(tokens: list[str]) -> list[str]:
    merged: list[str] = []
    idx = 0
    while idx < len(tokens):
        token = tokens[idx]
        next_token = tokens[idx + 1] if idx + 1 < len(tokens) else None
        if next_token and token.lower() == "i" and next_token.lower() == "frame":
            merged.append("IFrame")
            idx += 2
            continue
        if next_token and len(token) == 1 and token.isalpha() and next_token.isdigit():
            merged.append(f"{token.upper()}{next_token}")
            idx += 2
            continue
        if token.lower() == "autobackup":
            merged.extend(["Auto", "Backup"])
            idx += 1
            continue
        if token.lower() == "gen":
            merged.append("Generated")
            idx += 1
            continue
        merged.append(token)
        idx += 1
    return merged


def humanize_settings_identifier(identifier: str) -> str:
    if not identifier:
        return ""
    tokens = _split_identifier(identifier)
    if not tokens:
        return identifier
    merged = _merge_display_name_tokens(tokens)
    output: list[str] = []
    for token in merged:
        if token.isdigit():
            output.append(token)
            continue
        upper_token = token.upper()
        if upper_token in _ACRONYM_TOKENS:
            output.append(upper_token)
            continue
        if len(token) == 1 and token.isalpha():
            output.append(token.upper())
            continue
        output.append(token[0].upper() + token[1:])
    return " ".join(output)


def apply_settings_display_names(
    project_state: ProjectStateCore,
    existing_code_obj_ids: set[ID] | None = None,
) -> None:
    for code_obj_id, code_obj in project_state.codeObjs.items():
        if existing_code_obj_ids is not None and code_obj_id in existing_code_obj_ids:
            continue
        if code_obj.displayName.strip():
            continue
        if not code_obj.name:
            continue
        code_obj.displayName = humanize_settings_identifier(code_obj.name)


def add_code_obj_details(
    codeObjName: str,
    codeObjImpl: BaseCodeObjImplUnion,
    codeObjs: dict[ID, Core],
    codeObjImpls: dict[ID, BaseCodeObjImplUnion],
    codeObjVariants: dict[ID, Variant],
    display_name: str | None = None,
):
    codeObjVariant = Variant(
        impl=codeObjImpl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(codeObjImpl),
    )
    codeObjVariants[codeObjVariant.id] = codeObjVariant
    codeObjImpls[codeObjImpl.id] = codeObjImpl

    codeObj = Core(
        name=codeObjName,
        displayName=display_name if display_name is not None else "",
        variants=[codeObjVariant.id],
        defaultVariant=codeObjVariant.id,
    )
    codeObjs[codeObj.id] = codeObj
    return codeObj.id, codeObjVariant.id


def process_model_fields(
    model_class: type[BaseModel],
    codeObjs: dict[ID, Core],
    codeObjImpls: dict[ID, BaseCodeObjImplUnion],
    codeObjVariants: dict[ID, Variant],
    presetCodeObjImplNames: dict[str, BaseCodeObjImplUnion],
):
    child_ids: list[ID] = []
    codeObjVariantMap: dict[ID, ID] = {}
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
            codeObjId, codeObjVariantId = add_code_obj_details(
                codeObjName,
                codeObjImpl,
                codeObjs,
                codeObjImpls,
                codeObjVariants,
                display_name=humanize_settings_identifier(codeObjName),
            )
            child_ids.append(codeObjId)
            codeObjVariantMap[codeObjId] = codeObjVariantId

    return child_ids, codeObjVariantMap


def create_settings_code_objs(section_names):
    sectionToTopLevelId: dict[str, ID] = {}
    codeObjs: dict[ID, Core] = {}
    codeObjImpls: dict[ID, BaseCodeObjImplUnion] = {}
    codeObjVariants: dict[ID, Variant] = {}
    codeObjVariantMaps: dict[str, dict[ID, ID]] = {}
    presetCodeObjImplNames: dict[str, BaseCodeObjImplUnion] = {}

    for s in section_names:
        d = SettingsState.model_fields[s].default_factory

        if isclass(d) and issubclass(d, BaseModel):
            children, codeObjVariantMaps[s] = process_model_fields(
                d,
                codeObjs,
                codeObjImpls,
                codeObjVariants,
                presetCodeObjImplNames,
            )
        else:
            children = []
            codeObjVariantMaps[s] = {}

        topLevelParamImpl = NestedParamCodeObjImpl(children=children)
        codeObjId, codeObjVariantId = add_code_obj_details(
            s,
            topLevelParamImpl,
            codeObjs,
            codeObjImpls,
            codeObjVariants,
            display_name=humanize_settings_identifier(s),
        )
        codeObjVariantMaps[s][codeObjId] = codeObjVariantId
        sectionToTopLevelId[s] = codeObjId

    return (
        sectionToTopLevelId,
        codeObjs,
        codeObjImpls,
        codeObjVariants,
        codeObjVariantMaps,
    )


def create_settings_project_state(settings_path: Path):
    section_names = SettingsState.model_fields.keys()
    (
        sectionToTopLevelId,
        codeObjs,
        codeObjImpls,
        codeObjVariants,
        codeObjVariantMaps,
    ) = create_settings_code_objs(section_names)

    sections: dict[ID, Core] = {}
    sectionImpls: dict[ID, BaseSectionImplUnion] = {}
    sectionVariants: dict[ID, Variant] = {}
    sectionVariantMap: dict[ID, ID] = {}
    for k in section_names:
        sectionImpl = DictSectionImpl(
            size=SectionSize(width=550),
            isJsonSource=True,
            jsonSourceKeys=[k],
            configLanguage=ConfigLanguage.json,
            codeObjVariantMap=codeObjVariantMaps[k],
            topLevelParamId=sectionToTopLevelId[k],
        )
        sectionVariant = Variant(
            name=str(normalize_path(settings_path)),
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
        showParamDisplayNames=True,
        topLevelSections=projectConfigChildren,
        sectionVariantMap=sectionVariantMap,
        viewport=None,
        codegenTargets=[],
    )
    visibility_by_section_id = {section_id: True for section_id in sections.keys()}
    view_mode = ViewModeConfig(visibilityBySectionId=visibility_by_section_id)
    projectConfig.viewModes[view_mode.id] = view_mode
    projectConfig.activeViewModeId = view_mode.id

    return ProjectStateSingleConfig(
        projectConfig=projectConfig,
        sections=sections,
        sectionImpls=sectionImpls,
        sectionVariants=sectionVariants,
        codeObjs=codeObjs,
        codeObjImpls=codeObjImpls,
        codeObjVariants=codeObjVariants,
    )

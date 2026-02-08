import copy
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
from setta.utils.paths import normalize_workspace_path

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

SETTINGS_VIEW_GRID_COLUMNS = 3
SETTINGS_VIEW_GRID_SPACING = 600
SETTINGS_VIEW_MODE_GROUPS: list[tuple[str, list[str]]] = [
    (
        "Core",
        [
            "shortcuts",
            "gui",
            "backend",
            "sectionSizingPolicy",
            "languageServer",
        ],
    ),
    (
        "Section Defaults Structure and Code",
        [
            "callableSectionDefault",
            "dictSectionDefault",
            "listRootSectionDefault",
            "groupSectionDefault",
            "globalVariablesSectionDefault",
            "metaControlSectionDefault",
            "codeSectionDefault",
            "genPythonCodeSectionDefault",
            "genPythonMetadataSectionDefault",
        ],
    ),
    (
        "Section Defaults Content and Media",
        [
            "browserSectionDefault",
            "chatSectionDefault",
            "chartSectionDefault",
            "drawSectionDefault",
            "iFrameSectionDefault",
            "imageSectionDefault",
            "promptSectionDefault",
            "socialSectionDefault",
            "terminalSectionDefault",
            "textBlockSectionDefault",
        ],
    ),
    (
        "Param Defaults",
        [
            "buttonParamCodeObjDefault",
            "codeCallableCodeObjDefault",
            "codeParamCodeObjDefault",
            "colorPickerParamCodeObjDefault",
            "dropdownParamCodeObjDefault",
            "dropzoneParamCodeObjDefault",
            "nestedParamCodeObjDefault",
            "passwordParamCodeObjDefault",
            "rotaryParamCodeObjDefault",
            "sliderParamCodeObjDefault",
            "switchParamCodeObjDefault",
            "textAreaParamCodeObjDefault",
            "textParamCodeObjDefault",
        ],
    ),
]


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


def _build_settings_view_mode_visibility(
    section_name_to_id: dict[str, ID],
    visible_section_names: list[str],
) -> dict[ID, bool]:
    visible_set = set(visible_section_names)
    unknown_sections = [
        section_name
        for section_name in visible_set
        if section_name not in section_name_to_id
    ]
    if unknown_sections:
        raise KeyError(
            "Unknown settings sections in view mode definition: "
            + ", ".join(sorted(unknown_sections))
        )
    visibility_by_section_id = {
        section_id: False for section_id in section_name_to_id.values()
    }
    for section_name in visible_set:
        visibility_by_section_id[section_name_to_id[section_name]] = True
    return visibility_by_section_id


def _create_settings_view_modes(
    section_name_to_id: dict[str, ID],
    section_names: list[str],
    top_level_sections: dict[ID, TopLevelSectionLayout],
) -> list[ViewModeConfig]:
    all_sections = list(section_names)
    view_mode_definitions = [
        *SETTINGS_VIEW_MODE_GROUPS,
        ("All Settings", all_sections),
    ]
    view_modes: list[ViewModeConfig] = []
    for idx, (name, visible_section_names) in enumerate(view_mode_definitions):
        visibility_by_section_id = _build_settings_view_mode_visibility(
            section_name_to_id,
            visible_section_names,
        )
        ordered_section_names = visible_section_names + [
            section_name
            for section_name in section_names
            if section_name not in set(visible_section_names)
        ]
        view_layout = _build_settings_view_layout(
            section_name_to_id,
            top_level_sections,
            ordered_section_names,
        )
        view_modes.append(
            ViewModeConfig(
                name=name,
                sortIndex=idx,
                isTab=True,
                visibilityBySectionId=visibility_by_section_id,
                topLevelSections=view_layout,
                viewport=None,
                viewportInitialized=False,
            )
        )
    return view_modes


def _build_settings_view_layout(
    section_name_to_id: dict[str, ID],
    top_level_sections: dict[ID, TopLevelSectionLayout],
    ordered_section_names: list[str],
) -> dict[ID, TopLevelSectionLayout]:
    layout = copy.deepcopy(top_level_sections)
    for idx, section_name in enumerate(ordered_section_names):
        section_id = section_name_to_id[section_name]
        x = (idx % SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        y = (idx // SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING
        if section_id in layout:
            existing = layout[section_id]
            layout[section_id] = existing.model_copy(update={"x": x, "y": y})
        else:
            layout[section_id] = TopLevelSectionLayout(x=x, y=y)
    return layout


def _build_settings_default_layout(
    section_name_to_id: dict[str, ID],
    section_names: list[str],
) -> dict[ID, TopLevelSectionLayout]:
    return {
        section_name_to_id[section_name]: TopLevelSectionLayout(
            x=(idx % SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING,
            y=(idx // SETTINGS_VIEW_GRID_COLUMNS) * SETTINGS_VIEW_GRID_SPACING,
        )
        for idx, section_name in enumerate(section_names)
    }


def ensure_settings_view_modes(project_state: ProjectStateSingleConfig) -> bool:
    required_names = {name for name, _ in SETTINGS_VIEW_MODE_GROUPS}
    required_names.add("All Settings")
    view_modes_by_name = {
        view_mode.name: view_mode
        for view_mode in project_state.projectConfig.viewModes.values()
    }
    needs_reset = not project_state.projectConfig.topLevelSections
    section_ids = set(project_state.sections.keys())
    if not needs_reset and not required_names.issubset(view_modes_by_name.keys()):
        needs_reset = True
    if not needs_reset:
        missing_top_level = section_ids.difference(
            project_state.projectConfig.topLevelSections.keys()
        )
        if missing_top_level:
            needs_reset = True
    if not needs_reset:
        for name in required_names:
            if name not in view_modes_by_name:
                needs_reset = True
                break
            view_mode = view_modes_by_name[name]
            visibility = view_mode.visibilityBySectionId
            if not visibility or not any(visibility.values()):
                needs_reset = True
                break
            layout_ids = set(view_mode.topLevelSections.keys())
            if not layout_ids:
                needs_reset = True
                break
            visible_ids = {
                section_id
                for section_id, is_visible in visibility.items()
                if is_visible
            }
            if not visible_ids.issubset(layout_ids):
                needs_reset = True
                break
    if not needs_reset:
        return False

    section_name_to_id = {
        section.name: section_id
        for section_id, section in project_state.sections.items()
    }
    section_names = list(SettingsState.model_fields.keys())
    missing_sections = [
        name for name in section_names if name not in section_name_to_id
    ]
    if missing_sections:
        raise KeyError(
            "Missing settings sections for view mode reset: "
            + ", ".join(missing_sections)
        )
    base_layout = project_state.projectConfig.topLevelSections
    if not base_layout:
        base_layout = _build_settings_default_layout(section_name_to_id, section_names)
    view_modes = _create_settings_view_modes(
        section_name_to_id,
        section_names,
        base_layout,
    )
    active_name = None
    active_id = project_state.projectConfig.activeViewModeId
    if active_id and active_id in project_state.projectConfig.viewModes:
        active_name = project_state.projectConfig.viewModes[active_id].name
    project_state.projectConfig.viewModes = {}
    for view_mode in view_modes:
        project_state.projectConfig.viewModes[view_mode.id] = view_mode
    project_state.projectConfig.isEditingViewMode = False
    resolved_active_id = view_modes[0].id
    if active_name:
        for view_mode in view_modes:
            if view_mode.name == active_name:
                resolved_active_id = view_mode.id
                break
    project_state.projectConfig.activeViewModeId = resolved_active_id
    active_view_mode = project_state.projectConfig.viewModes[resolved_active_id]
    project_state.projectConfig.topLevelSections = active_view_mode.topLevelSections
    project_state.projectConfig.viewport = active_view_mode.viewport
    project_state.projectConfig.viewportInitialized = (
        active_view_mode.viewportInitialized
    )
    return True


def create_settings_project_state(settings_path: Path):
    section_names = list(SettingsState.model_fields.keys())
    (
        sectionToTopLevelId,
        codeObjs,
        codeObjImpls,
        codeObjVariants,
        codeObjVariantMaps,
    ) = create_settings_code_objs(section_names)

    sections: dict[ID, Core] = {}
    section_name_to_id: dict[str, ID] = {}
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
            name=str(normalize_workspace_path(settings_path)),
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
        section_name_to_id[k] = section.id

    projectConfigChildren = _build_settings_default_layout(
        {name: section_name_to_id[name] for name in section_names},
        section_names,
    )
    projectConfig = ProjectConfig(
        name="settings",
        showParamDisplayNames=True,
        allowJsonSourceKeyEdits=False,
        topLevelSections=projectConfigChildren,
        sectionVariantMap=sectionVariantMap,
        viewport=None,
        codegenTargets=[],
    )
    view_modes = _create_settings_view_modes(
        section_name_to_id,
        section_names,
        projectConfigChildren,
    )
    if not view_modes:
        raise KeyError("Settings project view modes could not be created.")
    for view_mode in view_modes:
        projectConfig.viewModes[view_mode.id] = view_mode
    projectConfig.activeViewModeId = view_modes[0].id
    projectConfig.topLevelSections = view_modes[0].topLevelSections
    projectConfig.viewport = view_modes[0].viewport
    projectConfig.viewportInitialized = view_modes[0].viewportInitialized

    return ProjectStateSingleConfig(
        projectConfig=projectConfig,
        sections=sections,
        sectionImpls=sectionImpls,
        sectionVariants=sectionVariants,
        codeObjs=codeObjs,
        codeObjImpls=codeObjImpls,
        codeObjVariants=codeObjVariants,
    )

from typing import TYPE_CHECKING

from setta.code_gen.utils import sanitize_python_identifier, sanitize_slug
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
)
from setta.utils.errors import InvalidParamName, InvalidProjectName, InvalidSectionName
from setta.utils.name_validation import (
    _collect_section_slug_map,
    _get_section_children_ids,
    _normalize_name,
    _raise_invalid_name,
    _section_name_format_error,
    validate_param_name_format,
    validate_project_name_format,
)

if TYPE_CHECKING:
    from setta.types.id import ID
    from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig


def validate_project_name(
    project_state: "ProjectStateBackend",
    project_config_id: "ID | None",
    name: str,
) -> str:
    normalized = validate_project_name_format(name)
    slug = sanitize_slug(normalized)
    for existing_id, config in project_state.projectConfigs.items():
        if project_config_id is not None and existing_id == project_config_id:
            continue
        existing_slug = sanitize_slug(config.name)
        if slug == existing_slug:
            _raise_invalid_name(
                f"Project name '{normalized}' conflicts with existing project '{config.name}'.",
                InvalidProjectName,
            )
    return normalized


def _get_section_name_validation_error(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    normalized: str,
) -> str | None:
    format_error = _section_name_format_error(normalized)
    if format_error:
        return format_error
    if section_id not in project_state.parentSectionMap:
        raise KeyError(f"Missing parentSectionMap entry for section {section_id}.")
    parent_id = project_state.parentSectionMap[section_id]
    if parent_id is None:
        sibling_ids = list(project_state.projectConfig.topLevelSections.keys())
    else:
        sibling_ids = _get_section_children_ids(project_state, parent_id)
    for sibling_id in sibling_ids:
        if sibling_id == section_id:
            continue
        sibling_name = project_state.sections[sibling_id].name.strip()
        if sibling_name == normalized:
            return f'Section name "{normalized}" already exists under this parent.'
    if parent_id is None:
        normalized_identifier = sanitize_python_identifier(normalized)
        for sibling_id in sibling_ids:
            if sibling_id == section_id:
                continue
            sibling_name = project_state.sections[sibling_id].name.strip()
            if not sibling_name:
                continue
            if sanitize_python_identifier(sibling_name) == normalized_identifier:
                return (
                    "Section name conflicts with another top-level name after Python "
                    "identifier sanitization."
                )

    slug_by_section_id, slug_to_section_ids = _collect_section_slug_map(
        project_state, {section_id: normalized}
    )
    section_slug = slug_by_section_id.get(section_id, "")
    if not section_slug:
        return "Section name is invalid after sanitization."
    if len(slug_to_section_ids.get(section_slug, [])) > 1:
        return f'Section path slug "{section_slug}" conflicts with another section.'
    return None


def validate_section_name(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    name: str,
) -> str:
    normalized = _normalize_name(name)
    error = _get_section_name_validation_error(project_state, section_id, normalized)
    if error:
        _raise_invalid_name(error, InvalidSectionName)
    return normalized


def _get_section_param_root_id(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    section_impl: BaseSectionWithParamsImpl,
) -> "ID":
    if isinstance(section_impl, CallableSectionImpl):
        root_id = section_impl.callable
        if root_id is None:
            raise KeyError(f"Section {section_id} missing callable root.")
        if root_id not in project_state.codeObjs:
            raise KeyError(f"Callable root {root_id} missing from project state.")
        return root_id
    if isinstance(section_impl, BaseDictSectionImpl):
        root_id = section_impl.topLevelParamId
        if root_id is None:
            raise KeyError(f"Section {section_id} missing top level param root.")
        if root_id not in project_state.codeObjs:
            raise KeyError(
                f"Top level param root {root_id} missing from project state."
            )
        return root_id
    raise TypeError(f"Section {section_id} does not support params.")


def _collect_param_hierarchy(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    section_impl: BaseSectionWithParamsImpl,
) -> tuple["ID", dict["ID", "ID | None"], dict["ID", list["ID"]]]:
    root_id = _get_section_param_root_id(project_state, section_id, section_impl)
    if root_id not in section_impl.codeObjVariantMap:
        raise KeyError(f"Section {section_id} missing root param variant mapping.")
    hierarchy = traverse_hierarchy(
        project_state.codeObjs,
        project_state.codeObjImpls,
        project_state.codeObjVariants,
        section_impl.codeObjVariantMap,
        top_level_ids=[],
        root_id=root_id,
        options=TraversalOptions(build_parent_map=True, build_children_map=True),
    )
    return root_id, hierarchy.parent_map, hierarchy.children_map


def validate_param_name(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    code_obj_id: "ID",
    name: str,
) -> str:
    normalized = validate_param_name_format(
        project_state, section_id, code_obj_id, name
    )
    if not normalized:
        return normalized
    section_impl = get_curr_effective_section_impl_with_type_guard(
        project_state, section_id, BaseSectionWithParamsImpl
    )
    _, parent_map, children_map = _collect_param_hierarchy(
        project_state, section_id, section_impl
    )
    if code_obj_id not in parent_map:
        raise KeyError(f"Param {code_obj_id} not found in section {section_id}.")
    parent_id = parent_map[code_obj_id]
    if parent_id is None:
        return normalized
    siblings = children_map.get(parent_id, [])
    for sibling_id in siblings:
        if sibling_id == code_obj_id:
            continue
        sibling_name = project_state.codeObjs[sibling_id].name.strip()
        if sibling_name == normalized:
            _raise_invalid_name(
                f'Param name "{normalized}" already exists under this parent.',
                InvalidParamName,
            )
    return normalized

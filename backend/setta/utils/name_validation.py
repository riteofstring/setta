import keyword
import re
from typing import TYPE_CHECKING

from setta.code_gen.utils import sanitize_python_identifier, sanitize_slug
from setta.types.code_obj_impls import BaseParamCodeObjImpl
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl,
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_config import (
    ProjectCodegenLanguage,
    project_config_has_codegen_language,
)
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CallableSectionImpl,
    ListRootSectionImpl,
)
from setta.utils.constants import C
from setta.utils.errors import InvalidParamName, InvalidProjectName, InvalidSectionName

if TYPE_CHECKING:
    from setta.types.id import ID
    from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig


PROJECT_RESERVED_NAMES: frozenset[str] = frozenset(
    {
        "home",
        C.SETTINGS_PROJECT_NAME.lower(),
    }
)
SECTION_RESERVED_NAMES: frozenset[str] = frozenset()
PARAM_RESERVED_NAMES: frozenset[str] = frozenset()
ALLOWED_SIMPLE_NAME_CHARS: frozenset[str] = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-"
)
PYTHON_IDENTIFIER_REGEX = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _normalize_name(name: str) -> str:
    return name.strip()


def _contains_control_chars(name: str) -> bool:
    for char in name:
        codepoint = ord(char)
        if codepoint < 32 or codepoint == 127:
            return True
    return False


def _raise_invalid_name(message: str, exc_type: type[ValueError]) -> None:
    raise exc_type(message)


def _project_name_format_error(
    normalized: str,
    *,
    allow_reserved: bool,
) -> str | None:
    if not normalized:
        return "Project name cannot be empty."
    if _contains_control_chars(normalized):
        return "Project name cannot include control characters."
    if "/" in normalized or "\\" in normalized:
        return "Project name cannot include path separators."
    if ".." in normalized:
        return "Project name cannot include '..' path segments."
    for char in normalized:
        if char not in ALLOWED_SIMPLE_NAME_CHARS:
            return (
                "Project name can only contain letters, numbers, spaces, '_' and '-'."
            )
    if not allow_reserved and normalized.lower() in PROJECT_RESERVED_NAMES:
        return f"Project name '{normalized}' is reserved."
    slug = sanitize_slug(normalized)
    if not slug:
        return "Project name is invalid after sanitization."
    return None


def get_project_name_format_error(
    name: str,
    *,
    allow_reserved: bool = False,
) -> str | None:
    normalized = _normalize_name(name)
    return _project_name_format_error(normalized, allow_reserved=allow_reserved)


def validate_project_name_format(
    name: str,
    *,
    allow_reserved: bool = False,
) -> str:
    normalized = _normalize_name(name)
    error = _project_name_format_error(normalized, allow_reserved=allow_reserved)
    if error:
        _raise_invalid_name(error, InvalidProjectName)
    return normalized


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


def _section_name_format_error(normalized: str) -> str | None:
    if not normalized:
        return "Section name cannot be empty."
    if _contains_control_chars(normalized):
        return "Section name cannot include control characters."
    if "/" in normalized or "\\" in normalized:
        return "Section name cannot include path separators."
    if ".." in normalized:
        return "Section name cannot include '..' path segments."
    for char in normalized:
        if char not in ALLOWED_SIMPLE_NAME_CHARS:
            return (
                "Section name can only contain letters, numbers, spaces, '_' and '-'."
            )
    if normalized.lower() in SECTION_RESERVED_NAMES:
        return f"Section name '{normalized}' is reserved."
    return None


def get_section_name_format_error(name: str) -> str | None:
    normalized = _normalize_name(name)
    return _section_name_format_error(normalized)


def validate_section_name_format(name: str) -> str:
    normalized = _normalize_name(name)
    error = _section_name_format_error(normalized)
    if error:
        _raise_invalid_name(error, InvalidSectionName)
    return normalized


def _get_section_children_ids(
    project_state: "ProjectStateSingleConfig", section_id: "ID"
) -> list["ID"]:
    impl = get_curr_effective_section_impl_with_type_guard(
        project_state, section_id, BaseParentSectionImpl
    )
    return impl.children


def _resolve_section_name(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    name_overrides: dict["ID", str] | None,
) -> str:
    if name_overrides and section_id in name_overrides:
        return name_overrides[section_id]
    return project_state.sections[section_id].name


def _resolve_section_full_path_name(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    name_overrides: dict["ID", str] | None = None,
) -> str:
    if section_id not in project_state.sections:
        raise KeyError(f"Missing section {section_id}.")
    if section_id not in project_state.parentSectionMap:
        raise KeyError(f"Missing parentSectionMap entry for section {section_id}.")
    parent_id = project_state.parentSectionMap[section_id]
    if not parent_id:
        return _resolve_section_name(project_state, section_id, name_overrides)
    child_id = section_id
    output = ""
    while parent_id:
        child_impl = get_curr_effective_section_impl(project_state, child_id)
        if isinstance(child_impl, ListRootSectionImpl):
            idx = _get_section_children_ids(project_state, parent_id).index(child_id)
            output = f"[{idx}]{output}"
        else:
            child_name = _resolve_section_name(project_state, child_id, name_overrides)
            output = f'["{child_name}"]{output}'
        child_id = parent_id
        parent_id = project_state.parentSectionMap[parent_id]
    child_name = _resolve_section_name(project_state, child_id, name_overrides)
    return f"{child_name}{output}"


def _collect_section_slug_map(
    project_state: "ProjectStateSingleConfig",
    name_overrides: dict["ID", str] | None = None,
) -> tuple[dict["ID", str], dict[str, list["ID"]]]:
    slug_by_section_id: dict["ID", str] = {}
    slug_to_section_ids: dict[str, list["ID"]] = {}
    for section_id in project_state.sections:
        full_name = _resolve_section_full_path_name(
            project_state, section_id, name_overrides
        )
        slug = sanitize_slug(full_name)
        slug_by_section_id[section_id] = slug
        slug_to_section_ids.setdefault(slug, []).append(section_id)
    return slug_by_section_id, slug_to_section_ids


def validate_section_name(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    name: str,
) -> str:
    normalized = validate_section_name_format(name)
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
            _raise_invalid_name(
                f'Section name "{normalized}" already exists under this parent.',
                InvalidSectionName,
            )
    if parent_id is None:
        normalized_identifier = sanitize_python_identifier(normalized)
        for sibling_id in sibling_ids:
            if sibling_id == section_id:
                continue
            sibling_name = project_state.sections[sibling_id].name.strip()
            if not sibling_name:
                continue
            if sanitize_python_identifier(sibling_name) == normalized_identifier:
                _raise_invalid_name(
                    "Section name conflicts with another top-level name after Python identifier sanitization.",
                    InvalidSectionName,
                )

    slug_by_section_id, slug_to_section_ids = _collect_section_slug_map(
        project_state, {section_id: normalized}
    )
    section_slug = slug_by_section_id.get(section_id, "")
    if not section_slug:
        _raise_invalid_name(
            "Section name is invalid after sanitization.",
            InvalidSectionName,
        )
    if len(slug_to_section_ids.get(section_slug, [])) > 1:
        _raise_invalid_name(
            f'Section path slug "{section_slug}" conflicts with another section.',
            InvalidSectionName,
        )
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


def _is_dict_param(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
) -> bool:
    section_impl = get_curr_effective_section_impl(project_state, section_id)
    return isinstance(section_impl, BaseDictSectionImpl)


def _param_name_format_error(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    code_obj_id: "ID",
    normalized: str,
) -> str | None:
    code_obj_impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state, section_id, code_obj_id, BaseParamCodeObjImpl
    )
    if not normalized:
        if code_obj_impl.coreNameEditable:
            return None
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if isinstance(section_impl, BaseDictSectionImpl):
            if section_impl.topLevelParamId == code_obj_id:
                return None
        return "Param name cannot be empty."
    if _contains_control_chars(normalized):
        return "Param name cannot include control characters."
    if not _is_dict_param(project_state, section_id):
        if "/" in normalized or "\\" in normalized:
            return "Param name cannot include path separators."
        if ".." in normalized:
            return "Param name cannot include '..' path segments."
        if normalized.lower() in PARAM_RESERVED_NAMES:
            return f"Param name '{normalized}' is reserved."
        python_codegen_enabled = project_config_has_codegen_language(
            project_state.projectConfig, ProjectCodegenLanguage.python
        )
        if python_codegen_enabled:
            if PYTHON_IDENTIFIER_REGEX.fullmatch(normalized) is None:
                return "Param name must be a valid Python identifier."
            if keyword.iskeyword(normalized):
                return "Param name cannot be a Python keyword."
    return None


def get_param_name_format_error(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    code_obj_id: "ID",
    name: str,
) -> str | None:
    normalized = _normalize_name(name)
    return _param_name_format_error(project_state, section_id, code_obj_id, normalized)


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


def validate_param_name_format(
    project_state: "ProjectStateSingleConfig",
    section_id: "ID",
    code_obj_id: "ID",
    name: str,
) -> str:
    normalized = _normalize_name(name)
    error = _param_name_format_error(
        project_state,
        section_id,
        code_obj_id,
        normalized,
    )
    if error:
        _raise_invalid_name(error, InvalidParamName)
    return normalized


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


def collect_section_name_conflicts(
    project_state: "ProjectStateSingleConfig",
) -> dict["ID", list[str]]:
    errors: dict["ID", list[str]] = {}

    def add_error(section_id: "ID", message: str) -> None:
        errors.setdefault(section_id, []).append(message)

    siblings_by_parent: dict["ID | None", list["ID"]] = {}
    for section_id in project_state.sections:
        if section_id not in project_state.parentSectionMap:
            raise KeyError(f"Missing parentSectionMap entry for section {section_id}.")
        parent_id = project_state.parentSectionMap[section_id]
        siblings_by_parent.setdefault(parent_id, []).append(section_id)

    for child_ids in siblings_by_parent.values():
        name_to_ids: dict[str, list["ID"]] = {}
        for child_id in child_ids:
            name = project_state.sections[child_id].name.strip()
            if not name:
                continue
            name_to_ids.setdefault(name, []).append(child_id)
        for name, ids in name_to_ids.items():
            if len(ids) > 1:
                message = f'Duplicate sibling name "{name}".'
                for child_id in ids:
                    add_error(child_id, message)

    top_level_ids = siblings_by_parent.get(None, [])
    if top_level_ids:
        identifier_to_ids: dict[str, list["ID"]] = {}
        for section_id in top_level_ids:
            name = project_state.sections[section_id].name.strip()
            if not name:
                continue
            identifier = sanitize_python_identifier(name)
            identifier_to_ids.setdefault(identifier, []).append(section_id)
        for ids in identifier_to_ids.values():
            if len(ids) > 1:
                message = (
                    "Section name conflicts with another top-level name after Python "
                    "identifier sanitization."
                )
                for section_id in ids:
                    add_error(section_id, message)

    _, slug_to_section_ids = _collect_section_slug_map(project_state)
    for slug, ids in slug_to_section_ids.items():
        if not slug:
            message = "Section name is invalid after sanitization."
            for section_id in ids:
                add_error(section_id, message)
            continue
        if len(ids) > 1:
            message = f'Section path slug "{slug}" conflicts with another section.'
            for section_id in ids:
                add_error(section_id, message)

    return errors


def collect_section_name_format_errors(
    project_state: "ProjectStateSingleConfig",
) -> dict["ID", list[str]]:
    errors: dict["ID", list[str]] = {}
    for section_id, section in project_state.sections.items():
        error = get_section_name_format_error(section.name)
        if error:
            errors.setdefault(section_id, []).append(error)
    return errors


def collect_param_name_conflicts(
    project_state: "ProjectStateSingleConfig",
) -> dict["ID", list[str]]:
    errors: dict["ID", list[str]] = {}

    def add_error(param_id: "ID", message: str) -> None:
        errors.setdefault(param_id, []).append(message)

    for section_id in project_state.sections:
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if not isinstance(section_impl, BaseSectionWithParamsImpl):
            continue
        if (
            isinstance(section_impl, CallableSectionImpl)
            and section_impl.callable is None
        ):
            continue
        if (
            isinstance(section_impl, BaseDictSectionImpl)
            and section_impl.topLevelParamId is None
        ):
            continue
        _, _, children_map = _collect_param_hierarchy(
            project_state, section_id, section_impl
        )
        for child_ids in children_map.values():
            name_to_ids: dict[str, list["ID"]] = {}
            for param_id in child_ids:
                name = project_state.codeObjs[param_id].name.strip()
                if not name:
                    continue
                name_to_ids.setdefault(name, []).append(param_id)
            for name, ids in name_to_ids.items():
                if len(ids) > 1:
                    message = f'Duplicate param name "{name}".'
                    for param_id in ids:
                        add_error(param_id, message)
    return errors


def collect_param_name_format_errors(
    project_state: "ProjectStateSingleConfig",
) -> dict["ID", list[str]]:
    errors: dict["ID", list[str]] = {}
    for section_id in project_state.sections:
        section_impl = get_curr_effective_section_impl(project_state, section_id)
        if not isinstance(section_impl, BaseSectionWithParamsImpl):
            continue
        if (
            isinstance(section_impl, CallableSectionImpl)
            and section_impl.callable is None
        ):
            continue
        if (
            isinstance(section_impl, BaseDictSectionImpl)
            and section_impl.topLevelParamId is None
        ):
            continue
        for code_obj_id in section_impl.codeObjVariantMap:
            if code_obj_id not in project_state.codeObjs:
                raise KeyError(f"Missing code obj {code_obj_id} in project state.")
            code_obj_impl = get_curr_effective_code_obj_impl(
                project_state,
                section_id,
                code_obj_id,
            )
            if not isinstance(code_obj_impl, BaseParamCodeObjImpl):
                continue
            error = get_param_name_format_error(
                project_state,
                section_id,
                code_obj_id,
                project_state.codeObjs[code_obj_id].name,
            )
            if error:
                errors.setdefault(code_obj_id, []).append(error)
    return errors


def collect_project_name_format_errors(
    project_state: "ProjectStateSingleConfig",
) -> list[str]:
    allow_reserved = (
        project_state.projectConfig.name.strip().lower()
        == C.SETTINGS_PROJECT_NAME.lower()
    )
    error = get_project_name_format_error(
        project_state.projectConfig.name,
        allow_reserved=allow_reserved,
    )
    if not error:
        return []
    return [error]


def get_section_slug_conflict_ids(
    project_state: "ProjectStateSingleConfig",
) -> set["ID"]:
    conflict_ids: set["ID"] = set()
    slug_by_section_id, slug_to_section_ids = _collect_section_slug_map(project_state)
    for slug, ids in slug_to_section_ids.items():
        if not slug or len(ids) > 1:
            conflict_ids.update(ids)
            continue
    for section_id, slug in slug_by_section_id.items():
        if not slug:
            conflict_ids.add(section_id)
    return conflict_ids

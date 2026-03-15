import keyword
import re
from typing import TYPE_CHECKING

from setta.code_gen.utils import sanitize_slug
from setta.types.code_obj_impls import BaseParamCodeObjImpl
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.project_config import (
    ProjectCodegenLanguage,
    project_config_has_codegen_language,
)
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    ListRootSectionImpl,
)
from setta.utils.constants import C
from setta.utils.errors import InvalidParamName, InvalidProjectName, InvalidSectionName

if TYPE_CHECKING:
    from setta.types.id import ID
    from setta.types.project_state import ProjectStateSingleConfig


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


def _is_python_keyword(name: str) -> bool:
    if name == "_":
        return False
    return keyword.iskeyword(name) or keyword.issoftkeyword(name)


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
    if name_overrides is None:
        cached = project_state._section_slug_cache
        if cached is not None:
            return cached
    slug_by_section_id: dict["ID", str] = {}
    slug_to_section_ids: dict[str, list["ID"]] = {}
    for section_id in project_state.sections:
        full_name = _resolve_section_full_path_name(
            project_state, section_id, name_overrides
        )
        slug = sanitize_slug(full_name)
        slug_by_section_id[section_id] = slug
        slug_to_section_ids.setdefault(slug, []).append(section_id)
    if name_overrides is None:
        project_state._section_slug_cache = (slug_by_section_id, slug_to_section_ids)
    return slug_by_section_id, slug_to_section_ids


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
            if _is_python_keyword(normalized):
                return "Param name cannot be a Python keyword."
    return None
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

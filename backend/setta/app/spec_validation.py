from functools import lru_cache

from setta.app.catalog import APP_CATALOG, APP_CATALOG_ID
from setta.app.spec_utils import (
    get_data_path as _get_data_path,
)
from setta.app.spec_utils import (
    is_ui_element as _is_ui_element,
)
from setta.app.spec_utils import (
    resolve_binding_record as _resolve_binding_record,
)
from setta.app.spec_utils import (
    resolve_binding_string as _resolve_binding_string,
)
from setta.types.app_validation import AppValidationIssue
from setta.types.chat_messages import JSONValue

_RESPONSIVE_BREAKPOINT_ORDER = ("base", "sm", "md", "lg", "xl", "2xl")
_ALLOWED_RESPONSIVE_BREAKPOINTS = set(_RESPONSIVE_BREAKPOINT_ORDER)


def validate_app_spec(
    app_spec: JSONValue,
    *,
    catalog_id: str,
    action_definitions: dict[str, JSONValue] | None = None,
    data_bindings: dict[str, JSONValue] | None = None,
) -> None:
    issues = collect_app_spec_validation_issues(
        app_spec,
        catalog_id=catalog_id,
        action_definitions=action_definitions,
        data_bindings=data_bindings,
    )
    if issues:
        raise ValueError(issues[0].message)


def validate_app_action_definitions(
    action_definitions: dict[str, JSONValue],
    *,
    allowed_action_types: set[str] | None = None,
) -> None:
    allowed = allowed_action_types or _list_catalog_actions()
    for name, definition in action_definitions.items():
        if not isinstance(definition, dict):
            raise ValueError(f"App action '{name}' must be an object.")
        action_type = definition.get("type", name)
        if not isinstance(action_type, str):
            raise ValueError(f"App action '{name}' type must be a string.")
        if action_type not in allowed:
            raise ValueError(f"App action '{name}' uses unknown type '{action_type}'.")


def collect_app_action_definition_issues(
    action_definitions: dict[str, JSONValue],
    *,
    allowed_action_types: set[str] | None = None,
) -> list[AppValidationIssue]:
    issues: list[AppValidationIssue] = []
    allowed = allowed_action_types or _list_catalog_actions()
    for name, definition in action_definitions.items():
        if not isinstance(definition, dict):
            issues.append(
                AppValidationIssue(message=f"App action '{name}' must be an object.")
            )
            continue
        action_type = definition.get("type", name)
        if not isinstance(action_type, str):
            issues.append(
                AppValidationIssue(
                    message=f"App action '{name}' type must be a string."
                )
            )
            continue
        if action_type not in allowed:
            issues.append(
                AppValidationIssue(
                    message=f"App action '{name}' uses unknown type '{action_type}'."
                )
            )
    return issues


def collect_app_spec_validation_issues(
    app_spec: JSONValue,
    *,
    catalog_id: str,
    action_definitions: dict[str, JSONValue] | None = None,
    data_bindings: dict[str, JSONValue] | None = None,
) -> list[AppValidationIssue]:
    issues: list[AppValidationIssue] = []
    if catalog_id != APP_CATALOG_ID:
        issues.append(
            AppValidationIssue(message=f"Unknown app catalog id: {catalog_id}")
        )
        return issues

    component_schemas = _build_component_schema_map()
    allowed_components = set(component_schemas.keys())
    allowed_actions = _list_catalog_actions()
    if action_definitions is not None:
        allowed_actions.update(action_definitions.keys())

    try:
        root_element, elements = _resolve_app_spec(app_spec)
    except ValueError as exc:
        issues.append(AppValidationIssue(message=str(exc)))
        return issues

    run_action_names = _collect_run_action_names(action_definitions)
    run_action_count, used_config_ids, unscoped_keys = _collect_validate_elements(
        root_element,
        elements,
        allowed_components,
        component_schemas,
        allowed_actions,
        action_definitions,
        data_bindings,
        issues=issues,
    )
    if run_action_count > 1 and len(run_action_names) <= 1:
        issues.append(
            AppValidationIssue(
                message=(
                    "App spec can only include one run action. "
                    "Define an additional run action to allow multiple run buttons."
                )
            )
        )
    if len(used_config_ids) > 1 and unscoped_keys:
        missing = ", ".join(sorted(unscoped_keys))
        issues.append(
            AppValidationIssue(
                message=(
                    "App spec uses multiple configs but some elements are not scoped. "
                    "Wrap them in ConfigScope or set configId explicitly. "
                    f"Missing scope for: {missing}."
                )
            )
        )
    return issues


def _collect_issue(
    message: str,
    *,
    element_key: str | None = None,
    element_type: str | None = None,
) -> AppValidationIssue:
    return AppValidationIssue(
        message=message,
        elementKey=element_key,
        elementType=element_type,
    )


def _collect_validate_elements(
    root_element: dict[str, JSONValue],
    elements: dict[str, dict[str, JSONValue]],
    allowed_components: set[str],
    component_schemas: dict[str, dict[str, JSONValue]],
    allowed_actions: set[str],
    action_definitions: dict[str, JSONValue] | None,
    data_bindings: dict[str, JSONValue] | None,
    *,
    issues: list[AppValidationIssue],
) -> tuple[int, set[str], list[str]]:
    stack: list[tuple[dict[str, JSONValue], str | None]] = [(root_element, None)]
    visited: set[str] = set()
    run_action_count = 0
    used_config_ids: set[str] = set()
    unscoped_keys: list[str] = []

    while stack:
        element, scope_config_id = stack.pop()
        key_value = element.get("key")
        if not isinstance(key_value, str):
            issues.append(_collect_issue("App spec elements require a string key."))
            continue
        key = key_value
        if key in visited:
            continue
        visited.add(key)

        component_type_value = element.get("type")
        if not isinstance(component_type_value, str):
            issues.append(
                _collect_issue(
                    f"App spec element '{key}' missing component type.",
                    element_key=key,
                )
            )
            _collect_push_children(
                key,
                element,
                elements,
                scope_config_id,
                issues=issues,
                element_type=None,
                stack=stack,
            )
            continue
        component_type = component_type_value
        if component_type not in allowed_components:
            issues.append(
                _collect_issue(
                    f"App spec element '{key}' uses unknown component '{component_type}'.",
                    element_key=key,
                    element_type=component_type,
                )
            )
            _collect_push_children(
                key,
                element,
                elements,
                scope_config_id,
                issues=issues,
                element_type=component_type,
                stack=stack,
            )
            continue

        component_schema = component_schemas.get(component_type)
        if component_schema is None:
            issues.append(
                _collect_issue(
                    f"App spec element '{key}' uses unknown component '{component_type}'.",
                    element_key=key,
                    element_type=component_type,
                )
            )
            _collect_push_children(
                key,
                element,
                elements,
                scope_config_id,
                issues=issues,
                element_type=component_type,
                stack=stack,
            )
            continue

        props = _collect_element_props(
            key,
            element,
            issues=issues,
            element_type=component_type,
        )
        binding = _resolve_binding_record(data_bindings, _get_data_path(props))

        _collect_validate_children_against_catalog(
            key,
            component_type,
            component_schema,
            element,
            issues=issues,
        )
        _collect_validate_props_against_catalog(
            key,
            component_type,
            component_schema,
            props,
            binding,
            issues=issues,
        )

        if component_type == "ConfigScope":
            config_id = _get_prop_string(element, "configId")
            if config_id:
                used_config_ids.add(config_id)
            scope_config_id = config_id

        if component_type == "ActionButton":
            action_name = _resolve_action_name(element, binding)
            action_type: str | None = None
            if action_name:
                if action_name not in allowed_actions:
                    issues.append(
                        _collect_issue(
                            f"App spec action '{action_name}' is not registered (element '{key}').",
                            element_key=key,
                            element_type=component_type,
                        )
                    )
                else:
                    definition = (
                        action_definitions.get(action_name)
                        if action_definitions is not None
                        else None
                    )
                    action_type = _resolve_action_type(action_name, definition)
                    if action_type == "run":
                        run_action_count += 1
                _apply_config_scope_guardrail(
                    key,
                    scope_config_id,
                    element,
                    binding,
                    used_config_ids,
                    unscoped_keys,
                    action_type=action_type,
                )
        if component_type in {"ParamInput", "TextOutput", "ImageOutput"}:
            _apply_config_scope_guardrail(
                key,
                scope_config_id,
                element,
                binding,
                used_config_ids,
                unscoped_keys,
            )

        _collect_push_children(
            key,
            element,
            elements,
            scope_config_id,
            issues=issues,
            element_type=component_type,
            stack=stack,
        )

    return run_action_count, used_config_ids, unscoped_keys


def _collect_element_props(
    element_key: str,
    element: dict[str, JSONValue],
    *,
    issues: list[AppValidationIssue],
    element_type: str | None,
) -> dict[str, JSONValue]:
    raw = element.get("props")
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        issues.append(
            _collect_issue(
                f"App spec element '{element_key}' props must be an object.",
                element_key=element_key,
                element_type=element_type,
            )
        )
        return {}
    return raw


def _collect_validate_children_against_catalog(
    element_key: str,
    component_type: str,
    component_schema: dict[str, JSONValue],
    element: dict[str, JSONValue],
    *,
    issues: list[AppValidationIssue],
) -> None:
    allows_children = component_schema.get("children")
    if not isinstance(allows_children, bool) or allows_children:
        return
    if element.get("children") is None:
        return
    issues.append(
        _collect_issue(
            f"App spec element '{element_key}' cannot have children (component '{component_type}' is childless).",
            element_key=element_key,
            element_type=component_type,
        )
    )


def _collect_validate_props_against_catalog(
    element_key: str,
    component_type: str,
    component_schema: dict[str, JSONValue],
    props: dict[str, JSONValue],
    binding: dict[str, JSONValue] | None,
    *,
    issues: list[AppValidationIssue],
) -> None:
    raw_props_schema = component_schema.get("props")
    props_schema: dict[str, JSONValue] = (
        raw_props_schema if isinstance(raw_props_schema, dict) else {}
    )

    for prop_key, prop_value in props.items():
        if prop_key not in props_schema:
            issues.append(
                _collect_issue(
                    f"App spec element '{element_key}' has unknown prop '{prop_key}' for component '{component_type}'.",
                    element_key=element_key,
                    element_type=component_type,
                )
            )
            continue
        prop_schema = props_schema.get(prop_key)
        if isinstance(prop_schema, dict):
            try:
                _validate_prop_value(
                    element_key, component_type, prop_key, prop_value, prop_schema
                )
            except ValueError as exc:
                issues.append(
                    _collect_issue(
                        str(exc),
                        element_key=element_key,
                        element_type=component_type,
                    )
                )

    for prop_key, prop_schema in props_schema.items():
        if not isinstance(prop_schema, dict):
            continue
        if prop_schema.get("required") is not True:
            continue
        if prop_key in props:
            if _is_missing_required_value(props[prop_key]):
                issues.append(
                    _collect_issue(
                        f"App spec element '{element_key}' missing required prop '{prop_key}' for component '{component_type}'.",
                        element_key=element_key,
                        element_type=component_type,
                    )
                )
            continue
        if binding is not None and prop_key in binding:
            bound_value = binding[prop_key]
            try:
                _validate_prop_value(
                    element_key, component_type, prop_key, bound_value, prop_schema
                )
            except ValueError as exc:
                issues.append(
                    _collect_issue(
                        str(exc),
                        element_key=element_key,
                        element_type=component_type,
                    )
                )
            if _is_missing_required_value(bound_value):
                issues.append(
                    _collect_issue(
                        f"App spec element '{element_key}' missing required prop '{prop_key}' for component '{component_type}'.",
                        element_key=element_key,
                        element_type=component_type,
                    )
                )
            continue
        issues.append(
            _collect_issue(
                f"App spec element '{element_key}' missing required prop '{prop_key}' for component '{component_type}'.",
                element_key=element_key,
                element_type=component_type,
            )
        )


def _collect_push_children(
    element_key: str,
    element: dict[str, JSONValue],
    elements: dict[str, dict[str, JSONValue]],
    scope_config_id: str | None,
    *,
    issues: list[AppValidationIssue],
    element_type: str | None,
    stack: list[tuple[dict[str, JSONValue], str | None]],
) -> None:
    children = element.get("children")
    if children is None:
        return
    if not isinstance(children, list):
        issues.append(
            _collect_issue(
                f"App spec element '{element_key}' children must be a list.",
                element_key=element_key,
                element_type=element_type,
            )
        )
        return
    for child in children:
        if isinstance(child, str):
            child_element = elements.get(child)
            if child_element is None:
                issues.append(
                    _collect_issue(
                        f"App spec element '{element_key}' references missing child '{child}'.",
                        element_key=element_key,
                        element_type=element_type,
                    )
                )
                continue
            stack.append((child_element, scope_config_id))
            continue
        if _is_ui_element(child):
            stack.append((child, scope_config_id))
            continue
        issues.append(
            _collect_issue(
                f"App spec element '{element_key}' children must be element keys or objects.",
                element_key=element_key,
                element_type=element_type,
            )
        )


@lru_cache(maxsize=1)
def _cached_catalog_actions() -> frozenset[str]:
    actions = APP_CATALOG.get("actions")
    if not isinstance(actions, list):
        return frozenset()
    output: set[str] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        name = action.get("name")
        if isinstance(name, str):
            output.add(name)
    return frozenset(output)


def _list_catalog_actions() -> set[str]:
    return set(_cached_catalog_actions())


def _collect_run_action_names(
    action_definitions: dict[str, JSONValue] | None,
) -> set[str]:
    run_names = {"run"}
    if not action_definitions:
        return run_names
    for name, definition in action_definitions.items():
        action_type = _resolve_action_type(name, definition)
        if action_type == "run":
            run_names.add(name)
    return run_names


@lru_cache(maxsize=1)
def _build_component_schema_map() -> dict[str, dict[str, JSONValue]]:
    components = APP_CATALOG.get("components")
    if not isinstance(components, list):
        return {}
    output: dict[str, dict[str, JSONValue]] = {}
    for component in components:
        if not isinstance(component, dict):
            continue
        type_name = component.get("type")
        if isinstance(type_name, str):
            output[type_name] = component
    return output


def _resolve_app_spec(
    app_spec: JSONValue,
) -> tuple[dict[str, JSONValue], dict[str, dict[str, JSONValue]]]:
    if not isinstance(app_spec, dict):
        raise ValueError("App spec must be an object.")

    root_value = app_spec.get("root")
    elements_value = app_spec.get("elements")

    elements: dict[str, dict[str, JSONValue]] = {}
    if elements_value is not None:
        if not isinstance(elements_value, dict):
            raise ValueError("App spec elements must be an object.")
        for key, value in elements_value.items():
            if not isinstance(key, str):
                raise ValueError("App spec element keys must be strings.")
            if not _is_ui_element(value):
                example = '{"key":"root","type":"Stack","props":{},"children":[]}'
                raise ValueError(
                    f"Invalid app spec element for key '{key}': each element must be an object with top-level string fields 'key' and 'type' (example: {example})."
                )
            element_key = value.get("key")
            if element_key != key:
                raise ValueError(
                    f"App spec element map key '{key}' does not match element.key '{element_key}'."
                )
            elements[key] = value

    if _is_ui_element(root_value):
        root_element = root_value
    elif isinstance(root_value, str):
        root_element = elements.get(root_value)
        if root_element is None:
            raise ValueError(f"App spec root '{root_value}' not found in elements.")
    elif root_value is None and _is_ui_element(app_spec):
        root_element = app_spec
    else:
        raise ValueError("App spec root must be a UI element or element key.")

    return root_element, elements


def _is_missing_required_value(value: JSONValue) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, dict):
        if not value:
            return True
        return all(_is_missing_required_value(v) for v in value.values())
    return False


def _validate_prop_value(
    element_key: str,
    component_type: str,
    prop_key: str,
    value: JSONValue,
    prop_schema: dict[str, JSONValue],
) -> None:
    expected_type = prop_schema.get("type")
    if not isinstance(expected_type, str):
        return

    if prop_schema.get("responsive") is True and isinstance(value, dict):
        if not value:
            raise ValueError(
                f"App spec element '{element_key}' prop '{prop_key}' must include at least one breakpoint value (component '{component_type}')."
            )
        for breakpoint_key, breakpoint_value in value.items():
            if not isinstance(breakpoint_key, str):
                raise ValueError(
                    f"App spec element '{element_key}' prop '{prop_key}' breakpoint keys must be strings (component '{component_type}')."
                )
            if breakpoint_key not in _ALLOWED_RESPONSIVE_BREAKPOINTS:
                allowed = ", ".join(_RESPONSIVE_BREAKPOINT_ORDER)
                raise ValueError(
                    f"App spec element '{element_key}' prop '{prop_key}' uses unknown breakpoint '{breakpoint_key}' (allowed: {allowed})."
                )
            _validate_scalar_prop_value(
                element_key,
                component_type,
                prop_key,
                breakpoint_value,
                prop_schema,
            )
        return

    _validate_scalar_prop_value(
        element_key,
        component_type,
        prop_key,
        value,
        prop_schema,
    )


def _validate_scalar_prop_value(
    element_key: str,
    component_type: str,
    prop_key: str,
    value: JSONValue,
    prop_schema: dict[str, JSONValue],
) -> None:
    expected_type = prop_schema.get("type")
    if not isinstance(expected_type, str):
        return

    if expected_type == "string":
        if not isinstance(value, str):
            raise ValueError(
                f"App spec element '{element_key}' prop '{prop_key}' must be a string (component '{component_type}')."
            )
    elif expected_type in {"number", "dimension"}:
        is_dimension = expected_type == "dimension"
        if is_dimension and isinstance(value, str):
            if value.strip() == "":
                raise ValueError(
                    f"App spec element '{element_key}' prop '{prop_key}' must be a non-empty string (component '{component_type}')."
                )
            # CSS lengths (e.g. "1rem", "clamp(...)") are accepted but cannot be range-validated.
            return
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValueError(
                f"App spec element '{element_key}' prop '{prop_key}' must be a number (component '{component_type}')."
            )
        min_value = prop_schema.get("min")
        max_value = prop_schema.get("max")
        if isinstance(min_value, (int, float)) and value < min_value:
            raise ValueError(
                f"App spec element '{element_key}' prop '{prop_key}' must be >= {min_value} (component '{component_type}')."
            )
        if isinstance(max_value, (int, float)) and value > max_value:
            raise ValueError(
                f"App spec element '{element_key}' prop '{prop_key}' must be <= {max_value} (component '{component_type}')."
            )
    elif expected_type == "boolean":
        if not isinstance(value, bool):
            raise ValueError(
                f"App spec element '{element_key}' prop '{prop_key}' must be a boolean (component '{component_type}')."
            )
    else:
        return

    enum_values = prop_schema.get("enum")
    if isinstance(enum_values, list) and enum_values:
        if value not in enum_values:
            allowed = ", ".join(str(v) for v in enum_values)
            raise ValueError(
                f"App spec element '{element_key}' prop '{prop_key}' must be one of [{allowed}] (component '{component_type}')."
            )


def _get_prop_string(
    element: dict[str, JSONValue],
    key: str,
) -> str | None:
    props = element.get("props")
    if not isinstance(props, dict):
        return None
    value = props.get(key)
    if isinstance(value, str):
        return value
    return None


def _resolve_action_type(
    action_name: str,
    definition: JSONValue | None,
) -> str:
    if isinstance(definition, dict):
        action_type = definition.get("type")
        if isinstance(action_type, str):
            return action_type
    return action_name


def _resolve_action_name(
    element: dict[str, JSONValue],
    binding: dict[str, JSONValue] | None,
) -> str | None:
    action_name = _get_prop_string(element, "action")
    if action_name:
        return action_name
    if binding is None:
        return None
    value = binding.get("action")
    if isinstance(value, str):
        return value
    return None


def _apply_config_scope_guardrail(
    element_key: str,
    scope_config_id: str | None,
    element: dict[str, JSONValue],
    binding: dict[str, JSONValue] | None,
    used_config_ids: set[str],
    unscoped_keys: list[str],
    *,
    action_type: str | None = None,
) -> None:
    explicit_config_id = _get_prop_string(
        element, "configId"
    ) or _resolve_binding_string(binding, "configId")
    effective_config_id = explicit_config_id or scope_config_id
    if effective_config_id:
        used_config_ids.add(effective_config_id)
        return
    if action_type is not None and action_type not in {"run", "downloadArtifact"}:
        return
    unscoped_keys.append(element_key)

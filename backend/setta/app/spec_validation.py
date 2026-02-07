from setta.app.catalog import APP_CATALOG, APP_CATALOG_ID, list_app_components
from setta.types.chat_messages import JSONValue


def validate_app_spec(
    app_spec: JSONValue,
    *,
    catalog_id: str,
    action_definitions: dict[str, JSONValue] | None = None,
    data_bindings: dict[str, JSONValue] | None = None,
) -> None:
    if catalog_id != APP_CATALOG_ID:
        raise ValueError(f"Unknown app catalog id: {catalog_id}")

    allowed_components = set(list_app_components())
    allowed_actions = _list_catalog_actions()
    if action_definitions is not None:
        allowed_actions.update(action_definitions.keys())

    root_element, elements = _resolve_app_spec(app_spec)
    run_action_names = _collect_run_action_names(action_definitions)
    (
        run_action_count,
        used_config_ids,
        unscoped_keys,
    ) = _validate_elements(
        root_element,
        elements,
        allowed_components,
        allowed_actions,
        action_definitions,
        data_bindings,
    )
    if run_action_count > 1 and len(run_action_names) <= 1:
        raise ValueError(
            "App spec can only include one run action. "
            "Define an additional run action to allow multiple run buttons."
        )
    if len(used_config_ids) > 1 and unscoped_keys:
        missing = ", ".join(sorted(unscoped_keys))
        raise ValueError(
            "App spec uses multiple configs but some elements are not scoped. "
            "Wrap them in ConfigScope or set configId explicitly. "
            f"Missing scope for: {missing}."
        )


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


def _list_catalog_actions() -> set[str]:
    actions = APP_CATALOG.get("actions")
    if not isinstance(actions, list):
        return set()
    output: set[str] = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        name = action.get("name")
        if isinstance(name, str):
            output.add(name)
    return output


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
                raise ValueError(f"Invalid app spec element for key '{key}'.")
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


def _validate_elements(
    root_element: dict[str, JSONValue],
    elements: dict[str, dict[str, JSONValue]],
    allowed_components: set[str],
    allowed_actions: set[str],
    action_definitions: dict[str, JSONValue] | None,
    data_bindings: dict[str, JSONValue] | None,
) -> tuple[int, set[str], list[str]]:
    stack: list[tuple[dict[str, JSONValue], str | None]] = [(root_element, None)]
    visited: set[str] = set()
    run_action_count = 0
    used_config_ids: set[str] = set()
    unscoped_keys: list[str] = []

    while stack:
        element, scope_config_id = stack.pop()
        key = element.get("key")
        if not isinstance(key, str):
            raise ValueError("App spec elements require a string key.")
        if key in visited:
            continue
        visited.add(key)

        component_type = element.get("type")
        if not isinstance(component_type, str):
            raise ValueError(f"App spec element '{key}' missing component type.")
        if component_type not in allowed_components:
            raise ValueError(
                f"App spec element '{key}' uses unknown component '{component_type}'."
            )

        if component_type == "ConfigScope":
            config_id = _get_prop_string(element, "configId")
            if config_id:
                used_config_ids.add(config_id)
            scope_config_id = config_id

        binding = _resolve_binding_record(
            data_bindings, _get_prop_string(element, "dataPath")
        )

        if component_type == "ParamInput":
            _validate_param_binding(key, element, binding)
        if component_type == "ActionButton":
            action_name = _resolve_action_name(element, binding)
            action_type: str | None = None
            if action_name:
                _validate_action_binding(key, action_name, allowed_actions)
                definition = (
                    action_definitions.get(action_name)
                    if action_definitions is not None
                    else None
                )
                action_type = _resolve_action_type(action_name, definition)
                if action_type == "run":
                    run_action_count += 1
            if action_name:
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

        children = element.get("children")
        if children is None:
            continue
        if not isinstance(children, list):
            raise ValueError(f"App spec element '{key}' children must be a list.")
        for child in children:
            if isinstance(child, str):
                child_element = elements.get(child)
                if child_element is None:
                    raise ValueError(
                        f"App spec element '{key}' references missing child '{child}'."
                    )
                stack.append((child_element, scope_config_id))
                continue
            if _is_ui_element(child):
                stack.append((child, scope_config_id))
                continue
            raise ValueError(
                f"App spec element '{key}' children must be element keys or objects."
            )
    return run_action_count, used_config_ids, unscoped_keys


def _validate_action_binding(
    key: str,
    action_name: str,
    allowed_actions: set[str],
) -> None:
    if action_name not in allowed_actions:
        raise ValueError(
            f"App spec action '{action_name}' is not registered (element '{key}')."
        )


def _is_ui_element(value: JSONValue | None) -> bool:
    if not isinstance(value, dict):
        return False
    key = value.get("key")
    element_type = value.get("type")
    return isinstance(key, str) and isinstance(element_type, str)


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


def _resolve_binding_record(
    data_bindings: dict[str, JSONValue] | None,
    data_path: str | None,
) -> dict[str, JSONValue] | None:
    if not data_bindings or data_path is None:
        return None
    if data_path == "" or data_path.startswith("/"):
        resolved = _resolve_pointer(data_bindings, data_path)
    else:
        resolved = data_bindings.get(data_path)
    if isinstance(resolved, dict):
        return resolved
    return None


def _resolve_pointer(value: JSONValue, pointer: str) -> JSONValue | None:
    if pointer == "":
        return value
    if not pointer.startswith("/"):
        return None
    current: JSONValue = value
    segments = [_decode_pointer_segment(segment) for segment in pointer.split("/")[1:]]
    for segment in segments:
        if isinstance(current, list):
            if not segment.isdigit():
                return None
            index = int(segment)
            if index < 0 or index >= len(current):
                return None
            current = current[index]
            continue
        if not isinstance(current, dict):
            return None
        if segment not in current:
            return None
        current = current[segment]
    return current


def _decode_pointer_segment(segment: str) -> str:
    return segment.replace("~1", "/").replace("~0", "~")


def _resolve_binding_string(
    binding: dict[str, JSONValue] | None,
    key: str,
) -> str | None:
    if binding is None:
        return None
    value = binding.get(key)
    if isinstance(value, str):
        return value
    return None


def _validate_param_binding(
    element_key: str,
    element: dict[str, JSONValue],
    binding: dict[str, JSONValue] | None,
) -> None:
    section_id = _get_prop_string(element, "sectionId") or _resolve_binding_string(
        binding, "sectionId"
    )
    param_id = _get_prop_string(element, "paramId") or _resolve_binding_string(
        binding, "paramId"
    )
    if not section_id or not param_id:
        raise ValueError(
            f"ParamInput requires sectionId and paramId (element '{element_key}')."
        )


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

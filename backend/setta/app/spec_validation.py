from typing import Iterable

from setta.app.catalog import APP_CATALOG, APP_CATALOG_ID, list_app_components
from setta.types.chat_messages import JSONValue


def validate_app_spec(
    app_spec: JSONValue,
    *,
    catalog_id: str,
    action_names: Iterable[str] | None = None,
) -> None:
    if catalog_id != APP_CATALOG_ID:
        raise ValueError(f"Unknown app catalog id: {catalog_id}")

    allowed_components = set(list_app_components())
    allowed_actions = _list_catalog_actions()
    if action_names is not None:
        allowed_actions.update(action_names)

    root_element, elements = _resolve_app_spec(app_spec)
    _validate_elements(root_element, elements, allowed_components, allowed_actions)


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
            raise ValueError(
                f"App action '{name}' uses unknown type '{action_type}'."
            )


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
) -> None:
    stack: list[dict[str, JSONValue]] = [root_element]
    visited: set[str] = set()

    while stack:
        element = stack.pop()
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

        if component_type == "ActionButton":
            _validate_action_binding(key, element, allowed_actions)

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
                stack.append(child_element)
                continue
            if _is_ui_element(child):
                stack.append(child)
                continue
            raise ValueError(
                f"App spec element '{key}' children must be element keys or objects."
            )


def _validate_action_binding(
    key: str,
    element: dict[str, JSONValue],
    allowed_actions: set[str],
) -> None:
    props = element.get("props")
    if not isinstance(props, dict):
        return
    action_name = props.get("action")
    if not isinstance(action_name, str):
        return
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

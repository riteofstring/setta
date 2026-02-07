import re

from setta.app.catalog import APP_CATALOG_ID, APP_CATALOG_VERSION
from setta.app.spec_validation import (
    validate_app_action_definitions,
    validate_app_spec,
)
from setta.types.app_definition import AppDefinition
from setta.types.app_validation import AppCapabilities, AppValidationIssue
from setta.types.chat_messages import JSONValue

_EXTERNAL_HREF_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
_THEME_SCHEMA_VERSION = "v1"


def build_app_capabilities(definition: AppDefinition) -> AppCapabilities:
    catalog_version = (
        APP_CATALOG_VERSION if definition.catalogId == APP_CATALOG_ID else ""
    )
    features = {
        "themeVars": True,
        "assets": True,
        "dimensionStrings": True,
        "dataBindingsJsonPointer": True,
        "responsive": False,
        "motion": False,
        "customComponents": False,
    }
    return AppCapabilities(
        catalogId=definition.catalogId,
        catalogVersion=catalog_version,
        appSpecVersion=definition.appSpecVersion,
        themeSchemaVersion=_THEME_SCHEMA_VERSION,
        features=features,
    )


def validate_app_definition_payload(
    app_spec: JSONValue,
    *,
    definition: AppDefinition,
) -> tuple[list[AppValidationIssue], list[AppValidationIssue]]:
    errors: list[AppValidationIssue] = []
    warnings: list[AppValidationIssue] = []

    try:
        validate_app_action_definitions(definition.actions)
        validate_app_spec(
            app_spec,
            catalog_id=definition.catalogId,
            action_definitions=definition.actions,
            data_bindings=definition.dataBindings,
        )
    except ValueError as exc:
        errors.append(AppValidationIssue(message=str(exc)))

    warnings.extend(_validate_theme(definition.theme))
    warnings.extend(_validate_assets(definition.assets))
    warnings.extend(_collect_action_warnings(app_spec, definition=definition))

    return errors, warnings


def _validate_theme(theme: dict[str, JSONValue] | None) -> list[AppValidationIssue]:
    if theme is None:
        return []
    raw_vars = theme.get("vars")
    if not isinstance(raw_vars, dict):
        return []
    invalid = [
        key
        for key in raw_vars.keys()
        if not isinstance(key, str) or not key.startswith("--app-")
    ]
    if not invalid:
        return []
    invalid_sorted = sorted([key for key in invalid if isinstance(key, str)])
    preview = ", ".join(invalid_sorted[:6])
    suffix = " ..." if len(invalid_sorted) > 6 else ""
    return [
        AppValidationIssue(
            message=(
                "theme.vars contains keys that do not start with '--app-' and will be ignored: "
                f"{preview}{suffix}"
            )
        )
    ]


def _is_external_href(href: str) -> bool:
    trimmed = href.strip()
    if trimmed.startswith("//"):
        return True
    return bool(_EXTERNAL_HREF_RE.match(trimmed))


def _resolve_asset_href(asset: JSONValue) -> str | None:
    if not isinstance(asset, dict):
        return None
    href = asset.get("href") or asset.get("url") or asset.get("path")
    if isinstance(href, str):
        return href
    return None


def _validate_assets(assets: list[JSONValue]) -> list[AppValidationIssue]:
    external: list[str] = []
    for asset in assets:
        href = _resolve_asset_href(asset)
        if not href:
            continue
        if _is_external_href(href):
            external.append(href)
    if not external:
        return []
    external_sorted = sorted(external)
    preview = ", ".join(external_sorted[:3])
    suffix = " ..." if len(external_sorted) > 3 else ""
    return [
        AppValidationIssue(
            message=(
                "assets includes external URLs which will be filtered when external links are disallowed: "
                f"{preview}{suffix}"
            )
        )
    ]


def _is_ui_element(value: JSONValue | None) -> bool:
    if not isinstance(value, dict):
        return False
    return isinstance(value.get("key"), str) and isinstance(value.get("type"), str)


def _resolve_element_props(element: dict[str, JSONValue]) -> dict[str, JSONValue]:
    raw = element.get("props")
    if isinstance(raw, dict):
        return raw
    return {}


def _get_data_path(props: dict[str, JSONValue]) -> str | None:
    value = props.get("dataPath")
    if isinstance(value, str):
        return value
    return None


def _decode_pointer_segment(segment: str) -> str:
    return segment.replace("~1", "/").replace("~0", "~")


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


def _resolve_binding_record(
    data_bindings: dict[str, JSONValue],
    data_path: str | None,
) -> dict[str, JSONValue] | None:
    if not data_bindings or data_path is None:
        return None
    resolved: JSONValue | None
    if data_path == "" or data_path.startswith("/"):
        resolved = _resolve_pointer(data_bindings, data_path)
    else:
        resolved = data_bindings.get(data_path)
    if isinstance(resolved, dict):
        return resolved
    return None


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


def _resolve_action_type(action_name: str, definition: JSONValue | None) -> str:
    if isinstance(definition, dict):
        action_type = definition.get("type")
        if isinstance(action_type, str):
            return action_type
    return action_name


def _resolve_action_name(
    props: dict[str, JSONValue],
    binding: dict[str, JSONValue] | None,
) -> str | None:
    direct = props.get("action")
    if isinstance(direct, str) and direct.strip():
        return direct
    return _resolve_binding_string(binding, "action")


def _resolve_app_spec(
    app_spec: JSONValue,
) -> tuple[dict[str, JSONValue], dict[str, dict[str, JSONValue]]]:
    if not isinstance(app_spec, dict):
        raise ValueError("App spec must be an object.")

    root_value = app_spec.get("root")
    elements_value = app_spec.get("elements")

    elements: dict[str, dict[str, JSONValue]] = {}
    if isinstance(elements_value, dict):
        for key, value in elements_value.items():
            if not isinstance(key, str):
                continue
            if _is_ui_element(value):
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


def _iter_app_elements(
    app_spec: JSONValue,
) -> list[dict[str, JSONValue]]:
    root, elements = _resolve_app_spec(app_spec)

    stack: list[dict[str, JSONValue]] = [root]
    visited: set[str] = set()
    output: list[dict[str, JSONValue]] = []

    while stack:
        element = stack.pop()
        key = element.get("key")
        if not isinstance(key, str):
            continue
        if key in visited:
            continue
        visited.add(key)
        output.append(element)

        children = element.get("children")
        if children is None:
            continue
        if not isinstance(children, list):
            continue
        for child in children:
            if isinstance(child, str):
                child_el = elements.get(child)
                if child_el is not None:
                    stack.append(child_el)
                continue
            if _is_ui_element(child):
                stack.append(child)
    return output


def _collect_action_warnings(
    app_spec: JSONValue,
    *,
    definition: AppDefinition,
) -> list[AppValidationIssue]:
    try:
        elements = _iter_app_elements(app_spec)
    except ValueError:
        return []

    warnings: list[AppValidationIssue] = []
    for element in elements:
        element_type = element.get("type")
        if element_type != "ActionButton":
            continue

        props = _resolve_element_props(element)
        binding = _resolve_binding_record(
            definition.dataBindings, _get_data_path(props)
        )

        action_name = _resolve_action_name(props, binding)
        if not action_name:
            continue

        definition_payload = definition.actions.get(action_name)
        action_type = _resolve_action_type(action_name, definition_payload)
        if action_type != "run":
            continue

        section_id = props.get("sectionId")
        if not (isinstance(section_id, str) and section_id.strip()):
            section_id = _resolve_binding_string(binding, "sectionId")
        if isinstance(section_id, str) and section_id.strip():
            continue

        key = element.get("key")
        warnings.append(
            AppValidationIssue(
                message="Run ActionButton is missing sectionId.",
                elementKey=key if isinstance(key, str) else None,
                elementType="ActionButton",
            )
        )

    return warnings

import re

from setta.app.catalog import APP_CATALOG_ID, APP_CATALOG_VERSION
from setta.app.spec_validation import (
    collect_app_action_definition_issues,
    collect_app_spec_validation_issues,
)
from setta.types.app_definition import AppDefinition
from setta.types.app_validation import AppCapabilities, AppValidationIssue
from setta.types.chat_messages import JSONValue

_EXTERNAL_HREF_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
_THEME_SCHEMA_VERSION = "v1"
_THEME_MODE_VALUES = {"light", "dark", "auto"}
_THEME_ALLOWED_KEYS = {
    "mode",
    "className",
    "colors",
    "fonts",
    "typography",
    "spacing",
    "vars",
    "motion",
}
_THEME_COLOR_KEYS = {
    "background",
    "surface",
    "surfaceAlt",
    "headerBackground",
    "headerText",
    "text",
    "muted",
    "border",
    "cardBackground",
    "cardBorder",
    "accent",
    "accentHover",
    "accentText",
}
_THEME_FONT_KEYS = {"body", "heading", "mono"}
_THEME_TYPOGRAPHY_KEYS = {
    "bodySize",
    "bodyLineHeight",
    "headingSizes",
    "headingLineHeight",
}
_THEME_HEADING_SIZE_KEYS = {"h1", "h2", "h3", "h4"}
_THEME_SPACING_KEYS = {
    "pagePaddingX",
    "pagePaddingY",
    "contentWidth",
    "cardPadding",
    "cardRadius",
    "stackGap",
}
_THEME_MOTION_KEYS = {"durationMs", "delayMs", "staggerMs", "easing"}


def build_app_capabilities(definition: AppDefinition) -> AppCapabilities:
    catalog_version = (
        APP_CATALOG_VERSION if definition.catalogId == APP_CATALOG_ID else ""
    )
    features = {
        "themeVars": True,
        "assets": True,
        "dimensionStrings": True,
        "dataBindingsJsonPointer": True,
        "responsive": True,
        "motion": True,
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

    errors.extend(collect_app_action_definition_issues(definition.actions))
    errors.extend(
        collect_app_spec_validation_issues(
            app_spec,
            catalog_id=definition.catalogId,
            action_definitions=definition.actions,
            data_bindings=definition.dataBindings,
        )
    )

    theme_errors, theme_warnings = collect_app_theme_validation_issues(definition.theme)
    errors.extend(theme_errors)
    warnings.extend(theme_warnings)
    warnings.extend(_validate_assets(definition.assets))
    warnings.extend(_collect_action_warnings(app_spec, definition=definition))

    return errors, warnings


def validate_app_theme_or_raise(theme: dict[str, JSONValue] | None) -> None:
    errors, _warnings = collect_app_theme_validation_issues(theme)
    if errors:
        raise ValueError(errors[0].message)


def _preview_sorted(values: list[str], *, limit: int = 6) -> tuple[str, str]:
    preview = ", ".join(values[:limit])
    suffix = " ..." if len(values) > limit else ""
    return preview, suffix


def collect_app_theme_validation_issues(
    theme: dict[str, JSONValue] | None,
) -> tuple[list[AppValidationIssue], list[AppValidationIssue]]:
    if theme is None:
        return [], []

    errors: list[AppValidationIssue] = []
    warnings: list[AppValidationIssue] = []

    unknown_keys = sorted(
        [key for key in theme.keys() if key not in _THEME_ALLOWED_KEYS]
    )
    if unknown_keys:
        preview, suffix = _preview_sorted(unknown_keys)
        warnings.append(
            AppValidationIssue(
                message=f"theme contains unknown keys and they will be ignored: {preview}{suffix}"
            )
        )

    mode = theme.get("mode")
    if mode is not None:
        if not isinstance(mode, str):
            errors.append(AppValidationIssue(message="theme.mode must be a string."))
        elif mode not in _THEME_MODE_VALUES:
            errors.append(
                AppValidationIssue(
                    message="theme.mode must be one of: light, dark, auto."
                )
            )

    class_name = theme.get("className")
    if class_name is not None and not isinstance(class_name, str):
        errors.append(AppValidationIssue(message="theme.className must be a string."))

    errors.extend(_validate_theme_colors(theme.get("colors"), warnings=warnings))
    errors.extend(_validate_theme_fonts(theme.get("fonts"), warnings=warnings))
    errors.extend(_validate_theme_typography(theme.get("typography"), warnings=warnings))
    errors.extend(_validate_theme_spacing(theme.get("spacing"), warnings=warnings))
    errors.extend(_validate_theme_vars(theme.get("vars"), warnings=warnings))
    errors.extend(_validate_theme_motion(theme.get("motion"), warnings=warnings))

    return errors, warnings


def _validate_theme_colors(
    raw: JSONValue | None,
    *,
    warnings: list[AppValidationIssue],
) -> list[AppValidationIssue]:
    if raw is None:
        return []
    if not isinstance(raw, dict):
        return [AppValidationIssue(message="theme.colors must be an object.")]

    errors: list[AppValidationIssue] = []
    has_variants = "light" in raw or "dark" in raw
    if has_variants:
        extra_variant_keys = sorted(
            [key for key in raw.keys() if key not in ("light", "dark")]
        )
        if extra_variant_keys:
            preview, suffix = _preview_sorted(extra_variant_keys)
            warnings.append(
                AppValidationIssue(
                    message=(
                        "theme.colors contains unknown keys and they will be ignored: "
                        f"{preview}{suffix}"
                    )
                )
            )
        for variant_name in ("light", "dark"):
            if variant_name not in raw:
                continue
            variant = raw.get(variant_name)
            if not isinstance(variant, dict):
                errors.append(
                    AppValidationIssue(
                        message=f"theme.colors.{variant_name} must be an object."
                    )
                )
                continue
            errors.extend(
                _validate_theme_color_map(
                    variant,
                    prefix=f"theme.colors.{variant_name}",
                    warnings=warnings,
                )
            )
        return errors

    errors.extend(_validate_theme_color_map(raw, prefix="theme.colors", warnings=warnings))
    return errors


def _validate_theme_color_map(
    raw: dict[str, JSONValue],
    *,
    prefix: str,
    warnings: list[AppValidationIssue],
) -> list[AppValidationIssue]:
    unknown = sorted([key for key in raw.keys() if key not in _THEME_COLOR_KEYS])
    if unknown:
        preview, suffix = _preview_sorted(unknown)
        warnings.append(
            AppValidationIssue(
                message=(
                    f"{prefix} contains unknown keys and they will be ignored: "
                    f"{preview}{suffix}"
                )
            )
        )

    errors: list[AppValidationIssue] = []
    for key in _THEME_COLOR_KEYS:
        if key not in raw:
            continue
        value = raw.get(key)
        if not isinstance(value, str):
            errors.append(
                AppValidationIssue(message=f"{prefix}.{key} must be a string.")
            )
    return errors


def _validate_theme_fonts(
    raw: JSONValue | None,
    *,
    warnings: list[AppValidationIssue],
) -> list[AppValidationIssue]:
    if raw is None:
        return []
    if not isinstance(raw, dict):
        return [AppValidationIssue(message="theme.fonts must be an object.")]

    unknown = sorted([key for key in raw.keys() if key not in _THEME_FONT_KEYS])
    if unknown:
        preview, suffix = _preview_sorted(unknown)
        warnings.append(
            AppValidationIssue(
                message=(
                    "theme.fonts contains unknown keys and they will be ignored: "
                    f"{preview}{suffix}"
                )
            )
        )

    errors: list[AppValidationIssue] = []
    for key in _THEME_FONT_KEYS:
        if key not in raw:
            continue
        value = raw.get(key)
        if not isinstance(value, str):
            errors.append(
                AppValidationIssue(message=f"theme.fonts.{key} must be a string.")
            )
    return errors


def _validate_theme_typography(
    raw: JSONValue | None,
    *,
    warnings: list[AppValidationIssue],
) -> list[AppValidationIssue]:
    if raw is None:
        return []
    if not isinstance(raw, dict):
        return [AppValidationIssue(message="theme.typography must be an object.")]

    unknown = sorted(
        [key for key in raw.keys() if key not in _THEME_TYPOGRAPHY_KEYS]
    )
    if unknown:
        preview, suffix = _preview_sorted(unknown)
        warnings.append(
            AppValidationIssue(
                message=(
                    "theme.typography contains unknown keys and they will be ignored: "
                    f"{preview}{suffix}"
                )
            )
        )

    errors: list[AppValidationIssue] = []
    for key in ("bodySize", "bodyLineHeight", "headingLineHeight"):
        if key not in raw:
            continue
        value = raw.get(key)
        if not isinstance(value, (int, float, str)):
            errors.append(
                AppValidationIssue(
                    message=f"theme.typography.{key} must be a number or string."
                )
            )

    if "headingSizes" in raw:
        heading_sizes = raw.get("headingSizes")
        if not isinstance(heading_sizes, dict):
            errors.append(
                AppValidationIssue(
                    message="theme.typography.headingSizes must be an object."
                )
            )
        else:
            heading_unknown = sorted(
                [
                    key
                    for key in heading_sizes.keys()
                    if key not in _THEME_HEADING_SIZE_KEYS
                ]
            )
            if heading_unknown:
                preview, suffix = _preview_sorted(heading_unknown)
                warnings.append(
                    AppValidationIssue(
                        message=(
                            "theme.typography.headingSizes contains unknown keys and they will be ignored: "
                            f"{preview}{suffix}"
                        )
                    )
                )
            for key in _THEME_HEADING_SIZE_KEYS:
                if key not in heading_sizes:
                    continue
                value = heading_sizes.get(key)
                if not isinstance(value, (int, float, str)):
                    errors.append(
                        AppValidationIssue(
                            message=(
                                f"theme.typography.headingSizes.{key} must be a number or string."
                            )
                        )
                    )

    return errors


def _validate_theme_spacing(
    raw: JSONValue | None,
    *,
    warnings: list[AppValidationIssue],
) -> list[AppValidationIssue]:
    if raw is None:
        return []
    if not isinstance(raw, dict):
        return [AppValidationIssue(message="theme.spacing must be an object.")]

    unknown = sorted([key for key in raw.keys() if key not in _THEME_SPACING_KEYS])
    if unknown:
        preview, suffix = _preview_sorted(unknown)
        warnings.append(
            AppValidationIssue(
                message=(
                    "theme.spacing contains unknown keys and they will be ignored: "
                    f"{preview}{suffix}"
                )
            )
        )

    errors: list[AppValidationIssue] = []
    for key in _THEME_SPACING_KEYS:
        if key not in raw:
            continue
        value = raw.get(key)
        if not isinstance(value, (int, float, str)):
            errors.append(
                AppValidationIssue(
                    message=f"theme.spacing.{key} must be a number or string."
                )
            )
    return errors


def _validate_theme_vars(
    raw: JSONValue | None,
    *,
    warnings: list[AppValidationIssue],
) -> list[AppValidationIssue]:
    if raw is None:
        return []
    if not isinstance(raw, dict):
        return [AppValidationIssue(message="theme.vars must be an object.")]

    invalid_namespace = sorted(
        [
            key
            for key in raw.keys()
            if not isinstance(key, str) or not key.startswith("--app-")
        ]
    )
    if invalid_namespace:
        invalid_sorted = sorted(
            [key for key in invalid_namespace if isinstance(key, str)]
        )
        preview, suffix = _preview_sorted(invalid_sorted)
        warnings.append(
            AppValidationIssue(
                message=(
                    "theme.vars contains keys that do not start with '--app-' and will be ignored: "
                    f"{preview}{suffix}"
                )
            )
        )

    for key, value in raw.items():
        if not isinstance(key, str) or not key.startswith("--app-"):
            continue
        if isinstance(value, str):
            continue
        if isinstance(value, (int, float)):
            continue
        warnings.append(
            AppValidationIssue(
                message=f"theme.vars {key} must be a string or number and will be ignored."
            )
        )
    return []


def _validate_theme_motion(
    raw: JSONValue | None,
    *,
    warnings: list[AppValidationIssue],
) -> list[AppValidationIssue]:
    if raw is None:
        return []
    if not isinstance(raw, dict):
        return [AppValidationIssue(message="theme.motion must be an object.")]

    unknown = sorted([key for key in raw.keys() if key not in _THEME_MOTION_KEYS])
    if unknown:
        preview, suffix = _preview_sorted(unknown)
        warnings.append(
            AppValidationIssue(
                message=(
                    "theme.motion contains unknown keys and they will be ignored: "
                    f"{preview}{suffix}"
                )
            )
        )

    errors: list[AppValidationIssue] = []
    for key in ("durationMs", "delayMs", "staggerMs"):
        if key not in raw:
            continue
        value = raw.get(key)
        if not isinstance(value, (int, float)):
            errors.append(
                AppValidationIssue(message=f"theme.motion.{key} must be a number.")
            )

    easing = raw.get("easing")
    if easing is not None and not isinstance(easing, str):
        errors.append(
            AppValidationIssue(message="theme.motion.easing must be a string.")
        )

    return errors


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

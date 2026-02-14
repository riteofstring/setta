from setta.app.definition_diagnostics import validate_app_definition_payload
from setta.types.app_definition import AppDefinition, AppRoute


# These tests validate backend app route validation behavior:
# - Normalization warnings (missing leading slash, trailing slash)
# - Duplicate path errors after normalization
# - rootKey existence checks against appSpec.elements
# - Missing route name warnings for navigation labels


def test_validate_app_definition_payload_reports_duplicate_route_paths() -> None:
    definition = AppDefinition(
        routes=[
            AppRoute(path="/alpha", name="Alpha", rootKey="root"),
            AppRoute(path="alpha/", name="Alpha 2", rootKey="root"),
        ]
    )
    app_spec = {
        "root": "root",
        "elements": {"root": {"key": "root", "type": "Stack"}},
    }

    errors, warnings = validate_app_definition_payload(app_spec, definition=definition)

    assert warnings
    assert any("not normalized" in issue.message for issue in warnings)
    assert errors
    assert any("Duplicate route path" in issue.message for issue in errors)


def test_validate_app_definition_payload_reports_missing_route_root_key() -> None:
    definition = AppDefinition(
        routes=[AppRoute(path="/", name="Home", rootKey="missing-root")]
    )
    app_spec = {
        "root": "root",
        "elements": {"root": {"key": "root", "type": "Stack"}},
    }

    errors, warnings = validate_app_definition_payload(app_spec, definition=definition)

    assert warnings == []
    assert errors
    assert any("not found in appSpec.elements" in issue.message for issue in errors)


def test_validate_app_definition_payload_warns_on_missing_route_name() -> None:
    definition = AppDefinition(routes=[AppRoute(path="/", rootKey="root")])
    app_spec = {
        "root": "root",
        "elements": {"root": {"key": "root", "type": "Stack"}},
    }

    errors, warnings = validate_app_definition_payload(app_spec, definition=definition)

    assert errors == []
    assert warnings
    assert any("routes[0].name is missing" in issue.message for issue in warnings)

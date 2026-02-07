import pytest

from setta.app.catalog import APP_CATALOG_ID
from setta.app.spec_validation import validate_app_spec


def _spec(elements: dict[str, dict], root_key: str = "root") -> dict:
    return {"root": root_key, "elements": elements}


def test_param_input_requires_binding() -> None:
    spec = _spec(
        {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": ["param"],
            },
            "param": {
                "key": "param",
                "type": "ParamInput",
                "props": {"label": "Missing"},
            },
        }
    )

    with pytest.raises(ValueError, match="ParamInput requires sectionId"):
        validate_app_spec(spec, catalog_id=APP_CATALOG_ID)


def test_param_input_allows_data_path_binding() -> None:
    spec = _spec(
        {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": ["param"],
            },
            "param": {
                "key": "param",
                "type": "ParamInput",
                "props": {"dataPath": "/params", "label": "Bound"},
            },
        }
    )
    data_bindings = {"params": {"sectionId": "section-1", "paramId": "param-1"}}

    validate_app_spec(
        spec,
        catalog_id=APP_CATALOG_ID,
        data_bindings=data_bindings,
    )


def test_multi_config_requires_scoped_elements() -> None:
    spec = _spec(
        {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": ["scope-a", "scope-b", "param"],
            },
            "scope-a": {
                "key": "scope-a",
                "type": "ConfigScope",
                "props": {"configId": "config-a"},
                "children": [
                    {
                        "key": "text-a",
                        "type": "Text",
                        "props": {"text": "Alpha"},
                    }
                ],
            },
            "scope-b": {
                "key": "scope-b",
                "type": "ConfigScope",
                "props": {"configId": "config-b"},
                "children": [
                    {
                        "key": "text-b",
                        "type": "Text",
                        "props": {"text": "Beta"},
                    }
                ],
            },
            "param": {
                "key": "param",
                "type": "ParamInput",
                "props": {
                    "sectionId": "section-1",
                    "paramId": "param-1",
                    "label": "Unscoped",
                },
            },
        }
    )

    with pytest.raises(ValueError, match="uses multiple configs"):
        validate_app_spec(spec, catalog_id=APP_CATALOG_ID)


def test_multi_config_all_scoped_ok() -> None:
    spec = _spec(
        {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": ["scope-a", "scope-b"],
            },
            "scope-a": {
                "key": "scope-a",
                "type": "ConfigScope",
                "props": {"configId": "config-a"},
                "children": [
                    {
                        "key": "param-a",
                        "type": "ParamInput",
                        "props": {
                            "sectionId": "section-a",
                            "paramId": "param-a",
                            "label": "A",
                        },
                    }
                ],
            },
            "scope-b": {
                "key": "scope-b",
                "type": "ConfigScope",
                "props": {"configId": "config-b"},
                "children": [
                    {
                        "key": "param-b",
                        "type": "ParamInput",
                        "props": {
                            "sectionId": "section-b",
                            "paramId": "param-b",
                            "label": "B",
                        },
                    }
                ],
            },
        }
    )

    validate_app_spec(spec, catalog_id=APP_CATALOG_ID)


def test_multiple_run_buttons_require_additional_action() -> None:
    spec = _spec(
        {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": ["run-a", "run-b"],
            },
            "run-a": {
                "key": "run-a",
                "type": "ActionButton",
                "props": {"label": "Run A", "action": "run"},
            },
            "run-b": {
                "key": "run-b",
                "type": "ActionButton",
                "props": {"label": "Run B", "action": "run"},
            },
        }
    )

    with pytest.raises(ValueError, match="only include one run action"):
        validate_app_spec(spec, catalog_id=APP_CATALOG_ID)


def test_multiple_run_buttons_allowed_with_run_action_definition() -> None:
    spec = _spec(
        {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": ["run-a", "run-b"],
            },
            "run-a": {
                "key": "run-a",
                "type": "ActionButton",
                "props": {"label": "Run A", "action": "run"},
            },
            "run-b": {
                "key": "run-b",
                "type": "ActionButton",
                "props": {"label": "Run B", "action": "runSecondary"},
            },
        }
    )
    action_definitions = {"runSecondary": {"type": "run"}}

    validate_app_spec(
        spec,
        catalog_id=APP_CATALOG_ID,
        action_definitions=action_definitions,
    )

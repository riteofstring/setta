import pytest

from setta.app.catalog import APP_CATALOG_ID
from setta.app.spec_validation import validate_app_spec


class TestAppSpecValidation:
    def test_rejects_param_input_without_binding(self) -> None:
        app_spec = {
            "root": {
                "key": "param",
                "type": "ParamInput",
                "props": {"label": "Missing"},
            },
            "elements": {},
        }

        with pytest.raises(ValueError, match="ParamInput requires sectionId and paramId"):
            validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_allows_param_input_binding_from_props(self) -> None:
        app_spec = {
            "root": {
                "key": "param",
                "type": "ParamInput",
                "props": {
                    "sectionId": "section-1",
                    "paramId": "param-1",
                    "label": "Bound",
                },
            },
            "elements": {},
        }

        validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_rejects_multi_config_without_scope(self) -> None:
        app_spec = {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": [
                    {
                        "key": "scope-a",
                        "type": "ConfigScope",
                        "props": {"configId": "config-a"},
                        "children": [
                            {
                                "key": "output-a",
                                "type": "TextOutput",
                                "props": {"sectionId": "section-a"},
                            }
                        ],
                    },
                    {
                        "key": "scope-b",
                        "type": "ConfigScope",
                        "props": {"configId": "config-b"},
                        "children": [
                            {
                                "key": "output-b",
                                "type": "TextOutput",
                                "props": {"sectionId": "section-b"},
                            }
                        ],
                    },
                    # Unscoped element should be rejected once multiple configs are used.
                    {
                        "key": "unscoped-output",
                        "type": "TextOutput",
                        "props": {"sectionId": "section-unscoped"},
                    },
                ],
            },
            "elements": {},
        }

        with pytest.raises(ValueError, match="multiple configs"):
            validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_allows_multi_config_when_scoped(self) -> None:
        app_spec = {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": [
                    {
                        "key": "scope-a",
                        "type": "ConfigScope",
                        "props": {"configId": "config-a"},
                        "children": [
                            {
                                "key": "output-a",
                                "type": "TextOutput",
                                "props": {"sectionId": "section-a"},
                            }
                        ],
                    },
                    {
                        "key": "scope-b",
                        "type": "ConfigScope",
                        "props": {"configId": "config-b"},
                        "children": [
                            {
                                "key": "output-b",
                                "type": "TextOutput",
                                "props": {"sectionId": "section-b"},
                            }
                        ],
                    },
                ],
            },
            "elements": {},
        }

        validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_rejects_multiple_run_buttons_without_multiple_run_actions(self) -> None:
        app_spec = {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": [
                    {
                        "key": "run-1",
                        "type": "ActionButton",
                        "props": {"label": "Run", "action": "run"},
                    },
                    {
                        "key": "run-2",
                        "type": "ActionButton",
                        "props": {"label": "Run again", "action": "run"},
                    },
                ],
            },
            "elements": {},
        }

        with pytest.raises(ValueError, match="only include one run action"):
            validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_allows_multiple_run_buttons_with_multiple_run_actions(self) -> None:
        app_spec = {
            "root": {
                "key": "root",
                "type": "Stack",
                "children": [
                    {
                        "key": "run-1",
                        "type": "ActionButton",
                        "props": {"label": "Run", "action": "run"},
                    },
                    {
                        "key": "run-2",
                        "type": "ActionButton",
                        "props": {"label": "Run extra", "action": "run2"},
                    },
                ],
            },
            "elements": {},
        }

        validate_app_spec(
            app_spec,
            catalog_id=APP_CATALOG_ID,
            action_definitions={"run2": {"type": "run"}},
        )

    def test_allows_param_binding_from_data_bindings(self) -> None:
        app_spec = {
            "root": {
                "key": "param",
                "type": "ParamInput",
                "props": {"dataPath": "/params/name"},
            },
            "elements": {},
        }
        bindings = {
            "params": {
                "name": {
                    "sectionId": "section-1",
                    "paramId": "param-1",
                }
            }
        }

        validate_app_spec(
            app_spec,
            catalog_id=APP_CATALOG_ID,
            data_bindings=bindings,
        )

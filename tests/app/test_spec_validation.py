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

        with pytest.raises(ValueError, match="missing required prop 'sectionId'"):
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

    def test_rejects_unknown_prop(self) -> None:
        app_spec = {
            "root": {
                "key": "root",
                "type": "Stack",
                "props": {"unknown": "nope"},
                "children": [],
            },
            "elements": {},
        }

        with pytest.raises(ValueError, match="unknown prop 'unknown'"):
            validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_rejects_childless_component_with_children(self) -> None:
        app_spec = {
            "root": {
                "key": "heading",
                "type": "Heading",
                "props": {"text": "Hello"},
                "children": [],
            },
            "elements": {},
        }

        with pytest.raises(ValueError, match="cannot have children"):
            validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_rejects_config_scope_without_config_id(self) -> None:
        app_spec = {
            "root": {
                "key": "scope",
                "type": "ConfigScope",
                "children": [],
            },
            "elements": {},
        }

        with pytest.raises(ValueError, match="missing required prop 'configId'"):
            validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_rejects_text_output_without_section_id(self) -> None:
        app_spec = {
            "root": {
                "key": "output",
                "type": "TextOutput",
                "props": {"label": "Result"},
            },
            "elements": {},
        }

        with pytest.raises(ValueError, match="missing required prop 'sectionId'"):
            validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

    def test_allows_text_output_binding_from_data_bindings(self) -> None:
        app_spec = {
            "root": {
                "key": "output",
                "type": "TextOutput",
                "props": {"dataPath": "/outputs/result"},
            },
            "elements": {},
        }
        bindings = {
            "outputs": {
                "result": {
                    "sectionId": "section-1",
                    "label": "From binding",
                }
            }
        }

        validate_app_spec(
            app_spec,
            catalog_id=APP_CATALOG_ID,
            data_bindings=bindings,
        )

    def test_allows_dimension_string_props(self) -> None:
        app_spec = {
            "root": {
                "key": "root",
                "type": "Stack",
                "props": {"gap": "clamp(8px, 2vw, 20px)"},
                "children": [
                    {
                        "key": "box",
                        "type": "Box",
                        "props": {"padding": "1.5rem", "radius": "12px"},
                        "children": [
                            {
                                "key": "spacer",
                                "type": "Spacer",
                                "props": {"size": "2rem", "axis": "y"},
                            }
                        ],
                    }
                ],
            },
            "elements": {},
        }

        validate_app_spec(app_spec, catalog_id=APP_CATALOG_ID)

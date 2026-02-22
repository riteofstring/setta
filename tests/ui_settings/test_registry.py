from types import SimpleNamespace

import pytest

from setta.plugins.models import PluginRegisteredUISetting
from setta.types.id import ID
from setta.ui_settings import registry as ui_settings_registry
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingHighlight,
    UISettingLocation,
    UISettingRuntimeEntry,
    UISettingValueSchema,
)


def _build_plugin_runtime_entry(
    *,
    setting_id: str,
    plugin_id: str,
) -> UISettingRuntimeEntry:
    return UISettingRuntimeEntry(
        metadata=UISettingEntry(
            settingId=setting_id,
            title="Plugin Setting",
            description="Plugin setting used by registry unit tests.",
            location=UISettingLocation(
                side="left",
                overviewTabKey=f"PluginPane:{plugin_id}:pane",
                pluginId=plugin_id,
                paneId="pane",
            ),
            highlight=UISettingHighlight(
                strategy="plugin_handler",
                pluginRevealKey="reveal",
            ),
            source="plugin",
            pluginId=plugin_id,
            mutability="writable",
            valueSchema=UISettingValueSchema(type="boolean"),
        ),
        readValue=lambda _ctx, _project_config_id: False,
        writeValue=lambda _ctx, _project_config_id, _value: None,
    )


def test_build_ui_settings_registry_isolates_plugin_id_collisions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin_id = "plugin-a"
    duplicate_setting_id = ui_settings_registry.build_plugin_setting_id(
        plugin_id=plugin_id,
        local_setting_id="enabled",
    )
    duplicate_entries = [
        _build_plugin_runtime_entry(
            setting_id=duplicate_setting_id,
            plugin_id=plugin_id,
        ),
        _build_plugin_runtime_entry(
            setting_id=duplicate_setting_id,
            plugin_id=plugin_id,
        ),
    ]

    def _fake_build_plugin_entries(*, ctx, project_config_id):
        assert ctx is not None
        assert isinstance(project_config_id, ID)
        return duplicate_entries, {}

    monkeypatch.setattr(
        ui_settings_registry,
        "_build_plugin_entries",
        _fake_build_plugin_entries,
    )

    # Duplicate plugin contributions should not crash global registry construction.
    registry = ui_settings_registry.build_ui_settings_registry(
        ctx=SimpleNamespace(),
        project_config_id=ID("project-1"),
    )

    # Exactly one entry should remain for the duplicate key, with a plugin-scoped error.
    assert registry.get(duplicate_setting_id) is not None
    assert plugin_id in registry.pluginErrorsByPluginId
    assert (
        "duplicated ui settingId: enabled" in registry.pluginErrorsByPluginId[plugin_id]
    )


def test_build_plugin_entries_reports_schema_backend_cross_source_duplicate() -> None:
    plugin_id = "plugin-a"
    schema_json = {
        "type": "object",
        "x-setta-ui-settings": [
            {
                "settingId": "enabled",
                "title": "Enabled",
                "description": "Enable plugin behavior.",
                "paneId": "pane",
                "revealKey": "reveal",
                "configPath": ["enabled"],
                "valueSchema": {"type": "boolean"},
                "defaultValue": False,
            }
        ],
    }
    backend_registration = PluginRegisteredUISetting(
        localSettingId="enabled",
        pluginId=plugin_id,
        title="Enabled (backend)",
        description="Conflicting backend registration.",
        synonyms=[],
        paneId="pane",
        revealKey="reveal",
        mutability="writable",
        valueSchema={"type": "boolean"},
        readHandlerId="read_enabled",
        writeHandlerId="write_enabled",
    )
    runtime_response = SimpleNamespace(
        status=SimpleNamespace(
            plugins=[
                SimpleNamespace(
                    pluginId=plugin_id,
                    state=SimpleNamespace(value="active"),
                )
            ]
        ),
        list=SimpleNamespace(
            plugins=[
                SimpleNamespace(
                    pluginId=plugin_id,
                    effectiveCapabilities=["registerPane"],
                    config=SimpleNamespace(schemaJson=schema_json),
                )
            ]
        ),
    )

    class _FakePluginManager:
        def get_runtime_response(self):
            return runtime_response

        def get_backend_ui_settings(self, *, plugin_id: str):
            assert plugin_id == "plugin-a"
            return [backend_registration]

    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(
            state=SimpleNamespace(plugin_manager=_FakePluginManager())
        )
    )

    # Cross-source duplicates should be isolated and reported without producing entries.
    entries, plugin_errors = ui_settings_registry._build_plugin_entries(
        ctx=ctx,
        project_config_id=ID("project-1"),
    )
    assert entries == []
    assert plugin_id in plugin_errors
    assert (
        "declared in both schema and backend registration" in plugin_errors[plugin_id]
    )


def test_core_entries_include_required_reveal_activation_metadata() -> None:
    entries = ui_settings_registry._build_core_entries()
    entries_by_setting_id = {entry.metadata.settingId: entry for entry in entries}

    # Accordion-backed core settings should always expose deterministic activation metadata.
    for (
        setting_id,
        (
            expected_step_type,
            expected_item_value,
        ),
    ) in (
        ui_settings_registry._REQUIRED_CORE_REVEAL_ACTIVATION_STEP_BY_SETTING_ID.items()
    ):
        assert setting_id in entries_by_setting_id
        activation_steps = entries_by_setting_id[
            setting_id
        ].metadata.revealActivationSteps
        assert any(
            step.type == expected_step_type and step.itemValue == expected_item_value
            for step in activation_steps
        )

from types import SimpleNamespace

import pytest

from setta.plugins.models import PluginRegisteredUISetting
from setta.types.id import ID
from setta.ui_settings import registry as ui_settings_registry
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingHighlight,
    UISettingLocation,
    UISettingMutationResult,
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
        writeValue=lambda _ctx, _project_config_id, _value, expected_old_value=None: (
            expected_old_value
        ),
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
        return duplicate_entries, ui_settings_registry.PluginUISettingErrorsByPluginId()

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
    assert (plugin_id, "enabled") in registry.pluginErrorsByPluginAndLocalSettingId


def test_build_ui_settings_registry_rejects_writable_entries_without_precondition_arg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    invalid_entry = UISettingRuntimeEntry(
        metadata=UISettingEntry(
            settingId="core.invalid_writer",
            title="Invalid Writer",
            description="Should require expected_old_value.",
            location=UISettingLocation(side="left", overviewTabKey="Overview"),
            highlight=UISettingHighlight(
                strategy="dom_anchor",
                anchorId="core.invalid_writer",
            ),
            source="core",
            mutability="writable",
            valueSchema=UISettingValueSchema(type="boolean"),
        ),
        readValue=lambda _ctx, _project_config_id: False,
        writeValue=lambda _ctx, _project_config_id, _value: UISettingMutationResult(
            oldValue=False,
            newValue=bool(_value),
            normalizedValue=bool(_value),
            changed=True,
        ),
    )

    monkeypatch.setattr(ui_settings_registry, "_build_core_entries", lambda: [])

    def _fake_build_plugin_entries(*, ctx, project_config_id):
        assert ctx is not None
        assert isinstance(project_config_id, ID)
        return [invalid_entry], {}

    monkeypatch.setattr(
        ui_settings_registry,
        "_build_plugin_entries",
        _fake_build_plugin_entries,
    )

    with pytest.raises(ValueError) as exc:
        ui_settings_registry.build_ui_settings_registry(
            ctx=SimpleNamespace(),
            project_config_id=ID("project-1"),
        )
    assert "core.invalid_writer writeValue must accept expected_old_value." in str(
        exc.value
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
    plugin_errors_by_setting = getattr(
        plugin_errors,
        "by_plugin_and_local_setting_id",
        {},
    )
    assert (plugin_id, "enabled") in plugin_errors_by_setting


def test_build_plugin_entries_accepts_pending_restart_status() -> None:
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
    runtime_response = SimpleNamespace(
        status=SimpleNamespace(
            plugins=[
                SimpleNamespace(
                    pluginId=plugin_id,
                    state=SimpleNamespace(value="pending_restart"),
                )
            ]
        ),
        list=SimpleNamespace(
            plugins=[
                SimpleNamespace(
                    pluginId=plugin_id,
                    effectiveCapabilities=["registerPane"],
                    config=SimpleNamespace(
                        schemaJson=schema_json,
                        currentConfig={"enabled": True},
                    ),
                )
            ]
        ),
    )

    class _FakePluginManager:
        def get_runtime_response(self):
            return runtime_response

        def get_backend_ui_settings(self, *, plugin_id: str):
            assert plugin_id == "plugin-a"
            return []

    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(
            state=SimpleNamespace(plugin_manager=_FakePluginManager())
        )
    )

    # pending_restart is operational and should stay visible/readable in registry paths.
    entries, plugin_errors = ui_settings_registry._build_plugin_entries(
        ctx=ctx,
        project_config_id=ID("project-1"),
    )
    assert len(entries) == 1
    assert plugin_errors == {}
    assert entries[0].metadata.settingId == f"plugin::{plugin_id}::enabled"
    assert entries[0].readValue(ctx, ID("project-1")) is True


def test_require_active_plugin_runtime_entry_accepts_shadowed_then_active_state_order() -> (
    None
):
    plugin_id = "plugin-a"
    plugin_entry = SimpleNamespace(
        pluginId=plugin_id,
        effectiveCapabilities=["registerPane"],
        config=SimpleNamespace(currentConfig={"enabled": True}),
    )
    runtime_response = SimpleNamespace(
        status=SimpleNamespace(
            plugins=[
                SimpleNamespace(
                    pluginId=plugin_id,
                    state=SimpleNamespace(value="shadowed"),
                ),
                SimpleNamespace(
                    pluginId=plugin_id,
                    state=SimpleNamespace(value="active"),
                ),
            ]
        ),
        list=SimpleNamespace(plugins=[plugin_entry]),
    )

    class _FakePluginManager:
        def get_runtime_response(self):
            return runtime_response

    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(
            state=SimpleNamespace(plugin_manager=_FakePluginManager())
        )
    )

    # Mixed shadowed+active rows should resolve to the active runtime entry.
    resolved = ui_settings_registry._require_active_plugin_runtime_entry(
        ctx=ctx,
        plugin_id=plugin_id,
    )
    assert resolved is plugin_entry


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


def test_read_plugin_config_path_value_raises_on_non_object_intermediate_node() -> None:
    with pytest.raises(ui_settings_registry.UISettingValidationError) as exc:
        ui_settings_registry._read_plugin_config_path_value(
            config={"settings": "invalid"},
            config_path=["settings", "enabled"],
            default_value=False,
            plugin_id="plugin-a",
        )
    assert exc.value.code == "mutation_failed"
    assert "non-object node at settings" in str(exc.value)


def test_read_plugin_config_path_value_returns_default_for_missing_leaf() -> None:
    value = ui_settings_registry._read_plugin_config_path_value(
        config={"settings": {}},
        config_path=["settings", "enabled"],
        default_value=False,
        plugin_id="plugin-a",
    )
    assert value is False


@pytest.mark.asyncio
async def test_plugin_write_value_validates_old_value_before_write() -> None:
    class PluginManagerState:
        def __init__(self) -> None:
            self.write_invocation_count = 0
            self.runtime_response = SimpleNamespace(
                status=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            state=SimpleNamespace(value="active"),
                        )
                    ]
                ),
                list=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            config=SimpleNamespace(
                                currentConfig={"enabled": "invalid-old-value"}
                            ),
                        )
                    ]
                ),
            )

        def get_runtime_response(self):
            return self.runtime_response

        def compare_and_write_plugin_config_path_value(
            self,
            *,
            plugin_id: str,
            setting_id: str,
            config_path: list[str],
            default_value: object,
            value: object,
            expected_old_value: object | None = None,
            validate_old_value=None,
        ) -> tuple[object, object]:
            assert plugin_id == "plugin-a"
            assert setting_id == "plugin::plugin-a::enabled"
            assert config_path == ["enabled"]
            current_config = self.runtime_response.list.plugins[0].config.currentConfig
            old_value = current_config.get("enabled", default_value)
            if expected_old_value is not None and expected_old_value != old_value:
                raise ui_settings_registry.PluginManagerError(
                    "PLUGIN_SCHEMA_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
                    (
                        f"UI setting {setting_id} changed since pre-write validation. "
                        "Retry with a fresh read before writing."
                    ),
                )
            if validate_old_value is not None:
                validate_old_value(old_value)
            self.write_invocation_count += 1
            next_config = dict(current_config)
            next_config["enabled"] = value
            self.runtime_response.list.plugins[0].config.currentConfig = next_config
            return old_value, next_config.get("enabled", default_value)

    plugin_manager = PluginManagerState()
    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(state=SimpleNamespace(plugin_manager=plugin_manager))
    )
    write_value = ui_settings_registry._build_plugin_write_value(
        setting_id="plugin::plugin-a::enabled",
        plugin_id="plugin-a",
        config_path=["enabled"],
        default_value=False,
        value_schema=UISettingValueSchema(type="boolean"),
    )

    with pytest.raises(ui_settings_registry.UISettingValidationError) as exc:
        await write_value(ctx, ID("project-1"), True)
    assert exc.value.code == "invalid_value_type"
    assert plugin_manager.write_invocation_count == 0
    assert (
        plugin_manager.runtime_response.list.plugins[0].config.currentConfig["enabled"]
        == "invalid-old-value"
    )


@pytest.mark.asyncio
async def test_plugin_backend_write_value_validates_old_value_before_write() -> None:
    class PluginManagerState:
        def __init__(self) -> None:
            self.backend_write_invocation_count = 0
            self.backend_enabled: object = "invalid-old-value"
            self.runtime_response = SimpleNamespace(
                status=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            state=SimpleNamespace(value="active"),
                        )
                    ]
                ),
                list=SimpleNamespace(
                    plugins=[SimpleNamespace(pluginId="plugin-a")],
                ),
            )

        def get_runtime_response(self):
            return self.runtime_response

        def compare_and_write_backend_ui_setting_value(
            self,
            *,
            plugin_id: str,
            setting_id: str,
            read_handler_id: str,
            write_handler_id: str,
            project_config_id: ID,
            value: object,
            expected_old_value: object | None = None,
            validate_old_value=None,
            validate_new_value=None,
        ) -> tuple[object, object]:
            assert plugin_id == "plugin-a"
            assert setting_id == "plugin::plugin-a::enabled"
            assert read_handler_id == "read-enabled"
            assert write_handler_id == "write-enabled"
            assert project_config_id == ID("project-1")
            if (
                expected_old_value is not None
                and expected_old_value != self.backend_enabled
            ):
                raise ui_settings_registry.PluginManagerError(
                    "PLUGIN_BACKEND_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
                    "mismatch",
                )
            old_value = self.backend_enabled
            if validate_old_value is not None:
                validate_old_value(old_value)
            self.backend_write_invocation_count += 1
            self.backend_enabled = value
            if validate_new_value is not None:
                validate_new_value(self.backend_enabled)
            return old_value, self.backend_enabled

    plugin_manager = PluginManagerState()
    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(state=SimpleNamespace(plugin_manager=plugin_manager))
    )
    write_value = ui_settings_registry._build_plugin_backend_write_value(
        setting_id="plugin::plugin-a::enabled",
        plugin_id="plugin-a",
        read_handler_id="read-enabled",
        write_handler_id="write-enabled",
        plugin_manager=plugin_manager,
        value_schema=UISettingValueSchema(type="boolean"),
    )

    with pytest.raises(ui_settings_registry.UISettingValidationError) as exc:
        await write_value(ctx, ID("project-1"), True)
    assert exc.value.code == "invalid_value_type"
    assert plugin_manager.backend_write_invocation_count == 0
    assert plugin_manager.backend_enabled == "invalid-old-value"


@pytest.mark.asyncio
async def test_plugin_write_value_rejects_non_object_root_without_mutation() -> None:
    class PluginManagerState:
        def __init__(self) -> None:
            self.write_invocation_count = 0
            self.runtime_response = SimpleNamespace(
                status=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            state=SimpleNamespace(value="active"),
                        )
                    ]
                ),
                list=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            config=SimpleNamespace(currentConfig="invalid-root"),
                        )
                    ]
                ),
            )

        def get_runtime_response(self):
            return self.runtime_response

        def compare_and_write_plugin_config_path_value(
            self,
            *,
            plugin_id: str,
            setting_id: str,
            config_path: list[str],
            default_value: object,
            value: object,
            expected_old_value: object | None = None,
            validate_old_value=None,
        ) -> tuple[object, object]:
            assert plugin_id == "plugin-a"
            assert setting_id == "plugin::plugin-a::enabled"
            assert config_path == ["enabled"]
            current_config = self.runtime_response.list.plugins[0].config.currentConfig
            if not isinstance(current_config, dict):
                raise ui_settings_registry.UISettingValidationError(
                    "mutation_failed",
                    f"Plugin {plugin_id} config root must be an object.",
                )
            old_value = current_config.get("enabled", default_value)
            if expected_old_value is not None and expected_old_value != old_value:
                raise ui_settings_registry.PluginManagerError(
                    "PLUGIN_SCHEMA_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
                    (
                        f"UI setting {setting_id} changed since pre-write validation. "
                        "Retry with a fresh read before writing."
                    ),
                )
            if validate_old_value is not None:
                validate_old_value(old_value)
            self.write_invocation_count += 1
            next_config = dict(current_config)
            next_config["enabled"] = value
            self.runtime_response.list.plugins[0].config.currentConfig = next_config
            return old_value, next_config.get("enabled", default_value)

    plugin_manager = PluginManagerState()
    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(state=SimpleNamespace(plugin_manager=plugin_manager))
    )
    write_value = ui_settings_registry._build_plugin_write_value(
        setting_id="plugin::plugin-a::enabled",
        plugin_id="plugin-a",
        config_path=["enabled"],
        default_value=False,
        value_schema=UISettingValueSchema(type="boolean"),
    )

    # Corrupt persisted config roots must fail fast and never write a repaired shape.
    with pytest.raises(ui_settings_registry.UISettingValidationError) as exc:
        await write_value(ctx, ID("project-1"), True)
    assert exc.value.code == "mutation_failed"
    assert "config root must be an object" in str(exc.value)
    assert plugin_manager.write_invocation_count == 0
    assert (
        plugin_manager.runtime_response.list.plugins[0].config.currentConfig
        == "invalid-root"
    )


@pytest.mark.asyncio
async def test_plugin_write_value_rejects_non_object_intermediate_path_without_mutation() -> (
    None
):
    class PluginManagerState:
        def __init__(self) -> None:
            self.write_invocation_count = 0
            self.runtime_response = SimpleNamespace(
                status=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            state=SimpleNamespace(value="active"),
                        )
                    ]
                ),
                list=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            config=SimpleNamespace(
                                currentConfig={"settings": "invalid-node"}
                            ),
                        )
                    ]
                ),
            )

        def get_runtime_response(self):
            return self.runtime_response

        def compare_and_write_plugin_config_path_value(
            self,
            *,
            plugin_id: str,
            setting_id: str,
            config_path: list[str],
            default_value: object,
            value: object,
            expected_old_value: object | None = None,
            validate_old_value=None,
        ) -> tuple[object, object]:
            assert plugin_id == "plugin-a"
            assert setting_id == "plugin::plugin-a::enabled"
            assert config_path == ["settings", "enabled"]
            current_config = self.runtime_response.list.plugins[0].config.currentConfig
            old_value_raw = current_config
            traversed_segments: list[str] = []
            for segment in config_path:
                if not isinstance(old_value_raw, dict):
                    mismatch_path = (
                        ".".join(traversed_segments)
                        if len(traversed_segments) > 0
                        else "<root>"
                    )
                    raise ui_settings_registry.UISettingValidationError(
                        "mutation_failed",
                        (
                            f"Plugin {plugin_id} config path {'.'.join(config_path)} "
                            f"contains a non-object node at {mismatch_path}."
                        ),
                    )
                if segment not in old_value_raw:
                    old_value_raw = default_value
                    break
                traversed_segments.append(segment)
                old_value_raw = old_value_raw[segment]
            old_value = old_value_raw
            if expected_old_value is not None and expected_old_value != old_value:
                raise ui_settings_registry.PluginManagerError(
                    "PLUGIN_SCHEMA_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
                    (
                        f"UI setting {setting_id} changed since pre-write validation. "
                        "Retry with a fresh read before writing."
                    ),
                )
            if validate_old_value is not None:
                validate_old_value(old_value)
            self.write_invocation_count += 1
            next_config = dict(current_config)
            nested_raw_value = next_config.get("settings")
            if nested_raw_value is None:
                nested_value: dict[str, object] = {}
                next_config["settings"] = nested_value
            elif not isinstance(nested_raw_value, dict):
                raise ui_settings_registry.UISettingValidationError(
                    "mutation_failed",
                    (
                        f"Plugin {plugin_id} config path {'.'.join(config_path)} "
                        "contains a non-object node at settings."
                    ),
                )
            else:
                nested_value = dict(nested_raw_value)
                next_config["settings"] = nested_value
            nested_value["enabled"] = value
            self.runtime_response.list.plugins[0].config.currentConfig = next_config
            return old_value, nested_value["enabled"]

    plugin_manager = PluginManagerState()
    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(state=SimpleNamespace(plugin_manager=plugin_manager))
    )
    write_value = ui_settings_registry._build_plugin_write_value(
        setting_id="plugin::plugin-a::enabled",
        plugin_id="plugin-a",
        config_path=["settings", "enabled"],
        default_value=False,
        value_schema=UISettingValueSchema(type="boolean"),
    )

    # Invalid intermediate nodes must fail without replacing nodes with implicit dicts.
    with pytest.raises(ui_settings_registry.UISettingValidationError) as exc:
        await write_value(ctx, ID("project-1"), True)
    assert exc.value.code == "mutation_failed"
    assert "non-object node at settings" in str(exc.value)
    assert plugin_manager.write_invocation_count == 0
    assert (
        plugin_manager.runtime_response.list.plugins[0].config.currentConfig["settings"]
        == "invalid-node"
    )


@pytest.mark.asyncio
async def test_plugin_schema_write_drift_errors_reference_canonical_setting_id() -> (
    None
):
    class PluginManagerState:
        def __init__(self) -> None:
            self.write_invocation_count = 0
            self.runtime_response = SimpleNamespace(
                status=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            state=SimpleNamespace(value="active"),
                        )
                    ]
                ),
                list=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            config=SimpleNamespace(
                                currentConfig={"settings": {"enabled": True}}
                            ),
                        )
                    ]
                ),
            )

        def get_runtime_response(self):
            return self.runtime_response

        def compare_and_write_plugin_config_path_value(
            self,
            *,
            plugin_id: str,
            setting_id: str,
            config_path: list[str],
            default_value: object,
            value: object,
            expected_old_value: object | None = None,
            validate_old_value=None,
        ) -> tuple[object, object]:
            assert plugin_id == "plugin-a"
            assert setting_id == "plugin::plugin-a::public_name"
            assert config_path == ["settings", "enabled"]
            current_config = self.runtime_response.list.plugins[0].config.currentConfig
            settings = current_config.get("settings", {})
            old_value = (
                settings.get("enabled", default_value)
                if isinstance(settings, dict)
                else default_value
            )
            if expected_old_value is not None and expected_old_value != old_value:
                raise ui_settings_registry.PluginManagerError(
                    "PLUGIN_SCHEMA_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
                    (
                        f"UI setting {setting_id} changed since pre-write validation. "
                        "Retry with a fresh read before writing."
                    ),
                )
            if validate_old_value is not None:
                validate_old_value(old_value)
            self.write_invocation_count += 1
            next_config = dict(current_config)
            next_settings = dict(settings) if isinstance(settings, dict) else {}
            next_settings["enabled"] = value
            next_config["settings"] = next_settings
            self.runtime_response.list.plugins[0].config.currentConfig = next_config
            return old_value, next_settings["enabled"]

    plugin_manager = PluginManagerState()
    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(state=SimpleNamespace(plugin_manager=plugin_manager))
    )
    write_value = ui_settings_registry._build_plugin_write_value(
        setting_id="plugin::plugin-a::public_name",
        plugin_id="plugin-a",
        config_path=["settings", "enabled"],
        default_value=False,
        value_schema=UISettingValueSchema(type="boolean"),
    )

    with pytest.raises(ui_settings_registry.UISettingValidationError) as exc:
        await write_value(
            ctx,
            ID("project-1"),
            True,
            expected_old_value=False,
        )
    assert exc.value.code == "mutation_failed"
    assert "UI setting plugin::plugin-a::public_name changed" in str(exc.value)
    assert "enabled changed since pre-write validation" not in str(exc.value)
    assert plugin_manager.write_invocation_count == 0


@pytest.mark.asyncio
async def test_plugin_backend_write_drift_errors_reference_canonical_setting_id() -> (
    None
):
    class PluginManagerState:
        def __init__(self) -> None:
            self.write_invocation_count = 0
            self.backend_value = True
            self.runtime_response = SimpleNamespace(
                status=SimpleNamespace(
                    plugins=[
                        SimpleNamespace(
                            pluginId="plugin-a",
                            state=SimpleNamespace(value="active"),
                        )
                    ]
                ),
                list=SimpleNamespace(plugins=[SimpleNamespace(pluginId="plugin-a")]),
            )

        def get_runtime_response(self):
            return self.runtime_response

        def compare_and_write_backend_ui_setting_value(
            self,
            *,
            plugin_id: str,
            setting_id: str,
            read_handler_id: str,
            write_handler_id: str,
            project_config_id: ID,
            value: object,
            expected_old_value: object | None = None,
            validate_old_value=None,
            validate_new_value=None,
        ) -> tuple[object, object]:
            assert plugin_id == "plugin-a"
            assert setting_id == "plugin::plugin-a::public_name"
            assert read_handler_id == "read-enabled"
            assert write_handler_id == "write-enabled"
            assert project_config_id == ID("project-1")
            old_value = self.backend_value
            if expected_old_value is not None and expected_old_value != old_value:
                raise ui_settings_registry.PluginManagerError(
                    "PLUGIN_BACKEND_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
                    (
                        "UI setting plugin::plugin-a::public_name changed since "
                        "pre-write validation. Retry with a fresh read before writing."
                    ),
                )
            if validate_old_value is not None:
                validate_old_value(old_value)
            self.write_invocation_count += 1
            self.backend_value = value
            if validate_new_value is not None:
                validate_new_value(self.backend_value)
            return old_value, self.backend_value

    plugin_manager = PluginManagerState()
    ctx = SimpleNamespace(
        fastmcp=SimpleNamespace(state=SimpleNamespace(plugin_manager=plugin_manager))
    )
    write_value = ui_settings_registry._build_plugin_backend_write_value(
        setting_id="plugin::plugin-a::public_name",
        plugin_id="plugin-a",
        read_handler_id="read-enabled",
        write_handler_id="write-enabled",
        plugin_manager=plugin_manager,
        value_schema=UISettingValueSchema(type="boolean"),
    )

    with pytest.raises(ui_settings_registry.UISettingValidationError) as exc:
        await write_value(
            ctx,
            ID("project-1"),
            False,
            expected_old_value=False,
        )
    assert exc.value.code == "mutation_failed"
    assert "UI setting plugin::plugin-a::public_name changed" in str(exc.value)
    assert "read-enabled changed since pre-write validation" not in str(exc.value)
    assert plugin_manager.write_invocation_count == 0

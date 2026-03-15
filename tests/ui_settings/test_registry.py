from types import SimpleNamespace

from setta.types.id import ID
from setta.ui_settings import registry as ui_settings_registry


def test_build_ui_settings_registry_builds_core_only_registry() -> None:
    # The legacy Python UI-setting registry now exposes only core settings.
    registry = ui_settings_registry.build_ui_settings_registry(
        ctx=SimpleNamespace(),
        project_config_id=ID("project-1"),
    )

    assert registry.pluginErrorsByPluginId == {}
    assert registry.pluginErrorsByPluginAndLocalSettingId == {}
    assert registry.knownPluginIds == set()
    assert registry.knownPluginAndLocalSettingIds == set()
    project_name_entry = registry.get("core.project.name")
    assert project_name_entry is not None
    assert project_name_entry.metadata.source == "core"


def test_core_entries_include_required_reveal_activation_metadata() -> None:
    # Core reveal metadata must stay intact for the remaining Python UI-setting tools.
    entries = ui_settings_registry._build_core_entries()
    entries_by_setting_id = {entry.metadata.settingId: entry for entry in entries}

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

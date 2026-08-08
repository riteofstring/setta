import sys

import pytest

from setta.agentic.external_adapters.opencode_sdk import OpenCodeSdkAdapter
from setta.agentic.external_adapters.plugin_process import (
    PluginProcessExternalAgentAdapter,
)
from setta.agentic.external_adapters.registry import ExternalAgentAdapterRegistry
from setta.types.external_agents import ExternalAgentRunMode, ExternalAgentToolType


def _build_plugin_adapter(
    *,
    adapter_id: str = "fixture-plugin:adapter",
    run_modes: set[ExternalAgentRunMode] | None = None,
) -> PluginProcessExternalAgentAdapter:
    return PluginProcessExternalAgentAdapter(
        adapter_id=adapter_id,
        name="Fixture Plugin Adapter",
        supported_run_modes=run_modes or {ExternalAgentRunMode.sdk},
        command=sys.executable,
        args=(),
        default_model=None,
    )


def test_registry_rejects_plugin_adapters_from_generic_register() -> None:
    # Plugin adapters must be registered by explicit plugin adapter id.
    registry = ExternalAgentAdapterRegistry()

    with pytest.raises(ValueError) as exc_info:
        registry.register(_build_plugin_adapter())
    assert "register_plugin_adapter" in str(exc_info.value)


def test_registry_plugin_registration_validates_id_tool_type_and_duplicates() -> None:
    # Plugin adapter registration should enforce id, plugin tool type, and uniqueness.
    registry = ExternalAgentAdapterRegistry()

    with pytest.raises(ValueError) as missing_id_error:
        registry.register_plugin_adapter("   ", _build_plugin_adapter())
    assert "id is required" in str(missing_id_error.value)

    with pytest.raises(TypeError) as wrong_tool_type_error:
        registry.register_plugin_adapter("fixture", OpenCodeSdkAdapter())
    assert "tool_type=ExternalAgentToolType.plugin" in str(wrong_tool_type_error.value)

    adapter = _build_plugin_adapter()
    registry.register_plugin_adapter("fixture-plugin:adapter", adapter)
    assert registry.get_plugin_adapter("fixture-plugin:adapter") is adapter

    with pytest.raises(ValueError) as duplicate_error:
        registry.register_plugin_adapter("fixture-plugin:adapter", adapter)
    assert "Duplicate plugin external agent adapter id" in str(duplicate_error.value)


def test_registry_plugin_lookup_requires_id_and_known_adapter() -> None:
    # Plugin lookups should require an adapter id and reject unknown ids.
    registry = ExternalAgentAdapterRegistry()
    adapter = _build_plugin_adapter()
    registry.register_plugin_adapter("fixture-plugin:adapter", adapter)

    with pytest.raises(KeyError) as missing_id_error:
        registry.lookup(
            ExternalAgentToolType.plugin,
            ExternalAgentRunMode.sdk,
            plugin_adapter_id=None,
        )
    assert "Missing plugin adapter id" in str(missing_id_error.value)

    with pytest.raises(KeyError) as unknown_id_error:
        registry.lookup(
            ExternalAgentToolType.plugin,
            ExternalAgentRunMode.sdk,
            plugin_adapter_id="fixture-plugin:missing",
        )
    assert "No adapter registered for plugin external tool" in str(
        unknown_id_error.value
    )


def test_registry_plugin_lookup_normalizes_whitespace_adapter_ids() -> None:
    # Lookup/get should trim adapter ids to avoid whitespace-only configuration failures.
    registry = ExternalAgentAdapterRegistry()
    adapter = _build_plugin_adapter()
    registry.register_plugin_adapter("fixture-plugin:adapter", adapter)

    assert registry.get_plugin_adapter(" fixture-plugin:adapter ") is adapter

    lookup_result = registry.lookup(
        ExternalAgentToolType.plugin,
        ExternalAgentRunMode.sdk,
        plugin_adapter_id=" fixture-plugin:adapter ",
    )
    assert lookup_result.adapter is adapter


def test_registry_lookup_enforces_run_mode_support() -> None:
    # Lookups should fail when requested run mode is unsupported by the adapter.
    registry = ExternalAgentAdapterRegistry()
    plugin_adapter = _build_plugin_adapter(run_modes={ExternalAgentRunMode.sdk})
    registry.register_plugin_adapter("fixture-plugin:adapter", plugin_adapter)

    with pytest.raises(ValueError) as plugin_mode_error:
        registry.lookup(
            ExternalAgentToolType.plugin,
            ExternalAgentRunMode.server,
            plugin_adapter_id="fixture-plugin:adapter",
        )
    assert "does not support run mode" in str(plugin_mode_error.value)

    registry.register(OpenCodeSdkAdapter())
    with pytest.raises(ValueError) as opencode_mode_error:
        registry.lookup(ExternalAgentToolType.opencode, ExternalAgentRunMode.app_server)
    assert "does not support run mode" in str(opencode_mode_error.value)

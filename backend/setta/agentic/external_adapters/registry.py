from dataclasses import dataclass

from setta.agentic.external_adapters.base import ExternalAgentAdapter
from setta.types.external_agents import ExternalAgentRunMode, ExternalAgentToolType


@dataclass(frozen=True)
class AdapterLookupResult:
    adapter: ExternalAgentAdapter
    run_mode: ExternalAgentRunMode


class ExternalAgentAdapterRegistry:
    def __init__(self, adapters: list[ExternalAgentAdapter] | None = None) -> None:
        self._adapters_by_tool: dict[ExternalAgentToolType, ExternalAgentAdapter] = {}
        self._plugin_adapters_by_id: dict[str, ExternalAgentAdapter] = {}
        if adapters:
            for adapter in adapters:
                self.register(adapter)

    def register(self, adapter: ExternalAgentAdapter) -> None:
        tool_type = getattr(adapter, "tool_type", None)
        if tool_type is None:
            raise ValueError("External agent adapter missing tool_type")
        if not isinstance(tool_type, ExternalAgentToolType):
            raise TypeError(
                "External agent adapter tool_type must be ExternalAgentToolType"
            )
        if tool_type == ExternalAgentToolType.plugin:
            raise ValueError(
                "Plugin adapters must be registered by adapter id via "
                "register_plugin_adapter()."
            )
        self._adapters_by_tool[tool_type] = adapter

    def register_plugin_adapter(
        self,
        adapter_id: str,
        adapter: ExternalAgentAdapter,
    ) -> None:
        normalized_adapter_id = adapter_id.strip()
        if normalized_adapter_id == "":
            raise ValueError("Plugin external agent adapter id is required")
        tool_type = getattr(adapter, "tool_type", None)
        if tool_type != ExternalAgentToolType.plugin:
            raise TypeError(
                "Plugin external agent adapters must use tool_type=ExternalAgentToolType.plugin"
            )
        if normalized_adapter_id in self._plugin_adapters_by_id:
            raise ValueError(
                f"Duplicate plugin external agent adapter id: {normalized_adapter_id}"
            )
        self._plugin_adapters_by_id[normalized_adapter_id] = adapter

    def get_plugin_adapter(self, adapter_id: str) -> ExternalAgentAdapter | None:
        return self._plugin_adapters_by_id.get(adapter_id)

    def lookup(
        self,
        tool_type: ExternalAgentToolType,
        run_mode: ExternalAgentRunMode,
        plugin_adapter_id: str | None = None,
    ) -> AdapterLookupResult:
        adapter: ExternalAgentAdapter | None
        if tool_type == ExternalAgentToolType.plugin:
            if not plugin_adapter_id:
                raise KeyError("Missing plugin adapter id for plugin external tool")
            adapter = self._plugin_adapters_by_id.get(plugin_adapter_id)
            if adapter is None:
                raise KeyError(
                    f"No adapter registered for plugin external tool {plugin_adapter_id}"
                )
        else:
            adapter = self._adapters_by_tool.get(tool_type)
            if adapter is None:
                raise KeyError(f"No adapter registered for external tool {tool_type}")
        if run_mode not in adapter.supported_run_modes:
            raise ValueError(
                f"Adapter for {tool_type} does not support run mode {run_mode}"
            )
        return AdapterLookupResult(adapter=adapter, run_mode=run_mode)

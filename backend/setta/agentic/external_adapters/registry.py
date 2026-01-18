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
        self._adapters_by_tool[tool_type] = adapter

    def lookup(
        self,
        tool_type: ExternalAgentToolType,
        run_mode: ExternalAgentRunMode,
    ) -> AdapterLookupResult:
        adapter = self._adapters_by_tool.get(tool_type)
        if adapter is None:
            raise KeyError(f"No adapter registered for external tool {tool_type}")
        if run_mode not in adapter.supported_run_modes:
            raise ValueError(
                f"Adapter for {tool_type} does not support run mode {run_mode}"
            )
        return AdapterLookupResult(adapter=adapter, run_mode=run_mode)

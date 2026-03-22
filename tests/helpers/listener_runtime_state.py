from dataclasses import dataclass

from setta.api.listener import ListenerDependencyMetadata
from setta.types.listener import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
)


@dataclass(slots=True)
class ListenerTestRuntimeState:
    dependency_metadata: ListenerDependencyMetadata
    dependency_catalog: ListenerDependencyCatalog | None = None
    dependency_graph: object | None = None


def build_listener_runtime_state_from_catalog(
    dependency_catalog: ListenerDependencyCatalog,
) -> ListenerTestRuntimeState:
    return ListenerTestRuntimeState(
        dependency_metadata=ListenerDependencyMetadata.from_catalog(dependency_catalog),
        dependency_catalog=dependency_catalog,
    )


def build_listener_runtime_state_from_entries(
    entries: list[ListenerDependencyCatalogEntry],
) -> ListenerTestRuntimeState:
    return build_listener_runtime_state_from_catalog(
        ListenerDependencyCatalog(entries=entries)
    )

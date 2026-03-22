from dataclasses import dataclass
from typing import TYPE_CHECKING

from setta.api.listener import ListenerDependencyMetadata
from setta.types.listener import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
)

if TYPE_CHECKING:
    from setta.code_gen.dependency_graph import DependencyGraph


@dataclass(slots=True)
class ListenerTestRuntimeState:
    dependency_metadata: ListenerDependencyMetadata
    dependency_catalog: ListenerDependencyCatalog | None = None
    dependency_graph: "DependencyGraph | None" = None


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

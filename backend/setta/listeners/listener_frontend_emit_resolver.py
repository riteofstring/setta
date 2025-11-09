from typing import Any, Mapping

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
    ParamNode,
    SectionNode,
)
from setta.types.dependency_value import (
    Base64DependencyValue,
    DependencyValueType,
    FileReadDependencyValue,
    LiteralDependencyValue,
)
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


class ListenerFrontendEmitResolverError(Exception):
    """Base class for listener emit translation errors."""


class UnknownListenerDependencyError(ListenerFrontendEmitResolverError):
    """Raised when a sanitized dependency name cannot be resolved."""

    def __init__(self, dependency_name: str) -> None:
        super().__init__(f"Unknown listener dependency: {dependency_name}")
        self.dependency_name = dependency_name


class UnsupportedListenerDependencyError(ListenerFrontendEmitResolverError):
    """Raised when a dependency cannot currently be emitted."""

    def __init__(self, dependency_name: str, reason: str) -> None:
        super().__init__(f"Unsupported listener dependency {dependency_name}: {reason}")
        self.dependency_name = dependency_name
        self.reason = reason


class InvalidListenerDependencyValueError(ListenerFrontendEmitResolverError):
    """Raised when a provided value cannot be coerced into the expected type."""

    def __init__(
        self,
        dependency_name: str,
        *,
        expected_type: DependencyValueType,
        actual_value: Any,
    ) -> None:
        super().__init__(
            f"Invalid value for dependency {dependency_name}: "
            f"expected {expected_type.value}, got {type(actual_value).__name__}"
        )
        self.dependency_name = dependency_name
        self.expected_type = expected_type
        self.actual_value = actual_value


class ListenerFrontendEmitResolver:
    """Translate sanitized dependency values into typed websocket payloads."""

    def __init__(self) -> None:
        self._cached_graphs: dict[str, DependencyGraph] = {}

    def resolve(
        self,
        *,
        project_state: ProjectStateSingleConfig,
        dependency_values: Mapping[str, Any],
        dependency_graph: DependencyGraph | None = None,
    ) -> list[ListenerFrontendEmitKeyAndValue]:
        if not dependency_values:
            raise ValueError("dependency_values must include at least one entry")

        graph = self._ensure_graph(project_state, dependency_graph)

        resolved: list[ListenerFrontendEmitKeyAndValue] = []
        for sanitized_name, raw_value in dependency_values.items():
            dep_key = graph.full_path_name_to_dep_key.get(sanitized_name)
            if dep_key is None:
                raise UnknownListenerDependencyError(sanitized_name)
            node = graph.graph.get(dep_key)
            if node is None:
                raise UnknownListenerDependencyError(sanitized_name)

            encoded_value = self._coerce_node_value(
                dependency_name=sanitized_name,
                node=node,
                raw_value=raw_value,
            )
            resolved.append(
                ListenerFrontendEmitKeyAndValue(
                    dependencyKey=dep_key,
                    value=encoded_value,
                )
            )

        return resolved

    def _ensure_graph(
        self,
        project_state: ProjectStateSingleConfig,
        dependency_graph: DependencyGraph | None,
    ) -> DependencyGraph:
        if dependency_graph is not None:
            project_id = project_state.projectConfig.id
            self._cached_graphs[project_id] = dependency_graph
            return dependency_graph

        project_id = project_state.projectConfig.id
        graph = self._cached_graphs.get(project_id)
        if graph is None:
            graph = DependencyGraph(project_state)
            self._cached_graphs[project_id] = graph
        return graph

    def _coerce_node_value(
        self,
        *,
        dependency_name: str,
        node: Node,
        raw_value: Any,
    ) -> BaseDependencyValueUnion:
        expected_type = self._infer_expected_value_type(
            dependency_name=dependency_name,
            node=node,
        )
        if expected_type is DependencyValueType.Base64:
            return self._coerce_base64(dependency_name, raw_value)
        if expected_type is DependencyValueType.FileRead:
            return self._coerce_file_read(dependency_name, raw_value)
        if expected_type is DependencyValueType.Literal:
            return self._coerce_literal(dependency_name, node, raw_value)

        raise UnsupportedListenerDependencyError(
            dependency_name,
            reason=f"unsupported value type {expected_type}",
        )

    def _infer_expected_value_type(
        self,
        *,
        dependency_name: str,
        node: Node,
    ) -> DependencyValueType:
        dependency_value = node.value
        if dependency_value is not None:
            return dependency_value.type

        if isinstance(node, SectionNode):
            section_type = node.type
            if section_type in (SectionType.Draw, SectionType.Image):
                return DependencyValueType.Base64
            if section_type in (SectionType.Callable, SectionType.TextBlock):
                return DependencyValueType.Literal

        raise UnsupportedListenerDependencyError(
            dependency_name,
            reason="dependency does not expose a writable value",
        )

    def _coerce_literal(
        self, dependency_name: str, node: Node, raw_value: Any
    ) -> LiteralDependencyValue:
        if not isinstance(raw_value, str):
            raise InvalidListenerDependencyValueError(
                dependency_name,
                expected_type=DependencyValueType.Literal,
                actual_value=raw_value,
            )

        if isinstance(node, (SectionNode, ParamNode)):
            return LiteralDependencyValue(raw_value)

        raise UnsupportedListenerDependencyError(
            dependency_name,
            reason="literal values are only supported for sections and params",
        )

    def _coerce_base64(
        self, dependency_name: str, raw_value: Any
    ) -> Base64DependencyValue:
        if not isinstance(raw_value, str):
            raise InvalidListenerDependencyValueError(
                dependency_name,
                expected_type=DependencyValueType.Base64,
                actual_value=raw_value,
            )
        return Base64DependencyValue(raw_value)

    def _coerce_file_read(
        self, dependency_name: str, raw_value: Any
    ) -> FileReadDependencyValue:
        if not isinstance(raw_value, str):
            raise InvalidListenerDependencyValueError(
                dependency_name,
                expected_type=DependencyValueType.FileRead,
                actual_value=raw_value,
            )
        return FileReadDependencyValue(raw_value)

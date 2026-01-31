from typing import Any, Iterable, Mapping

from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
    ParamNode,
    SectionNode,
)
from setta.project_state.artifacts import Artifacts
from setta.types.artifact import ArtifactType
from setta.types.binary_content import BinaryContentRef
from setta.types.dependency_value import (
    BinaryDependencyValue,
    DependencyValueType,
    FileReadDependencyValue,
    LiteralDependencyValue,
)
from setta.types.generated.dependency_values import BaseDependencyValueUnion
from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
from setta.types.listener import ListenerFrontendEmitKeyAndValue
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


class ListenerArtifactUpdateError(ListenerFrontendEmitResolverError):
    """Base class for listener artifact update errors."""


class InvalidListenerArtifactUpdateError(ListenerArtifactUpdateError):
    """Raised when an artifact update payload is invalid."""

    def __init__(self, path: str, message: str) -> None:
        super().__init__(f"Invalid artifact update for {path}: {message}")
        self.path = path
        self.message = message


class UnsupportedListenerArtifactUpdateError(ListenerArtifactUpdateError):
    """Raised when an artifact update cannot be applied."""

    def __init__(self, path: str, reason: str) -> None:
        super().__init__(f"Unsupported artifact update for {path}: {reason}")
        self.path = path
        self.reason = reason


class ListenerFrontendEmitResolver:
    """Translate sanitized dependency/artifact values into typed payloads."""

    def resolve(
        self,
        *,
        dependency_values: Mapping[str, Any],
        dependency_graph: DependencyGraph,
    ) -> list[ListenerFrontendEmitKeyAndValue]:
        resolved: list[ListenerFrontendEmitKeyAndValue] = []
        for sanitized_name, raw_value in dependency_values.items():
            dep_key = dependency_graph.full_path_name_to_dep_key.get(sanitized_name)
            if dep_key is None:
                raise UnknownListenerDependencyError(sanitized_name)
            node = dependency_graph.graph.get(dep_key)
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

    def resolve_artifact_updates(
        self,
        *,
        artifact_updates: Iterable[BaseArtifactUnionWithDiscriminator] | None = None,
        artifacts: Artifacts,
    ) -> list[BaseArtifactUnionWithDiscriminator]:
        if not artifact_updates:
            return []

        resolved: list[BaseArtifactUnionWithDiscriminator] = []
        for artifact in artifact_updates:
            normalized_path = self._normalize_artifact_path(artifact.id, artifacts)
            self._assert_artifact_type_supported(
                path=normalized_path,
                artifact_type=artifact.type,
                artifacts=artifacts,
            )
            normalized_payload = self._coerce_artifact_model(
                normalized_path,
                artifact,
            )
            resolved.append(normalized_payload)
        return resolved

    def _normalize_artifact_path(self, raw_path: str, artifacts: Artifacts) -> str:
        if not isinstance(raw_path, str):
            raise InvalidListenerArtifactUpdateError(
                path=str(raw_path),
                message="artifact path must be a string",
            )
        stripped = raw_path.strip()
        if not stripped:
            raise InvalidListenerArtifactUpdateError(
                path=raw_path,
                message="artifact path must be a non-empty string",
            )
        try:
            normalized = artifacts.normalize_artifact_id(stripped)
        except Exception as exc:
            raise InvalidListenerArtifactUpdateError(
                path=raw_path,
                message="failed to normalize artifact path",
            ) from exc
        return normalized

    def _coerce_artifact_model(
        self,
        normalized_path: str,
        artifact: BaseArtifactUnionWithDiscriminator,
    ) -> BaseArtifactUnionWithDiscriminator:
        if normalized_path != artifact.id:
            return artifact.model_copy(update={"id": normalized_path})
        return artifact

    def _assert_artifact_type_supported(
        self,
        *,
        path: str,
        artifact_type: ArtifactType,
        artifacts: Artifacts,
    ) -> None:
        try:
            cached = artifacts.get_cached_artifact_type(path)
        except ValueError as exc:
            raise UnsupportedListenerArtifactUpdateError(
                path,
                reason="artifact path resolves to multiple cached types",
            ) from exc

        if cached is None:
            return

        if cached is not artifact_type:
            raise UnsupportedListenerArtifactUpdateError(
                path,
                reason=(
                    f"expected type {cached.value} but received {artifact_type.value}"
                ),
            )

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
        if expected_type is DependencyValueType.Binary:
            return self._coerce_binary(dependency_name, raw_value)
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
                return DependencyValueType.Binary
            if section_type in (
                SectionType.Callable,
                SectionType.TextBlock,
                SectionType.Chat,
            ):
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

    def _coerce_binary(
        self, dependency_name: str, raw_value: Any
    ) -> BinaryDependencyValue:
        if isinstance(raw_value, BinaryContentRef):
            return BinaryDependencyValue(payload=raw_value)
        if not isinstance(raw_value, Mapping):
            raise InvalidListenerDependencyValueError(
                dependency_name,
                expected_type=DependencyValueType.Binary,
                actual_value=raw_value,
            )
        payload = BinaryContentRef(
            contentId=str(raw_value.get("contentId", "")),
            byteLength=int(raw_value.get("byteLength", 0)),
            mimeType=raw_value.get("mimeType"),
            sha256=raw_value.get("sha256"),
        )
        return BinaryDependencyValue(payload=payload)

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

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import (
    Any,
    Awaitable,
    Callable,
    Literal,
    Sequence,
    TYPE_CHECKING,
    get_args,
    get_origin,
)

from pydantic import BaseModel, Field, PrivateAttr

from setta.sessions.registry import SessionMetadata
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerForceRefreshEvent,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyEvent as SDKListenerDependencyEvent,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyEventEntry as SDKListenerDependencyEventEntry,
)
from setta.sdk_contracts.generated import (
    ListenerRealtimeDelta as SDKListenerRealtimeDelta,
)
from setta.sdk_contracts.generated import (
    ListenerRealtimeEvent as SDKListenerRealtimeEvent,
)
from setta.sdk_contracts.generated import (
    ListenerRegisterAckStatus as SDKListenerRegisterAckStatus,
)
from setta.types.generated.go_shared_types import (
    CodeObjType,
    CodeObjValueRepresentationMode,
    ListenerDependencyMode,
    ListenerErrorMessage,
    ListenerFrontendEmitMessage,
    ListenerInitMessage,
    ListenerMessageType,
    ListenerRegisterAckMessage,
    ListenerRouterEndpointCallMessage,
    ListenerRouterEndpointResultMessage,
    SectionRepresentationMode,
    SectionType,
)
from setta.types.generated.go_shared_constants import LOOPBACK_HOSTS
from setta.types.protocol import (
    BaseDependencyKeyUnion,
    SectionDependencyKey,
    SectionParamDependencyKey,
    create_dep_key,
)

if TYPE_CHECKING:
    from setta.api.listener_endpoint_client import RouterEndpointAPI
    from setta.api.listener import SettaListener
    from setta.types.id import ID

logger = logging.getLogger("setta.api.listener")
_MISSING = object()
_UNAVAILABLE = object()
ListenerSessionSecret = tuple["SessionMetadata", bytes]


def _literal_string_values(annotation: Any) -> tuple[str, ...]:
    if get_origin(annotation) is Literal:
        return tuple(value for value in get_args(annotation) if isinstance(value, str))
    values: list[str] = []
    for arg in get_args(annotation):
        values.extend(_literal_string_values(arg))
    return tuple(dict.fromkeys(values))


def _contract_literal_string_values(
    model: type[BaseModel], field_name: str
) -> tuple[str, ...]:
    field_info = model.model_fields.get(field_name)
    if field_info is None:
        raise RuntimeError(
            f"Generated listener contract {model.__name__}.{field_name} is missing"
        )
    literal_values = _literal_string_values(field_info.annotation)
    if not literal_values:
        raise RuntimeError(
            f"Generated listener contract {model.__name__}.{field_name} must use Literal values"
        )
    return literal_values


(
    _LISTENER_ACK_STATUS_ACCEPTED,
    _LISTENER_ACK_STATUS_REJECTED,
) = _contract_literal_string_values(SDKListenerRegisterAckStatus, "status")
(
    _LISTENER_SNAPSHOT_REFRESH_KIND_BOOTSTRAP,
    _LISTENER_SNAPSHOT_REFRESH_KIND_FORCE_REFRESH,
) = _contract_literal_string_values(ListenerForceRefreshEvent, "refreshKind")

_GENERATED_LISTENER_MESSAGE_MODELS: dict[str, type[BaseModel]] = {
    ListenerMessageType.ListenerError.value: ListenerErrorMessage,
    ListenerMessageType.ListenerFrontendEmit.value: ListenerFrontendEmitMessage,
    ListenerMessageType.ListenerInit.value: ListenerInitMessage,
    ListenerMessageType.ListenerRegisterAck.value: ListenerRegisterAckMessage,
    ListenerMessageType.ListenerRouterEndpointCall.value: ListenerRouterEndpointCallMessage,
    ListenerMessageType.ListenerRouterEndpointResult.value: ListenerRouterEndpointResultMessage,
}

FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE = (
    "frontendAffinityToken must be a non-empty string when provided."
)
ListenerSessionSecret = tuple[SessionMetadata, bytes]


def parse_frontend_affinity_token(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE)
    normalized = value.strip()
    if normalized == "":
        raise ValueError(FRONTEND_AFFINITY_TOKEN_ERROR_MESSAGE)
    return normalized


def _hosts_are_equivalent(left: str, right: str) -> bool:
    return left == right or {left, right} <= LOOPBACK_HOSTS


def _validate_generated_listener_message(raw_message: Any) -> BaseModel | None:
    if not isinstance(raw_message, dict):
        return None
    message_type = _normalize_listener_message_type(raw_message.get("messageType"))
    if message_type is None:
        return None
    model = _GENERATED_LISTENER_MESSAGE_MODELS.get(message_type)
    if model is None:
        return None
    return model.model_validate(raw_message)


def _normalize_listener_message_type(raw_type: Any) -> str | None:
    if isinstance(raw_type, ListenerMessageType):
        return raw_type.value
    if isinstance(raw_type, str):
        return raw_type
    return None


class ListenerRealtimeEventContent(SDKListenerRealtimeEvent):
    deltas: list["ListenerRealtimeDelta"] = Field(default_factory=list)


class DependencyEvent(SDKListenerDependencyEventEntry):
    _binary_payload: bytes | None = PrivateAttr(default=None)

    @property
    def binaryPayload(self) -> bytes | None:
        return self._binary_payload

    @binaryPayload.setter
    def binaryPayload(self, value: bytes | None) -> None:
        self._binary_payload = value


class ListenerDependencyEventContent(SDKListenerDependencyEvent):
    dependencyEvents: list[DependencyEvent] = Field(default_factory=list)


class ListenerRealtimeDelta(SDKListenerRealtimeDelta):
    _binary_payload: bytes | None = PrivateAttr(default=None)

    @property
    def binaryPayload(self) -> bytes | None:
        return self._binary_payload

    @binaryPayload.setter
    def binaryPayload(self, value: bytes | None) -> None:
        self._binary_payload = value


_CONTROL_LISTENER_MESSAGE_MODELS: dict[str, type[BaseModel]] = {
    ListenerMessageType.ListenerRealtimeEvent.value: ListenerRealtimeEventContent,
    ListenerMessageType.ListenerDependencyEvent.value: ListenerDependencyEventContent,
    ListenerMessageType.ListenerForceRefresh.value: ListenerForceRefreshEvent,
}


# Listener callbacks may either complete synchronously or return an awaitable.
ListenerCallback = Callable[[Any, Any], Awaitable[None] | None]
ListenerCallbackBuilder = Callable[["SettaListener"], None]


@dataclass(slots=True)
class ListenerCallbackSpec:
    function: ListenerCallback
    callback_id: str
    declared_dependencies: tuple["ListenerDependencySpec", ...]
    dependency_mode: ListenerDependencyMode
    debounce_ms: int | None
    throttle_ms: int | None
    run_on_refresh: bool
    structured_dependencies: tuple[BaseDependencyKeyUnion, ...] = ()
    dependency_names: tuple[str, ...] = ()
    logger: logging.Logger | None = None


@dataclass(slots=True)
class ListenerCallbackContext:
    changed: dict[str, Any]
    changed_by_id: dict["ListenerDependencyId", Any]
    events: list[DependencyEvent]
    log: logging.Logger
    emit_to_frontend: Callable[..., Awaitable[None]]
    project_manager: RouterEndpointAPI
    frontend_affinity_token: str | None
    ids: "ListenerDependencyIds"
    values: "ListenerDependencyValues"


@dataclass(slots=True)
class ListenerRuntimeState:
    dependency_metadata: "ListenerDependencyMetadata"
    dependency_catalog: ListenerDependencyCatalog


@dataclass(slots=True)
class ListenerRealtimeCacheUpdate:
    previous_cache: dict[str, Any]
    updated_cache: dict[str, Any]
    dirty_dependency_keys: set[BaseDependencyKeyUnion]


@dataclass(frozen=True, slots=True)
class ListenerParamIds:
    sectionId: "ID"
    paramInfoId: "ID"


@dataclass(frozen=True, slots=True)
class ListenerDependencyId:
    sectionId: "ID"
    paramInfoId: "ID | None" = None


@dataclass(frozen=True, slots=True)
class ListenerDependencyMetadataEntry:
    dependencyKey: BaseDependencyKeyUnion
    name: str
    fullPathName: str
    dependencies: tuple[BaseDependencyKeyUnion, ...] = ()
    sectionType: SectionType | None = None
    codeObjType: CodeObjType | None = None
    controlCodeObjId: "ID | None" = None
    controlCodeObjType: CodeObjType | None = None
    sectionRepresentation: SectionRepresentationMode | None = None
    controlValueRepresentation: CodeObjValueRepresentationMode | None = None
    valueRepresentation: CodeObjValueRepresentationMode | None = None


class ListenerDependencyMetadata:
    def __init__(self, entries: Sequence[ListenerDependencyMetadataEntry]) -> None:
        by_key: dict[BaseDependencyKeyUnion, ListenerDependencyMetadataEntry] = {}
        by_name: dict[str, ListenerDependencyMetadataEntry] = {}
        dependents_by_key: dict[
            BaseDependencyKeyUnion, list[BaseDependencyKeyUnion]
        ] = {}
        ordered_names: list[str] = []
        for entry in entries:
            by_key[entry.dependencyKey] = entry
            by_name[entry.fullPathName] = entry
            ordered_names.append(entry.fullPathName)
            for dependency_key in entry.dependencies:
                dependents_by_key.setdefault(dependency_key, []).append(
                    entry.dependencyKey
                )
        self._by_key = by_key
        self._by_name = by_name
        self._dependents_by_key = {
            dependency_key: tuple(dependents)
            for dependency_key, dependents in dependents_by_key.items()
        }
        self._ordered_names = tuple(ordered_names)

    @classmethod
    def from_catalog(
        cls,
        catalog: ListenerDependencyCatalog,
    ) -> "ListenerDependencyMetadata":
        return cls(
            [
                ListenerDependencyMetadataEntry(
                    dependencyKey=entry.dependencyKey,
                    name=entry.name,
                    fullPathName=entry.fullPathName,
                    dependencies=tuple(entry.dependencies),
                    sectionType=(
                        None
                        if entry.sectionType is None
                        else SectionType(entry.sectionType)
                    ),
                    codeObjType=(
                        None
                        if entry.codeObjType is None
                        else CodeObjType(entry.codeObjType)
                    ),
                    controlCodeObjId=entry.controlCodeObjId,
                    controlCodeObjType=(
                        None
                        if entry.controlCodeObjType is None
                        else CodeObjType(entry.controlCodeObjType)
                    ),
                    sectionRepresentation=(
                        None
                        if entry.sectionRepresentation is None
                        else SectionRepresentationMode(entry.sectionRepresentation)
                    ),
                    controlValueRepresentation=(
                        None
                        if entry.controlValueRepresentation is None
                        else CodeObjValueRepresentationMode(
                            entry.controlValueRepresentation
                        )
                    ),
                    valueRepresentation=(
                        None
                        if entry.valueRepresentation is None
                        else CodeObjValueRepresentationMode(entry.valueRepresentation)
                    ),
                )
                for entry in catalog.entries
            ]
        )

    def dependency_key(self, name: str) -> BaseDependencyKeyUnion:
        if not name:
            raise ValueError("dependency name must be non-empty")
        if name not in self._by_name:
            raise KeyError(f"Unknown dependency name: {name}")
        return self._by_name[name].dependencyKey

    def dependency_name(self, dep_key: BaseDependencyKeyUnion) -> str:
        if dep_key not in self._by_key:
            raise KeyError(f"Unknown dependency key: {dep_key!r}")
        return self._by_key[dep_key].fullPathName

    def entry_for_name(self, name: str) -> ListenerDependencyMetadataEntry:
        if name not in self._by_name:
            raise KeyError(f"Unknown dependency name: {name}")
        return self._by_name[name]

    def entry_for_key(
        self, dep_key: BaseDependencyKeyUnion
    ) -> ListenerDependencyMetadataEntry:
        if dep_key not in self._by_key:
            raise KeyError(f"Unknown dependency key: {dep_key!r}")
        return self._by_key[dep_key]

    def names(self) -> tuple[str, ...]:
        return self._ordered_names

    def dependents(
        self,
        dep_key: BaseDependencyKeyUnion,
    ) -> tuple[BaseDependencyKeyUnion, ...]:
        return self._dependents_by_key.get(dep_key, ())


class ListenerDependencyIds:
    def __init__(
        self,
        dependency_metadata: ListenerDependencyMetadata,
    ) -> None:
        self._dependency_metadata = dependency_metadata

    def dependency_key(self, name: str) -> BaseDependencyKeyUnion:
        return self._dependency_metadata.dependency_key(name)

    def section_id(self, dependency_name: str) -> "ID":
        dep_key = self.dependency_key(dependency_name)
        if not isinstance(dep_key, SectionDependencyKey):
            raise ValueError(
                f"Dependency {dependency_name!r} does not refer to a section"
            )
        return dep_key.sectionId

    def section_ids(self, dependency_names: list[str]) -> list["ID"]:
        return [self.section_id(name) for name in dependency_names]

    def param_ids(self, dependency_name: str) -> ListenerParamIds:
        dep_key = self.dependency_key(dependency_name)
        if not isinstance(dep_key, SectionParamDependencyKey):
            raise ValueError(
                f"Dependency {dependency_name!r} does not refer to a param"
            )
        return ListenerParamIds(
            sectionId=dep_key.sectionId,
            paramInfoId=dep_key.codeObjId,
        )

    def meta_control_param_ids(self, dependency_name: str) -> ListenerParamIds:
        entry = self._dependency_metadata.entry_for_name(dependency_name)
        dep_key = entry.dependencyKey
        if not isinstance(dep_key, SectionDependencyKey):
            raise ValueError(
                f"Dependency {dependency_name!r} does not refer to a section"
            )
        if entry.sectionType != SectionType.MetaControl:
            raise ValueError(
                f"Dependency {dependency_name!r} does not refer to a meta control section"
            )
        if entry.controlCodeObjId is None:
            raise KeyError(
                f"Meta control dependency {dependency_name!r} is missing control param metadata"
            )
        return ListenerParamIds(
            sectionId=dep_key.sectionId,
            paramInfoId=entry.controlCodeObjId,
        )

    def dependency_id(self, dependency_name: str) -> ListenerDependencyId:
        dep_key = self.dependency_key(dependency_name)
        if isinstance(dep_key, SectionParamDependencyKey):
            return ListenerDependencyId(
                sectionId=dep_key.sectionId,
                paramInfoId=dep_key.codeObjId,
            )
        return ListenerDependencyId(sectionId=dep_key.sectionId)

    def dependency_name(
        self, section_id: "ID", param_info_id: "ID | None" = None
    ) -> str:
        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_info_id)
        try:
            return self._dependency_metadata.dependency_name(dep_key)
        except KeyError as error:
            raise KeyError(
                f"Unknown dependency id: sectionId={section_id} paramInfoId={param_info_id}"
            ) from error


class ListenerDependencyValues:
    def __init__(
        self,
        dependency_metadata: ListenerDependencyMetadata | None = None,
        state: Any = _MISSING,
        *,
        dependency_metadata_resolver: Callable[[], ListenerDependencyMetadata | None]
        | None = None,
        value_resolver: Callable[[str], Any] | None = None,
        state_resolver: Callable[[], Any] | None = None,
    ) -> None:
        if dependency_metadata_resolver is not None and dependency_metadata is not None:
            raise ValueError(
                "ListenerDependencyValues accepts either dependency_metadata or dependency_metadata_resolver"
            )
        if dependency_metadata_resolver is None and dependency_metadata is None:
            raise ValueError(
                "ListenerDependencyValues requires dependency_metadata or dependency_metadata_resolver"
            )
        if state_resolver is not None and state is not _MISSING:
            raise ValueError(
                "ListenerDependencyValues accepts either state or state_resolver"
            )
        if state_resolver is None and state is _MISSING:
            raise ValueError(
                "ListenerDependencyValues requires state or state_resolver"
            )
        self._dependency_metadata = dependency_metadata
        self._dependency_metadata_resolver = dependency_metadata_resolver
        self._state = state
        self._value_resolver = value_resolver
        self._state_resolver = state_resolver

    def _require_dependency_metadata(self) -> ListenerDependencyMetadata:
        if self._dependency_metadata_resolver is not None:
            dependency_metadata = self._dependency_metadata_resolver()
        else:
            dependency_metadata = self._dependency_metadata
        if dependency_metadata is None:
            raise RuntimeError("Listener dependency metadata is unavailable")
        return dependency_metadata

    def _require_state(self) -> Any:
        if self._state_resolver is not None:
            state = self._state_resolver()
        else:
            state = self._state
        if state is _MISSING or state is None:
            raise RuntimeError("Listener runtime state is unavailable")
        return state

    def by_id(self, section_id: "ID", param_id: "ID | None" = None) -> Any:
        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        try:
            name = self._require_dependency_metadata().dependency_name(dep_key)
        except KeyError as error:
            raise KeyError(
                f"Unknown dependency id: sectionId={section_id} paramInfoId={param_id}"
            ) from error
        if self._value_resolver is not None:
            value = self._value_resolver(name)
            if value is not _MISSING:
                return value
        return getattr(self._require_state(), name)


class _ListenerCallbackStateView:
    def __init__(
        self,
        *,
        dependency_metadata_resolver: Callable[[], ListenerDependencyMetadata | None],
        value_resolver: Callable[[str], Any],
        log_identifier: str,
    ) -> None:
        self._dependency_metadata_resolver = dependency_metadata_resolver
        self._value_resolver = value_resolver
        self._log_identifier = log_identifier

    def _require_dependency_metadata(self) -> ListenerDependencyMetadata:
        dependency_metadata = self._dependency_metadata_resolver()
        if dependency_metadata is None:
            raise RuntimeError("Listener dependency metadata is unavailable")
        return dependency_metadata

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        dependency_metadata = self._require_dependency_metadata()
        try:
            dependency_metadata.dependency_key(name)
        except KeyError as error:
            raise AttributeError(
                f"{type(self).__name__!r} object has no attribute {name!r}"
            ) from error
        value = self._value_resolver(name)
        if value is _MISSING:
            raise RuntimeError(
                (
                    f"Listener {self._log_identifier} dependency {name!r} is "
                    "unavailable in the metadata-backed callback state"
                )
            )
        return value

    def __dir__(self) -> list[str]:
        base = set(super().__dir__())
        dependency_metadata = self._dependency_metadata_resolver()
        if dependency_metadata is None:
            return sorted(base)
        return sorted(base | set(dependency_metadata.names()))


ListenerDependencySpec = str | ListenerDependencyId | BaseDependencyKeyUnion


def dep_id(section_id: "ID", param_id: "ID | None" = None) -> ListenerDependencyId:
    return ListenerDependencyId(sectionId=section_id, paramInfoId=param_id)

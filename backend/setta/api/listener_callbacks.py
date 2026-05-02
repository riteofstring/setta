from __future__ import annotations

import asyncio
import json
import logging
from ast import literal_eval
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Iterable,
    Mapping,
    Sequence,
    cast,
)
from uuid import uuid4

from pydantic import BaseModel, ValidationError

from setta.api.listener_endpoint_client import (
    ROUTER_ENDPOINT_SET_CHAT_SECTION_STATE,
    RouterEndpointAPI,
)
from setta.sdk_contracts.generated import (
    ListenerFrontendEmitRequest,
    ListenerRegisterCallbackSpec,
    ListenerRegisterRequest,
)
from setta.types.artifact import BaseArtifactTypeAdapter, BaseArtifactUnion
from setta.types.generated.go_shared_types import (
    ListenerDependencyMode,
    ListenerFrontendEmitMessage,
    ListenerInitContent,
    ListenerInitMessage,
    ListenerMessageType,
    ListenerRouterEndpointCallContent,
    ListenerRouterEndpointCallMessage,
)
from setta.types.protocol import (
    BaseDependencyKeyUnion,
    SectionDependencyKey,
    SectionParamDependencyKey,
    create_dep_key,
)

from .listener_models import (
    _MISSING,
    DependencyEvent,
    ListenerCallback,
    ListenerCallbackBuilder,
    ListenerCallbackContext,
    ListenerCallbackSpec,
    ListenerDependencyId,
    ListenerDependencyIds,
    ListenerDependencyMetadata,
    ListenerDependencySpec,
    ListenerDependencyValues,
    ListenerRuntimeState,
    _ListenerCallbackStateView,
)

if TYPE_CHECKING:
    import websockets

    from setta.sdk_contracts.generated import (
        ListenerDependencyCatalog,
        ListenerRenderedDependencyValues,
    )
    from setta.types.id import ID

    from .listener import SettaListener
    from .scheduling import ListenerCallbackScheduler

logger = logging.getLogger("setta.api.listener")


class ListenerCallbackMixin:
    if TYPE_CHECKING:
        _callback_lock: asyncio.Lock
        _callbacks: dict[str, ListenerCallbackSpec]
        _dependency_cache: dict[str, Any]
        _expected_ack_callback_ids: set[str]
        _frontend_affinity_token: str | None
        _is_registered: bool
        _latest_dependency_catalog: ListenerDependencyCatalog | None
        _latest_dependency_metadata: ListenerDependencyMetadata | None
        _latest_dependency_snapshot_values: ListenerRenderedDependencyValues | None
        _log_identifier: str
        _pending_router_endpoint_calls: dict[str, asyncio.Future[Any]]
        _pending_router_endpoint_force_refreshes: dict[str, asyncio.Future[None]]
        _project_config_id: ID | None
        _project_name: str | None
        _registration_pending: bool
        _router_endpoint_api: RouterEndpointAPI | None
        _runtime_state: ListenerRuntimeState | None
        _scheduler: ListenerCallbackScheduler
        _send_lock: asyncio.Lock
        _use_temporary_ids: bool
        _websocket: websockets.ClientConnection | None

        def _build_dependency_cache_from_snapshot_values(
            self,
            dependency_values: ListenerRenderedDependencyValues | None,
            dependency_metadata: ListenerDependencyMetadata,
        ) -> tuple[dict[str, Any], set[BaseDependencyKeyUnion]]: ...

        def _build_refresh_changed_dependencies(
            self,
            dependencies: Sequence[str],
            updated_cache: dict[str, Any],
            previous_cache: dict[str, Any] | None,
        ) -> tuple[dict[str, Any], bool]: ...

        async def _invoke_callback(
            self,
            spec: ListenerCallbackSpec,
            state: Any,
            ctx: ListenerCallbackContext,
        ) -> None: ...

        def _require_outbound_project_id(self, *, action: str) -> ID: ...
        def _require_project_id(self) -> ID: ...
        def _require_runtime_state(self, *, action: str) -> ListenerRuntimeState: ...

    def listen(
        self,
        *,
        deps: Iterable[ListenerDependencySpec] | None = None,
        dependency_mode: ListenerDependencyMode | str | None = None,
        debounce_ms: int | None = None,
        throttle_ms: int | None = None,
        run_on_refresh: bool = False,
    ) -> Callable[[ListenerCallback], ListenerCallback]:
        def decorator(func: ListenerCallback) -> ListenerCallback:
            deps_provided = deps is not None
            dependencies = tuple(deps) if deps is not None else ()
            if dependency_mode is None:
                if deps_provided:
                    normalized_mode = ListenerDependencyMode.always
                else:
                    normalized_mode = ListenerDependencyMode.refresh_only
            else:
                try:
                    normalized_mode = ListenerDependencyMode(dependency_mode)
                except ValueError as error:
                    choices = ", ".join(
                        member.value for member in ListenerDependencyMode
                    )
                    raise ValueError(
                        f"Unknown dependency mode {dependency_mode!r}. Expected one of: {choices}"
                    ) from error
                if (
                    not deps_provided
                    and normalized_mode is not ListenerDependencyMode.refresh_only
                ):
                    raise ValueError(
                        "Listener dependency_mode requires deps (use deps=[] for all dependencies)"
                    )
            callback_id = uuid4().hex
            spec = ListenerCallbackSpec(
                function=func,
                callback_id=callback_id,
                declared_dependencies=dependencies,
                dependency_mode=normalized_mode,
                debounce_ms=debounce_ms,
                throttle_ms=throttle_ms,
                run_on_refresh=run_on_refresh,
            )
            spec.logger = logger.getChild(f"callback.{callback_id}")
            self._callbacks[callback_id] = spec
            self._register_scheduler_callback(spec)
            return func

        return decorator

    def clear_callbacks(self) -> None:
        """Remove every registered callback and scheduler entry."""
        if not self._callbacks:
            return
        for callback_id in list(self._callbacks.keys()):
            self._remove_callback(callback_id)

    def _remove_callback(self, callback_id: str) -> None:
        """Drop a single callback and its scheduler registration."""
        spec = self._callbacks.pop(callback_id, None)
        if spec is None:
            return
        self._scheduler.unregister_callback(callback_id)

    async def reload_callbacks(
        self,
        builder: ListenerCallbackBuilder,
        *,
        trigger_refresh: bool = True,
    ) -> None:
        async with self._callback_lock:
            previous_callbacks = dict(self._callbacks)
            previous_is_registered = self._is_registered
            previous_registration_pending = self._registration_pending
            previous_expected_ids = set(self._expected_ack_callback_ids)
            try:
                self.clear_callbacks()
                builder(cast("SettaListener", self))
                self._is_registered = False
                self._registration_pending = False
                self._expected_ack_callback_ids = set()
                await self._send_listener_register()
                if trigger_refresh:
                    await self._replay_cached_snapshot()
            except Exception:
                self.clear_callbacks()
                for spec in previous_callbacks.values():
                    self._callbacks[spec.callback_id] = spec
                    self._register_scheduler_callback(spec)
                self._is_registered = previous_is_registered
                self._registration_pending = previous_registration_pending
                self._expected_ack_callback_ids = previous_expected_ids
                raise

    def _refresh_callback_dependency_metadata(
        self, dependency_metadata: ListenerDependencyMetadata
    ) -> None:
        for spec in self._callbacks.values():
            spec.structured_dependencies = (
                self._resolve_callback_structured_dependencies(
                    spec,
                    dependency_metadata,
                )
            )
            if not spec.structured_dependencies:
                spec.dependency_names = ()
                continue
            spec.dependency_names = self._resolve_callback_dependency_names(
                spec.structured_dependencies,
                dependency_metadata,
            )

    def _resolve_callback_structured_dependencies(
        self,
        spec: ListenerCallbackSpec,
        dependency_metadata: ListenerDependencyMetadata,
    ) -> tuple[BaseDependencyKeyUnion, ...]:
        if not spec.declared_dependencies or spec.structured_dependencies:
            return spec.structured_dependencies
        structured = [
            self._resolve_callback_dependency_key(dependency, dependency_metadata)
            for dependency in spec.declared_dependencies
        ]
        return tuple(structured)

    def _resolve_callback_dependency_key(
        self,
        dependency: str | ListenerDependencyId | BaseDependencyKeyUnion,
        dependency_metadata: ListenerDependencyMetadata,
    ) -> BaseDependencyKeyUnion:
        if isinstance(dependency, ListenerDependencyId):
            dep_key = create_dep_key(
                sectionId=dependency.sectionId,
                codeObjId=dependency.paramInfoId,
            )
        elif isinstance(dependency, (SectionDependencyKey, SectionParamDependencyKey)):
            dep_key = dependency
        elif isinstance(dependency, str):
            try:
                dep_key = dependency_metadata.dependency_key(dependency)
            except KeyError as error:
                raise KeyError(
                    f"Unknown listener dependency {dependency!r} for project {self._log_identifier}"
                ) from error
        else:
            raise TypeError(
                "Listener dependencies must be a name, dependency id, or dependency key"
            )
        try:
            dependency_metadata.entry_for_key(dep_key)
        except KeyError as error:
            raise KeyError(
                f"Unknown listener dependency key {dep_key!r} for project {self._log_identifier}"
            ) from error
        return dep_key

    def _resolve_callback_dependency_names(
        self,
        structured_dependencies: Sequence[BaseDependencyKeyUnion],
        dependency_metadata: ListenerDependencyMetadata,
    ) -> tuple[str, ...]:
        names: list[str] = []
        for dep_key in structured_dependencies:
            try:
                names.append(dependency_metadata.dependency_name(dep_key))
            except KeyError as error:
                raise KeyError(
                    f"Unknown listener dependency key {dep_key!r} for project {self._log_identifier}"
                ) from error
        return tuple(names)

    async def _send_bootstrap_init(self) -> None:
        """Send an initial bootstrap handshake to identify the target project."""
        if self._project_config_id is None and self._project_name is None:
            raise ValueError(
                "Listener bootstrap init requires either projectConfigId or projectName"
            )
        message = ListenerInitMessage(
            messageType=ListenerMessageType.ListenerInit,
            content=ListenerInitContent(
                projectConfigId=self._project_config_id or "",
                projectName=self._project_name or "",
                useTemporaryIds=self._use_temporary_ids,
            ),
        )
        payload = message.model_dump_json()
        logger.debug("Listener %s sending bootstrap init", self._log_identifier)
        try:
            await self._send_websocket_payload(payload)
        except Exception:
            logger.exception(
                "Listener %s failed to send bootstrap init", self._log_identifier
            )
            raise

    async def _send_listener_register(self) -> None:
        """Send the full callback registration after bootstrap completes."""
        runtime_state = self._runtime_state
        if runtime_state is None:
            logger.debug(
                "Listener %s skipping register because runtime state is unavailable",
                self._log_identifier,
            )
            return
        self._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
        callbacks: dict[str, ListenerRegisterCallbackSpec] = {}
        for spec in self._callbacks.values():
            callbacks[spec.callback_id] = ListenerRegisterCallbackSpec(
                dependencies=list(spec.structured_dependencies),
                dependencyMode=spec.dependency_mode.value,
                debounceMs=spec.debounce_ms,
                throttleMs=spec.throttle_ms,
                runOnRefresh=spec.run_on_refresh,
            )
        content = ListenerRegisterRequest(
            projectConfigId=self._require_project_id(), callbacks=callbacks
        )
        payload = json.dumps(
            {
                "messageType": ListenerMessageType.ListenerRegister.value,
                "content": content.model_dump(mode="json"),
            }
        )
        logger.debug(
            "Listener %s registering %d callbacks",
            self._log_identifier,
            len(content.callbacks),
        )
        self._registration_pending = True
        self._is_registered = False
        self._expected_ack_callback_ids = set(content.callbacks.keys())
        try:
            await self._send_websocket_payload(payload)
        except Exception:
            self._registration_pending = False
            logger.exception(
                "Listener %s failed to send register payload", self._log_identifier
            )
            raise

    def _serialize_frontend_emit_artifact_updates(
        self,
        artifact_updates: Sequence[BaseArtifactUnion | Mapping[str, Any]] | None,
    ) -> list[BaseArtifactUnion]:
        serialized_artifact_updates: list[BaseArtifactUnion] = []
        if artifact_updates is None:
            return serialized_artifact_updates
        for artifact in artifact_updates:
            try:
                serialized_artifact_updates.append(
                    BaseArtifactTypeAdapter.validate_python(artifact)
                )
            except ValidationError as exc:
                raise ValueError(
                    "artifact_updates entries must match the BaseArtifact schema"
                ) from exc
        return serialized_artifact_updates

    def _build_frontend_emit_message(
        self,
        *,
        project_config_id: str,
        dependency_values: Mapping[str, Any],
        artifact_updates: Sequence[BaseArtifactUnion],
    ) -> ListenerFrontendEmitMessage:
        return ListenerFrontendEmitMessage(
            messageType=ListenerMessageType.ListenerFrontendEmit,
            content=ListenerFrontendEmitRequest(
                projectConfigId=project_config_id,
                dependencyValues=dict(dependency_values),
                artifactUpdates=list(artifact_updates),
            ).model_dump(mode="python"),
        )

    async def emit_to_frontend(
        self,
        *,
        dependency_values: Mapping[str, Any] | None = None,
        artifact_updates: Sequence[BaseArtifactUnion | Mapping[str, Any]] | None = None,
    ) -> None:
        project_config_id = self._require_outbound_project_id(action="emitting")
        serialized_values = dict(dependency_values or {})
        serialized_artifact_updates = self._serialize_frontend_emit_artifact_updates(
            artifact_updates
        )
        if not serialized_values and not serialized_artifact_updates:
            raise ValueError(
                "emit_to_frontend requires at least one dependency value or artifact update"
            )
        message = self._build_frontend_emit_message(
            project_config_id=project_config_id,
            dependency_values=serialized_values,
            artifact_updates=serialized_artifact_updates,
        )
        logger.debug(
            "Listener %s emitting dependency overrides %s and artifact updates %s",
            self._log_identifier,
            ", ".join(serialized_values.keys()) or "-",
            ", ".join(artifact.id for artifact in serialized_artifact_updates) or "-",
        )
        await self._send_websocket_payload(message.model_dump_json())

    def _serialize_router_endpoint_payload(
        self,
        payload: object | None = None,
    ) -> dict[str, object]:
        if payload is None:
            return {}
        if isinstance(payload, BaseModel):
            return payload.model_dump()
        if isinstance(payload, dict):
            return {str(key): value for key, value in payload.items()}
        raise ValueError("router endpoint payload must be a dict or pydantic model")

    def _start_router_endpoint_call(
        self,
        endpoint_name: str,
    ) -> tuple[str, asyncio.Future[Any], asyncio.Future[None] | None]:
        loop = asyncio.get_running_loop()
        call_id = uuid4().hex
        future: asyncio.Future[Any] = loop.create_future()
        self._pending_router_endpoint_calls[call_id] = future
        refresh_future: asyncio.Future[None] | None = None
        if endpoint_name == ROUTER_ENDPOINT_SET_CHAT_SECTION_STATE:
            refresh_future = loop.create_future()
            self._pending_router_endpoint_force_refreshes[call_id] = refresh_future
        return call_id, future, refresh_future

    async def _call_router_endpoint(
        self,
        endpoint_name: str,
        payload: object | None = None,
    ) -> object:
        project_config_id = self._require_outbound_project_id(
            action="calling router endpoints"
        )
        if not endpoint_name:
            raise ValueError("router endpoint call requires a non-empty endpoint name")
        call_id, future, refresh_future = self._start_router_endpoint_call(
            endpoint_name
        )
        serialized_payload = self._serialize_router_endpoint_payload(payload)
        message = ListenerRouterEndpointCallMessage(
            messageType=ListenerMessageType.ListenerRouterEndpointCall,
            content=ListenerRouterEndpointCallContent(
                projectConfigId=project_config_id,
                callId=call_id,
                endpointName=endpoint_name,
                payload=serialized_payload,
            ),
        )
        logger.debug(
            "Listener %s calling router endpoint %s (callId=%s)",
            self._log_identifier,
            endpoint_name,
            call_id,
        )
        try:
            await self._send_websocket_payload(message.model_dump_json())
            result = await future
            if refresh_future is not None:
                await refresh_future
        finally:
            self._pending_router_endpoint_calls.pop(call_id, None)
            if refresh_future is not None:
                self._pending_router_endpoint_force_refreshes.pop(call_id, None)
        return result

    def _evaluate_expression(
        self,
        *,
        dependency: str,
        expression: str | None,
    ) -> Any:
        if not expression:
            raise ValueError(
                f"Listener {self._log_identifier} missing expression for dependency {dependency}"
            )

        try:
            return literal_eval(expression)
        except Exception as error:
            logger.error(
                "Listener %s failed to evaluate expression for %s: %s",
                self._log_identifier,
                dependency,
                error,
            )
            raise

    def _register_scheduler_callback(self, spec: ListenerCallbackSpec) -> None:
        async def executor(
            changed: dict[str, Any], events: list[DependencyEvent]
        ) -> None:
            runtime_state = self._runtime_state
            if runtime_state is None:
                return
            state = self._build_callback_state(runtime_state)
            ctx = self._build_callback_context(spec, changed, events)
            await self._invoke_callback(spec, state, ctx)

        try:
            self._scheduler.register_callback(
                spec.callback_id,
                executor=executor,
                debounce_ms=spec.debounce_ms,
                throttle_ms=spec.throttle_ms,
            )
        except ValueError:
            # Re-registering should overwrite prior scheduling state.
            self._scheduler.unregister_callback(spec.callback_id)
            self._scheduler.register_callback(
                spec.callback_id,
                executor=executor,
                debounce_ms=spec.debounce_ms,
                throttle_ms=spec.throttle_ms,
            )

    def _callback_logger(self, spec: ListenerCallbackSpec) -> logging.Logger:
        spec_logger = spec.logger
        if spec_logger is None:
            spec_logger = logger.getChild(f"callback.{spec.callback_id}")
            spec.logger = spec_logger
        return spec_logger

    def _callback_project_manager(self) -> RouterEndpointAPI:
        if self._router_endpoint_api is None:
            self._router_endpoint_api = RouterEndpointAPI(self._call_router_endpoint)
        return self._router_endpoint_api

    def _current_dependency_metadata(self) -> ListenerDependencyMetadata | None:
        runtime_state = self._runtime_state
        if runtime_state is None:
            return None
        return runtime_state.dependency_metadata

    def _current_callback_state(self) -> Any | None:
        runtime_state = self._runtime_state
        if runtime_state is None:
            return None
        return self._build_callback_state(runtime_state)

    def _current_dependency_value(self, dependency_name: str) -> Any:
        return self._dependency_cache.get(dependency_name, _MISSING)

    def _build_listener_dependency_values(self) -> ListenerDependencyValues:
        return ListenerDependencyValues(
            dependency_metadata_resolver=self._current_dependency_metadata,
            value_resolver=self._current_dependency_value,
            state_resolver=self._current_callback_state,
        )

    def _build_callback_context(
        self,
        spec: ListenerCallbackSpec,
        changed: dict[str, Any],
        events: list[DependencyEvent] | None = None,
    ) -> ListenerCallbackContext:
        runtime_state = self._require_runtime_state(action="calling router endpoints")
        return ListenerCallbackContext(
            changed=changed,
            changed_by_id=self._build_changed_by_id(
                runtime_state.dependency_metadata, changed
            ),
            events=[] if events is None else events,
            log=self._callback_logger(spec),
            emit_to_frontend=self.emit_to_frontend,
            project_manager=self._callback_project_manager(),
            frontend_affinity_token=self._frontend_affinity_token,
            ids=ListenerDependencyIds(runtime_state.dependency_metadata),
            values=self._build_listener_dependency_values(),
        )

    def _build_callback_state(
        self,
        runtime_state: ListenerRuntimeState,
        *,
        value_resolver: Callable[[str], Any] | None = None,
        dependency_metadata_resolver: Callable[[], ListenerDependencyMetadata | None]
        | None = None,
    ) -> Any:
        if dependency_metadata_resolver is None:

            def dependency_metadata_resolver() -> ListenerDependencyMetadata:
                return runtime_state.dependency_metadata

        if value_resolver is None:

            def value_resolver(dependency_name: str) -> Any:
                return self._dependency_cache.get(dependency_name, _MISSING)

        return _ListenerCallbackStateView(
            dependency_metadata_resolver=dependency_metadata_resolver,
            value_resolver=value_resolver,
            log_identifier=self._log_identifier,
        )

    def _build_changed_by_id(
        self,
        dependency_metadata: ListenerDependencyMetadata,
        changed: dict[str, Any],
    ) -> dict[ListenerDependencyId, Any]:
        if not changed:
            return {}
        changed_by_id: dict[ListenerDependencyId, Any] = {}
        for dependency_name, value in changed.items():
            try:
                dep_key = dependency_metadata.dependency_key(dependency_name)
            except KeyError as error:
                raise KeyError(
                    f"Unknown dependency name {dependency_name!r} for project {self._log_identifier}"
                ) from error
            if isinstance(dep_key, SectionParamDependencyKey):
                changed_by_id[
                    ListenerDependencyId(
                        sectionId=dep_key.sectionId,
                        paramInfoId=dep_key.codeObjId,
                    )
                ] = value
                continue
            changed_by_id[ListenerDependencyId(sectionId=dep_key.sectionId)] = value
        return changed_by_id

    async def _send_websocket_payload(self, payload: str) -> None:
        websocket = self._websocket
        if websocket is None:
            raise RuntimeError(
                f"Listener {self._log_identifier} is not connected to the websocket"
            )
        async with self._send_lock:
            try:
                await websocket.send(payload)
            except Exception:
                logger.exception(
                    "Listener %s failed to send websocket payload",
                    self._log_identifier,
                )
                raise

    async def _replay_cached_snapshot(self) -> None:
        """Replay the most recent cached snapshot for newly registered callbacks."""
        runtime_state = self._ensure_runtime_state_for_replay()
        if runtime_state is None:
            return

        (
            rendered_snapshot_values,
            _rendered_snapshot_value_keys,
        ) = self._build_dependency_cache_from_snapshot_values(
            self._latest_dependency_snapshot_values,
            runtime_state.dependency_metadata,
        )
        updated_cache = dict(rendered_snapshot_values)
        if self._latest_dependency_snapshot_values is None:
            logger.warning(
                (
                    "Listener %s replaying snapshot without authoritative "
                    "snapshot values; leaving dependency cache on the fail-closed path"
                ),
                self._log_identifier,
            )
        callbacks_to_run = self._collect_replay_callbacks_to_run(
            runtime_state,
            updated_cache,
        )
        self._dependency_cache = updated_cache

        callback_state = self._build_callback_state(
            runtime_state,
            value_resolver=lambda dependency_name: updated_cache.get(
                dependency_name,
                _MISSING,
            ),
            dependency_metadata_resolver=lambda: runtime_state.dependency_metadata,
        )
        for spec, changed in callbacks_to_run:
            ctx = self._build_callback_context(spec, changed, events=[])
            await self._invoke_callback(spec, callback_state, ctx)

    def _ensure_runtime_state_for_replay(self) -> ListenerRuntimeState | None:
        runtime_state = self._runtime_state
        if runtime_state is not None:
            return runtime_state
        if (
            self._latest_dependency_metadata is None
            or self._latest_dependency_catalog is None
        ):
            logger.debug(
                (
                    "Listener %s cannot replay snapshot without cached "
                    "dependency metadata"
                ),
                self._log_identifier,
            )
            return None
        runtime_state = ListenerRuntimeState(
            dependency_metadata=self._latest_dependency_metadata,
            dependency_catalog=self._latest_dependency_catalog,
        )
        self._runtime_state = runtime_state
        return runtime_state

    def _collect_replay_callbacks_to_run(
        self,
        runtime_state: ListenerRuntimeState,
        updated_cache: dict[str, Any],
    ) -> list[tuple[ListenerCallbackSpec, dict[str, Any]]]:
        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []
        self._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
        for spec in self._callbacks.values():
            self._scheduler.reset(spec.callback_id)
            if spec.dependency_mode is ListenerDependencyMode.realtime_only:
                continue
            if not spec.dependency_names:
                callbacks_to_run.append((spec, {}))
                continue
            changed, unresolved_dependencies = self._build_refresh_changed_dependencies(
                spec.dependency_names,
                updated_cache,
                None,
            )
            if unresolved_dependencies and not changed:
                continue
            if changed or spec.run_on_refresh:
                callbacks_to_run.append((spec, changed))
        return callbacks_to_run

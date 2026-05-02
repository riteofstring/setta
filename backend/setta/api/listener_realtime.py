from __future__ import annotations

import base64
import inspect
import logging
from typing import TYPE_CHECKING, Any, Literal, Sequence

from setta.local_core_client import LocalCoreClient
from setta.logging.tasks import spawn_background_task
from setta.runtime_compat import RuntimeCompatibilityError
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerSnapshot,
    LocalCoreListenerRealtimeDelta,
    LocalCoreRenderRealtimeDependencyValuesRequest,
    LocalCoreRenderRealtimeDependencyValuesResult,
)
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES,
)
from setta.types.generated.go_shared_types import ListenerDependencyMode

from .listener_models import (
    _LISTENER_SNAPSHOT_REFRESH_KIND_BOOTSTRAP,
    _LISTENER_SNAPSHOT_REFRESH_KIND_FORCE_REFRESH,
    _MISSING,
    _UNAVAILABLE,
    DependencyEvent,
    ListenerCallbackSpec,
    ListenerDependencyEventContent,
    ListenerDependencyMetadata,
    ListenerRealtimeCacheUpdate,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    ListenerRuntimeState,
)

if TYPE_CHECKING:
    import asyncio

    from setta.sdk_contracts.generated import ListenerForceRefreshEvent
    from setta.types.protocol import BaseDependencyKeyUnion

    from .listener_models import ListenerCallbackContext
    from .scheduling import ListenerCallbackScheduler

logger = logging.getLogger("setta.api.listener")


class ListenerRealtimeMixin:
    if TYPE_CHECKING:
        _callbacks: dict[str, ListenerCallbackSpec]
        _dependency_cache: dict[str, Any]
        _latest_dependency_catalog: ListenerDependencyCatalog | None
        _latest_dependency_metadata: ListenerDependencyMetadata | None
        _latest_dependency_snapshot_values: ListenerRenderedDependencyValues | None
        _local_core_client: LocalCoreClient | None
        _log_identifier: str
        _pending_router_endpoint_force_refreshes: dict[str, asyncio.Future[None]]
        _project_config_id: str | None
        _refresh_callback_semaphore: asyncio.Semaphore
        _runtime_state: ListenerRuntimeState | None
        _scheduler: ListenerCallbackScheduler

        def _build_callback_context(
            self,
            spec: ListenerCallbackSpec,
            changed: dict[str, Any],
            events: list[DependencyEvent] | None = None,
        ) -> ListenerCallbackContext: ...

        def _build_callback_state(
            self,
            runtime_state: ListenerRuntimeState,
        ) -> Any: ...

        def _evaluate_expression(
            self,
            *,
            dependency: str,
            expression: str | None,
        ) -> Any: ...

        def _get_last_realtime_sequence(self) -> int | None: ...
        def _refresh_callback_dependency_metadata(
            self,
            dependency_metadata: ListenerDependencyMetadata,
        ) -> None: ...
        def _reset_realtime_sequence(self) -> None: ...
        async def _send_listener_register(self) -> None: ...
        def _set_last_realtime_sequence(self, sequence: int) -> None: ...
        def _validate_sequence_session_id(
            self,
            share_session_id: str | None,
        ) -> str | None: ...

    async def _refresh_from_snapshot(
        self,
        snapshot: ListenerSnapshot,
        *,
        refresh_kind: Literal["bootstrap", "force_refresh"] | None = None,
    ) -> None:
        """Refresh listener state from a snapshot delivered over the websocket."""
        if self._runtime_state is None:
            resolved_refresh_kind: Literal["bootstrap", "force_refresh"] = (
                _LISTENER_SNAPSHOT_REFRESH_KIND_BOOTSTRAP
            )
        else:
            resolved_refresh_kind = _LISTENER_SNAPSHOT_REFRESH_KIND_FORCE_REFRESH
        if refresh_kind is not None:
            resolved_refresh_kind = refresh_kind
        await self._process_snapshot(
            snapshot,
            refresh_kind=resolved_refresh_kind,
        )

    async def _process_snapshot(
        self,
        snapshot: ListenerSnapshot,
        *,
        refresh_kind: Literal["bootstrap", "force_refresh"],
    ) -> None:
        self._validate_sequence_session_id(snapshot.shareSessionId)
        self._reset_realtime_sequence()
        self._apply_snapshot_project_identity(snapshot.projectConfigId, refresh_kind)
        runtime_state = self._build_runtime_state_from_catalog(
            snapshot.dependencyCatalog
        )
        self._latest_dependency_snapshot_values = snapshot.dependencyValues
        self._latest_dependency_catalog = snapshot.dependencyCatalog
        previous_cache = dict(self._dependency_cache)
        (
            rendered_snapshot_values,
            _rendered_snapshot_value_keys,
        ) = self._build_dependency_cache_from_snapshot_values(
            snapshot.dependencyValues,
            runtime_state.dependency_metadata,
        )
        updated_cache = dict(rendered_snapshot_values)
        callbacks_to_run = self._collect_snapshot_callbacks_to_run(
            runtime_state,
            updated_cache,
            previous_cache,
        )

        self._runtime_state = runtime_state
        self._latest_dependency_metadata = runtime_state.dependency_metadata
        self._dependency_cache = updated_cache

        if refresh_kind == "bootstrap":
            await self._send_listener_register()
        else:
            logger.debug(
                "Listener %s refreshed metadata-backed callback state",
                self._log_identifier,
            )

        callback_state = self._build_callback_state(runtime_state)
        for spec, changed in callbacks_to_run:
            ctx = self._build_callback_context(spec, changed, events=[])
            spawn_background_task(
                self._invoke_refresh_callback(spec, callback_state, ctx),
                label="listener-refresh-callback",
                extra_values={
                    "callback_id": spec.callback_id,
                    "refresh_kind": refresh_kind,
                },
            )

    def _apply_snapshot_project_identity(
        self,
        incoming_project_id: str,
        refresh_kind: Literal["bootstrap", "force_refresh"],
    ) -> None:
        if self._project_config_id is None:
            self._project_config_id = incoming_project_id
            return
        if incoming_project_id == self._project_config_id:
            return
        logger.warning(
            "Listener %s received %s snapshot for unexpected project %s",
            self._log_identifier,
            refresh_kind,
            incoming_project_id,
        )
        self._project_config_id = incoming_project_id

    def _build_runtime_state_from_catalog(
        self,
        dependency_catalog: ListenerDependencyCatalog,
    ) -> ListenerRuntimeState:
        return ListenerRuntimeState(
            dependency_metadata=ListenerDependencyMetadata.from_catalog(
                dependency_catalog
            ),
            dependency_catalog=dependency_catalog,
        )

    def _collect_snapshot_callbacks_to_run(
        self,
        runtime_state: ListenerRuntimeState,
        updated_cache: dict[str, Any],
        previous_cache: dict[str, Any],
    ) -> list[tuple[ListenerCallbackSpec, dict[str, Any]]]:
        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []
        self._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
        for spec in self._callbacks.values():
            self._scheduler.reset(spec.callback_id)
            changed, unresolved_dependencies = self._build_refresh_changed_dependencies(
                spec.dependency_names,
                updated_cache,
                previous_cache,
            )
            if not self._should_run_snapshot_callback(
                spec,
                changed,
                unresolved_dependencies,
            ):
                continue
            callbacks_to_run.append((spec, changed))
        return callbacks_to_run

    def _build_refresh_changed_dependencies(
        self,
        dependencies: Sequence[str],
        updated_cache: dict[str, Any],
        previous_cache: dict[str, Any] | None,
    ) -> tuple[dict[str, Any], bool]:
        changed: dict[str, Any] = {}
        unresolved_dependencies = False
        for dependency in dependencies:
            value = updated_cache.get(dependency, _UNAVAILABLE)
            if value is _UNAVAILABLE:
                unresolved_dependencies = True
                continue
            if previous_cache is None:
                changed[dependency] = value
                continue
            previous = previous_cache.get(dependency, _MISSING)
            updated_cache[dependency] = value
            if previous is _MISSING or value != previous:
                changed[dependency] = value
        return changed, unresolved_dependencies

    def _should_run_snapshot_callback(
        self,
        spec: ListenerCallbackSpec,
        changed: dict[str, Any],
        unresolved_dependencies: bool,
    ) -> bool:
        if unresolved_dependencies and not changed:
            return False
        mode = spec.dependency_mode
        if mode is ListenerDependencyMode.realtime_only:
            return False
        if mode is ListenerDependencyMode.always:
            if not spec.dependency_names:
                return True
            return bool(changed) or spec.run_on_refresh
        return True

    def _build_dependency_cache_from_snapshot_values(
        self,
        dependency_values: ListenerRenderedDependencyValues | None,
        dependency_metadata: ListenerDependencyMetadata,
    ) -> tuple[dict[str, Any], set[BaseDependencyKeyUnion]]:
        if dependency_values is None:
            return {}, set()

        values_by_name: dict[str, Any] = {}
        resolved_dependency_keys: set[BaseDependencyKeyUnion] = set()
        for entry in dependency_values.entries:
            try:
                dependency_name = dependency_metadata.dependency_name(
                    entry.dependencyKey
                )
            except KeyError:
                logger.debug(
                    "Listener %s ignoring snapshot value for unknown dependency key %s",
                    self._log_identifier,
                    entry.dependencyKey,
                )
                continue
            rendered_value = entry.renderedValue.strip()
            if not rendered_value:
                continue
            try:
                values_by_name[dependency_name] = self._evaluate_expression(
                    dependency=dependency_name,
                    expression=rendered_value,
                )
                resolved_dependency_keys.add(entry.dependencyKey)
            except Exception:
                logger.debug(
                    (
                        "Listener %s could not evaluate Go snapshot value for %s; "
                        "leaving dependency on fallback path"
                    ),
                    self._log_identifier,
                    dependency_name,
                    exc_info=logger.isEnabledFor(logging.DEBUG),
                )
                continue
        return values_by_name, resolved_dependency_keys

    def _get_local_core_client(self) -> LocalCoreClient:
        if self._local_core_client is None:
            self._local_core_client = LocalCoreClient()
        return self._local_core_client

    def _build_realtime_affected_dependency_keys(
        self,
        dependency_metadata: ListenerDependencyMetadata,
        dirty_dependency_keys: set[BaseDependencyKeyUnion],
    ) -> set[BaseDependencyKeyUnion]:
        affected = set(dirty_dependency_keys)
        queue = list(dirty_dependency_keys)
        while queue:
            dependency_key = queue.pop(0)
            for dependent_key in dependency_metadata.dependents(dependency_key):
                if dependent_key in affected:
                    continue
                affected.add(dependent_key)
                queue.append(dependent_key)
        return affected

    def _build_local_core_realtime_request(
        self,
        runtime_state: ListenerRuntimeState,
        deltas: Sequence[ListenerRealtimeDelta],
    ) -> LocalCoreRenderRealtimeDependencyValuesRequest:
        dependency_catalog = runtime_state.dependency_catalog
        if dependency_catalog is None:
            raise RuntimeError("Listener dependency catalog is unavailable")
        current_dependency_values = self._latest_dependency_snapshot_values
        if current_dependency_values is None:
            current_dependency_values = ListenerRenderedDependencyValues(entries=[])
        local_core_deltas: list[LocalCoreListenerRealtimeDelta] = []
        for delta in deltas:
            binary_payload_base64: str | None = None
            if delta.binaryPayload is not None:
                binary_payload_base64 = base64.b64encode(delta.binaryPayload).decode(
                    "ascii"
                )
            local_core_deltas.append(
                LocalCoreListenerRealtimeDelta(
                    dependency=delta.dependency,
                    value=delta.value,
                    binaryPayloadBase64=binary_payload_base64,
                )
            )
        return LocalCoreRenderRealtimeDependencyValuesRequest(
            dependencyCatalog=dependency_catalog,
            currentDependencyValues=current_dependency_values,
            deltas=local_core_deltas,
        )

    def _merge_rendered_dependency_values(
        self,
        current: ListenerRenderedDependencyValues | None,
        *,
        remove_keys: set[BaseDependencyKeyUnion],
        updates: ListenerRenderedDependencyValues | None,
    ) -> ListenerRenderedDependencyValues:
        merged_entries: dict[
            BaseDependencyKeyUnion, ListenerRenderedDependencyValue
        ] = {}
        if current is not None:
            for entry in current.entries:
                if entry.dependencyKey in remove_keys:
                    continue
                merged_entries[entry.dependencyKey] = entry
        if updates is not None:
            for entry in updates.entries:
                merged_entries[entry.dependencyKey] = entry
        return ListenerRenderedDependencyValues(entries=list(merged_entries.values()))

    async def _invoke_callback(
        self,
        spec: ListenerCallbackSpec,
        state: Any,
        ctx: ListenerCallbackContext,
    ) -> None:
        result = spec.function(state, ctx)
        if inspect.isawaitable(result):
            await result

    async def _invoke_refresh_callback(
        self,
        spec: ListenerCallbackSpec,
        state: Any,
        ctx: ListenerCallbackContext,
    ) -> None:
        async with self._refresh_callback_semaphore:
            await self._invoke_callback(spec, state, ctx)

    def _should_ignore_project_event(
        self,
        event_project_config_id: str,
        event_name: str,
    ) -> bool:
        project_config_id = self._project_config_id
        if project_config_id is None or event_project_config_id == project_config_id:
            return False
        logger.debug(
            "Listener %s ignoring %s for project %s",
            self._log_identifier,
            event_name,
            event_project_config_id,
        )
        return True

    def _runtime_state_for_event(
        self,
        event_name: str,
    ) -> ListenerRuntimeState | None:
        runtime_state = self._runtime_state
        if runtime_state is not None:
            return runtime_state
        logger.debug(
            "Listener %s received %s before bootstrap; ignoring",
            self._log_identifier,
            event_name,
        )
        return None

    def _is_out_of_order_event_sequence(
        self,
        sequence: int,
        share_session_id: str | None,
        event_name: str,
    ) -> bool:
        sequence_session_id = self._validate_sequence_session_id(share_session_id)
        last_sequence = self._get_last_realtime_sequence()
        if last_sequence is None or sequence > last_sequence:
            return False
        logger.debug(
            ("Listener %s ignoring out-of-order %s sequence %s (last=%s session=%s)"),
            self._log_identifier,
            event_name,
            sequence,
            last_sequence,
            sequence_session_id,
        )
        return True

    def _prepare_sequenced_runtime_event(
        self,
        *,
        event_name: str,
        project_config_id: str,
        sequence: int,
        share_session_id: str | None,
    ) -> ListenerRuntimeState | None:
        if self._should_ignore_project_event(project_config_id, event_name):
            return None
        runtime_state = self._runtime_state_for_event(event_name)
        if runtime_state is None:
            return None
        if self._is_out_of_order_event_sequence(
            sequence,
            share_session_id,
            event_name,
        ):
            return None
        self._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
        self._set_last_realtime_sequence(sequence)
        return runtime_state

    def _collect_dirty_dependency_keys(
        self,
        dependency_metadata: ListenerDependencyMetadata,
        deltas: Sequence[ListenerRealtimeDelta],
    ) -> set[BaseDependencyKeyUnion]:
        dirty_dependency_keys: set[BaseDependencyKeyUnion] = set()
        for delta in deltas:
            dep_key = delta.dependency
            try:
                dependency_metadata.dependency_name(dep_key)
            except KeyError:
                logger.error(
                    "Listener %s received realtime delta for unknown dependency metadata key %s",
                    self._log_identifier,
                    dep_key,
                )
                continue
            dirty_dependency_keys.add(dep_key)
        return dirty_dependency_keys

    async def _render_local_core_dependency_values(
        self,
        runtime_state: ListenerRuntimeState,
        deltas: Sequence[ListenerRealtimeDelta],
    ) -> ListenerRenderedDependencyValues | None:
        try:
            local_core_result = (
                LocalCoreRenderRealtimeDependencyValuesResult.model_validate(
                    await self._get_local_core_client().run_command(
                        LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES,
                        self._build_local_core_realtime_request(
                            runtime_state, deltas
                        ).model_dump(mode="json"),
                    )
                )
            )
            return local_core_result.dependencyValues
        except RuntimeCompatibilityError:
            raise
        except Exception as error:
            logger.debug(
                "Listener %s local core render failed: %s",
                self._log_identifier,
                error,
                exc_info=logger.isEnabledFor(logging.DEBUG),
            )
            return None

    def _remove_dirty_dependencies_from_cache(
        self,
        updated_cache: dict[str, Any],
        dirty_dependency_keys: set[BaseDependencyKeyUnion],
        dependency_metadata: ListenerDependencyMetadata,
    ) -> None:
        for dependency_key in dirty_dependency_keys:
            try:
                dependency = dependency_metadata.dependency_name(dependency_key)
            except KeyError:
                continue
            updated_cache.pop(dependency, None)

    def _apply_rendered_dependency_values_to_cache(
        self,
        updated_cache: dict[str, Any],
        dependency_values: ListenerRenderedDependencyValues,
        dependency_metadata: ListenerDependencyMetadata,
        *,
        unknown_key_log: str,
    ) -> set[BaseDependencyKeyUnion]:
        rendered_dependency_values, _ = (
            self._build_dependency_cache_from_snapshot_values(
                dependency_values,
                dependency_metadata,
            )
        )
        applied_dependency_keys: set[BaseDependencyKeyUnion] = set()
        for entry in dependency_values.entries:
            try:
                dependency = dependency_metadata.dependency_name(entry.dependencyKey)
            except KeyError:
                logger.debug(
                    unknown_key_log,
                    self._log_identifier,
                    entry.dependencyKey,
                )
                continue
            applied_dependency_keys.add(entry.dependencyKey)
            if dependency in rendered_dependency_values:
                updated_cache[dependency] = rendered_dependency_values[dependency]
                continue
            updated_cache.pop(dependency, None)
        return applied_dependency_keys

    def _apply_optional_rendered_dependency_values_to_cache(
        self,
        updated_cache: dict[str, Any],
        dependency_values: ListenerRenderedDependencyValues | None,
        dependency_metadata: ListenerDependencyMetadata,
        *,
        unknown_key_log: str,
    ) -> set[BaseDependencyKeyUnion]:
        if dependency_values is None:
            return set()
        return self._apply_rendered_dependency_values_to_cache(
            updated_cache,
            dependency_values,
            dependency_metadata,
            unknown_key_log=unknown_key_log,
        )

    async def _build_realtime_cache_update(
        self,
        runtime_state: ListenerRuntimeState,
        content: ListenerRealtimeEventContent,
    ) -> ListenerRealtimeCacheUpdate | None:
        previous_cache = dict(self._dependency_cache)
        updated_cache = dict(previous_cache)
        initial_dirty_dependency_keys = self._collect_dirty_dependency_keys(
            runtime_state.dependency_metadata,
            content.deltas,
        )
        if not initial_dirty_dependency_keys:
            return None

        dirty_dependency_keys = self._build_realtime_affected_dependency_keys(
            runtime_state.dependency_metadata,
            initial_dirty_dependency_keys,
        )
        local_core_dependency_values = await self._render_local_core_dependency_values(
            runtime_state,
            content.deltas,
        )
        self._remove_dirty_dependencies_from_cache(
            updated_cache,
            dirty_dependency_keys,
            runtime_state.dependency_metadata,
        )

        self._apply_optional_rendered_dependency_values_to_cache(
            updated_cache,
            local_core_dependency_values,
            runtime_state.dependency_metadata,
            unknown_key_log=(
                "Listener %s ignoring local core value for unknown dependency key %s"
            ),
        )
        authoritative_dependency_keys = self._apply_optional_rendered_dependency_values_to_cache(
            updated_cache,
            content.dependencyValues,
            runtime_state.dependency_metadata,
            unknown_key_log=(
                "Listener %s ignoring realtime authoritative value for unknown dependency key %s"
            ),
        )
        dirty_dependency_keys.update(authoritative_dependency_keys)

        self._update_latest_dependency_values_from_realtime(
            dirty_dependency_keys,
            local_core_dependency_values,
            authoritative_dependency_keys,
            content.dependencyValues,
        )
        return ListenerRealtimeCacheUpdate(
            previous_cache=previous_cache,
            updated_cache=updated_cache,
            dirty_dependency_keys=dirty_dependency_keys,
        )

    def _update_latest_dependency_values_from_realtime(
        self,
        dirty_dependency_keys: set[BaseDependencyKeyUnion],
        local_core_dependency_values: ListenerRenderedDependencyValues | None,
        authoritative_dependency_keys: set[BaseDependencyKeyUnion],
        authoritative_dependency_values: ListenerRenderedDependencyValues | None,
    ) -> None:
        self._latest_dependency_snapshot_values = (
            self._merge_rendered_dependency_values(
                self._latest_dependency_snapshot_values,
                remove_keys=dirty_dependency_keys,
                updates=local_core_dependency_values,
            )
        )
        if authoritative_dependency_values is None:
            return
        self._latest_dependency_snapshot_values = (
            self._merge_rendered_dependency_values(
                self._latest_dependency_snapshot_values,
                remove_keys=authoritative_dependency_keys,
                updates=authoritative_dependency_values,
            )
        )

    def _build_cache_diff(
        self,
        previous_cache: dict[str, Any],
        updated_cache: dict[str, Any],
    ) -> dict[str, Any]:
        changed = {
            dependency: updated_cache[dependency]
            for dependency in updated_cache.keys() - previous_cache.keys()
        }
        for dependency, value in updated_cache.items():
            previous = previous_cache.get(dependency, _MISSING)
            if previous is _MISSING or previous != value:
                changed[dependency] = value
        return changed

    def _build_realtime_changed_dependencies(
        self,
        spec: ListenerCallbackSpec,
        previous_cache: dict[str, Any],
        updated_cache: dict[str, Any],
        dirty_dependency_keys: set[BaseDependencyKeyUnion],
    ) -> dict[str, Any]:
        if not spec.structured_dependencies:
            return self._build_cache_diff(previous_cache, updated_cache)
        changed: dict[str, Any] = {}
        for dep_key, dependency in zip(
            spec.structured_dependencies,
            spec.dependency_names,
        ):
            if dep_key in dirty_dependency_keys and dependency in updated_cache:
                changed[dependency] = updated_cache[dependency]
        return changed

    def _collect_realtime_callbacks_to_run(
        self,
        previous_cache: dict[str, Any],
        updated_cache: dict[str, Any],
        dirty_dependency_keys: set[BaseDependencyKeyUnion],
    ) -> list[tuple[ListenerCallbackSpec, dict[str, Any]]]:
        callbacks_to_run: list[tuple[ListenerCallbackSpec, dict[str, Any]]] = []
        for spec in self._callbacks.values():
            if spec.dependency_mode is ListenerDependencyMode.refresh_only:
                continue
            changed = self._build_realtime_changed_dependencies(
                spec,
                previous_cache,
                updated_cache,
                dirty_dependency_keys,
            )
            if changed:
                callbacks_to_run.append((spec, changed))
        return callbacks_to_run

    def _collect_dependency_event_callbacks(
        self,
        dependency_events: Sequence[DependencyEvent],
    ) -> dict[str, list[DependencyEvent]]:
        callbacks_to_run: dict[str, list[DependencyEvent]] = {}
        for event in dependency_events:
            for spec in self._callbacks.values():
                if spec.dependency_mode is ListenerDependencyMode.refresh_only:
                    continue
                if (
                    spec.structured_dependencies
                    and event.dependencyKey not in spec.structured_dependencies
                ):
                    continue
                callbacks_to_run.setdefault(spec.callback_id, []).append(event)
        return callbacks_to_run

    async def _handle_realtime_event(
        self, content: ListenerRealtimeEventContent
    ) -> None:
        """Apply realtime deltas and invoke interested callbacks."""
        runtime_state = self._prepare_sequenced_runtime_event(
            event_name="realtime event",
            project_config_id=content.projectConfigId,
            sequence=content.sequence,
            share_session_id=content.shareSessionId,
        )
        if runtime_state is None:
            return

        if not content.deltas:
            logger.debug(
                "Listener %s received realtime event with no deltas (sequence=%s)",
                self._log_identifier,
                content.sequence,
            )
            return

        cache_update = await self._build_realtime_cache_update(runtime_state, content)
        if cache_update is None:
            return
        self._dependency_cache = cache_update.updated_cache
        for spec, changed in self._collect_realtime_callbacks_to_run(
            cache_update.previous_cache,
            cache_update.updated_cache,
            cache_update.dirty_dependency_keys,
        ):
            self._scheduler.submit(spec.callback_id, changed=dict(changed))

    async def _handle_dependency_event(
        self, content: ListenerDependencyEventContent
    ) -> None:
        """Apply realtime dependency events and invoke interested callbacks."""
        if (
            self._prepare_sequenced_runtime_event(
                event_name="dependency event",
                project_config_id=content.projectConfigId,
                sequence=content.sequence,
                share_session_id=content.shareSessionId,
            )
            is None
        ):
            return
        if not content.dependencyEvents:
            logger.debug(
                "Listener %s received dependency event with no events (sequence=%s)",
                self._log_identifier,
                content.sequence,
            )
            return

        for callback_id, events in self._collect_dependency_event_callbacks(
            content.dependencyEvents,
        ).items():
            spec = self._callbacks.get(callback_id)
            if spec is None:
                continue
            self._scheduler.submit(spec.callback_id, events=list(events))

    def _resolve_snapshot_refresh_kind(
        self,
        refresh_kind: str | None,
    ) -> Literal["bootstrap", "force_refresh"] | None:
        if refresh_kind == _LISTENER_SNAPSHOT_REFRESH_KIND_BOOTSTRAP:
            return _LISTENER_SNAPSHOT_REFRESH_KIND_BOOTSTRAP
        if refresh_kind == _LISTENER_SNAPSHOT_REFRESH_KIND_FORCE_REFRESH:
            return _LISTENER_SNAPSHOT_REFRESH_KIND_FORCE_REFRESH
        return None

    def _complete_pending_force_refresh(self, raw_call_id: str | None) -> None:
        if raw_call_id is None:
            return
        call_id = raw_call_id.strip()
        if not call_id:
            return
        future = self._pending_router_endpoint_force_refreshes.get(call_id)
        if future is None or future.done():
            return
        future.set_result(None)

    async def _handle_force_refresh(self, content: ListenerForceRefreshEvent) -> None:
        """Handle force refresh payloads by replaying the latest snapshot."""
        completed = False
        try:
            await self._refresh_from_snapshot(
                content.snapshot,
                refresh_kind=self._resolve_snapshot_refresh_kind(content.refreshKind),
            )
            completed = True
        finally:
            if completed:
                self._complete_pending_force_refresh(content.callId)

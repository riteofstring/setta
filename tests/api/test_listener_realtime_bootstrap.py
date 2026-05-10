import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock

import pytest
from setta.api.listener import (
    ListenerDependencyMetadata,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    SettaListener,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerSnapshot,
)
from setta.types.generated.go_shared_types import (
    CodeObjType,
    CodeObjValueRepresentationMode,
)
from setta.types.id import ID
from setta.types.protocol import create_dep_key

from tests.api.test_listener_realtime import (
    PARAM_SLIDER_ID,
    PARAM_SWITCH_ID,
    PROJECT_TYPED_ID,
    SECTION_ONE_ID,
    _GraphlessDependencyGraph,
    _TextListenerFixture,
    _build_composite_runtime_state,
    _build_nested_controls_fixture,
    _build_text_dependency_catalog,
    _literal_dependency_value,
)
from tests.helpers.listener_runtime_state import (
    ListenerTestRuntimeState,
    build_listener_runtime_state_from_catalog,
)


@pytest.mark.asyncio
class TestSettaListenerBootstrapFailure:
    def _build_project_state(self) -> _TextListenerFixture:
        return _TextListenerFixture.create(
            project_config_id=ID("project-fail"),
            project_name="Demo Project",
            section_id=ID("section-welcome"),
            text="Hello",
        )

    async def test_bootstrap_registers_fail_closed_when_snapshot_values_are_missing(
        self,
    ) -> None:
        listener = SettaListener(project_name="Demo Project")
        callback_calls: list[tuple[str, dict[str, Any]]] = []

        @listener.listen(deps=("Welcome",))
        def on_change(state, ctx) -> None:
            callback_calls.append((state.Welcome, dict(ctx.changed)))

        project_state = self._build_project_state()

        register_payloads: list[dict[str, Any]] = []

        async def capture_payload(payload: str) -> None:
            register_payloads.append(json.loads(payload))

        dependency_catalog = _build_text_dependency_catalog(project_state)
        listener._send_websocket_payload = AsyncMock(side_effect=capture_payload)

        await listener._refresh_from_snapshot(
            ListenerSnapshot(
                projectConfigId=project_state.projectConfig.id,
                dependencyCatalog=dependency_catalog,
                dependencyValues=ListenerRenderedDependencyValues(),
            )
        )
        await asyncio.sleep(0)

        assert listener._runtime_state is not None
        assert listener._dependency_cache == {}
        assert listener._registration_pending
        assert len(register_payloads) == 1
        assert register_payloads[0]["messageType"] == "ListenerRegister"
        assert callback_calls == []

    async def test_bootstrap_uses_go_snapshot_values_when_runtime_state_is_unavailable(
        self,
    ) -> None:
        listener = SettaListener(project_name="Demo Project")
        callback_calls: list[tuple[str, dict[str, Any]]] = []

        @listener.listen(deps=("Welcome",))
        def on_change(state, ctx) -> None:
            callback_calls.append((state.Welcome, dict(ctx.changed)))

        project_state = self._build_project_state()
        dependency_catalog = _build_text_dependency_catalog(project_state)
        dependency_entry = dependency_catalog.entries[0]
        dependency_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=dependency_entry.dependencyKey,
                    renderedValue="'From Go snapshot'",
                )
            ]
        )

        register_payloads: list[dict[str, Any]] = []

        async def capture_payload(payload: str) -> None:
            register_payloads.append(json.loads(payload))

        listener._send_websocket_payload = AsyncMock(side_effect=capture_payload)

        await listener._refresh_from_snapshot(
            ListenerSnapshot(
                projectConfigId=project_state.projectConfig.id,
                dependencyCatalog=dependency_catalog,
                dependencyValues=dependency_values,
            )
        )
        await asyncio.sleep(0)

        assert listener._runtime_state is not None
        assert listener._dependency_cache["Welcome"] == "From Go snapshot"
        assert listener._registration_pending
        assert len(register_payloads) == 1
        assert register_payloads[0]["messageType"] == "ListenerRegister"
        assert callback_calls == [("From Go snapshot", {"Welcome": "From Go snapshot"})]

    async def test_bootstrap_uses_authoritative_composite_cache_from_go_snapshot_values(
        self,
    ) -> None:
        fixture = _build_nested_controls_fixture(ID("project-snapshot-composite"))
        listener = SettaListener(project_name=fixture.projectConfig.name)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any]]] = []

        dependency_catalog = fixture.dependency_catalog()
        dependency_values = fixture.dependency_values(count=5)

        @listener.listen(deps=(fixture.section_name,), run_on_refresh=True)
        def on_change(state, ctx) -> None:
            callback_calls.append((state.Controls, dict(ctx.changed)))

        register_payloads: list[dict[str, Any]] = []

        async def capture_payload(payload: str) -> None:
            register_payloads.append(json.loads(payload))

        listener._send_websocket_payload = AsyncMock(side_effect=capture_payload)

        await listener._refresh_from_snapshot(
            ListenerSnapshot(
                projectConfigId=fixture.projectConfig.id,
                dependencyCatalog=dependency_catalog,
                dependencyValues=dependency_values,
            )
        )
        await asyncio.sleep(0)

        assert listener._runtime_state is not None
        assert listener._dependency_cache[fixture.count_name] == 5
        assert listener._dependency_cache[fixture.section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {fixture.section_name: {"count": 5}})]
        assert len(register_payloads) == 1
        assert register_payloads[0]["messageType"] == "ListenerRegister"

    async def test_realtime_updates_cache_when_runtime_state_is_unavailable(
        self,
    ) -> None:
        listener = SettaListener(project_name="Demo Project")
        project_state = self._build_project_state()

        callback_calls: list[tuple[str, dict[str, Any]]] = []

        @listener.listen(deps=("Welcome",))
        def on_change(state, ctx) -> None:
            callback_calls.append((state.Welcome, dict(ctx.changed)))

        runtime_state = build_listener_runtime_state_from_catalog(
            _build_text_dependency_catalog(project_state)
        )
        listener._runtime_state = runtime_state
        listener._project_config_id = project_state.projectConfig.id
        listener._dependency_cache = {"Welcome": "Hello"}
        listener._refresh_callback_dependency_metadata(
            runtime_state.dependency_metadata
        )

        spec = next(iter(listener._callbacks.values()))
        dependency_key = spec.structured_dependencies[0]

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Updated while unavailable"),
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(spec.callback_id)

        assert listener._dependency_cache["Welcome"] == "Updated while unavailable"
        assert listener._get_last_realtime_sequence() == 1
        assert callback_calls == [
            ("Updated while unavailable", {"Welcome": "Updated while unavailable"})
        ]

    async def test_realtime_uses_catalog_metadata_when_runtime_state_is_unavailable(
        self,
    ) -> None:
        listener = SettaListener(project_name="Project project-typed")
        slider_events: list[tuple[Any, Any]] = []
        switch_events: list[tuple[Any, Any]] = []

        @listener.listen(deps=("section__slider",))
        def on_slider(state, ctx) -> None:
            slider_events.append(
                (state.section__slider, ctx.changed["section__slider"])
            )

        @listener.listen(deps=("section__switch",))
        def on_switch(state, ctx) -> None:
            switch_events.append(
                (state.section__switch, ctx.changed["section__switch"])
            )

        slider_key = create_dep_key(
            sectionId=SECTION_ONE_ID,
            codeObjId=PARAM_SLIDER_ID,
        )
        switch_key = create_dep_key(
            sectionId=SECTION_ONE_ID,
            codeObjId=PARAM_SWITCH_ID,
        )
        catalog = ListenerDependencyCatalog(
            entries=[
                ListenerDependencyCatalogEntry(
                    dependencyKey=slider_key,
                    name="slider",
                    fullPathName="section__slider",
                    codeObjType=CodeObjType.SliderParam,
                    valueRepresentation=CodeObjValueRepresentationMode.expression,
                ),
                ListenerDependencyCatalogEntry(
                    dependencyKey=switch_key,
                    name="switch",
                    fullPathName="section__switch",
                    codeObjType=CodeObjType.SwitchParam,
                    valueRepresentation=CodeObjValueRepresentationMode.expression,
                ),
            ]
        )
        listener._runtime_state = ListenerTestRuntimeState(
            dependency_metadata=ListenerDependencyMetadata.from_catalog(catalog),
            dependency_catalog=catalog,
            dependency_graph=_GraphlessDependencyGraph(),
        )
        listener._project_config_id = PROJECT_TYPED_ID
        listener._dependency_cache = {
            "section__slider": 1,
            "section__switch": False,
        }
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=PROJECT_TYPED_ID,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=slider_key,
                        value=_literal_dependency_value("5"),
                    ),
                    ListenerRealtimeDelta(
                        dependency=switch_key,
                        value=_literal_dependency_value("true"),
                    ),
                ],
                sequence=1,
            )
        )

        slider_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.declared_dependencies == ("section__slider",)
        )
        switch_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.declared_dependencies == ("section__switch",)
        )
        await listener._scheduler.flush(slider_spec.callback_id)
        await listener._scheduler.flush(switch_spec.callback_id)

        assert listener._dependency_cache["section__slider"] == 5
        assert isinstance(listener._dependency_cache["section__slider"], int)
        assert slider_events == [(5, 5)]

        assert listener._dependency_cache["section__switch"] is True
        assert switch_events == [(True, True)]
        assert listener._get_last_realtime_sequence() == 1

    async def test_realtime_uses_authoritative_composite_values_when_runtime_state_is_unavailable(
        self,
    ) -> None:
        fixture = _build_nested_controls_fixture(ID("project-composite"))
        listener = SettaListener(project_name=fixture.projectConfig.name)
        runtime_state = _build_composite_runtime_state(fixture)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(fixture.count_name,))
        def on_count(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, fixture.section_name),
                    ctx.values.by_id(fixture.section_id),
                    ctx.changed[fixture.count_name],
                )
            )

        listener._runtime_state = ListenerTestRuntimeState(
            dependency_metadata=runtime_state.dependency_metadata,
            dependency_catalog=runtime_state.dependency_catalog,
            dependency_graph=_GraphlessDependencyGraph(),
        )
        listener._project_config_id = fixture.projectConfig.id
        listener._dependency_cache = fixture.dependency_cache(count=1)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = fixture.dependency_values(count=5)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=fixture.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=fixture.count_key(),
                        value=_literal_dependency_value("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[fixture.count_name] == 5
        assert listener._dependency_cache[fixture.section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {"count": 5}, 5)]
        assert listener._get_last_realtime_sequence() == 1

    async def test_realtime_triggers_composite_listener_from_authoritative_values_when_runtime_state_is_unavailable(
        self,
    ) -> None:
        fixture = _build_nested_controls_fixture(ID("project-composite-parent"))
        listener = SettaListener(project_name=fixture.projectConfig.name)
        runtime_state = _build_composite_runtime_state(fixture)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(fixture.section_name,))
        def on_section(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, fixture.section_name),
                    ctx.values.by_id(fixture.section_id),
                    ctx.changed[fixture.section_name],
                )
            )

        listener._runtime_state = ListenerTestRuntimeState(
            dependency_metadata=runtime_state.dependency_metadata,
            dependency_catalog=runtime_state.dependency_catalog,
            dependency_graph=_GraphlessDependencyGraph(),
        )
        listener._project_config_id = fixture.projectConfig.id
        listener._dependency_cache = fixture.dependency_cache(count=1)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = fixture.dependency_values(count=5)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=fixture.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=fixture.count_key(),
                        value=_literal_dependency_value("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[fixture.section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {"count": 5}, {"count": 5})]
        assert listener._get_last_realtime_sequence() == 1

    async def test_realtime_uses_authoritative_composite_values_when_runtime_state_exists(
        self,
    ) -> None:
        fixture = _build_nested_controls_fixture(ID("project-runtime-composite"))
        listener = SettaListener(project_name=fixture.projectConfig.name)
        runtime_state = _build_composite_runtime_state(fixture)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(fixture.count_name,))
        def on_count(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, fixture.section_name),
                    ctx.values.by_id(fixture.section_id),
                    ctx.changed[fixture.count_name],
                )
            )

        listener._runtime_state = runtime_state
        listener._project_config_id = fixture.projectConfig.id
        listener._dependency_cache = fixture.dependency_cache(count=1)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = fixture.dependency_values(count=5)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=fixture.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=fixture.count_key(),
                        value=_literal_dependency_value("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[fixture.count_name] == 5
        assert listener._dependency_cache[fixture.section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {"count": 5}, 5)]
        assert listener._get_last_realtime_sequence() == 1

    async def test_realtime_triggers_composite_listener_from_authoritative_values_when_runtime_state_exists(
        self,
    ) -> None:
        fixture = _build_nested_controls_fixture(ID("project-runtime-composite-parent"))
        listener = SettaListener(project_name=fixture.projectConfig.name)
        runtime_state = _build_composite_runtime_state(fixture)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(fixture.section_name,))
        def on_section(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, fixture.section_name),
                    ctx.values.by_id(fixture.section_id),
                    ctx.changed[fixture.section_name],
                )
            )

        listener._runtime_state = runtime_state
        listener._project_config_id = fixture.projectConfig.id
        listener._dependency_cache = fixture.dependency_cache(count=1)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = fixture.dependency_values(count=5)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=fixture.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=fixture.count_key(),
                        value=_literal_dependency_value("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[fixture.section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {"count": 5}, {"count": 5})]
        assert listener._get_last_realtime_sequence() == 1

    async def test_replay_cached_snapshot_fails_closed_without_latest_go_snapshot_values(
        self,
    ) -> None:
        listener = SettaListener(project_name="Demo Project")
        project_state = self._build_project_state()
        callback_calls: list[tuple[str, dict[str, Any]]] = []

        @listener.listen(deps=("Welcome",), run_on_refresh=True)
        def on_change(state, ctx) -> None:
            callback_calls.append((state.Welcome, dict(ctx.changed)))

        runtime_state = build_listener_runtime_state_from_catalog(
            _build_text_dependency_catalog(project_state)
        )
        listener._latest_dependency_metadata = runtime_state.dependency_metadata
        listener._latest_dependency_catalog = runtime_state.dependency_catalog

        await listener._replay_cached_snapshot()

        assert listener._runtime_state is not None
        assert listener._dependency_cache == {}
        assert callback_calls == []

    async def test_replay_cached_snapshot_uses_latest_go_snapshot_values(self) -> None:
        listener = SettaListener(project_name="Demo Project")
        project_state = self._build_project_state()
        callback_calls: list[tuple[str, dict[str, Any]]] = []

        @listener.listen(deps=("Welcome",), run_on_refresh=True)
        def on_change(state, ctx) -> None:
            callback_calls.append((state.Welcome, dict(ctx.changed)))

        runtime_state = build_listener_runtime_state_from_catalog(
            _build_text_dependency_catalog(project_state)
        )
        dependency_entry = runtime_state.dependency_metadata.entry_for_name("Welcome")
        listener._latest_dependency_metadata = runtime_state.dependency_metadata
        listener._latest_dependency_catalog = runtime_state.dependency_catalog
        listener._latest_dependency_snapshot_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=dependency_entry.dependencyKey,
                    renderedValue="'Replay from Go snapshot'",
                )
            ]
        )
        await listener._replay_cached_snapshot()

        assert listener._runtime_state is not None
        assert listener._dependency_cache["Welcome"] == "Replay from Go snapshot"
        assert callback_calls == [
            (
                "Replay from Go snapshot",
                {"Welcome": "Replay from Go snapshot"},
            )
        ]

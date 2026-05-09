import asyncio
import json
from dataclasses import dataclass
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast

import pytest
from setta.api.listener import (
    DependencyEvent,
    ListenerCallbackSpec,
    ListenerDependencyEventContent,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    SettaListener,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerForceRefreshEvent,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerSnapshot,
)
from setta.types.artifact import BaseArtifactTypeAdapter
from setta.types.generated.go_shared_types import (
    CodeObjValueRepresentationMode,
    DependencyValueType,
    ListenerDependencyMode,
    ListenerFrontendEmitMessage,
    LiteralDependencyValue,
    SectionType,
)
from setta.types.id import ID
from setta.types.protocol import (
    BaseDependencyKeyUnion,
    create_dep_key,
)

from tests.helpers.listener_runtime_state import (
    ListenerTestRuntimeState,
    build_listener_runtime_state_from_catalog,
)

if TYPE_CHECKING:
    from websockets import ClientConnection


def _literal_dependency_value(payload: str) -> LiteralDependencyValue:
    return LiteralDependencyValue(
        type=DependencyValueType.Literal,
        payload=payload,
    )


class _StubWebsocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, payload: str) -> None:
        self.sent.append(payload)


class _GraphlessDependencyGraph:
    def __init__(self) -> None:
        self.graph: dict[BaseDependencyKeyUnion, object] = {}

    def change_value(
        self,
        dep_key: BaseDependencyKeyUnion,
        value: object,
    ) -> None:
        raise AssertionError(
            f"unexpected fallback graph mutation for {dep_key!r}: {value!r}"
        )


@dataclass(slots=True)
class _TextListenerFixture:
    projectConfig: SimpleNamespace
    sections: dict[ID, None]
    text: str

    @classmethod
    def create(
        cls,
        *,
        project_config_id: ID,
        project_name: str,
        section_id: ID,
        text: str,
    ) -> "_TextListenerFixture":
        return cls(
            projectConfig=SimpleNamespace(
                id=project_config_id,
                name=project_name,
            ),
            sections={section_id: None},
            text=text,
        )

    def model_copy(self, *, deep: bool = False) -> "_TextListenerFixture":
        return _TextListenerFixture(
            projectConfig=SimpleNamespace(
                id=self.projectConfig.id,
                name=self.projectConfig.name,
            ),
            sections=dict(self.sections) if deep else self.sections.copy(),
            text=self.text,
        )


@dataclass(slots=True)
class _CompositeListenerFixture:
    projectConfig: SimpleNamespace
    sections: dict[ID, None]
    section_id: ID
    param_id: ID
    section_name: str
    count_name: str

    @classmethod
    def create(
        cls,
        *,
        project_config_id: ID,
        project_name: str,
    ) -> "_CompositeListenerFixture":
        section_id = ID(f"{project_config_id}-controls")
        return cls(
            projectConfig=SimpleNamespace(
                id=project_config_id,
                name=project_name,
            ),
            sections={section_id: None},
            section_id=section_id,
            param_id=ID(f"{project_config_id}-count-param"),
            section_name="Controls",
            count_name="Controls__count",
        )

    def section_key(self) -> BaseDependencyKeyUnion:
        return create_dep_key(sectionId=self.section_id)

    def count_key(self) -> BaseDependencyKeyUnion:
        return create_dep_key(sectionId=self.section_id, codeObjId=self.param_id)

    def dependency_catalog(self) -> ListenerDependencyCatalog:
        return ListenerDependencyCatalog(
            entries=[
                ListenerDependencyCatalogEntry(
                    dependencyKey=self.section_key(),
                    name="Controls",
                    fullPathName=self.section_name,
                    dependencies=[self.count_key()],
                    sectionType=SectionType.Dict,
                ),
                ListenerDependencyCatalogEntry(
                    dependencyKey=self.count_key(),
                    name="count",
                    fullPathName=self.count_name,
                    valueRepresentation=CodeObjValueRepresentationMode.expression,
                ),
            ]
        )

    def dependency_values(self, *, count: int) -> ListenerRenderedDependencyValues:
        return ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=self.count_key(),
                    renderedValue=str(count),
                ),
                ListenerRenderedDependencyValue(
                    dependencyKey=self.section_key(),
                    renderedValue=repr({"count": count}),
                ),
            ]
        )

    def dependency_cache(self, *, count: int) -> dict[str, Any]:
        return {
            self.count_name: count,
            self.section_name: {"count": count},
        }


def _attach_stub_websocket(listener: SettaListener, websocket: _StubWebsocket) -> None:
    listener._websocket = cast("ClientConnection", websocket)


def _build_text_dependency_catalog(
    project_state: _TextListenerFixture,
) -> ListenerDependencyCatalog:
    section_id = next(iter(project_state.sections))
    return ListenerDependencyCatalog(
        entries=[
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=section_id),
                name="Welcome",
                fullPathName="Welcome",
                sectionType=SectionType.TextBlock,
            )
        ]
    )


def _build_text_dependency_values(
    project_state: _TextListenerFixture,
) -> ListenerRenderedDependencyValues:
    section_id = next(iter(project_state.sections))
    return ListenerRenderedDependencyValues(
        entries=[
            ListenerRenderedDependencyValue(
                dependencyKey=create_dep_key(sectionId=section_id),
                renderedValue=repr(project_state.text),
            )
        ]
    )


def _build_composite_runtime_state(
    fixture: _CompositeListenerFixture,
) -> ListenerTestRuntimeState:
    return build_listener_runtime_state_from_catalog(fixture.dependency_catalog())


def _build_authoritative_snapshot_payload(
    project_state: _TextListenerFixture | _CompositeListenerFixture,
) -> tuple[ListenerDependencyCatalog, ListenerRenderedDependencyValues]:
    if isinstance(project_state, _TextListenerFixture):
        return (
            _build_text_dependency_catalog(project_state),
            _build_text_dependency_values(project_state),
        )
    return (
        project_state.dependency_catalog(),
        project_state.dependency_values(count=1),
    )


async def _refresh_from_authoritative_snapshot(
    listener: SettaListener,
    project_state: _TextListenerFixture | _CompositeListenerFixture,
) -> None:
    snapshot = _build_authoritative_listener_snapshot(project_state)
    await listener._refresh_from_snapshot(snapshot)


async def _process_authoritative_snapshot(
    listener: SettaListener,
    project_state: _TextListenerFixture | _CompositeListenerFixture,
    *,
    refresh_kind: str,
    share_session_id: str | None,
) -> None:
    snapshot = _build_authoritative_listener_snapshot(
        project_state,
        share_session_id=share_session_id,
    )
    await listener._process_snapshot(snapshot, refresh_kind=refresh_kind)


def _build_authoritative_listener_snapshot(
    project_state: _TextListenerFixture | _CompositeListenerFixture,
    *,
    share_session_id: str | None = None,
) -> ListenerSnapshot:
    dependency_catalog, dependency_values = _build_authoritative_snapshot_payload(
        project_state
    )
    return ListenerSnapshot(
        projectConfigId=project_state.projectConfig.id,
        shareSessionId=share_session_id,
        dependencyCatalog=dependency_catalog,
        dependencyValues=dependency_values,
    )


def _build_force_refresh_content(
    project_state: _TextListenerFixture | _CompositeListenerFixture,
    *,
    share_session_id: str | None = None,
) -> ListenerForceRefreshEvent:
    return ListenerForceRefreshEvent(
        snapshot=_build_authoritative_listener_snapshot(
            project_state,
            share_session_id=share_session_id,
        )
    )


PROJECT_TYPED_ID = ID("project-typed")
SECTION_ONE_ID = ID("section-1")
PARAM_SLIDER_ID = ID("param-slider")
PARAM_SWITCH_ID = ID("param-switch")


def _build_nested_controls_fixture(project_config_id: ID) -> _CompositeListenerFixture:
    return _CompositeListenerFixture.create(
        project_config_id=project_config_id,
        project_name=f"Project {project_config_id}",
    )


@pytest.mark.asyncio
class TestSettaListenerRealtimeIntegration:
    def _build_project_state(self) -> _TextListenerFixture:
        return _TextListenerFixture.create(
            project_config_id=ID("project-1"),
            project_name="Demo Project",
            section_id=ID("section-welcome"),
            text="Hello",
        )

    def _set_snapshot_section_text(
        self,
        project_state: _TextListenerFixture,
        text: str,
    ) -> None:
        project_state.text = text

    def _get_structured_dependency(
        self, spec: ListenerCallbackSpec
    ) -> BaseDependencyKeyUnion:
        if not spec.structured_dependencies:
            raise AssertionError("Callback structured dependencies not populated")
        return spec.structured_dependencies[0]

    async def test_emit_to_frontend_serializes_artifact_update_dicts(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        sent_payloads: list[str] = []

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        listener._runtime_state = build_listener_runtime_state_from_catalog(
            _build_text_dependency_catalog(project_state)
        )
        listener._project_config_id = project_state.projectConfig.id
        listener._is_registered = True

        # Listener emits should accept dict-shaped artifact payloads and send
        # the validated artifact schema over the websocket.
        await listener.emit_to_frontend(
            artifact_updates=[
                {
                    "type": "Image",
                    "id": "listener/new-image.png",
                    "value": {
                        "contentId": "listener-image",
                        "byteLength": 3,
                        "mimeType": "image/png",
                        "sha256": "listener-image-sha256",
                    },
                }
            ]
        )

        assert len(sent_payloads) == 1
        parsed_message = ListenerFrontendEmitMessage.model_validate_json(
            sent_payloads[0]
        )
        assert isinstance(parsed_message, ListenerFrontendEmitMessage)
        assert parsed_message.content.dependencyValues == {}
        assert len(parsed_message.content.artifactUpdates) == 1
        artifact = BaseArtifactTypeAdapter.validate_python(
            parsed_message.content.artifactUpdates[0].model_dump(mode="python")
        )
        assert artifact.id == "listener/new-image.png"
        assert artifact.value.contentId == "listener-image"

    async def test_emit_to_frontend_rejects_invalid_artifact_update_shape(
        self,
    ) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        listener._runtime_state = build_listener_runtime_state_from_catalog(
            _build_text_dependency_catalog(project_state)
        )
        listener._project_config_id = project_state.projectConfig.id
        listener._is_registered = True

        # Listener emits should fail closed when artifact payloads do not match
        # the BaseArtifact schema expected by the backend/runtime path.
        with pytest.raises(
            ValueError,
            match="artifact_updates entries must match the BaseArtifact schema",
        ):
            await listener.emit_to_frontend(
                artifact_updates=[
                    {
                        "type": "Image",
                        "id": "listener/invalid-image.png",
                    }
                ]
            )

    async def test_realtime_callback_respects_debounce_scheduler(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
        )
        realtime_calls: list[dict[str, Any]] = []
        refresh_calls: list[dict[str, Any]] = []

        @listener.listen(
            deps=("Welcome",),
            debounce_ms=50,
        )
        def on_realtime(_state, ctx):
            realtime_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_refresh(_state, ctx):
            refresh_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await _refresh_from_authoritative_snapshot(listener, project_state)
        await asyncio.sleep(0)

        assert refresh_calls == [{"Welcome": "Hello"}]
        assert realtime_calls == [{"Welcome": "Hello"}]
        assert websocket.sent

        realtime_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_realtime
        )
        dependency_key = self._get_structured_dependency(realtime_spec)

        first_content = ListenerRealtimeEventContent(
            projectConfigId=project_state.projectConfig.id,
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value=_literal_dependency_value("Updated-1"),
                )
            ],
            sequence=1,
        )
        await listener._handle_realtime_event(first_content)
        await asyncio.sleep(0.02)
        assert realtime_calls == [{"Welcome": "Hello"}]

        second_content = ListenerRealtimeEventContent(
            projectConfigId=project_state.projectConfig.id,
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value=_literal_dependency_value("Updated-2"),
                )
            ],
            sequence=2,
        )
        await listener._handle_realtime_event(second_content)

        await asyncio.sleep(0.1)

        assert realtime_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Updated-2"},
        ]
        assert listener._dependency_cache.get("Welcome") == "Updated-2"
        assert listener._get_last_realtime_sequence() == 2

        register_payload = json.loads(websocket.sent[-1])
        assert "callbacks" in register_payload["content"]
        callback_payloads = list(register_payload["content"]["callbacks"].values())
        assert callback_payloads[0]["debounceMs"] == 50

    async def test_refresh_callbacks_respect_concurrency_limit(self) -> None:
        project_state = self._build_project_state()
        concurrency = 2
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
            refresh_concurrency=concurrency,
        )
        active = 0
        max_active = 0
        completed = 0
        active_lock = asyncio.Lock()
        ready_event = asyncio.Event()
        release_event = asyncio.Event()
        completed_event = asyncio.Event()
        total_callbacks = 4

        async def on_refresh(_state, _ctx) -> None:
            nonlocal active, max_active, completed
            async with active_lock:
                active += 1
                if active > max_active:
                    max_active = active
                if active >= concurrency:
                    ready_event.set()
            await release_event.wait()
            async with active_lock:
                active -= 1
                completed += 1
                if completed == total_callbacks:
                    completed_event.set()

        for _ in range(total_callbacks):
            listener.listen(deps=("Welcome",), run_on_refresh=True)(on_refresh)

        await _process_authoritative_snapshot(
            listener,
            project_state,
            refresh_kind="force_refresh",
            share_session_id=None,
        )
        try:
            await asyncio.wait_for(ready_event.wait(), timeout=1.0)
            assert concurrency == max_active
        finally:
            release_event.set()

        await asyncio.wait_for(completed_event.wait(), timeout=1.0)

    async def test_force_refresh_replays_snapshot_and_resets_sequence(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
        )
        run_on_refresh_calls: list[dict[str, Any]] = []
        standard_calls: list[dict[str, Any]] = []

        @listener.listen(deps=("Welcome",), run_on_refresh=True)
        def on_refresh(_state, ctx):
            run_on_refresh_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_standard(_state, ctx):
            standard_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await _refresh_from_authoritative_snapshot(listener, project_state)
        await asyncio.sleep(0)

        assert run_on_refresh_calls == [{"Welcome": "Hello"}]
        assert standard_calls == [{"Welcome": "Hello"}]

        refresh_spec = next(
            spec for spec in listener._callbacks.values() if spec.function is on_refresh
        )
        dependency_key = self._get_structured_dependency(refresh_spec)

        realtime_event = ListenerRealtimeEventContent(
            projectConfigId=project_state.projectConfig.id,
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value=_literal_dependency_value("Updated"),
                )
            ],
            sequence=1,
        )
        await listener._handle_realtime_event(realtime_event)
        await asyncio.sleep(0.05)

        assert run_on_refresh_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Updated"},
        ]
        assert standard_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Updated"},
        ]
        assert listener._get_last_realtime_sequence() == 1

        refreshed_state = project_state.model_copy(deep=True)
        self._set_snapshot_section_text(refreshed_state, "Updated")

        await listener._handle_force_refresh(
            _build_force_refresh_content(refreshed_state)
        )
        await asyncio.sleep(0)

        assert listener._get_last_realtime_sequence() is None
        assert run_on_refresh_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Updated"},
            {},
        ]
        assert standard_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Updated"},
        ]

    async def test_realtime_sequences_are_tracked_for_share_session(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
            share_session_id="session-a",
        )
        realtime_calls: list[dict[str, Any]] = []

        @listener.listen(deps=("Welcome",))
        def on_realtime(_state, ctx):
            realtime_calls.append(dict(ctx.changed))

        await _process_authoritative_snapshot(
            listener,
            project_state,
            refresh_kind="force_refresh",
            share_session_id="session-a",
        )
        await asyncio.sleep(0)

        realtime_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_realtime
        )
        dependency_key = self._get_structured_dependency(realtime_spec)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                shareSessionId="session-a",
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Update-A"),
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(realtime_spec.callback_id)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                shareSessionId="session-a",
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Update-B"),
                    )
                ],
                sequence=2,
            )
        )
        await listener._scheduler.flush(realtime_spec.callback_id)

        assert realtime_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Update-A"},
            {"Welcome": "Update-B"},
        ]
        assert listener._get_last_realtime_sequence() == 2

    async def test_realtime_rejects_unconfigured_share_session(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)

        @listener.listen(deps=("Welcome",))
        def on_realtime(state, ctx):
            pass

        await _process_authoritative_snapshot(
            listener,
            project_state,
            refresh_kind="force_refresh",
            share_session_id=None,
        )
        await asyncio.sleep(0)

        realtime_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_realtime
        )
        dependency_key = self._get_structured_dependency(realtime_spec)

        with pytest.raises(ValueError):
            await listener._handle_realtime_event(
                ListenerRealtimeEventContent(
                    projectConfigId=project_state.projectConfig.id,
                    shareSessionId="session-a",
                    deltas=[
                        ListenerRealtimeDelta(
                            dependency=dependency_key,
                            value=_literal_dependency_value("Update-A"),
                        )
                    ],
                    sequence=1,
                )
            )

    async def test_action_sequences_are_tracked_for_share_session(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
            share_session_id="session-a",
        )
        action_calls: list[list[str | None]] = []
        section_id = next(iter(project_state.sections))
        dependency_key = create_dep_key(sectionId=section_id)

        @listener.listen(
            deps=(dependency_key,),
            dependency_mode=ListenerDependencyMode.realtime_only,
        )
        def on_action(_state, ctx):
            action_calls.append(
                [
                    event.payload.payload
                    if isinstance(event.payload, LiteralDependencyValue)
                    else None
                    for event in ctx.events
                ]
            )

        await _process_authoritative_snapshot(
            listener,
            project_state,
            refresh_kind="force_refresh",
            share_session_id="session-a",
        )
        await asyncio.sleep(0)

        action_spec = next(
            spec for spec in listener._callbacks.values() if spec.function is on_action
        )

        await listener._handle_dependency_event(
            ListenerDependencyEventContent(
                projectConfigId=project_state.projectConfig.id,
                shareSessionId="session-a",
                dependencyEvents=[
                    DependencyEvent(
                        dependencyKey=dependency_key,
                        payload=_literal_dependency_value("payload-a"),
                        timestampMs=1,
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(action_spec.callback_id)

        await listener._handle_dependency_event(
            ListenerDependencyEventContent(
                projectConfigId=project_state.projectConfig.id,
                shareSessionId="session-a",
                dependencyEvents=[
                    DependencyEvent(
                        dependencyKey=dependency_key,
                        payload=_literal_dependency_value("payload-b"),
                        timestampMs=2,
                    )
                ],
                sequence=2,
            )
        )
        await listener._scheduler.flush(action_spec.callback_id)

        assert action_calls == [["payload-a"], ["payload-b"]]
        assert listener._get_last_realtime_sequence() == 2

    async def test_action_rejects_mismatched_share_session(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
            share_session_id="session-a",
        )
        section_id = next(iter(project_state.sections))
        dependency_key = create_dep_key(sectionId=section_id)

        @listener.listen(
            deps=(dependency_key,),
            dependency_mode=ListenerDependencyMode.realtime_only,
        )
        def on_action(state, ctx):
            pass

        await _process_authoritative_snapshot(
            listener,
            project_state,
            refresh_kind="force_refresh",
            share_session_id="session-a",
        )
        await asyncio.sleep(0)

        with pytest.raises(ValueError):
            await listener._handle_dependency_event(
                ListenerDependencyEventContent(
                    projectConfigId=project_state.projectConfig.id,
                    shareSessionId="session-b",
                    dependencyEvents=[
                        DependencyEvent(
                            dependencyKey=dependency_key,
                            payload=_literal_dependency_value("payload-b"),
                            timestampMs=2,
                        )
                    ],
                    sequence=1,
                )
            )

    async def test_refresh_only_callbacks_ignore_realtime(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        refresh_calls: list[dict[str, Any]] = []
        realtime_calls: list[dict[str, Any]] = []

        @listener.listen(
            deps=("Welcome",),
            dependency_mode=ListenerDependencyMode.refresh_only,
        )
        def on_refresh(_state, ctx):
            refresh_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_realtime(_state, ctx):
            realtime_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await _refresh_from_authoritative_snapshot(listener, project_state)
        await asyncio.sleep(0)

        assert refresh_calls == [{"Welcome": "Hello"}]
        assert realtime_calls == [{"Welcome": "Hello"}]

        realtime_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_realtime
        )
        dependency_key = self._get_structured_dependency(realtime_spec)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Updated"),
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(realtime_spec.callback_id)

        assert refresh_calls == [{"Welcome": "Hello"}]
        assert realtime_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Updated"},
        ]

    async def test_realtime_only_callbacks_skip_snapshot(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        realtime_calls: list[dict[str, Any]] = []

        @listener.listen(
            deps=("Welcome",),
            dependency_mode=ListenerDependencyMode.realtime_only,
        )
        def on_realtime(_state, ctx):
            realtime_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await _refresh_from_authoritative_snapshot(listener, project_state)
        await asyncio.sleep(0)

        assert realtime_calls == []

        realtime_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_realtime
        )
        dependency_key = self._get_structured_dependency(realtime_spec)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Updated"),
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(realtime_spec.callback_id)

        assert realtime_calls == [{"Welcome": "Updated"}]

    async def test_default_dependency_mode_omitted_deps_is_refresh_only(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        refresh_calls: list[dict[str, Any]] = []

        @listener.listen()
        def on_refresh(_state, ctx):
            refresh_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await _refresh_from_authoritative_snapshot(listener, project_state)
        await asyncio.sleep(0)

        assert refresh_calls == [{}]

        refresh_spec = next(
            spec for spec in listener._callbacks.values() if spec.function is on_refresh
        )
        assert refresh_spec.dependency_mode == ListenerDependencyMode.refresh_only

        section_id = next(iter(project_state.sections))
        dependency_key = create_dep_key(sectionId=section_id)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Updated"),
                    )
                ],
                sequence=1,
            )
        )
        await asyncio.sleep(0)

        assert refresh_calls == [{}]

    async def test_default_dependency_mode_with_deps_is_always(self) -> None:
        listener = SettaListener(project_name="Demo Project")

        @listener.listen(deps=("Welcome",))
        def on_change(_state, _ctx) -> None:
            return None

        spec = next(iter(listener._callbacks.values()))
        assert spec.dependency_mode == ListenerDependencyMode.always

    async def test_listener_rejects_invalid_dependency_mode_inputs(self) -> None:
        listener = SettaListener(project_name="Demo Project")

        with pytest.raises(ValueError, match="Unknown dependency mode"):

            @listener.listen(dependency_mode="not-a-mode")
            def _invalid_mode(_state, _ctx) -> None:
                return None

        with pytest.raises(
            ValueError,
            match="Listener dependency_mode requires deps",
        ):

            @listener.listen(dependency_mode=ListenerDependencyMode.realtime_only)
            def _missing_deps(_state, _ctx) -> None:
                return None

    async def test_realtime_only_wildcard_skips_snapshot(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        realtime_calls: list[dict[str, Any]] = []

        @listener.listen(
            deps=(),
            dependency_mode=ListenerDependencyMode.realtime_only,
        )
        def on_realtime(_state, ctx):
            realtime_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await _refresh_from_authoritative_snapshot(listener, project_state)
        await asyncio.sleep(0)

        assert realtime_calls == []

        section_id = next(iter(project_state.sections))
        dependency_key = create_dep_key(sectionId=section_id)
        realtime_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_realtime
        )

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Updated"),
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(realtime_spec.callback_id)

        assert realtime_calls == [{"Welcome": "Updated"}]

        refreshed_state = project_state.model_copy(deep=True)
        self._set_snapshot_section_text(refreshed_state, "Updated")

        await listener._handle_force_refresh(
            _build_force_refresh_content(refreshed_state)
        )
        await asyncio.sleep(0)

        assert realtime_calls == [{"Welcome": "Updated"}]

    async def test_any_dependency_callbacks_receive_all_deltas(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        any_calls: list[dict[str, Any]] = []
        specific_calls: list[dict[str, Any]] = []

        @listener.listen(
            deps=(),
            dependency_mode=ListenerDependencyMode.always,
        )
        def on_any(_state, ctx):
            any_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_specific(_state, ctx):
            specific_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await _refresh_from_authoritative_snapshot(listener, project_state)
        await asyncio.sleep(0)

        assert any_calls == [{}]
        assert specific_calls == [{"Welcome": "Hello"}]

        specific_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_specific
        )
        any_spec = next(
            spec for spec in listener._callbacks.values() if spec.function is on_any
        )
        dependency_key = self._get_structured_dependency(specific_spec)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=_literal_dependency_value("Updated"),
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(specific_spec.callback_id)
        await listener._scheduler.flush(any_spec.callback_id)

        assert any_calls == [{}, {"Welcome": "Updated"}]
        assert specific_calls == [
            {"Welcome": "Hello"},
            {"Welcome": "Updated"},
        ]

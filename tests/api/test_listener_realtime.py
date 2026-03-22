import asyncio
import contextlib
from dataclasses import dataclass
import io
import json
import logging
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock

import pytest
from setta.api.listener import (
    ListenerCallbackSpec,
    ListenerDependencyMetadata,
    SettaListener,
)
from setta.code_gen.dependency_graph import DependencyGraph, ParamNode
from setta.types.binary_content import BinaryContentRef
from setta.types.code_obj_impls import (
    CodeObjType,
    CodeParamCodeObjImpl,
    NestedParamCodeObjImpl,
    ParameterPassingStyle,
)
from setta.types.core import Core, Variant
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import BinaryDependencyValue, LiteralDependencyValue
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.websocket_unions import (
    PythonScriptWebsocketMsgTypeAdapter,
)
from setta.types.id import ID
from setta.types.listener import (
    DependencyEvent,
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerDependencyEventContent,
    ListenerDependencyMode,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerSnapshot,
)
from setta.types.project_config import (
    CodeObjValueRepresentationMode,
    ProjectConfig,
    TopLevelSectionLayout,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import DictSectionImpl, SectionType
from setta.types.websocket import (
    WebsocketMsgListenerDependencyEvent,
    WebsocketMsgListenerError,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerRealtimeEvent,
)

from tests.helpers.binary_frames import encode_binary_frame
from tests.helpers.listener_runtime_state import (
    ListenerTestRuntimeState,
    build_listener_dependency_cache,
    build_listener_dependency_catalog_from_graph,
    build_listener_dependency_metadata_from_graph,
    build_listener_runtime_state,
    build_listener_runtime_state_from_catalog,
)
from tests.helpers.project_state_core import compute_initial_nonPresetImpls

if TYPE_CHECKING:
    from websockets import ClientConnection


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

    def model_copy(self, *, _deep: bool = False) -> "_TextListenerFixture":
        return _TextListenerFixture(
            projectConfig=SimpleNamespace(
                id=self.projectConfig.id,
                name=self.projectConfig.name,
            ),
            sections=dict(self.sections),
            text=self.text,
        )


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


def _build_authoritative_snapshot_payload(
    listener: SettaListener,
    project_state: ProjectStateSingleConfig | _TextListenerFixture,
) -> tuple[ListenerDependencyCatalog, ListenerRenderedDependencyValues]:
    if isinstance(project_state, _TextListenerFixture):
        return (
            _build_text_dependency_catalog(project_state),
            _build_text_dependency_values(project_state),
        )
    runtime_state = build_listener_runtime_state(project_state)
    dependency_metadata = runtime_state.dependency_metadata
    dependency_cache = build_listener_dependency_cache(listener, runtime_state)
    catalog_entries: list[ListenerDependencyCatalogEntry] = []
    value_entries: list[ListenerRenderedDependencyValue] = []
    for dependency_name in dependency_metadata.names():
        entry = dependency_metadata.entry_for_name(dependency_name)
        catalog_entries.append(
            ListenerDependencyCatalogEntry(
                dependencyKey=entry.dependencyKey,
                name=entry.name,
                fullPathName=entry.fullPathName,
                dependencies=list(entry.dependencies),
                sectionType=entry.sectionType,
                codeObjType=entry.codeObjType,
                controlCodeObjId=entry.controlCodeObjId,
                controlCodeObjType=entry.controlCodeObjType,
                sectionRepresentation=entry.sectionRepresentation,
                controlValueRepresentation=entry.controlValueRepresentation,
                valueRepresentation=entry.valueRepresentation,
            )
        )
        if dependency_name not in dependency_cache:
            continue
        value_entries.append(
            ListenerRenderedDependencyValue(
                dependencyKey=entry.dependencyKey,
                renderedValue=repr(dependency_cache[dependency_name]),
            )
        )
    return (
        ListenerDependencyCatalog(entries=catalog_entries),
        ListenerRenderedDependencyValues(entries=value_entries),
    )


async def _refresh_from_authoritative_snapshot(
    listener: SettaListener,
    project_state: ProjectStateSingleConfig | _TextListenerFixture,
) -> None:
    snapshot = _build_authoritative_listener_snapshot(listener, project_state)
    await listener._refresh_from_snapshot(snapshot)


async def _process_authoritative_snapshot(
    listener: SettaListener,
    project_state: ProjectStateSingleConfig | _TextListenerFixture,
    *,
    refresh_kind: str,
    share_session_id: str | None,
) -> None:
    snapshot = _build_authoritative_listener_snapshot(
        listener,
        project_state,
        share_session_id=share_session_id,
    )
    await listener._process_snapshot(snapshot, refresh_kind=refresh_kind)


def _build_authoritative_listener_snapshot(
    listener: SettaListener,
    project_state: ProjectStateSingleConfig | _TextListenerFixture,
    *,
    share_session_id: str | None = None,
) -> ListenerSnapshot:
    dependency_catalog, dependency_values = _build_authoritative_snapshot_payload(
        listener,
        project_state,
    )
    return ListenerSnapshot(
        projectConfigId=project_state.projectConfig.id,
        shareSessionId=share_session_id,
        dependencyCatalog=dependency_catalog,
        dependencyValues=dependency_values,
    )


def _build_force_refresh_content(
    listener: SettaListener,
    project_state: ProjectStateSingleConfig | _TextListenerFixture,
    *,
    share_session_id: str | None = None,
) -> ListenerForceRefreshContent:
    return ListenerForceRefreshContent(
        snapshot=_build_authoritative_listener_snapshot(
            listener,
            project_state,
            share_session_id=share_session_id,
        )
    )


PROJECT_TYPED_ID = ID("project-typed")
SECTION_ONE_ID = ID("section-1")
PARAM_SLIDER_ID = ID("param-slider")
PARAM_SWITCH_ID = ID("param-switch")


def _build_nested_controls_project_state(
    project_config_id: ID,
) -> tuple[ProjectStateSingleConfig, ID, ID]:
    section_id = ID(f"{project_config_id}-controls")
    section_impl_id = ID(f"{project_config_id}-section-impl")
    section_variant_id = ID(f"{project_config_id}-section-variant")

    root_param_id = ID(f"{project_config_id}-root-param")
    root_param_impl_id = ID(f"{project_config_id}-root-param-impl")
    root_param_variant_id = ID(f"{project_config_id}-root-param-variant")

    param_id = ID(f"{project_config_id}-count-param")
    param_impl_id = ID(f"{project_config_id}-count-param-impl")
    param_variant_id = ID(f"{project_config_id}-count-param-variant")

    root_param_impl = NestedParamCodeObjImpl(
        id=root_param_impl_id,
        children=[param_id],
    )
    root_param_variant = Variant(
        id=root_param_variant_id,
        impl=root_param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(root_param_impl),
    )
    root_param_core = Core(
        id=root_param_id,
        name="root",
        variants=[root_param_variant.id],
        defaultVariant=root_param_variant.id,
    )

    param_impl = CodeParamCodeObjImpl(
        id=param_impl_id,
        value="1",
    )
    param_variant = Variant(
        id=param_variant_id,
        impl=param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
    )
    param_core = Core(
        id=param_id,
        name="count",
        variants=[param_variant.id],
        defaultVariant=param_variant.id,
    )

    section_impl = DictSectionImpl(
        id=section_impl_id,
        topLevelParamId=root_param_id,
        codeObjVariantMap={
            root_param_id: root_param_variant.id,
            param_id: param_variant.id,
        },
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name="Controls",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )

    project_config = ProjectConfig(
        id=project_config_id,
        name=f"Project {project_config_id}",
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={
            root_param_id: root_param_core,
            param_id: param_core,
        },
        codeObjImpls={
            root_param_impl.id: root_param_impl,
            param_impl.id: param_impl,
        },
        codeObjVariants={
            root_param_variant.id: root_param_variant,
            param_variant.id: param_variant,
        },
    )
    return project_state, section_id, param_id


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
                    },
                }
            ]
        )

        assert len(sent_payloads) == 1
        parsed_message = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            sent_payloads[0]
        )
        assert isinstance(parsed_message, WebsocketMsgListenerFrontendEmit)
        assert parsed_message.content.dependencyValues == {}
        assert len(parsed_message.content.artifactUpdates) == 1
        assert parsed_message.content.artifactUpdates[0].id == "listener/new-image.png"
        assert (
            parsed_message.content.artifactUpdates[0].value.contentId
            == "listener-image"
        )

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
                    value=LiteralDependencyValue("Updated-1"),
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
                    value=LiteralDependencyValue("Updated-2"),
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
                    value=LiteralDependencyValue("Updated"),
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
            _build_force_refresh_content(listener, refreshed_state)
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
                        value=LiteralDependencyValue("Update-A"),
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
                        value=LiteralDependencyValue("Update-B"),
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
                            value=LiteralDependencyValue("Update-A"),
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
            dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
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
                        payload=LiteralDependencyValue("payload-a"),
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
                        payload=LiteralDependencyValue("payload-b"),
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
            dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
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
                            payload=LiteralDependencyValue("payload-b"),
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
            dependency_mode=ListenerDependencyMode.REFRESH_ONLY,
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
                        value=LiteralDependencyValue("Updated"),
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
            dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
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
                        value=LiteralDependencyValue("Updated"),
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
        assert refresh_spec.dependency_mode == ListenerDependencyMode.REFRESH_ONLY

        section_id = next(iter(project_state.sections))
        dependency_key = create_dep_key(sectionId=section_id)

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=LiteralDependencyValue("Updated"),
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
        assert spec.dependency_mode == ListenerDependencyMode.ALWAYS

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

            @listener.listen(dependency_mode=ListenerDependencyMode.REALTIME_ONLY)
            def _missing_deps(_state, _ctx) -> None:
                return None

    async def test_realtime_only_wildcard_skips_snapshot(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        realtime_calls: list[dict[str, Any]] = []

        @listener.listen(
            deps=(),
            dependency_mode=ListenerDependencyMode.REALTIME_ONLY,
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
                        value=LiteralDependencyValue("Updated"),
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
            _build_force_refresh_content(listener, refreshed_state)
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
            dependency_mode=ListenerDependencyMode.ALWAYS,
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
                        value=LiteralDependencyValue("Updated"),
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

    async def test_realtime_delta_rehydrates_typed_values(self) -> None:
        listener = SettaListener(project_name="Project project-typed")
        slider_events: list[tuple[Any, Any]] = []
        switch_events: list[tuple[Any, Any]] = []

        @listener.listen(
            deps=("section__slider",),
        )
        def on_slider(state, ctx):
            slider_events.append(
                (state.section__slider, ctx.changed["section__slider"])
            )

        @listener.listen(
            deps=("section__switch",),
        )
        def on_switch(state, ctx):
            switch_events.append(
                (state.section__switch, ctx.changed["section__switch"])
            )

        slider_node = ParamNode(
            id=PARAM_SLIDER_ID,
            name="slider",
            full_path_name="section__slider",
            type=CodeObjType.SliderParam,
            isTopLevel=True,
            value=LiteralDependencyValue("1"),
            deps={},
            passing_style=ParameterPassingStyle.DEFAULT,
        )
        switch_node = ParamNode(
            id=PARAM_SWITCH_ID,
            name="switch",
            full_path_name="section__switch",
            type=CodeObjType.SwitchParam,
            isTopLevel=True,
            value=LiteralDependencyValue("false"),
            deps={},
            passing_style=ParameterPassingStyle.DEFAULT,
        )

        slider_key = create_dep_key(
            sectionId=SECTION_ONE_ID,
            codeObjId=PARAM_SLIDER_ID,
        )
        switch_key = create_dep_key(
            sectionId=SECTION_ONE_ID,
            codeObjId=PARAM_SWITCH_ID,
        )
        graph = {
            slider_key: slider_node,
            switch_key: switch_node,
        }

        dep_graph = cast(
            "DependencyGraph",
            SimpleNamespace(
                graph=graph,
                full_path_name_to_dep_key={
                    slider_node.full_path_name: slider_key,
                    switch_node.full_path_name: switch_key,
                },
            ),
        )
        listener._runtime_state = ListenerTestRuntimeState(
            dependency_metadata=build_listener_dependency_metadata_from_graph(
                dep_graph
            ),
            dependency_catalog=build_listener_dependency_catalog_from_graph(dep_graph),
            dependency_graph=dep_graph,
        )
        listener._project_config_id = PROJECT_TYPED_ID
        listener._dependency_cache = {
            "section__slider": 1,
            "section__switch": False,
        }

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        event = ListenerRealtimeEventContent(
            projectConfigId=PROJECT_TYPED_ID,
            deltas=[
                ListenerRealtimeDelta(
                    dependency=create_dep_key(
                        sectionId=SECTION_ONE_ID,
                        codeObjId=PARAM_SLIDER_ID,
                    ),
                    value=LiteralDependencyValue("5"),
                ),
                ListenerRealtimeDelta(
                    dependency=create_dep_key(
                        sectionId=SECTION_ONE_ID,
                        codeObjId=PARAM_SWITCH_ID,
                    ),
                    value=LiteralDependencyValue("true"),
                ),
            ],
            sequence=1,
        )

        await listener._handle_realtime_event(event)

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

        assert slider_events == [(5, 5)]
        assert listener._dependency_cache["section__slider"] == 5
        assert isinstance(listener._dependency_cache["section__slider"], int)

        assert switch_events == [(True, True)]
        assert listener._dependency_cache["section__switch"]
        assert isinstance(listener._dependency_cache["section__switch"], bool)
        assert listener._get_last_realtime_sequence() == 1

    async def test_listener_error_prints_when_logging_unconfigured(self) -> None:
        listener = SettaListener(project_name="Project Missing")
        error_message = WebsocketMsgListenerError(
            content=ListenerErrorContent(
                error="project_state_unavailable",
                details={"projectName": "dog"},
            )
        )
        root_logger = logging.getLogger()
        module_logger = logging.getLogger("setta.api.listener")
        setta_logger = logging.getLogger("setta")

        root_handlers = list(root_logger.handlers)
        module_handlers = list(module_logger.handlers)
        setta_handlers = list(setta_logger.handlers)
        original_propagate = module_logger.propagate
        original_module_level = module_logger.level
        original_setta_propagate = setta_logger.propagate
        original_setta_level = setta_logger.level
        last_resort = logging.lastResort
        last_resort_level = last_resort.level if last_resort is not None else None

        for handler in module_handlers:
            module_logger.removeHandler(handler)
        for handler in root_handlers:
            root_logger.removeHandler(handler)
        for handler in setta_handlers:
            setta_logger.removeHandler(handler)

        module_logger.setLevel(logging.ERROR)
        module_logger.propagate = True
        setta_logger.setLevel(logging.ERROR)
        setta_logger.propagate = True
        if last_resort is not None:
            last_resort.setLevel(logging.ERROR)

        stream = io.StringIO()
        try:
            with contextlib.redirect_stderr(stream):
                await listener._dispatch_websocket_message(error_message)
        finally:
            for handler in module_handlers:
                module_logger.addHandler(handler)
            module_logger.propagate = original_propagate
            module_logger.setLevel(original_module_level)
            for handler in setta_handlers:
                setta_logger.addHandler(handler)
            setta_logger.propagate = original_setta_propagate
            setta_logger.setLevel(original_setta_level)
            for handler in root_handlers:
                root_logger.addHandler(handler)
            if last_resort is not None and last_resort_level is not None:
                last_resort.setLevel(last_resort_level)

        output = stream.getvalue()
        assert (
            "Listener name:Project Missing received error project_state_unavailable"
            in output
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
        project_state, section_id, param_id = _build_nested_controls_project_state(
            ID("project-snapshot-composite")
        )
        listener = SettaListener(project_name=project_state.projectConfig.name)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any]]] = []

        runtime_state = build_listener_runtime_state(project_state)
        section_key = create_dep_key(sectionId=section_id)
        count_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        section_name = runtime_state.dependency_metadata.dependency_name(section_key)
        count_name = runtime_state.dependency_metadata.dependency_name(count_key)
        dependency_catalog = ListenerDependencyCatalog(
            entries=[
                ListenerDependencyCatalogEntry(
                    dependencyKey=entry.dependencyKey,
                    name=entry.name,
                    fullPathName=entry.fullPathName,
                    dependencies=list(entry.dependencies),
                    sectionType=entry.sectionType,
                    codeObjType=entry.codeObjType,
                    controlCodeObjId=entry.controlCodeObjId,
                    controlCodeObjType=entry.controlCodeObjType,
                    sectionRepresentation=entry.sectionRepresentation,
                    controlValueRepresentation=entry.controlValueRepresentation,
                    valueRepresentation=entry.valueRepresentation,
                )
                for entry in [
                    runtime_state.dependency_metadata.entry_for_name(name)
                    for name in runtime_state.dependency_metadata.names()
                ]
            ]
        )
        dependency_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=count_key,
                    renderedValue="5",
                ),
                ListenerRenderedDependencyValue(
                    dependencyKey=section_key,
                    renderedValue="{'count': 5}",
                ),
            ]
        )

        @listener.listen(deps=(section_name,), run_on_refresh=True)
        def on_change(state, ctx) -> None:
            callback_calls.append((state.Controls, dict(ctx.changed)))

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
        assert listener._dependency_cache[count_name] == 5
        assert listener._dependency_cache[section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {section_name: {"count": 5}})]
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
                        value=LiteralDependencyValue("Updated while unavailable"),
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
                        value=LiteralDependencyValue("5"),
                    ),
                    ListenerRealtimeDelta(
                        dependency=switch_key,
                        value=LiteralDependencyValue("true"),
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
        project_state, section_id, param_id = _build_nested_controls_project_state(
            ID("project-composite")
        )
        listener = SettaListener(project_name=project_state.projectConfig.name)
        runtime_state = build_listener_runtime_state(project_state)
        initial_cache = build_listener_dependency_cache(listener, runtime_state)
        section_key = create_dep_key(sectionId=section_id)
        count_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        section_name = runtime_state.dependency_metadata.dependency_name(section_key)
        count_name = runtime_state.dependency_metadata.dependency_name(count_key)
        composite_names = [
            name
            for name in runtime_state.dependency_metadata.names()
            if name not in {section_name, count_name}
        ]
        if composite_names:
            raise AssertionError(
                f"expected no intermediate composite dependency, got {composite_names!r}"
            )
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(count_name,))
        def on_count(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, section_name),
                    ctx.values.by_id(section_id),
                    ctx.changed[count_name],
                )
            )

        listener._runtime_state = ListenerTestRuntimeState(
            dependency_metadata=runtime_state.dependency_metadata,
            dependency_catalog=runtime_state.dependency_catalog,
            dependency_graph=_GraphlessDependencyGraph(),
        )
        listener._project_config_id = project_state.projectConfig.id
        listener._dependency_cache = dict(initial_cache)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=count_key,
                    renderedValue="5",
                ),
                ListenerRenderedDependencyValue(
                    dependencyKey=section_key,
                    renderedValue="{'count': 5}",
                ),
            ]
        )

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=count_key,
                        value=LiteralDependencyValue("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[count_name] == 5
        assert listener._dependency_cache[section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {"count": 5}, 5)]
        assert listener._get_last_realtime_sequence() == 1

    async def test_realtime_triggers_composite_listener_from_authoritative_values_when_runtime_state_is_unavailable(
        self,
    ) -> None:
        project_state, section_id, param_id = _build_nested_controls_project_state(
            ID("project-composite-parent")
        )
        listener = SettaListener(project_name=project_state.projectConfig.name)
        runtime_state = build_listener_runtime_state(project_state)
        initial_cache = build_listener_dependency_cache(listener, runtime_state)
        section_key = create_dep_key(sectionId=section_id)
        count_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        section_name = runtime_state.dependency_metadata.dependency_name(section_key)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(section_name,))
        def on_section(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, section_name),
                    ctx.values.by_id(section_id),
                    ctx.changed[section_name],
                )
            )

        listener._runtime_state = ListenerTestRuntimeState(
            dependency_metadata=runtime_state.dependency_metadata,
            dependency_catalog=runtime_state.dependency_catalog,
            dependency_graph=_GraphlessDependencyGraph(),
        )
        listener._project_config_id = project_state.projectConfig.id
        listener._dependency_cache = dict(initial_cache)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=count_key,
                    renderedValue="5",
                ),
                ListenerRenderedDependencyValue(
                    dependencyKey=section_key,
                    renderedValue="{'count': 5}",
                ),
            ]
        )

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=count_key,
                        value=LiteralDependencyValue("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {"count": 5}, {"count": 5})]
        assert listener._get_last_realtime_sequence() == 1

    async def test_realtime_uses_authoritative_composite_values_when_runtime_state_exists(
        self,
    ) -> None:
        project_state, section_id, param_id = _build_nested_controls_project_state(
            ID("project-runtime-composite")
        )
        listener = SettaListener(project_name=project_state.projectConfig.name)
        runtime_state = build_listener_runtime_state(project_state)
        initial_cache = build_listener_dependency_cache(listener, runtime_state)
        section_key = create_dep_key(sectionId=section_id)
        count_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        section_name = runtime_state.dependency_metadata.dependency_name(section_key)
        count_name = runtime_state.dependency_metadata.dependency_name(count_key)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(count_name,))
        def on_count(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, section_name),
                    ctx.values.by_id(section_id),
                    ctx.changed[count_name],
                )
            )

        listener._runtime_state = runtime_state
        listener._project_config_id = project_state.projectConfig.id
        listener._dependency_cache = dict(initial_cache)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=count_key,
                    renderedValue="5",
                ),
                ListenerRenderedDependencyValue(
                    dependencyKey=section_key,
                    renderedValue="{'count': 5}",
                ),
            ]
        )

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=count_key,
                        value=LiteralDependencyValue("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[count_name] == 5
        assert listener._dependency_cache[section_name] == {"count": 5}
        assert callback_calls == [({"count": 5}, {"count": 5}, 5)]
        assert listener._get_last_realtime_sequence() == 1

    async def test_realtime_triggers_composite_listener_from_authoritative_values_when_runtime_state_exists(
        self,
    ) -> None:
        project_state, section_id, param_id = _build_nested_controls_project_state(
            ID("project-runtime-composite-parent")
        )
        listener = SettaListener(project_name=project_state.projectConfig.name)
        runtime_state = build_listener_runtime_state(project_state)
        initial_cache = build_listener_dependency_cache(listener, runtime_state)
        section_key = create_dep_key(sectionId=section_id)
        count_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        section_name = runtime_state.dependency_metadata.dependency_name(section_key)
        callback_calls: list[tuple[dict[str, Any], dict[str, Any], Any]] = []

        @listener.listen(deps=(section_name,))
        def on_section(state, ctx) -> None:
            callback_calls.append(
                (
                    getattr(state, section_name),
                    ctx.values.by_id(section_id),
                    ctx.changed[section_name],
                )
            )

        listener._runtime_state = runtime_state
        listener._project_config_id = project_state.projectConfig.id
        listener._dependency_cache = dict(initial_cache)
        listener._refresh_callback_dependency_metadata(
            listener._runtime_state.dependency_metadata
        )
        dependency_values = ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=count_key,
                    renderedValue="5",
                ),
                ListenerRenderedDependencyValue(
                    dependencyKey=section_key,
                    renderedValue="{'count': 5}",
                ),
            ]
        )

        await listener._handle_realtime_event(
            ListenerRealtimeEventContent(
                projectConfigId=project_state.projectConfig.id,
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=count_key,
                        value=LiteralDependencyValue("5"),
                    )
                ],
                dependencyValues=dependency_values,
                sequence=1,
            )
        )

        callback_spec = next(iter(listener._callbacks.values()))
        await listener._scheduler.flush(callback_spec.callback_id)

        assert listener._dependency_cache[section_name] == {"count": 5}
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


class TestSettaListenerBinaryParsing:
    def test_text_realtime_event_round_trips_through_parser(self) -> None:
        listener = SettaListener(project_name="Text Parse")
        dependency = create_dep_key(sectionId=ID("section-1"))
        content = ListenerRealtimeEventContent(
            projectConfigId=ID("project-1"),
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency,
                    value=LiteralDependencyValue(payload="hello"),
                )
            ],
            sequence=1,
        )
        message = WebsocketMsgListenerRealtimeEvent(content=content)

        parsed = listener._parse_websocket_payload(message.model_dump_json())

        assert isinstance(parsed, WebsocketMsgListenerRealtimeEvent)
        assert parsed.content.projectConfigId == ID("project-1")
        assert parsed.content.deltas[0].dependency == dependency
        assert parsed.content.deltas[0].value == LiteralDependencyValue(payload="hello")

    def test_text_dependency_event_round_trips_through_parser(self) -> None:
        listener = SettaListener(project_name="Text Parse")
        dependency = create_dep_key(sectionId=ID("section-1"))
        content = ListenerDependencyEventContent(
            projectConfigId=ID("project-1"),
            dependencyEvents=[
                DependencyEvent(
                    dependencyKey=dependency,
                    payload=LiteralDependencyValue(payload="updated"),
                    timestampMs=123,
                )
            ],
            sequence=1,
        )
        message = WebsocketMsgListenerDependencyEvent(content=content)

        parsed = listener._parse_websocket_payload(message.model_dump_json())

        assert isinstance(parsed, WebsocketMsgListenerDependencyEvent)
        assert parsed.content.projectConfigId == ID("project-1")
        assert parsed.content.dependencyEvents[0].dependencyKey == dependency
        assert parsed.content.dependencyEvents[0].payload == LiteralDependencyValue(
            payload="updated"
        )

    def test_text_force_refresh_round_trips_through_parser(self) -> None:
        listener = SettaListener(project_name="Text Parse")
        dependency = create_dep_key(sectionId=ID("section-1"))
        content = ListenerForceRefreshContent(
            snapshot=ListenerSnapshot(
                projectConfigId=ID("project-1"),
                dependencyCatalog=ListenerDependencyCatalog(
                    entries=[
                        ListenerDependencyCatalogEntry(
                            dependencyKey=dependency,
                            name="Welcome",
                            fullPathName="Welcome",
                        )
                    ]
                ),
                dependencyValues=ListenerRenderedDependencyValues(
                    entries=[
                        ListenerRenderedDependencyValue(
                            dependencyKey=dependency,
                            renderedValue="Snapshot text",
                        )
                    ]
                ),
            )
        )
        message = WebsocketMsgListenerForceRefresh(content=content)

        parsed = listener._parse_websocket_payload(message.model_dump_json())

        assert isinstance(parsed, WebsocketMsgListenerForceRefresh)
        assert parsed.content.snapshot.projectConfigId == ID("project-1")
        assert parsed.content.snapshot.dependencyCatalog.entries
        assert parsed.content.snapshot.dependencyValues.entries

    def test_binary_realtime_event_applies_payload_to_all_deltas(self) -> None:
        listener = SettaListener(project_name="Binary Parse")
        dependency_one = create_dep_key(sectionId=ID("section-1"))
        dependency_two = create_dep_key(sectionId=ID("section-2"))
        ref = BinaryContentRef(
            contentId="binary-1",
            byteLength=3,
            mimeType="image/png",
        )
        delta_one = ListenerRealtimeDelta(
            dependency=dependency_one,
            value=BinaryDependencyValue(payload=ref),
        )
        delta_two = ListenerRealtimeDelta(
            dependency=dependency_two,
            value=BinaryDependencyValue(payload=ref),
        )
        content = ListenerRealtimeEventContent(
            projectConfigId=ID("project-1"),
            deltas=[delta_one, delta_two],
            sequence=1,
        )
        message = WebsocketMsgListenerRealtimeEvent(content=content)
        payload = encode_binary_frame(message.model_dump(mode="json"), b"payload")

        parsed = listener._parse_websocket_payload(payload)

        assert isinstance(parsed, WebsocketMsgListenerRealtimeEvent)
        assert parsed.content.deltas[0].binaryPayload == b"payload"
        assert parsed.content.deltas[1].binaryPayload == b"payload"

    def test_binary_dependency_event_applies_payload_to_all_events(self) -> None:
        listener = SettaListener(project_name="Binary Parse")
        dependency_one = create_dep_key(sectionId=ID("section-1"))
        dependency_two = create_dep_key(sectionId=ID("section-2"))
        ref = BinaryContentRef(
            contentId="binary-2",
            byteLength=5,
            mimeType="application/octet-stream",
        )
        event_one = DependencyEvent(
            dependencyKey=dependency_one,
            payload=BinaryDependencyValue(payload=ref),
            timestampMs=123,
        )
        event_two = DependencyEvent(
            dependencyKey=dependency_two,
            payload=BinaryDependencyValue(payload=ref),
            timestampMs=456,
        )
        content = ListenerDependencyEventContent(
            projectConfigId=ID("project-1"),
            dependencyEvents=[event_one, event_two],
            sequence=1,
        )
        message = WebsocketMsgListenerDependencyEvent(content=content)
        payload = encode_binary_frame(message.model_dump(mode="json"), b"payload")

        parsed = listener._parse_websocket_payload(payload)

        assert isinstance(parsed, WebsocketMsgListenerDependencyEvent)
        assert parsed.content.dependencyEvents[0].binaryPayload == b"payload"
        assert parsed.content.dependencyEvents[1].binaryPayload == b"payload"

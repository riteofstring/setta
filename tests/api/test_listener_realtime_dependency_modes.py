import asyncio
from typing import Any

import pytest
from setta.api.listener import (
    ListenerCallbackSpec,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    SettaListener,
)
from setta.types.generated.go_shared_types import ListenerDependencyMode
from setta.types.id import ID
from setta.types.protocol import BaseDependencyKeyUnion, create_dep_key

from tests.api.test_listener_realtime import (
    _StubWebsocket,
    _TextListenerFixture,
    _attach_stub_websocket,
    _build_force_refresh_content,
    _literal_dependency_value,
    _refresh_from_authoritative_snapshot,
)


@pytest.mark.asyncio
class TestSettaListenerRealtimeDependencyModes:
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

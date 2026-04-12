import asyncio
from unittest.mock import AsyncMock

import pytest
from setta.api.listener import (
    DependencyEvent,
    ListenerDependencyEventContent,
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
    DependencyValueType,
    ListenerDependencyMode,
    LiteralDependencyValue,
)
from setta.types.id import ID
from setta.types.protocol import create_dep_key


def _literal_dependency_value(payload: str) -> LiteralDependencyValue:
    return LiteralDependencyValue(
        type=DependencyValueType.Literal,
        payload=payload,
    )


def _build_snapshot(
    *,
    project_config_id: ID,
    section_id: ID,
    value: str,
) -> ListenerSnapshot:
    dependency_key = create_dep_key(sectionId=section_id)
    return ListenerSnapshot(
        projectConfigId=project_config_id,
        dependencyCatalog=ListenerDependencyCatalog(
            entries=[
                ListenerDependencyCatalogEntry(
                    dependencyKey=dependency_key,
                    name="Welcome",
                    fullPathName="Welcome",
                )
            ]
        ),
        dependencyValues=ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=dependency_key,
                    renderedValue=repr(value),
                )
            ]
        ),
    )


@pytest.mark.asyncio
async def test_realtime_event_preflight_updates_sequence_and_cache() -> None:
    project_config_id = ID("project-live")
    section_id = ID("section-live")
    listener = SettaListener(project_name="Project Live")
    callback_calls: list[dict[str, object]] = []

    @listener.listen(deps=("Welcome",))
    def on_change(_state, ctx) -> None:
        callback_calls.append(dict(ctx.changed))

    await listener._refresh_from_snapshot(
        _build_snapshot(
            project_config_id=project_config_id,
            section_id=section_id,
            value="Hello",
        ),
        refresh_kind="force_refresh",
    )
    await asyncio.sleep(0)
    callback_calls.clear()
    listener._render_local_core_dependency_values = AsyncMock(return_value=None)

    spec = next(iter(listener._callbacks.values()))
    dependency_key = spec.structured_dependencies[0]
    await listener._handle_realtime_event(
        ListenerRealtimeEventContent(
            projectConfigId=project_config_id,
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value=_literal_dependency_value("Updated"),
                )
            ],
            dependencyValues=ListenerRenderedDependencyValues(
                entries=[
                    ListenerRenderedDependencyValue(
                        dependencyKey=dependency_key,
                        renderedValue=repr("Updated"),
                    )
                ]
            ),
            sequence=1,
        )
    )
    await listener._scheduler.flush(spec.callback_id)

    assert callback_calls == [{"Welcome": "Updated"}]
    assert listener._dependency_cache == {"Welcome": "Updated"}
    assert listener._get_last_realtime_sequence() == 1


@pytest.mark.asyncio
async def test_dependency_event_preflight_updates_sequence_and_dispatches() -> None:
    project_config_id = ID("project-events")
    section_id = ID("section-events")
    dependency_key = create_dep_key(sectionId=section_id)
    listener = SettaListener(project_name="Project Events")
    event_payloads: list[list[str | None]] = []

    @listener.listen(
        deps=(dependency_key,),
        dependency_mode=ListenerDependencyMode.realtime_only,
    )
    def on_event(_state, ctx) -> None:
        event_payloads.append(
            [
                event.payload.payload
                if isinstance(event.payload, LiteralDependencyValue)
                else None
                for event in ctx.events
            ]
        )

    await listener._refresh_from_snapshot(
        _build_snapshot(
            project_config_id=project_config_id,
            section_id=section_id,
            value="Hello",
        ),
        refresh_kind="force_refresh",
    )
    await asyncio.sleep(0)

    spec = next(iter(listener._callbacks.values()))
    await listener._handle_dependency_event(
        ListenerDependencyEventContent(
            projectConfigId=project_config_id,
            dependencyEvents=[
                DependencyEvent(
                    dependencyKey=dependency_key,
                    payload=_literal_dependency_value("payload-a"),
                    timestampMs=1,
                )
            ],
            sequence=3,
        )
    )
    await listener._scheduler.flush(spec.callback_id)

    assert event_payloads == [["payload-a"]]
    assert listener._get_last_realtime_sequence() == 3

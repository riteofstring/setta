import contextlib
import io
import logging
from typing import Any

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
)
from setta.types.generated.go_shared_types import (
    CodeObjType,
    CodeObjValueRepresentationMode,
    ListenerErrorContent,
    ListenerErrorMessage,
    ListenerMessageType,
    ParameterPassingStyle,
)
from setta.types.protocol import create_dep_key

from tests.api.test_listener_realtime import (
    PARAM_SLIDER_ID,
    PARAM_SWITCH_ID,
    PROJECT_TYPED_ID,
    SECTION_ONE_ID,
    _GraphlessDependencyGraph,
    _StubWebsocket,
    _attach_stub_websocket,
    _literal_dependency_value,
)
from tests.helpers.listener_runtime_state import ListenerTestRuntimeState


@pytest.mark.asyncio
class TestSettaListenerRealtimeValuesAndErrors:
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
                    passingStyle=ParameterPassingStyle.DEFAULT,
                    valueRepresentation=CodeObjValueRepresentationMode.expression,
                ),
                ListenerDependencyCatalogEntry(
                    dependencyKey=switch_key,
                    name="switch",
                    fullPathName="section__switch",
                    codeObjType=CodeObjType.SwitchParam,
                    passingStyle=ParameterPassingStyle.DEFAULT,
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
                    value=_literal_dependency_value("5"),
                ),
                ListenerRealtimeDelta(
                    dependency=create_dep_key(
                        sectionId=SECTION_ONE_ID,
                        codeObjId=PARAM_SWITCH_ID,
                    ),
                    value=_literal_dependency_value("true"),
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
        error_message = ListenerErrorMessage(
            messageType=ListenerMessageType.ListenerError,
            content=ListenerErrorContent(
                error="project_state_unavailable",
                details={"projectName": "dog"},
            ),
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

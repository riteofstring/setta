import asyncio
import contextlib
import io
import json
import logging
import unittest
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock

from setta.api.listener import (
    ListenerCallbackSpec,
    ListenerRuntimeState,
    SettaListener,
)
from setta.code_gen.dependency_graph import DependencyGraph, ParamNode
from setta.code_gen.value_codec import PythonValueCodec
from setta.code_gen.utils import GEN_CODE_INSTANCE_NAME
from setta.types.code_obj_impls import CodeObjType, ParameterPassingStyle
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.id import ID
from setta.types.listener import (
    ControlActionEvent,
    ListenerActionEventContent,
    ListenerDependencyMode,
    ListenerErrorContent,
    ListenerForceRefreshContent,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl
from setta.types.websocket import WebsocketMsgListenerError

if TYPE_CHECKING:
    from setta.code_gen.python.code_generator import PythonCodeGenerator
    from websockets import ClientConnection


class _StubWebsocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, payload: str) -> None:
        self.sent.append(payload)


def _attach_stub_websocket(listener: SettaListener, websocket: _StubWebsocket) -> None:
    listener._websocket = cast("ClientConnection", websocket)


PROJECT_TYPED_ID = ID("project-typed")
SECTION_ONE_ID = ID("section-1")
PARAM_SLIDER_ID = ID("param-slider")
PARAM_SWITCH_ID = ID("param-switch")


class SettaListenerRealtimeIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def _build_project_state(self) -> ProjectStateSingleConfig:
        section_impl = TextBlockSectionImpl(
            id=ID("section-impl"),
            name="Welcome",
            text="Hello",
        )
        section_variant = Variant(
            id=ID("section-variant"),
            name="Welcome Variant",
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id=ID("section-welcome"),
            name="Welcome",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )
        project_config = ProjectConfig(
            id=ID("project-1"),
            name="Demo Project",
            sectionVariantMap={section_core.id: section_variant.id},
            topLevelSections={section_core.id: TopLevelSectionLayout()},
        )
        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section_core.id: section_core},
            sectionImpls={section_impl.id: section_impl},
            sectionVariants={section_variant.id: section_variant},
        )

    def _set_snapshot_section_text(
        self,
        project_state: ProjectStateSingleConfig,
        text: str,
    ) -> None:
        section_id = next(iter(project_state.sections))
        impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            section_id,
            TextBlockSectionImpl,
        )
        section_impl = project_state.sectionImpls[impl.id]
        if not isinstance(section_impl, TextBlockSectionImpl):
            raise AssertionError("Snapshot fixture expected TextBlockSectionImpl")
        section_impl.text = text

    def _get_structured_dependency(
        self, spec: ListenerCallbackSpec
    ) -> BaseDependencyKeyUnion:
        if not spec.structured_dependencies:
            raise AssertionError("Callback structured dependencies not populated")
        return spec.structured_dependencies[0]

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
        def on_realtime(state, ctx):
            realtime_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_refresh(state, ctx):
            refresh_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await listener._refresh_from_snapshot(project_state)
        await asyncio.sleep(0)

        self.assertEqual(refresh_calls, [{"Welcome": "Hello"}])
        self.assertEqual(realtime_calls, [{"Welcome": "Hello"}])
        self.assertTrue(websocket.sent)

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
        self.assertEqual(realtime_calls, [{"Welcome": "Hello"}])

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

        self.assertEqual(
            realtime_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated-2"}],
        )
        self.assertEqual(listener._dependency_cache.get("Welcome"), "Updated-2")
        self.assertEqual(listener._get_last_realtime_sequence(), 2)

        register_payload = json.loads(websocket.sent[-1])
        self.assertIn("callbacks", register_payload["content"])
        callback_payloads = list(register_payload["content"]["callbacks"].values())
        self.assertEqual(callback_payloads[0]["debounceMs"], 50)

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

        async def on_refresh(state, ctx) -> None:
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

        await listener._process_snapshot(
            project_state,
            refresh_kind="force_refresh",
            share_session_id=None,
        )
        try:
            await asyncio.wait_for(ready_event.wait(), timeout=1.0)
            self.assertEqual(concurrency, max_active)
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
        def on_refresh(state, ctx):
            run_on_refresh_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_standard(state, ctx):
            standard_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await listener._refresh_from_snapshot(project_state)
        await asyncio.sleep(0)

        self.assertEqual(run_on_refresh_calls, [{"Welcome": "Hello"}])
        self.assertEqual(standard_calls, [{"Welcome": "Hello"}])

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

        self.assertEqual(
            run_on_refresh_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}],
        )
        self.assertEqual(
            standard_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}],
        )
        self.assertEqual(listener._get_last_realtime_sequence(), 1)

        refreshed_state = project_state.model_copy(deep=True)
        self._set_snapshot_section_text(refreshed_state, "Updated")

        await listener._handle_force_refresh(
            ListenerForceRefreshContent(projectState=refreshed_state)
        )
        await asyncio.sleep(0)

        self.assertIsNone(listener._get_last_realtime_sequence())
        self.assertEqual(
            run_on_refresh_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}, {}],
        )
        self.assertEqual(
            standard_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}],
        )

    async def test_realtime_sequences_are_tracked_for_share_session(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
            share_session_id="session-a",
        )
        realtime_calls: list[dict[str, Any]] = []

        @listener.listen(deps=("Welcome",))
        def on_realtime(state, ctx):
            realtime_calls.append(dict(ctx.changed))

        await listener._process_snapshot(
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

        self.assertEqual(
            realtime_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Update-A"}, {"Welcome": "Update-B"}],
        )
        self.assertEqual(listener._get_last_realtime_sequence(), 2)

    async def test_realtime_rejects_unconfigured_share_session(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)

        @listener.listen(deps=("Welcome",))
        def on_realtime(state, ctx):
            pass

        await listener._process_snapshot(
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

        with self.assertRaises(ValueError):
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
        action_calls: list[list[str]] = []

        @listener.listen(actions=("action-id",))
        def on_action(state, ctx):
            action_calls.append([event.controlName for event in ctx.actions])

        await listener._process_snapshot(
            project_state,
            refresh_kind="force_refresh",
            share_session_id="session-a",
        )
        await asyncio.sleep(0)

        action_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.function is on_action
        )

        await listener._handle_action_event(
            ListenerActionEventContent(
                projectConfigId=project_state.projectConfig.id,
                shareSessionId="session-a",
                actionEvents=[
                    ControlActionEvent(
                        controlName="Control-A",
                        actionId="action-id",
                        payload="payload-a",
                        timestampMs=1,
                    )
                ],
                sequence=1,
            )
        )
        await listener._scheduler.flush(action_spec.callback_id)

        await listener._handle_action_event(
            ListenerActionEventContent(
                projectConfigId=project_state.projectConfig.id,
                shareSessionId="session-a",
                actionEvents=[
                    ControlActionEvent(
                        controlName="Control-B",
                        actionId="action-id",
                        payload="payload-b",
                        timestampMs=2,
                    )
                ],
                sequence=2,
            )
        )
        await listener._scheduler.flush(action_spec.callback_id)

        self.assertEqual(action_calls, [["Control-A"], ["Control-B"]])
        self.assertEqual(listener._get_last_realtime_sequence(), 2)

    async def test_action_rejects_mismatched_share_session(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(
            project_name=project_state.projectConfig.name,
            share_session_id="session-a",
        )

        @listener.listen(actions=("action-id",))
        def on_action(state, ctx):
            pass

        await listener._process_snapshot(
            project_state,
            refresh_kind="force_refresh",
            share_session_id="session-a",
        )
        await asyncio.sleep(0)

        with self.assertRaises(ValueError):
            await listener._handle_action_event(
                ListenerActionEventContent(
                    projectConfigId=project_state.projectConfig.id,
                    shareSessionId="session-b",
                    actionEvents=[
                        ControlActionEvent(
                            controlName="Control-B",
                            actionId="action-id",
                            payload="payload-b",
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
        def on_refresh(state, ctx):
            refresh_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_realtime(state, ctx):
            realtime_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await listener._refresh_from_snapshot(project_state)
        await asyncio.sleep(0)

        self.assertEqual(refresh_calls, [{"Welcome": "Hello"}])
        self.assertEqual(realtime_calls, [{"Welcome": "Hello"}])

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

        self.assertEqual(refresh_calls, [{"Welcome": "Hello"}])
        self.assertEqual(
            realtime_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}],
        )

        refreshed_state = project_state.model_copy(deep=True)
        self._set_snapshot_section_text(refreshed_state, "Updated")

        await listener._handle_force_refresh(
            ListenerForceRefreshContent(projectState=refreshed_state)
        )
        await asyncio.sleep(0)

        self.assertEqual(
            refresh_calls,
            [{"Welcome": "Hello"}, {}],
        )
        self.assertEqual(
            realtime_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}],
        )

    async def test_any_dependency_callbacks_receive_all_deltas(self) -> None:
        project_state = self._build_project_state()
        listener = SettaListener(project_name=project_state.projectConfig.name)
        any_calls: list[dict[str, Any]] = []
        specific_calls: list[dict[str, Any]] = []

        @listener.listen(dependency_mode=ListenerDependencyMode.ANY_DEPENDENCY)
        def on_any(state, ctx):
            any_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",))
        def on_specific(state, ctx):
            specific_calls.append(dict(ctx.changed))

        websocket = _StubWebsocket()
        _attach_stub_websocket(listener, websocket)

        await listener._refresh_from_snapshot(project_state)
        await asyncio.sleep(0)

        self.assertEqual(any_calls, [{}])
        self.assertEqual(specific_calls, [{"Welcome": "Hello"}])

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

        self.assertEqual(
            any_calls,
            [{}, {"Welcome": "Updated"}],
        )
        self.assertEqual(
            specific_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}],
        )

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

        state = SimpleNamespace(section__slider=1, section__switch=False)

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
        value_codec = PythonValueCodec(
            dep_graph,
            lambda key: (
                f"{GEN_CODE_INSTANCE_NAME}.{dep_graph.graph[key].full_path_name}"
            ),
        )

        code_generator = cast(
            "PythonCodeGenerator",
            SimpleNamespace(
                value_codec=value_codec,
                get_value=lambda node: value_codec.format_param_expression(node)
                if isinstance(node, ParamNode)
                else None,
            ),
        )

        listener._runtime_state = ListenerRuntimeState(
            project_state=MagicMock(),
            dependency_graph=dep_graph,
            code_generator=code_generator,
            s_instance=state,
        )
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

        self.assertEqual(state.section__slider, 5)
        self.assertIsInstance(state.section__slider, int)
        self.assertEqual(slider_events, [(5, 5)])
        self.assertEqual(listener._dependency_cache["section__slider"], 5)

        self.assertTrue(state.section__switch)
        self.assertIsInstance(state.section__switch, bool)
        self.assertEqual(switch_events, [(True, True)])
        self.assertTrue(listener._dependency_cache["section__switch"])
        self.assertEqual(listener._get_last_realtime_sequence(), 1)

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
        self.assertIn(
            "Listener name:Project Missing received error project_state_unavailable",
            output,
        )


class SettaListenerBootstrapFailureTests(unittest.IsolatedAsyncioTestCase):
    def _build_project_state(self) -> ProjectStateSingleConfig:
        section_impl = TextBlockSectionImpl(
            id=ID("section-impl"),
            name="Welcome",
            text="Hello",
        )
        section_variant = Variant(
            id=ID("section-variant"),
            name="Variant",
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id=ID("section-welcome"),
            name="Welcome",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )
        project_config = ProjectConfig(
            id=ID("project-fail"),
            name="Demo Project",
            sectionVariantMap={section_core.id: section_variant.id},
            topLevelSections={section_core.id: TopLevelSectionLayout()},
        )
        return ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={section_core.id: section_core},
            sectionImpls={section_impl.id: section_impl},
            sectionVariants={section_variant.id: section_variant},
        )

    async def test_bootstrap_registers_when_state_instantiation_fails(self) -> None:
        listener = SettaListener(project_name="Demo Project")

        @listener.listen(deps=("Welcome",))
        def on_change(state, ctx):  # pragma: no cover - invoked only on success
            raise AssertionError("callback should not execute when runtime state fails")

        project_state = self._build_project_state()

        register_payloads: list[dict[str, Any]] = []

        async def capture_payload(payload: str) -> None:
            register_payloads.append(json.loads(payload))

        listener._instantiate_state = MagicMock(
            side_effect=ValueError("math domain error")
        )
        listener._send_websocket_payload = AsyncMock(side_effect=capture_payload)

        await listener._refresh_from_snapshot(project_state)

        self.assertIsNotNone(listener._runtime_state)
        assert listener._runtime_state is not None  # help type checkers
        self.assertIsNone(listener._runtime_state.s_instance)
        self.assertTrue(listener._registration_pending)
        self.assertEqual(1, len(register_payloads))
        self.assertEqual("ListenerRegister", register_payloads[0]["messageType"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

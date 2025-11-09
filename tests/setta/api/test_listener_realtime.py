import asyncio
import contextlib
import io
import json
import logging
import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

from setta.api.listener import (
    ListenerCallbackSpec,
    ListenerRuntimeState,
    SettaListener,
)
from setta.code_gen.dependency_graph import ParamNode
from setta.code_gen.value_codec import PythonValueCodec
from setta.types.code_obj_impls import CodeObjType, ParameterPassingStyle
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import DependencyValue
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.listener import (
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


class _StubWebsocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send(self, payload: str) -> None:
        self.sent.append(payload)


class SettaListenerRealtimeIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def _build_project_state(self) -> ProjectStateSingleConfig:
        section_impl = TextBlockSectionImpl(
            id="section-impl",
            name="Welcome",
            text="Hello",
        )
        section_variant = Variant(
            id="section-variant",
            name="Welcome Variant",
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id="section-welcome",
            name="Welcome",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )
        project_config = ProjectConfig(
            id="project-1",
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
        listener._websocket = websocket

        await listener._refresh_from_snapshot(project_state)

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
            projectConfigId="project-1",
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value=DependencyValue.literal("Updated-1"),
                )
            ],
            sequence=1,
        )
        await listener._handle_realtime_event(first_content)
        await asyncio.sleep(0.02)
        self.assertEqual(realtime_calls, [{"Welcome": "Hello"}])

        second_content = ListenerRealtimeEventContent(
            projectConfigId="project-1",
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value=DependencyValue.literal("Updated-2"),
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
        self.assertEqual(listener._last_realtime_sequence, 2)

        register_payload = json.loads(websocket.sent[-1])
        self.assertIn("callbacks", register_payload["content"])
        callback_payloads = list(register_payload["content"]["callbacks"].values())
        self.assertEqual(callback_payloads[0]["debounceMs"], 50)

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
        listener._websocket = websocket

        await listener._refresh_from_snapshot(project_state)

        self.assertEqual(run_on_refresh_calls, [{"Welcome": "Hello"}])
        self.assertEqual(standard_calls, [{"Welcome": "Hello"}])

        refresh_spec = next(
            spec for spec in listener._callbacks.values() if spec.function is on_refresh
        )
        dependency_key = self._get_structured_dependency(refresh_spec)

        realtime_event = ListenerRealtimeEventContent(
            projectConfigId="project-1",
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value=DependencyValue.literal("Updated"),
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
        self.assertEqual(listener._last_realtime_sequence, 1)

        refreshed_state = project_state.model_copy(deep=True)
        section_impl_id = next(iter(refreshed_state.sectionImpls))
        refreshed_state.sectionImpls[section_impl_id].text = "Updated"

        await listener._handle_force_refresh(
            ListenerForceRefreshContent(projectState=refreshed_state)
        )

        self.assertIsNone(listener._last_realtime_sequence)
        self.assertEqual(
            run_on_refresh_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}, {}],
        )
        self.assertEqual(
            standard_calls,
            [{"Welcome": "Hello"}, {"Welcome": "Updated"}],
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
        listener._websocket = websocket

        await listener._refresh_from_snapshot(project_state)

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
                projectConfigId="project-1",
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=DependencyValue.literal("Updated"),
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
        section_impl_id = next(iter(refreshed_state.sectionImpls))
        refreshed_state.sectionImpls[section_impl_id].text = "Updated"

        await listener._handle_force_refresh(
            ListenerForceRefreshContent(projectState=refreshed_state)
        )

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
        listener._websocket = websocket

        await listener._refresh_from_snapshot(project_state)

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
                projectConfigId="project-1",
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=dependency_key,
                        value=DependencyValue.literal("Updated"),
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
            id="param-slider",
            name="slider",
            full_path_name="section__slider",
            type=CodeObjType.SliderParam,
            isTopLevel=True,
            value=DependencyValue.literal("1"),
            deps={},
            passing_style=ParameterPassingStyle.DEFAULT,
        )
        switch_node = ParamNode(
            id="param-switch",
            name="switch",
            full_path_name="section__switch",
            type=CodeObjType.SwitchParam,
            isTopLevel=True,
            value=DependencyValue.literal("false"),
            deps={},
            passing_style=ParameterPassingStyle.DEFAULT,
        )

        slider_key = create_dep_key(
            sectionId="section-1",
            codeObjId="param-slider",
        )
        switch_key = create_dep_key(
            sectionId="section-1",
            codeObjId="param-switch",
        )
        graph = {
            slider_key: slider_node,
            switch_key: switch_node,
        }

        state = SimpleNamespace(section__slider=1, section__switch=False)

        dep_graph = SimpleNamespace(graph=graph)
        value_codec = PythonValueCodec(
            dep_graph,
            lambda key: f"s.{dep_graph.graph[key].full_path_name}",
        )

        code_generator = SimpleNamespace(
            value_codec=value_codec,
            get_value=lambda node: value_codec.format_param_expression(node)
            if isinstance(node, ParamNode)
            else None,
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
        listener._websocket = websocket

        event = ListenerRealtimeEventContent(
            projectConfigId="project-typed",
            deltas=[
                ListenerRealtimeDelta(
                    dependency=create_dep_key(
                        sectionId="section-1",
                        codeObjId="param-slider",
                    ),
                    value=DependencyValue.literal("5"),
                ),
                ListenerRealtimeDelta(
                    dependency=create_dep_key(
                        sectionId="section-1",
                        codeObjId="param-switch",
                    ),
                    value=DependencyValue.literal("true"),
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
        self.assertEqual(listener._last_realtime_sequence, 1)

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

        root_handlers = list(root_logger.handlers)
        module_handlers = list(module_logger.handlers)
        original_propagate = module_logger.propagate

        for handler in module_handlers:
            module_logger.removeHandler(handler)
        for handler in root_handlers:
            root_logger.removeHandler(handler)

        stream = io.StringIO()
        try:
            with contextlib.redirect_stderr(stream):
                await listener._dispatch_websocket_message(error_message)
        finally:
            for handler in module_handlers:
                module_logger.addHandler(handler)
            module_logger.propagate = original_propagate
            for handler in root_handlers:
                root_logger.addHandler(handler)

        output = stream.getvalue()
        self.assertIn(
            "Listener name:Project Missing received error project_state_unavailable",
            output,
        )


class SettaListenerBootstrapFailureTests(unittest.IsolatedAsyncioTestCase):
    def _build_project_state(self) -> ProjectStateSingleConfig:
        section_impl = TextBlockSectionImpl(
            id="section-impl",
            name="Welcome",
            text="Hello",
        )
        section_variant = Variant(
            id="section-variant",
            name="Variant",
            impl=section_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
        )
        section_core = Core(
            id="section-welcome",
            name="Welcome",
            variants=[section_variant.id],
            defaultVariant=section_variant.id,
        )
        project_config = ProjectConfig(
            id="project-fail",
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

        listener._instantiate_s = MagicMock(side_effect=ValueError("math domain error"))
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

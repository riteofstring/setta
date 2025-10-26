import asyncio
import json
import unittest
from typing import Any

from setta.api.listener import ListenerCallbackSpec, SettaListener
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.listener import (
    ListenerDependencyKey,
    ListenerFeed,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl


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
    ) -> ListenerDependencyKey:
        if not spec.structured_dependencies:
            raise AssertionError("Callback structured dependencies not populated")
        return spec.structured_dependencies[0]

    async def test_realtime_callback_respects_debounce_scheduler(self) -> None:
        listener = SettaListener(project_id="project-1")
        realtime_calls: list[dict[str, Any]] = []
        persisted_calls: list[dict[str, Any]] = []

        @listener.listen(
            deps=("Welcome",),
            feed=ListenerFeed.REALTIME,
            debounce_ms=50,
        )
        def on_realtime(state, ctx):
            realtime_calls.append(dict(ctx.changed))

        @listener.listen(deps=("Welcome",), feed=ListenerFeed.PERSISTED)
        def on_persisted(state, ctx):
            persisted_calls.append(dict(ctx.changed))

        project_state = self._build_project_state()
        websocket = _StubWebsocket()

        await listener._handle_persisted_snapshot(
            project_state,
            is_bootstrap=True,
            websocket=websocket,
        )

        self.assertEqual(persisted_calls, [{"Welcome": "Hello"}])
        self.assertTrue(websocket.sent)

        realtime_spec = next(
            spec
            for spec in listener._callbacks.values()
            if spec.feed is ListenerFeed.REALTIME
        )
        dependency_key = self._get_structured_dependency(realtime_spec)

        first_content = ListenerRealtimeEventContent(
            projectConfigId="project-1",
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value="Updated-1",
                )
            ],
            sequence=1,
        )
        await listener._handle_realtime_event(first_content)
        await asyncio.sleep(0.02)
        self.assertEqual(realtime_calls, [])

        second_content = ListenerRealtimeEventContent(
            projectConfigId="project-1",
            deltas=[
                ListenerRealtimeDelta(
                    dependency=dependency_key,
                    value="Updated-2",
                )
            ],
            sequence=2,
        )
        await listener._handle_realtime_event(second_content)

        await asyncio.sleep(0.1)

        self.assertEqual(realtime_calls, [{"Welcome": "Updated-2"}])
        self.assertEqual(listener._dependency_cache.get("Welcome"), "Updated-2")
        self.assertEqual(listener._last_realtime_sequence, 2)

        register_payload = json.loads(websocket.sent[-1])
        self.assertIn("callbacks", register_payload["content"])
        callback_payloads = list(register_payload["content"]["callbacks"].values())
        self.assertEqual(callback_payloads[0]["debounceMs"], 50)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()


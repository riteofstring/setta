import unittest

from setta.api import SettaListener
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.listener import (
    ListenerFeed,
    ListenerRealtimeEventContent,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import TextBlockSectionImpl


class SettaListenerRealtimeTests(unittest.IsolatedAsyncioTestCase):
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

    async def test_realtime_event_invokes_registered_callbacks(self) -> None:
        listener = SettaListener(project_id="project-1")
        realtime_calls: list[tuple[str, dict[str, str]]] = []
        realtime_all_calls: list[dict[str, str]] = []
        persisted_calls: list[dict[str, str]] = []
        ignored_calls: list[dict[str, str]] = []

        @listener.listen(deps=["Welcome"], feed=ListenerFeed.REALTIME)
        def handle_specific(state, ctx):
            realtime_calls.append((state.Welcome, dict(ctx.changed)))

        @listener.listen(feed=ListenerFeed.REALTIME)
        def handle_all(state, ctx):
            realtime_all_calls.append(dict(ctx.changed))

        @listener.listen(deps=["Welcome"], feed=ListenerFeed.PERSISTED)
        def handle_persisted(state, ctx):
            persisted_calls.append(dict(ctx.changed))

        @listener.listen(deps=["OtherDependency"], feed=ListenerFeed.REALTIME)
        def handle_ignored(state, ctx):
            ignored_calls.append(dict(ctx.changed))

        project_state = self._build_project_state()
        await listener._handle_persisted_snapshot(project_state, is_bootstrap=True)

        initial_persisted_count = len(persisted_calls)
        self.assertEqual(initial_persisted_count, 1)
        self.assertEqual(listener._dependency_cache.get("Welcome"), "Hello")

        content = ListenerRealtimeEventContent(
            projectConfigId="project-1",
            dependencyIds=["Welcome"],
            delta={"Welcome": "Updated"},
            sequence=1,
        )

        await listener._handle_realtime_event(content)

        self.assertIsNotNone(listener._runtime_state)
        assert listener._runtime_state is not None
        self.assertEqual(listener._runtime_state.s_instance.Welcome, "Updated")
        self.assertEqual(listener._dependency_cache.get("Welcome"), "Updated")
        self.assertEqual(listener._last_realtime_sequence, content.sequence)

        self.assertEqual(realtime_calls, [("Updated", {"Welcome": "Updated"})])
        self.assertEqual(realtime_all_calls, [{"Welcome": "Updated"}])
        self.assertEqual(ignored_calls, [])
        self.assertEqual(len(persisted_calls), initial_persisted_count)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

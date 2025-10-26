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


class SettaListenerPersistedResilienceTests(unittest.IsolatedAsyncioTestCase):
    def _build_empty_project_state(
        self, project_id: str, *, gen_code_suffix: str | None = None
    ) -> ProjectStateSingleConfig:
        project_config = ProjectConfig(
            id=project_id,
            name="Resilience Project",
            genCodeSuffix=gen_code_suffix or "s = S()",
        )
        return ProjectStateSingleConfig(projectConfig=project_config)

    async def test_snapshot_guard_preserves_previous_runtime_on_build_error(
        self,
    ) -> None:
        listener = SettaListener(project_id="project-1")
        persisted_calls: list[dict[str, str]] = []

        @listener.listen(feed=ListenerFeed.PERSISTED)
        def handle_all(state, ctx):
            persisted_calls.append(dict(ctx.changed))

        valid_state = self._build_empty_project_state("project-1")
        await listener._handle_persisted_snapshot(valid_state, is_bootstrap=True)
        self.assertIsNotNone(listener._runtime_state)
        assert listener._runtime_state is not None
        previous_runtime = listener._runtime_state
        previous_cache = dict(listener._dependency_cache)
        self.assertEqual(persisted_calls, [{}])

        bad_state = self._build_empty_project_state(
            "project-1", gen_code_suffix="s = S(unknown_kw=1)"
        )
        await listener._handle_persisted_snapshot(bad_state, is_bootstrap=False)

        self.assertIs(listener._runtime_state, previous_runtime)
        self.assertEqual(listener._dependency_cache, previous_cache)
        self.assertEqual(persisted_calls, [{}])

        followup_state = self._build_empty_project_state("project-1")
        await listener._handle_persisted_snapshot(followup_state, is_bootstrap=False)

        self.assertIsNot(listener._runtime_state, previous_runtime)
        self.assertEqual(persisted_calls, [{}, {}])

    async def test_snapshot_uses_cached_value_when_dependency_missing(self) -> None:
        listener = SettaListener(project_id="project-1")
        changed_calls: list[dict[str, int]] = []

        @listener.listen(deps=["missing"], feed=ListenerFeed.PERSISTED)
        def handle_missing(state, ctx):
            changed_calls.append(dict(ctx.changed))

        initial_state = self._build_empty_project_state(
            "project-1", gen_code_suffix="s = S()\ns.missing = 1"
        )
        await listener._handle_persisted_snapshot(initial_state, is_bootstrap=True)
        self.assertEqual(changed_calls, [{"missing": 1}])
        self.assertEqual(listener._dependency_cache.get("missing"), 1)
        first_runtime = listener._runtime_state

        missing_state = self._build_empty_project_state("project-1")
        await listener._handle_persisted_snapshot(missing_state, is_bootstrap=False)

        self.assertIsNot(listener._runtime_state, first_runtime)
        self.assertEqual(changed_calls, [{"missing": 1}])
        self.assertEqual(listener._dependency_cache.get("missing"), 1)

        restored_state = self._build_empty_project_state(
            "project-1", gen_code_suffix="s = S()\ns.missing = 2"
        )
        await listener._handle_persisted_snapshot(restored_state, is_bootstrap=False)

        self.assertEqual(changed_calls, [{"missing": 1}, {"missing": 2}])
        self.assertEqual(listener._dependency_cache.get("missing"), 2)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

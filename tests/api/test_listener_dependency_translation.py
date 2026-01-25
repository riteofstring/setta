import unittest
from typing import TYPE_CHECKING, cast

from setta.api.listener import ListenerRuntimeState, SettaListener
from setta.code_gen.dependency_graph import DependencyGraph
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import GroupSectionImpl, TextBlockSectionImpl

if TYPE_CHECKING:
    from setta.code_gen.python.code_generator import PythonCodeGenerator


def _build_project_state_with_duplicate_names():
    group_impl = GroupSectionImpl(
        id=ID("impl-group"),
        name="Settings Group",
        children=[ID("section-child-1"), ID("section-child-2")],
    )
    first_child_impl = TextBlockSectionImpl(
        id=ID("impl-child-1"),
        name="Data Source",
        text="Hello",
    )
    second_child_impl = TextBlockSectionImpl(
        id=ID("impl-child-2"),
        name="Data-Source",
        text="World",
    )

    group_variant = Variant(
        id=ID("variant-group"),
        name="Settings Group",
        impl=group_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(group_impl),
    )
    first_child_variant = Variant(
        id=ID("variant-child-1"),
        name="Data Source",
        impl=first_child_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(first_child_impl),
    )
    second_child_variant = Variant(
        id=ID("variant-child-2"),
        name="Data-Source",
        impl=second_child_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(second_child_impl),
    )

    group_core = Core(
        id=ID("section-group"),
        name="Settings Group",
        variants=[group_variant.id],
        defaultVariant=group_variant.id,
    )
    first_child_core = Core(
        id=ID("section-child-1"),
        name="Data Source",
        variants=[first_child_variant.id],
        defaultVariant=first_child_variant.id,
    )
    second_child_core = Core(
        id=ID("section-child-2"),
        name="Data-Source",
        variants=[second_child_variant.id],
        defaultVariant=second_child_variant.id,
    )

    project_config = ProjectConfig(
        id=ID("project-listener"),
        name="Listener Project",
        sectionVariantMap={
            group_core.id: group_variant.id,
            first_child_core.id: first_child_variant.id,
            second_child_core.id: second_child_variant.id,
        },
        topLevelSections={
            group_core.id: TopLevelSectionLayout(),
        },
    )

    return (
        project_config,
        {
            group_core.id: group_core,
            first_child_core.id: first_child_core,
            second_child_core.id: second_child_core,
        },
        {
            group_impl.id: group_impl,
            first_child_impl.id: first_child_impl,
            second_child_impl.id: second_child_impl,
        },
        {
            group_variant.id: group_variant,
            first_child_variant.id: first_child_variant,
            second_child_variant.id: second_child_variant,
        },
    )


class SettaListenerDependencyTranslationTests(unittest.TestCase):
    def setUp(self) -> None:
        (
            project_config,
            sections,
            section_impls,
            section_variants,
        ) = _build_project_state_with_duplicate_names()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections=sections,
            sectionImpls=section_impls,
            sectionVariants=section_variants,
        )
        self.dependency_graph = DependencyGraph(self.project_state)

    def _create_listener(self) -> SettaListener:
        listener = SettaListener(
            project_name=self.project_state.projectConfig.name,
        )
        listener._project_config_id = self.project_state.projectConfig.id
        listener._runtime_state = ListenerRuntimeState(
            project_state=self.project_state,
            dependency_graph=self.dependency_graph,
            code_generator=cast("PythonCodeGenerator", object()),
            s_instance=object(),
        )
        return listener

    def test_sanitized_name_round_trip_maps_back_to_dep_key(self) -> None:
        listener = self._create_listener()
        sanitized_child = "Settings_Group__Data_Source"
        original_dep_key = self.dependency_graph.full_path_name_to_dep_key[
            sanitized_child
        ]

        @listener.listen(deps=(sanitized_child,))
        def _callback(state, ctx):
            return None

        register_content = listener._build_register_content()
        callback_payload = next(iter(register_content.callbacks.values()))
        dependency = callback_payload.dependencies[0]

        self.assertEqual(dependency, original_dep_key)

        graph_node = self.dependency_graph.graph[original_dep_key]
        self.assertEqual(graph_node.full_path_name, sanitized_child)

        spec = next(iter(listener._callbacks.values()))
        self.assertEqual(spec.structured_dependencies[0], dependency)

    def test_duplicate_sanitized_names_translate_to_distinct_dependencies(self) -> None:
        listener = self._create_listener()
        sanitized_names = sorted(
            name
            for name in self.dependency_graph.full_path_name_to_dep_key
            if name.startswith("Settings_Group__Data_Source")
        )
        self.assertEqual(
            sanitized_names,
            ["Settings_Group__Data_Source", "Settings_Group__Data_Source_2"],
        )

        @listener.listen(deps=tuple(sanitized_names))
        def _callback(state, ctx):
            return None

        register_content = listener._build_register_content()
        callback_payload = next(iter(register_content.callbacks.values()))
        dependencies = callback_payload.dependencies

        self.assertEqual(len(dependencies), 2)
        self.assertNotEqual(dependencies[0], dependencies[1])

        mapped_names = []
        for dependency, sanitized in zip(dependencies, sanitized_names):
            graph_node = self.dependency_graph.graph[dependency]
            self.assertEqual(graph_node.full_path_name, sanitized)
            mapped_names.append(graph_node.full_path_name)

        self.assertEqual(mapped_names, sanitized_names)

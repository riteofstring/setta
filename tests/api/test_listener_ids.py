import pytest

from setta.api import ListenerDependencyId, SettaListener, dep_id
from setta.api.listener import ListenerRuntimeState
from setta.code_gen.dependency_graph import DependencyGraph
from setta.types.code_obj_impls import CodeParamCodeObjImpl, NestedParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
    create_dep_key,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import DictSectionImpl


def build_project_state(param_value: str) -> tuple[ProjectStateSingleConfig, ID, ID]:
    section_id = ID("25")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")

    root_param_id = ID("root-param-1")
    root_param_impl_id = ID("root-param-impl-1")
    root_param_variant_id = ID("root-param-variant-1")

    param_id = ID("31")
    param_impl_id = ID("param-impl-1")
    param_variant_id = ID("param-variant-1")

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
        value=param_value,
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
        id=ID("21"),
        name="ListenerIdsProject",
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


def test_listener_register_accepts_dep_ids() -> None:
    project_state, section_id, param_id = build_project_state("1")
    listener = SettaListener(project_name=project_state.projectConfig.name)

    section_dep = dep_id(section_id)
    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[section_dep])
    def on_section(_state, _ctx) -> None:
        return None

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = listener._build_runtime_state(project_state)
    assert runtime_state.s_instance is not None
    listener._runtime_state = runtime_state
    listener._project_config_id = project_state.projectConfig.id

    content = listener._build_register_content()

    for spec in listener._callbacks.values():
        callback = content.callbacks[spec.callback_id]
        assert len(callback.dependencies) == 1
        dep_key = callback.dependencies[0]
        dep_name = runtime_state.dependency_graph.graph[dep_key].full_path_name
        assert spec.dependency_names == (dep_name,)

        if spec.declared_dependencies == (section_dep,):
            assert isinstance(dep_key, SectionDependencyKey)
            assert dep_key.sectionId == section_id
        elif spec.declared_dependencies == (param_dep,):
            assert isinstance(dep_key, SectionParamDependencyKey)
            assert dep_key.sectionId == section_id
            assert dep_key.codeObjId == param_id
        else:
            raise AssertionError("Unexpected listener dependency spec")


def test_listener_context_exposes_id_helpers() -> None:
    project_state, section_id, param_id = build_project_state("3")
    listener = SettaListener(project_name=project_state.projectConfig.name)

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = listener._build_runtime_state(project_state)
    assert runtime_state.s_instance is not None
    listener._runtime_state = runtime_state
    listener._project_config_id = project_state.projectConfig.id

    listener._refresh_callback_dependency_metadata(runtime_state.dependency_graph)
    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]
    state_value = getattr(runtime_state.s_instance, dependency_name)
    ctx = listener._build_callback_context(
        spec,
        {dependency_name: state_value},
        [],
    )

    assert (
        ctx.changed_by_id[ListenerDependencyId(section_id, param_id)]
        == state_value
    )
    assert ctx.values.by_id(section_id, param_id) == state_value
    assert ctx.ids.dependency_name(section_id, param_id) == dependency_name
    assert ctx.ids.dependency_id(dependency_name) == ListenerDependencyId(
        section_id, param_id
    )


def test_listener_context_values_by_id_uses_cached_values_without_runtime_instance() -> None:
    project_state, section_id, param_id = build_project_state("7")
    listener = SettaListener(project_name=project_state.projectConfig.name)

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = listener._build_runtime_state(project_state)
    listener._runtime_state = ListenerRuntimeState(
        project_state=runtime_state.project_state,
        dependency_graph=runtime_state.dependency_graph,
        s_instance=None,
    )
    listener._project_config_id = project_state.projectConfig.id

    listener._refresh_callback_dependency_metadata(runtime_state.dependency_graph)
    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]
    listener._dependency_cache[dependency_name] = "cached-value"
    ctx = listener._build_callback_context(spec, {}, [])

    assert ctx.values.by_id(section_id, param_id) == "cached-value"


def test_listener_context_values_by_id_fails_closed_without_cached_value() -> None:
    project_state, section_id, param_id = build_project_state("8")
    listener = SettaListener(project_name=project_state.projectConfig.name)

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = listener._build_runtime_state(project_state)
    listener._runtime_state = ListenerRuntimeState(
        project_state=runtime_state.project_state,
        dependency_graph=runtime_state.dependency_graph,
        s_instance=None,
    )
    listener._project_config_id = project_state.projectConfig.id

    listener._refresh_callback_dependency_metadata(runtime_state.dependency_graph)
    spec = next(iter(listener._callbacks.values()))
    ctx = listener._build_callback_context(spec, {}, [])

    with pytest.raises(RuntimeError, match="metadata-backed callback state"):
        ctx.values.by_id(section_id, param_id)


def test_metadata_backed_callback_state_fails_closed_for_unresolved_dependency() -> None:
    project_state, section_id, param_id = build_project_state("9")
    listener = SettaListener(project_name=project_state.projectConfig.name)

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = listener._build_runtime_state(project_state)
    listener._runtime_state = ListenerRuntimeState(
        project_state=runtime_state.project_state,
        dependency_graph=runtime_state.dependency_graph,
        s_instance=None,
    )
    listener._project_config_id = project_state.projectConfig.id
    listener._refresh_callback_dependency_metadata(runtime_state.dependency_graph)
    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]

    state = listener._build_callback_state(listener._runtime_state)

    with pytest.raises(RuntimeError, match="metadata-backed callback state"):
        _ = getattr(state, dependency_name)


def test_dependency_graph_exposes_section_and_param() -> None:
    project_state, section_id, param_id = build_project_state("5")
    dep_graph = DependencyGraph(project_state)

    section_key = create_dep_key(sectionId=section_id)
    param_key = create_dep_key(sectionId=section_id, codeObjId=param_id)

    assert section_key in dep_graph.graph
    assert param_key in dep_graph.graph

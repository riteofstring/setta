from dataclasses import dataclass
from typing import Any

from setta.api.listener import (
    ListenerDependencyMetadata,
    ListenerDependencyMetadataEntry,
    SettaListener,
)
from setta.code_gen.dependency_graph import (
    DependencyGraph,
    Node,
    ParamNode,
    SectionNode,
)
from setta.code_gen.value_codec import PythonValueCodec
from setta.code_gen.value_mode import PythonValueMode
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.listener import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType

_UNAVAILABLE = object()


@dataclass(slots=True)
class ListenerTestRuntimeState:
    dependency_metadata: ListenerDependencyMetadata
    dependency_catalog: ListenerDependencyCatalog | None = None
    dependency_graph: DependencyGraph | None = None


def build_listener_dependency_metadata_from_graph(
    dependency_graph: DependencyGraph,
) -> ListenerDependencyMetadata:
    entries: list[ListenerDependencyMetadataEntry] = []
    for dep_key, node in dependency_graph.graph.items():
        section_type = None
        code_obj_type = None
        control_code_obj_id = None
        control_code_obj_type = None
        section_representation = None
        control_value_representation = None
        value_representation = None
        if isinstance(node, SectionNode):
            section_type = node.type
            control_code_obj_id = node.control_code_obj_id
            control_code_obj_type = node.control_code_obj_type
            section_representation = node.representation
            control_value_representation = node.control_value_representation
        elif isinstance(node, ParamNode):
            code_obj_type = node.type
            value_representation = node.value_representation
        entries.append(
            ListenerDependencyMetadataEntry(
                dependencyKey=dep_key,
                name=node.name,
                fullPathName=node.full_path_name,
                dependencies=tuple(
                    child_dep_key
                    for child_dep_key, is_used in node.deps.items()
                    if is_used
                ),
                sectionType=section_type,
                codeObjType=code_obj_type,
                controlCodeObjId=control_code_obj_id,
                controlCodeObjType=control_code_obj_type,
                sectionRepresentation=section_representation,
                controlValueRepresentation=control_value_representation,
                valueRepresentation=value_representation,
            )
        )
    entries.sort(key=lambda entry: entry.fullPathName)
    return ListenerDependencyMetadata(entries)


def build_listener_runtime_state(
    project_state: ProjectStateSingleConfig,
) -> ListenerTestRuntimeState:
    dependency_graph = DependencyGraph(project_state)
    return ListenerTestRuntimeState(
        dependency_metadata=build_listener_dependency_metadata_from_graph(
            dependency_graph
        ),
        dependency_catalog=build_listener_dependency_catalog_from_graph(
            dependency_graph
        ),
        dependency_graph=dependency_graph,
    )


def build_listener_dependency_catalog_from_graph(
    dependency_graph: DependencyGraph,
) -> ListenerDependencyCatalog:
    entries: list[ListenerDependencyCatalogEntry] = []
    for dep_key, node in dependency_graph.graph.items():
        section_type = None
        code_obj_type = None
        passing_style = None
        control_code_obj_id = None
        control_code_obj_type = None
        section_representation = None
        control_value_representation = None
        value_representation = None
        if isinstance(node, SectionNode):
            section_type = node.type
            control_code_obj_id = node.control_code_obj_id
            control_code_obj_type = node.control_code_obj_type
            section_representation = node.representation
            control_value_representation = node.control_value_representation
        elif isinstance(node, ParamNode):
            code_obj_type = node.type
            passing_style = node.passing_style
            value_representation = node.value_representation
        entries.append(
            ListenerDependencyCatalogEntry(
                dependencyKey=dep_key,
                name=node.name,
                fullPathName=node.full_path_name,
                dependencies=[
                    child_dep_key
                    for child_dep_key, is_used in node.deps.items()
                    if is_used
                ],
                includeInCodegen=getattr(node, "include_in_codegen", True),
                sectionType=section_type,
                codeObjType=code_obj_type,
                passingStyle=passing_style,
                controlCodeObjId=control_code_obj_id,
                controlCodeObjType=control_code_obj_type,
                sectionRepresentation=section_representation,
                controlValueRepresentation=control_value_representation,
                valueRepresentation=value_representation,
            )
        )
    entries.sort(key=lambda entry: entry.fullPathName)
    return ListenerDependencyCatalog(entries=entries)


def build_listener_dependency_cache(
    listener: SettaListener,
    runtime_state: ListenerTestRuntimeState,
) -> dict[str, Any]:
    dependency_graph = runtime_state.dependency_graph
    if dependency_graph is None:
        raise RuntimeError("Listener test runtime state is missing dependency graph")

    def unexpected_dependency_lookup(dep_key: BaseDependencyKeyUnion) -> str:
        raise ValueError(
            "Unexpected dependency lookup while rendering direct listener value "
            f"for {dep_key!r}"
        )

    value_codec = PythonValueCodec(
        dependency_graph,
        unexpected_dependency_lookup,
        mode=PythonValueMode.LIVE_RUNTIME,
    )
    values_by_key: dict[BaseDependencyKeyUnion, Any] = {}
    values_by_name: dict[str, Any] = {}
    for name in runtime_state.dependency_metadata.names():
        dep_key = runtime_state.dependency_metadata.dependency_key(name)
        value = _build_cached_dependency_value(
            listener,
            runtime_state,
            dep_key,
            value_codec=value_codec,
            values_by_key=values_by_key,
        )
        if value is _UNAVAILABLE:
            continue
        values_by_name[name] = value
    return values_by_name


def build_listener_rendered_dependency_values(
    listener: SettaListener,
    runtime_state: ListenerTestRuntimeState,
) -> ListenerRenderedDependencyValues:
    dependency_cache = build_listener_dependency_cache(listener, runtime_state)
    entries: list[ListenerRenderedDependencyValue] = []
    for dependency_name in runtime_state.dependency_metadata.names():
        if dependency_name not in dependency_cache:
            continue
        entry = runtime_state.dependency_metadata.entry_for_name(dependency_name)
        entries.append(
            ListenerRenderedDependencyValue(
                dependencyKey=entry.dependencyKey,
                renderedValue=repr(dependency_cache[dependency_name]),
            )
        )
    return ListenerRenderedDependencyValues(entries=entries)


def _build_cached_dependency_value(
    listener: SettaListener,
    runtime_state: ListenerTestRuntimeState,
    dep_key: BaseDependencyKeyUnion,
    *,
    value_codec: PythonValueCodec,
    values_by_key: dict[BaseDependencyKeyUnion, Any],
) -> Any:
    if dep_key in values_by_key:
        return values_by_key[dep_key]
    dependency_graph = runtime_state.dependency_graph
    if dependency_graph is None:
        raise RuntimeError("Listener test runtime state is missing dependency graph")
    node = dependency_graph.graph.get(dep_key)
    if node is None:
        return _UNAVAILABLE
    if not getattr(node, "include_in_codegen", True):
        return _UNAVAILABLE
    if isinstance(node, ParamNode):
        value = _build_cached_param_node_value(
            listener,
            runtime_state,
            node,
            value_codec=value_codec,
            values_by_key=values_by_key,
        )
    elif isinstance(node, SectionNode):
        value = _build_cached_section_node_value(
            listener,
            runtime_state,
            node,
            value_codec=value_codec,
            values_by_key=values_by_key,
        )
    else:
        return _UNAVAILABLE
    if value is _UNAVAILABLE:
        return _UNAVAILABLE
    values_by_key[dep_key] = value
    return value


def _build_cached_param_node_value(
    listener: SettaListener,
    runtime_state: ListenerTestRuntimeState,
    node: ParamNode,
    *,
    value_codec: PythonValueCodec,
    values_by_key: dict[BaseDependencyKeyUnion, Any],
) -> Any:
    if node.type is CodeObjType.NestedParam:
        return _build_cached_mapping_value(
            listener,
            runtime_state,
            node.deps,
            value_codec=value_codec,
            values_by_key=values_by_key,
        )
    if node.type is CodeObjType.PasswordParam:
        dependency_graph = runtime_state.dependency_graph
        if dependency_graph is None:
            raise RuntimeError(
                "Listener test runtime state is missing dependency graph"
            )
        if node.code_obj_impl_id is None or not node.has_secret:
            return ""
        return dependency_graph.password_secrets.get(
            str(node.code_obj_impl_id),
            "",
        )
    if node.deps:
        return _UNAVAILABLE
    return _build_cached_direct_node_value(listener, node, value_codec=value_codec)


def _build_cached_section_node_value(
    listener: SettaListener,
    runtime_state: ListenerTestRuntimeState,
    node: SectionNode,
    *,
    value_codec: PythonValueCodec,
    values_by_key: dict[BaseDependencyKeyUnion, Any],
) -> Any:
    if node.type in {SectionType.Dict, SectionType.Group}:
        return _build_cached_mapping_value(
            listener,
            runtime_state,
            node.deps,
            value_codec=value_codec,
            values_by_key=values_by_key,
        )
    if node.type is SectionType.ListRoot:
        items: list[Any] = []
        for child_dep_key, is_used in node.deps.items():
            if not is_used:
                continue
            child_value = _build_cached_dependency_value(
                listener,
                runtime_state,
                child_dep_key,
                value_codec=value_codec,
                values_by_key=values_by_key,
            )
            if child_value is _UNAVAILABLE:
                return _UNAVAILABLE
            items.append(child_value)
        return items
    if node.type is SectionType.Callable:
        return _UNAVAILABLE
    return _build_cached_direct_node_value(listener, node, value_codec=value_codec)


def _build_cached_mapping_value(
    listener: SettaListener,
    runtime_state: ListenerTestRuntimeState,
    deps: dict[BaseDependencyKeyUnion, bool],
    *,
    value_codec: PythonValueCodec,
    values_by_key: dict[BaseDependencyKeyUnion, Any],
) -> Any:
    dependency_graph = runtime_state.dependency_graph
    if dependency_graph is None:
        raise RuntimeError("Listener test runtime state is missing dependency graph")
    payload: dict[str, Any] = {}
    for child_dep_key, is_used in deps.items():
        if not is_used:
            continue
        child_node = dependency_graph.graph.get(child_dep_key)
        if child_node is None:
            return _UNAVAILABLE
        if not getattr(child_node, "include_in_codegen", True):
            continue
        child_value = _build_cached_dependency_value(
            listener,
            runtime_state,
            child_dep_key,
            value_codec=value_codec,
            values_by_key=values_by_key,
        )
        if child_value is _UNAVAILABLE:
            return _UNAVAILABLE
        payload[child_node.name] = child_value
    return payload


def _build_cached_direct_node_value(
    listener: SettaListener,
    node: Node,
    *,
    value_codec: PythonValueCodec,
) -> Any:
    try:
        if isinstance(node, ParamNode):
            expression = value_codec.format_param_expression(node)
        elif isinstance(node, SectionNode):
            expression = value_codec.format_section(node)
        else:
            return _UNAVAILABLE
    except Exception:
        return _UNAVAILABLE
    if not expression:
        return None
    try:
        return listener._evaluate_expression(
            dependency=node.full_path_name,
            expression=expression,
        )
    except Exception:
        return _UNAVAILABLE

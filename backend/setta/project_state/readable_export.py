from typing import TYPE_CHECKING

from setta.types.helpers_lvl1 import get_variant_base_and_effective_section_impl
from setta.types.helpers_lvl2 import (
    get_meta_control_param_id,
    get_section_path_full_name,
    get_top_level_param_ids,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.id import ID
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
    MetaControlSectionImpl,
    SocialSectionImpl,
    TextBlockSectionImpl,
)
from setta.utils.constants import C
from setta.utils.utils import normalize_path

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig


def build_readable_project_export(
    project_state_backend: "ProjectStateBackend",
    *,
    include_variants: bool,
) -> dict[str, object]:
    default_config_id = project_state_backend.defaultProjectConfigId
    if default_config_id is None:
        raise KeyError("Missing default project config id.")
    if default_config_id not in project_state_backend.projectConfigs:
        raise KeyError(
            f"Unknown default project config: {project_state_backend.defaultProjectConfigId}"
        )
    default_config_name = project_state_backend.projectConfigs[default_config_id].name

    configs: list[dict[str, object]] = []
    for config_id in project_state_backend.projectConfigs.keys():
        single_config = convert_backend_to_single_config(
            project_state_backend, config_id
        )
        configs.append(
            _build_readable_config_export(
                single_config,
                include_variants=include_variants,
            )
        )

    return {
        "version": 1,
        "project": {
            "defaultConfig": default_config_name,
        },
        "configs": configs,
    }


def _build_readable_config_export(
    project_state: "ProjectStateSingleConfig",
    *,
    include_variants: bool,
) -> dict[str, object]:
    section_path_map = _build_section_path_map(project_state)
    param_name_paths_by_section: dict[ID, dict[ID, tuple[str, ...]]] = {}
    output_ports_by_section: dict[ID, dict[ID, str]] = {}

    sections: list[dict[str, object]] = []
    for section_id, variant_id in project_state.projectConfig.sectionVariantMap.items():
        if section_id not in project_state.sections:
            raise KeyError(f"Unknown section id: {section_id}")
        core = project_state.sections[section_id]
        variant, _, impl = get_variant_base_and_effective_section_impl(
            project_state, core, variant_id
        )

        param_name_paths, param_values = _collect_param_data(
            project_state, section_id, impl
        )
        param_name_paths_by_section[section_id] = param_name_paths
        output_ports_by_section[section_id] = _collect_output_ports(impl)

        sections.append(
            _build_readable_section_export(
                project_state=project_state,
                section_id=section_id,
                variant_id=variant.id,
                section_impl=impl,
                section_path_map=section_path_map,
                param_values=param_values,
                include_variants=include_variants,
            )
        )

    edges = _build_readable_edges(
        project_state=project_state,
        section_path_map=section_path_map,
        param_name_paths_by_section=param_name_paths_by_section,
        output_ports_by_section=output_ports_by_section,
    )

    output: dict[str, object] = {
        "name": project_state.projectConfig.name,
        "sections": sections,
        "edges": edges,
    }

    entry_section_id = project_state.projectConfig.entryCodeBlockId
    if entry_section_id is not None:
        if entry_section_id not in section_path_map:
            raise KeyError(f"Unknown entry section id: {entry_section_id}")
        output["entrySection"] = section_path_map[entry_section_id]

    return output


def _build_section_path_map(
    project_state: "ProjectStateSingleConfig",
) -> dict[ID, str]:
    output: dict[ID, str] = {}
    for section_id in project_state.projectConfig.sectionVariantMap.keys():
        output[section_id] = get_section_path_full_name(project_state, section_id)
    return output


def _collect_param_data(
    project_state: "ProjectStateSingleConfig",
    section_id: ID,
    section_impl: object,
) -> tuple[dict[ID, tuple[str, ...]], dict[str, object] | None]:
    if isinstance(section_impl, BaseSectionWithParamsImpl):
        top_level_ids = get_top_level_param_ids(project_state, section_impl)
        name_path_prefix: tuple[str, ...] = ()
        include_params = True
        if isinstance(section_impl, BaseDictSectionImpl) and section_impl.isJsonSource:
            name_path_prefix = tuple(section_impl.jsonSourceKeys)
            include_params = False

        hierarchy = _traverse_params(
            project_state,
            section_impl.codeObjVariantMap,
            top_level_ids,
            name_path_prefix,
            build_nested_dict=include_params,
        )
        return (
            hierarchy.id_to_name_path,
            hierarchy.nested_dict if include_params else None,
        )

    if isinstance(section_impl, MetaControlSectionImpl):
        param_id = get_meta_control_param_id(project_state, section_id)
        if param_id not in section_impl.codeObjVariantMap:
            raise KeyError(f"Meta control {section_id} missing code obj variant map.")
        hierarchy = _traverse_params(
            project_state,
            section_impl.codeObjVariantMap,
            [param_id],
            (),
            build_nested_dict=True,
        )
        return hierarchy.id_to_name_path, hierarchy.nested_dict

    return {}, None


def _traverse_params(
    project_state: "ProjectStateSingleConfig",
    code_obj_variant_map: dict[ID, ID],
    top_level_ids: list[ID],
    name_path_prefix: tuple[str, ...],
    *,
    build_nested_dict: bool,
):
    return traverse_hierarchy(
        project_state.codeObjs,
        project_state.codeObjImpls,
        project_state.codeObjVariants,
        code_obj_variant_map,
        top_level_ids,
        options=TraversalOptions(
            build_id_to_name_path=True,
            build_nested_dict=build_nested_dict,
            name_path_prefix=name_path_prefix,
        ),
    )


def _collect_output_ports(section_impl: object) -> dict[ID, str]:
    if not isinstance(section_impl, BaseSectionWithParamsImpl):
        return {}
    return {port.id: port.accessor for port in section_impl.edgeOutputPorts}


def _build_readable_section_export(
    *,
    project_state: "ProjectStateSingleConfig",
    section_id: ID,
    variant_id: ID,
    section_impl: object,
    section_path_map: dict[ID, str],
    param_values: dict[str, object] | None,
    include_variants: bool,
) -> dict[str, object]:
    if section_id not in section_path_map:
        raise KeyError(f"Missing section path for {section_id}")
    variant = project_state.sectionVariants[variant_id]
    output: dict[str, object] = {
        "path": section_path_map[section_id],
        "type": section_impl.type.value,
    }

    if include_variants:
        output["variant"] = variant.name

    if isinstance(section_impl, CallableSectionImpl):
        callable_id = section_impl.callable
        if callable_id is not None:
            if callable_id not in project_state.codeObjs:
                raise KeyError(f"Callable {callable_id} missing for {section_id}.")
            output["callable"] = project_state.codeObjs[callable_id].name

    if isinstance(section_impl, BaseSectionWithParamsImpl):
        if isinstance(section_impl, BaseDictSectionImpl) and section_impl.isJsonSource:
            output["jsonSourceKeys"] = list(section_impl.jsonSourceKeys)
        else:
            output["params"] = param_values or {}
    elif isinstance(section_impl, MetaControlSectionImpl):
        output["params"] = param_values or {}

    if isinstance(section_impl, BaseParentSectionImpl) and section_impl.children:
        children: list[str] = []
        for child_id in section_impl.children:
            if child_id not in section_path_map:
                raise KeyError(f"Missing child section path for {child_id}")
            children.append(section_path_map[child_id])
        output["children"] = children

    if isinstance(section_impl, TextBlockSectionImpl):
        output["text"] = section_impl.text
        output["format"] = section_impl.format.value
    elif isinstance(section_impl, SocialSectionImpl):
        output["url"] = section_impl.url
    elif isinstance(section_impl, BrowserSectionImpl):
        output["folder"] = section_impl.folder

    files: dict[str, object] = {}
    if isinstance(section_impl, BaseCodeSectionImpl):
        if section_impl.codeFileBinding is not None:
            files["code"] = str(section_impl.codeFileBinding.canonical_path)
    if isinstance(section_impl, BaseDictSectionImpl) and section_impl.isJsonSource:
        files["jsonSource"] = str(normalize_path(variant.name))
    if isinstance(section_impl, ImageSectionImpl) and section_impl.imagePath:
        files["image"] = section_impl.imagePath
    if isinstance(section_impl, ChartSectionImpl) and section_impl.dataPath:
        files["chartData"] = section_impl.dataPath
    if isinstance(section_impl, DrawSectionImpl):
        draw_assets = _collect_draw_assets(section_impl)
        if draw_assets:
            files["drawAssets"] = draw_assets
        if section_impl.renderedImagePath:
            files["drawRender"] = section_impl.renderedImagePath
    if isinstance(section_impl, ChatSectionImpl) and section_impl.chatId is not None:
        chat_path = C.SETTA_FILES_FOLDER / "chats" / f"{section_impl.chatId}.json"
        files["chat"] = str(chat_path)

    if files:
        output["files"] = files

    return output


def _collect_draw_assets(section_impl: DrawSectionImpl) -> list[str]:
    assets: list[str] = []
    seen: set[str] = set()
    for layer in section_impl.layers:
        for element in layer.elements:
            if element.dataPath in seen:
                continue
            seen.add(element.dataPath)
            assets.append(element.dataPath)
    return assets


def _build_readable_edges(
    *,
    project_state: "ProjectStateSingleConfig",
    section_path_map: dict[ID, str],
    param_name_paths_by_section: dict[ID, dict[ID, tuple[str, ...]]],
    output_ports_by_section: dict[ID, dict[ID, str]],
) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    for edge in project_state.projectConfig.edges:
        if edge.sourceSectionId not in project_state.projectConfig.sectionVariantMap:
            raise KeyError(f"Missing active variant for {edge.sourceSectionId}.")
        if edge.targetSectionId not in project_state.projectConfig.sectionVariantMap:
            raise KeyError(f"Missing active variant for {edge.targetSectionId}.")
        source_variant = project_state.projectConfig.sectionVariantMap[
            edge.sourceSectionId
        ]
        target_variant = project_state.projectConfig.sectionVariantMap[
            edge.targetSectionId
        ]
        if source_variant != edge.sourceVariantId:
            continue
        if target_variant != edge.targetVariantId:
            continue
        if edge.sourceSectionId not in section_path_map:
            raise KeyError(f"Unknown edge source section {edge.sourceSectionId}.")
        if edge.targetSectionId not in section_path_map:
            raise KeyError(f"Unknown edge target section {edge.targetSectionId}.")

        if edge.sourceSectionId not in output_ports_by_section:
            raise KeyError(f"Missing output ports for {edge.sourceSectionId}.")
        output_ports = output_ports_by_section[edge.sourceSectionId]
        if edge.sourcePortId not in output_ports:
            raise KeyError(
                f"Missing edge output port {edge.sourcePortId} for {edge.sourceSectionId}."
            )
        if edge.targetSectionId not in param_name_paths_by_section:
            raise KeyError(f"Missing params for {edge.targetSectionId}.")
        param_name_paths = param_name_paths_by_section[edge.targetSectionId]
        if edge.targetPortId not in param_name_paths:
            raise KeyError(
                f"Missing edge target param {edge.targetPortId} for {edge.targetSectionId}."
            )

        source_path = section_path_map[edge.sourceSectionId]
        target_path = section_path_map[edge.targetSectionId]
        accessor = output_ports[edge.sourcePortId]
        param_name_path = param_name_paths[edge.targetPortId]

        output.append(
            {
                "from": _format_edge_source(source_path, accessor),
                "to": _format_edge_target(target_path, param_name_path),
            }
        )
    return output


def _format_edge_source(section_path: str, accessor: str) -> str:
    cleaned = accessor.strip()
    if not cleaned:
        return f"{section_path}.out.{C.EDGE_OUTPUT_BASE_LABEL}"
    if cleaned.startswith("."):
        cleaned = cleaned[1:]
    if cleaned.startswith("["):
        return f"{section_path}.out{cleaned}"
    return f"{section_path}.out.{cleaned}"


def _format_edge_target(section_path: str, param_name_path: tuple[str, ...]) -> str:
    if not param_name_path:
        raise KeyError(f"Missing param name path for {section_path}.")
    param_path = ".".join(param_name_path)
    return f"{section_path}.param.{param_path}"

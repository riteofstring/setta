from dataclasses import dataclass

from setta.code_gen.dependency_graph import DependencyGraph, SectionNode
from setta.types.id import ID
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType


@dataclass(frozen=True)
class SectionMetadataEntry:
    section_id: ID
    name: str
    section_type: SectionType
    full_path_name: str
    is_top_level: bool
    parent_section_id: ID | None
    variant_id: ID | None
    variant_name: str | None


def build_python_meta_code(
    project_state: ProjectStateSingleConfig, dep_graph: DependencyGraph
) -> str:
    project_config = project_state.projectConfig
    project_fields = {
        "id": _format_optional_id(project_config.id),
        "name": repr(project_config.name),
        "activeViewModeId": _format_optional_id(project_config.activeViewModeId),
        "entryCodeBlockId": _format_optional_id(project_config.entryCodeBlockId),
        "activeIds": _format_id_list(project_config.activeIds),
        "showParamDisplayNames": repr(project_config.showParamDisplayNames),
        "previewImgColor": repr(project_config.previewImgColor),
    }
    entries = _collect_section_entries(project_state, dep_graph)
    return _render_meta_code(project_fields, entries)


def _collect_section_entries(
    project_state: ProjectStateSingleConfig, dep_graph: DependencyGraph
) -> list[SectionMetadataEntry]:
    project_config = project_state.projectConfig
    entries: list[SectionMetadataEntry] = []
    for node in dep_graph.graph.values():
        if not isinstance(node, SectionNode):
            continue
        section_id = ID(node.id)
        if section_id not in project_state.sections:
            raise KeyError(f"Missing section core for {section_id}")
        core = project_state.sections[section_id]
        if section_id not in project_state.parentSectionMap:
            raise KeyError(f"Missing parent mapping for section {section_id}")
        parent_section_id = project_state.parentSectionMap[section_id]
        variant_id = None
        if section_id in project_config.sectionVariantMap:
            variant_id = project_config.sectionVariantMap[section_id]
            if variant_id not in project_state.sectionVariants:
                raise KeyError(
                    f"Missing section variant {variant_id} for section {section_id}"
                )
        variant_name = None
        if variant_id is not None:
            variant_name = project_state.sectionVariants[variant_id].name
        entries.append(
            SectionMetadataEntry(
                section_id=section_id,
                name=core.name,
                section_type=SectionType(node.type),
                full_path_name=node.full_path_name,
                is_top_level=node.isTopLevel,
                parent_section_id=parent_section_id,
                variant_id=variant_id,
                variant_name=variant_name,
            )
        )
    return entries


def _render_meta_code(
    project_fields: dict[str, str], entries: list[SectionMetadataEntry]
) -> str:
    lines: list[str] = [
        "from dataclasses import dataclass",
        "",
        "@dataclass(frozen=True)",
        "class ProjectMetadata:",
        "    id: str",
        "    name: str",
        "    activeViewModeId: str | None",
        "    entryCodeBlockId: str | None",
        "    activeIds: list[str]",
        "    showParamDisplayNames: bool",
        "    previewImgColor: str",
        "",
        "@dataclass(frozen=True)",
        "class SectionMetadata:",
        "    id: str",
        "    name: str",
        "    type: str",
        "    fullPathName: str",
        "    isTopLevel: bool",
        "    parentSectionId: str | None",
        "    variantId: str | None",
        "    variantName: str | None",
        "",
        "@dataclass(frozen=True)",
        "class SettaGenMetadata:",
        "    project: ProjectMetadata",
        "    sections: dict[str, SectionMetadata]",
        "    sections_by_id: dict[str, SectionMetadata]",
        "",
        "project = ProjectMetadata(",
    ]
    for field_name, field_value in project_fields.items():
        lines.append(f"    {field_name}={field_value},")
    lines.append(")")
    lines.append("")
    sections_by_path = _render_sections_by_key(entries, key="path")
    lines.extend(sections_by_path)
    lines.append("")
    sections_by_id = _render_sections_by_key(entries, key="id")
    lines.extend(sections_by_id)
    lines.append("")
    lines.append(
        "meta = SettaGenMetadata(project=project, sections=sections, sections_by_id=sections_by_id)"
    )
    return "\n".join(lines)


def _render_sections_by_key(
    entries: list[SectionMetadataEntry], *, key: str
) -> list[str]:
    if key not in ("path", "id"):
        raise ValueError(f"Unsupported key for metadata render: {key}")
    if key == "path":
        lines = ["sections = {"]

        def key_fn(entry: SectionMetadataEntry) -> str:
            return entry.full_path_name
    else:
        lines = ["sections_by_id = {"]

        def key_fn(entry: SectionMetadataEntry) -> str:
            return str(entry.section_id)

    sorted_entries = sorted(entries, key=key_fn)
    for entry in sorted_entries:
        key_literal = repr(str(key_fn(entry)))
        lines.append(f"    {key_literal}: SectionMetadata(")
        lines.extend(_render_section_metadata(entry, indent="        "))
        lines.append("    ),")
    lines.append("}")
    return lines


def _render_section_metadata(entry: SectionMetadataEntry, *, indent: str) -> list[str]:
    return [
        f"{indent}id={_format_optional_id(entry.section_id)},",
        f"{indent}name={repr(entry.name)},",
        f"{indent}type={repr(entry.section_type.value)},",
        f"{indent}fullPathName={repr(entry.full_path_name)},",
        f"{indent}isTopLevel={repr(entry.is_top_level)},",
        f"{indent}parentSectionId={_format_optional_id(entry.parent_section_id)},",
        f"{indent}variantId={_format_optional_id(entry.variant_id)},",
        f"{indent}variantName={_format_optional_str(entry.variant_name)},",
    ]


def _format_optional_id(value: ID | None) -> str:
    if value is None:
        return "None"
    return repr(str(value))


def _format_optional_str(value: str | None) -> str:
    if value is None:
        return "None"
    return repr(value)


def _format_id_list(values: list[ID]) -> str:
    literals = ", ".join(repr(str(value)) for value in values)
    return f"[{literals}]"

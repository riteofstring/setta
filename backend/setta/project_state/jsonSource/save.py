from collections import defaultdict
from pathlib import Path

from setta.database.db_objs import DBE
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.generated.effective_impls import set_effective_impl_value
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
    get_variant_effective_section_impl,
)
from setta.types.helpers_lvl2 import get_top_level_param_ids
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_state import ProjectStateCore
from setta.types.section_impls import BaseDictSectionImpl
from setta.utils.structured_data import (
    read_json_source_payload,
    write_json_source_payload,
)


def build_json_source_dicts(
    p: ProjectStateCore, section_variant_ids: list[str] | None = None
) -> dict[Path, dict]:
    to_be_saved: dict[Path, dict] = defaultdict(dict)
    processed = set()
    for section in p.sections.values():
        for variant_id in section.variants:
            if variant_id in processed:
                continue
            processed.add(variant_id)
            variant, _, impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            if (
                not isinstance(impl, BaseDictSectionImpl)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue

            topLevelParamIds = get_top_level_param_ids(p, impl)
            hierarchy = traverse_hierarchy(
                p.codeObjs,
                p.codeObjImpls,
                p.codeObjVariants,
                impl.codeObjVariantMap,
                topLevelParamIds,
                options=TraversalOptions(
                    build_id_to_name_path=True,
                    build_nested_dict=True,
                    name_path_prefix=tuple(impl.jsonSourceKeys),
                ),
            )

            filename = Path(variant.name)
            to_be_saved[filename].update(hierarchy.nested_dict)

            # Make sure the jsonSourceKeys are present.
            # (They might not be because they are completely empty)
            add_key_path_to_dict(to_be_saved[filename], impl.jsonSourceKeys)

    return to_be_saved


def save_json_source_data(
    dbe: DBE, p: ProjectStateCore, section_variant_ids: list[str] | None = None
):
    json_source_updates = build_json_source_updates(p, section_variant_ids)
    for filename, updates in json_source_updates.items():
        existing: dict = {}
        if filename.exists():
            existing = read_json_source_payload(filename, dbe)
        updated = apply_json_source_updates(existing, updates)
        write_json_source_payload(filename, updated, dbe)


def build_json_source_updates(
    p: ProjectStateCore, section_variant_ids: list[str] | None = None
) -> dict[Path, list[tuple[list[str], dict]]]:
    updates: dict[Path, list[tuple[list[str], dict]]] = defaultdict(list)
    processed = set()
    for section in p.sections.values():
        for variant_id in section.variants:
            if variant_id in processed:
                continue
            processed.add(variant_id)
            variant, _, impl = get_variant_base_and_effective_section_impl(
                p, section, variant_id
            )
            if (
                not isinstance(impl, BaseDictSectionImpl)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue

            topLevelParamIds = get_top_level_param_ids(p, impl)
            hierarchy = traverse_hierarchy(
                p.codeObjs,
                p.codeObjImpls,
                p.codeObjVariants,
                impl.codeObjVariantMap,
                topLevelParamIds,
                options=TraversalOptions(
                    build_id_to_name_path=True,
                    build_nested_dict=True,
                    name_path_prefix=tuple(impl.jsonSourceKeys),
                ),
            )

            nested_dict = hierarchy.nested_dict
            add_key_path_to_dict(nested_dict, impl.jsonSourceKeys)
            subtree: dict | str | int | float | bool | None = nested_dict
            for path_part in impl.jsonSourceKeys:
                subtree = subtree[path_part]

            if not isinstance(subtree, dict):
                raise ValueError(
                    "jsonSourceKeys must resolve to a dict when saving JSON source data."
                )

            filename = Path(variant.name)
            updates[filename].append((list(impl.jsonSourceKeys), subtree))
    return updates


def apply_json_source_updates(
    existing: dict, updates: list[tuple[list[str], dict]]
) -> dict:
    output = existing
    for key_path, subtree in updates:
        if not key_path:
            output = subtree
            continue
        current = output
        for path_part in key_path[:-1]:
            if path_part not in current:
                current[path_part] = {}
            else:
                next_value = current[path_part]
                if not isinstance(next_value, dict):
                    raise ValueError(
                        "JSON source path conflicts with a non-dict value."
                    )
            current = current[path_part]
        current[key_path[-1]] = subtree
    return output


def add_key_path_to_dict(output: dict, key_path: list[str]):
    for path_part in key_path:
        # Create nested dictionaries if they don't exist
        if path_part not in output:
            output[path_part] = {}
        output = output[path_part]
    return output


def remove_json_source_values(p: ProjectStateCore):
    for section in p.sections.values():
        for variant_id in section.variants:
            impl = get_variant_effective_section_impl(p, section.id, variant_id)
            if not isinstance(impl, BaseDictSectionImpl) or not impl.isJsonSource:
                continue
            code_obj_variant_map = impl.codeObjVariantMap
            for cid, cvariant_id in code_obj_variant_map.items():
                cobj = p.codeObjs[cid]
                cvariant, cbase_impl, _ = get_variant_base_and_effective_code_obj_impl(
                    p, cobj, cvariant_id
                )
                if not isinstance(cbase_impl, BaseChildlessCodeObjImpl):
                    continue
                set_effective_impl_value(
                    cbase_impl,
                    cobj,
                    cvariant,
                    BaseChildlessCodeObjImplArgsWithCallable(value=""),
                )

from collections import defaultdict
from pathlib import Path

from setta.database.db_objs import DBE
from setta.types.generated.unions import BaseDictSectionImplUnion
from setta.types.helpers import (
    get_variant_base_and_effective_section_impl,
)
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_state import ProjectStateSingleConfig


def save_json_source_data(
    dbe: DBE, p: ProjectStateSingleConfig, section_variant_ids: list[str] | None = None
):
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
                not isinstance(impl, BaseDictSectionImplUnion)
                or not impl.isJsonSource
                or (section_variant_ids and variant_id not in section_variant_ids)
            ):
                continue
            hierarchy = traverse_hierarchy(
                p.codeObjs,
                p.codeObjImpls,
                p.codeObjVariants,
                impl.codeObjVariantMap,
                impl.topLevelParamIds,
                TraversalOptions(
                    build_name_paths=True,
                    build_nested_dict=True,
                    nested_dict_keys_prefix=impl.jsonSourceKeys,
                ),
            )

            filename = Path(variant.name)
            to_be_saved[filename].update(hierarchy.nested_dict)

            # Make sure the jsonSourceKeys are present.
            # (They might not be because they are completely empty)
            add_key_path_to_dict(to_be_saved[filename], impl.jsonSourceKeys)

    # Save each file
    for filename, data in to_be_saved.items():
        dbe.write_json(filename, data)


def add_key_path_to_dict(output: dict, key_path: list[str]):
    for path_part in key_path:
        # Create nested dictionaries if they don't exist
        if path_part not in output:
            output[path_part] = {}
        output = output[path_part]
    return output


def remove_json_source_values(p: dict):
    for variant in p["sectionVariants"].values():
        if variant["isJsonSource"]:
            variant["values"] = {}

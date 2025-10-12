import copy
import logging
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from setta.database.db_objs import DBE
from setta.project_state.jsonSource.jsonSource import JSONSource
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


logger = logging.getLogger(__name__)


def collect_json_source_payloads(
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
            nested_dict = copy.deepcopy(hierarchy.nested_dict)
            for key, value in nested_dict.items():
                to_be_saved[filename][key] = value

            # Make sure the jsonSourceKeys are present.
            # (They might not be because they are completely empty)
            add_key_path_to_dict(to_be_saved[filename], impl.jsonSourceKeys)

    return {filename: data for filename, data in to_be_saved.items()}


def save_json_source_data(
    dbe: DBE,
    json_source: JSONSource,
    *,
    files_to_save: Iterable[Path] | None = None,
):
    if files_to_save is None:
        files_to_save = list(json_source.json_source_dirty)
    files_to_save = list(files_to_save)
    if not files_to_save:
        return

    logger.critical(
        "save_json_source_data flushing_files=%s",
        [str(filename) for filename in files_to_save],
    )
    for filename in files_to_save:
        data = json_source.get_cached_json(filename)
        dbe.write_json(filename, data)

    json_source.json_source_dirty.difference_update(files_to_save)


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

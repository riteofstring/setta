import json
import logging
import os
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

logger = logging.getLogger(__name__)

_section_filter_env = os.getenv("SETTA_DEBUG_SECTION_FILTER", "")
SECTION_FILTER = {
    token.strip().casefold()
    for token in _section_filter_env.split(",")
    if token.strip()
}


def _should_log_section(section_name: str) -> bool:
    if not SECTION_FILTER:
        return True
    return section_name.casefold() in SECTION_FILTER


def _count_leaf_entries(value: object) -> int:
    if isinstance(value, dict):
        total = 0
        for child in value.values():
            total += _count_leaf_entries(child)
        return total
    if isinstance(value, list):
        total = 0
        for child in value:
            total += _count_leaf_entries(child)
        return total or 1
    return 1


def _extract_section_payload(nested: dict, json_source_keys: list[str]):
    cursor: object = nested
    for key in json_source_keys:
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(key)
        if cursor is None:
            return None
    return cursor


def _format_snapshot(snapshot: object) -> str:
    try:
        return json.dumps(snapshot, sort_keys=True)
    except (TypeError, ValueError):
        return repr(snapshot)


def save_json_source_data(
    dbe: DBE, p: ProjectStateCore, section_variant_ids: list[str] | None = None
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

            if logger.isEnabledFor(logging.DEBUG) and _should_log_section(section.name):
                leaf_count = _count_leaf_entries(hierarchy.nested_dict)
                logger.debug(
                    "jsonSource save staged section=%s variant=%s file=%s keys=%s leafCount=%d",
                    section.name,
                    variant.name,
                    filename,
                    impl.jsonSourceKeys,
                    leaf_count,
                )
                payload = _extract_section_payload(
                    hierarchy.nested_dict, list(impl.jsonSourceKeys)
                )
                logger.debug(
                    "jsonSource save payload section=%s variant=%s keys=%s snapshot=%s",
                    section.name,
                    variant.name,
                    impl.jsonSourceKeys,
                    _format_snapshot(payload) if payload is not None else "<missing>",
                )

    # Save each file
    for filename, data in to_be_saved.items():
        if logger.isEnabledFor(logging.DEBUG):
            leaf_count = _count_leaf_entries(data)
            logger.debug(
                "jsonSource write committing file=%s topLevelKeys=%s leafCount=%d",
                filename,
                list(data.keys()),
                leaf_count,
            )
        dbe.write_json(filename, data)


def add_key_path_to_dict(output: dict, key_path: list[str]):
    for path_part in key_path:
        # Create nested dictionaries if they don't exist
        if path_part not in output:
            output[path_part] = {}
        output = output[path_part]
    return output


def remove_json_source_values(p: ProjectStateCore):
    cleared_count = 0
    sections_touched: set[str] = set()
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
                if logger.isEnabledFor(logging.DEBUG):
                    if _should_log_section(section.name):
                        cleared_count += 1
                        sections_touched.add(section.name)

    if cleared_count and logger.isEnabledFor(logging.DEBUG):
        logger.debug(
            "jsonSource removed childless values count=%d sections=%s",
            cleared_count,
            sorted(sections_touched),
        )

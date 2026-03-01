import pytest

from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.id import ID


def _build_mismatched_section_hierarchy():
    # Build a callable tree where one child exists globally but is missing
    # from the section-local codeObjVariantMap.
    root_id = ID("callable-root")
    kept_child_id = ID("param-kept")
    stale_child_id = ID("param-stale")

    root_impl = CodeCallableCodeObjImpl(
        id=ID("impl-callable-root"),
        children=[kept_child_id, stale_child_id],
    )
    root_variant = Variant(
        id=ID("variant-callable-root"),
        impl=root_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(root_impl),
    )
    root_core = Core(
        id=root_id,
        name="callable",
        variants=[root_variant.id],
        defaultVariant=root_variant.id,
    )

    kept_impl = CodeParamCodeObjImpl(id=ID("impl-param-kept"), value="kept")
    kept_variant = Variant(
        id=ID("variant-param-kept"),
        impl=kept_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(kept_impl),
    )
    kept_core = Core(
        id=kept_child_id,
        name="kept",
        variants=[kept_variant.id],
        defaultVariant=kept_variant.id,
    )

    stale_impl = CodeParamCodeObjImpl(id=ID("impl-param-stale"), value="stale")
    stale_variant = Variant(
        id=ID("variant-param-stale"),
        impl=stale_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(stale_impl),
    )
    stale_core = Core(
        id=stale_child_id,
        name="stale",
        variants=[stale_variant.id],
        defaultVariant=stale_variant.id,
    )

    code_objs = {
        root_id: root_core,
        kept_child_id: kept_core,
        stale_child_id: stale_core,
    }
    code_obj_impls = {
        root_impl.id: root_impl,
        kept_impl.id: kept_impl,
        stale_impl.id: stale_impl,
    }
    code_obj_variants = {
        root_variant.id: root_variant,
        kept_variant.id: kept_variant,
        stale_variant.id: stale_variant,
    }
    code_obj_variant_map = {
        root_id: root_variant.id,
        kept_child_id: kept_variant.id,
        # stale_child_id intentionally omitted.
    }
    return (
        code_objs,
        code_obj_impls,
        code_obj_variants,
        code_obj_variant_map,
        root_id,
        kept_child_id,
        stale_child_id,
    )


def test_traverse_hierarchy_strict_mode_raises_for_missing_section_child_reference() -> (
    None
):
    (
        code_objs,
        code_obj_impls,
        code_obj_variants,
        code_obj_variant_map,
        root_id,
        _,
        stale_child_id,
    ) = _build_mismatched_section_hierarchy()

    with pytest.raises(KeyError) as exc_info:
        traverse_hierarchy(
            code_objs,
            code_obj_impls,
            code_obj_variants,
            code_obj_variant_map,
            top_level_ids=[],
            root_id=root_id,
            options=TraversalOptions(build_parent_map=True, build_children_map=True),
        )

    assert exc_info.value.args == (stale_child_id,)


def test_traverse_hierarchy_best_effort_filters_missing_section_child_references() -> (
    None
):
    (
        code_objs,
        code_obj_impls,
        code_obj_variants,
        code_obj_variant_map,
        root_id,
        kept_child_id,
        stale_child_id,
    ) = _build_mismatched_section_hierarchy()

    result = traverse_hierarchy(
        code_objs,
        code_obj_impls,
        code_obj_variants,
        code_obj_variant_map,
        top_level_ids=[],
        root_id=root_id,
        options=TraversalOptions(
            build_parent_map=True,
            build_children_map=True,
            collect_all_visited=True,
            skip_missing_references=True,
        ),
    )

    # Best-effort traversal must preserve reachable nodes while dropping only
    # references that are invalid for the current section map.
    assert result.collected_ids == [root_id, kept_child_id]
    assert result.children_map[root_id] == [kept_child_id]
    assert result.parent_map[root_id] is None
    assert result.parent_map[kept_child_id] == root_id
    assert stale_child_id not in result.parent_map
    assert stale_child_id not in result.all_visited_ids

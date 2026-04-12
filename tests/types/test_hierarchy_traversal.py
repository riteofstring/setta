from collections import Counter
from unittest.mock import patch

from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.core import Core, Variant
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.id import ID


def test_traverse_hierarchy_reuses_effective_impls_across_filter_checks() -> None:
    root_id = ID("root")
    first_child_id = ID("first-child")
    second_child_id = ID("second-child")

    root_impl_id = ID("root-impl")
    first_child_impl_id = ID("first-child-impl")
    second_child_impl_id = ID("second-child-impl")

    root_variant_id = ID("root-variant")
    first_child_variant_id = ID("first-child-variant")
    second_child_variant_id = ID("second-child-variant")

    code_objs = {
        root_id: Core(id=root_id, name="root"),
        first_child_id: Core(id=first_child_id, name="first-child"),
        second_child_id: Core(id=second_child_id, name="second-child"),
    }
    code_obj_impls = {
        root_impl_id: CodeCallableCodeObjImpl(
            id=root_impl_id,
            name="root",
            children=[first_child_id, second_child_id],
        ),
        first_child_impl_id: TextParamCodeObjImpl(
            id=first_child_impl_id,
            name="first-child",
        ),
        second_child_impl_id: TextParamCodeObjImpl(
            id=second_child_impl_id,
            name="second-child",
        ),
    }
    code_obj_variants = {
        root_variant_id: Variant(
            id=root_variant_id,
            impl=root_impl_id,
            nonPresetImpls=[root_impl_id],
        ),
        first_child_variant_id: Variant(
            id=first_child_variant_id,
            impl=first_child_impl_id,
            nonPresetImpls=[first_child_impl_id],
        ),
        second_child_variant_id: Variant(
            id=second_child_variant_id,
            impl=second_child_impl_id,
            nonPresetImpls=[second_child_impl_id],
        ),
    }
    code_obj_variant_map = {
        root_id: root_variant_id,
        first_child_id: first_child_variant_id,
        second_child_id: second_child_variant_id,
    }

    effective_impl_calls: list[ID] = []

    def fake_get_effective_impl(base_impl, _core, _variant):
        effective_impl_calls.append(base_impl.id)
        return base_impl

    with patch(
        "setta.types.hierarchy_traversal.get_effective_impl",
        side_effect=fake_get_effective_impl,
    ):
        result = traverse_hierarchy(
            code_objs,
            code_obj_impls,
            code_obj_variants,
            code_obj_variant_map,
            [root_id],
            options=TraversalOptions(
                collect_filter=lambda impl: isinstance(impl, TextParamCodeObjImpl),
                traverse_filter=lambda _impl: True,
                build_children_map=True,
            ),
        )

    assert result.collected_ids == [first_child_id, second_child_id]
    assert result.children_map == {root_id: [first_child_id, second_child_id]}
    assert Counter(effective_impl_calls) == Counter(
        [root_impl_id, first_child_impl_id, second_child_impl_id]
    )

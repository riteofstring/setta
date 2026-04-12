from setta.types.id import ID
from setta.types.shown_params import filter_for_ui_display


def test_filter_for_ui_display_keeps_pinned_descendants_and_shared_ancestors() -> None:
    root_id = ID("root")
    pinned_parent_id = ID("pinned-parent")
    pinned_leaf_id = ID("pinned-leaf")
    unpinned_parent_id = ID("unpinned-parent")
    unpinned_leaf_id = ID("unpinned-leaf")

    shown = filter_for_ui_display(
        param_ids=[
            root_id,
            pinned_parent_id,
            pinned_leaf_id,
            unpinned_parent_id,
            unpinned_leaf_id,
        ],
        id_to_id_path={
            root_id: (root_id,),
            pinned_parent_id: (root_id, pinned_parent_id),
            pinned_leaf_id: (root_id, pinned_parent_id, pinned_leaf_id),
            unpinned_parent_id: (root_id, unpinned_parent_id),
            unpinned_leaf_id: (root_id, unpinned_parent_id, unpinned_leaf_id),
        },
        children_map={
            root_id: [pinned_parent_id, unpinned_parent_id],
            pinned_parent_id: [pinned_leaf_id],
            unpinned_parent_id: [unpinned_leaf_id],
        },
        pinned_params={pinned_parent_id},
    )

    assert shown.pinned.requiredParamIdsToPaths == {
        root_id: (root_id,),
        pinned_parent_id: (root_id, pinned_parent_id),
        pinned_leaf_id: (root_id, pinned_parent_id, pinned_leaf_id),
    }
    assert shown.pinned.topLevelParamIds == [root_id]
    assert shown.unpinned.requiredParamIdsToPaths == {
        root_id: (root_id,),
        pinned_parent_id: (root_id, pinned_parent_id),
        pinned_leaf_id: (root_id, pinned_parent_id, pinned_leaf_id),
        unpinned_parent_id: (root_id, unpinned_parent_id),
        unpinned_leaf_id: (root_id, unpinned_parent_id, unpinned_leaf_id),
    }
    assert shown.unpinned.topLevelParamIds == [root_id]


def test_filter_for_ui_display_keeps_pinned_root_subtree_visible() -> None:
    root_id = ID("root")
    branch_id = ID("branch")
    leaf_id = ID("leaf")

    shown = filter_for_ui_display(
        param_ids=[root_id, branch_id, leaf_id],
        id_to_id_path={
            root_id: (root_id,),
            branch_id: (root_id, branch_id),
            leaf_id: (root_id, branch_id, leaf_id),
        },
        children_map={
            root_id: [branch_id],
            branch_id: [leaf_id],
        },
        pinned_params={root_id},
    )

    assert shown.pinned.requiredParamIdsToPaths == {
        root_id: (root_id,),
        branch_id: (root_id, branch_id),
        leaf_id: (root_id, branch_id, leaf_id),
    }
    assert shown.pinned.topLevelParamIds == [root_id]
    assert shown.unpinned.requiredParamIdsToPaths == {
        root_id: (root_id,),
        branch_id: (root_id, branch_id),
        leaf_id: (root_id, branch_id, leaf_id),
    }
    assert shown.unpinned.topLevelParamIds == [root_id]

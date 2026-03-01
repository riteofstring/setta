from setta.types.id import ID
from setta.types.shown_params import filter_for_ui_display


def test_filter_for_ui_display_keeps_pinned_paths_and_unpinned_tree_structure() -> None:
    # Build a small two-branch param tree:
    # root
    # ├─ left
    # │  └─ left_leaf
    # └─ right
    #    └─ right_leaf
    root = ID("root")
    left = ID("left")
    left_leaf = ID("left_leaf")
    right = ID("right")
    right_leaf = ID("right_leaf")
    param_ids = [root, left, left_leaf, right, right_leaf]
    id_to_id_path = {
        root: (root,),
        left: (root, left),
        left_leaf: (root, left, left_leaf),
        right: (root, right),
        right_leaf: (root, right, right_leaf),
    }
    children_map = {
        root: [left, right],
        left: [left_leaf],
        right: [right_leaf],
    }

    shown = filter_for_ui_display(
        param_ids=param_ids,
        id_to_id_path=id_to_id_path,
        children_map=children_map,
        pinned_params={left},
    )

    # Pinned area should include the pinned branch and the ancestor path.
    assert shown.pinned.topLevelParamIds == [root]
    assert shown.pinned.requiredParamIdsToPaths == {
        root: (root,),
        left: (root, left),
        left_leaf: (root, left, left_leaf),
    }
    # Unpinned area still includes full structure for unpinned descendants.
    assert shown.unpinned.topLevelParamIds == [root]
    assert shown.unpinned.requiredParamIdsToPaths == {
        root: (root,),
        left: (root, left),
        left_leaf: (root, left, left_leaf),
        right: (root, right),
        right_leaf: (root, right, right_leaf),
    }


def test_filter_for_ui_display_prunes_non_leaf_without_candidate_children() -> None:
    # root has one child; if that child is pinned, the unpinned area candidate set
    # contains only root and should be pruned to empty.
    root = ID("root")
    child = ID("child")
    param_ids = [root, child]
    id_to_id_path = {
        root: (root,),
        child: (root, child),
    }
    children_map = {
        root: [child],
    }

    shown = filter_for_ui_display(
        param_ids=param_ids,
        id_to_id_path=id_to_id_path,
        children_map=children_map,
        pinned_params={child},
    )

    assert shown.pinned.topLevelParamIds == [root]
    assert shown.pinned.requiredParamIdsToPaths == {
        root: (root,),
        child: (root, child),
    }
    assert shown.unpinned.topLevelParamIds == []
    assert shown.unpinned.requiredParamIdsToPaths == {}

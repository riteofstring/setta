from ...schema import db
from ...utils.utils import get_children_recursively


def load_sections(ids):
    print("ids", ids)
    query = """
        WITH RECURSIVE DESCENDANTS AS (
            SELECT parentId, childId
            FROM SectionChildren
            WHERE parentId = :parentId
        UNION
            SELECT X.parentId, X.childId
            FROM SectionChildren X
            JOIN DESCENDANTS ON X.parentId = DESCENDANTS.childId
        )
        SELECT * FROM DESCENDANTS
        ORDER BY "order";
    """

    all_ids, parent_to_children = get_children_recursively(db, ids, query)

    print("all_ids", all_ids)
    print("parent_to_children", parent_to_children)

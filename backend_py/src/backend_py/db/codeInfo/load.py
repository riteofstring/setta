from ...schema import db
from ...utils.utils import get_children_recursively


def load_code_info_for_sections(ui_types):
    section_ui_types = {
        k: v
        for k, v in ui_types.items()
        if v["type"] in ["SECTION", "LIST_ROOT", "DICT_ROOT"]
    }
    collection_ids = [v["config"]["codeInfoId"] for v in section_ui_types.values()]
    return load_code_info(collection_ids)


def load_code_info(ids):
    query = """
        WITH RECURSIVE DESCENDANTS AS (
            SELECT parentId, childId
            FROM CodeInfoCol
            WHERE parentId = :parentId
        UNION
            SELECT X.parentId, X.childId
            FROM CodeInfoCol X
            JOIN DESCENDANTS ON X.parentId = DESCENDANTS.childId
        )
        SELECT * FROM DESCENDANTS
        ORDER BY "order";
    """

    all_ids, parent_to_children = get_children_recursively(db, ids, query)

    placeholders = ", ".join(["?"] * len(all_ids))
    query = f"""
        SELECT * FROM CodeInfo
        WHERE id IN ({placeholders})
    """
    db.execute(query, all_ids)
    output = {}
    for row in db.fetchall():
        x = dict(row)
        x["children"] = parent_to_children[x["id"]]
        output[x["id"]] = x
    return output

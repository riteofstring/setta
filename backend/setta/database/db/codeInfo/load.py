import json

from setta.database.utils import get_children_recursively


def load_code_info_for_sections(dbs, sections):
    db = dbs.default
    collection_ids = [v["codeInfoId"] for v in sections.values()]
    return load_code_info(db, collection_ids)


def load_code_info(db, ids):
    query = """
        WITH RECURSIVE DESCENDANTS AS (
            SELECT parentId, childId, "order"
            FROM CodeInfoCol
            WHERE parentId = :parentId
        UNION
            SELECT X.parentId, X.childId, X."order"
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
        kp = x["keywordPositions"]
        kp = json.loads(kp) if kp is not None else kp
        x["keywordPositions"] = kp
        output[x["id"]] = x
    return output

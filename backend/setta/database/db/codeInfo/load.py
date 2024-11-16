from collections import defaultdict
from pprint import pprint

from setta.database.utils import parse_keyword_positions_string


def load_code_info(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        WITH RECURSIVE DESCENDANTS AS (
            SELECT c.idid, c.parentId, c.childId, c."order"
            FROM CodeInfoCol c
            WHERE c.idid IN ({placeholders})

            UNION

            SELECT X.idid, X.parentId, X.childId, X."order"
            FROM CodeInfoCol X
            JOIN DESCENDANTS d ON X.parentId = d.childId AND X.idid = d.idid
        )
        SELECT * FROM DESCENDANTS
        ORDER BY idid, "order";
    """
    db.execute(query, tuple(ids))
    results = db.fetchall()
    all_ids = set()
    code_info_cols = {
        k: {
            "id": k,
            "children": defaultdict(list),
        }
        for k in ids
    }
    for row in results:
        (codeInfoColId, parentId, childId, _) = row
        if parentId:
            all_ids.add(parentId)
        all_ids.add(childId)
        children_dict = code_info_cols[codeInfoColId]["children"]
        children_dict[parentId].append(childId)
        if childId not in children_dict:
            children_dict[childId] = []

    all_ids = list(all_ids)

    placeholders = ", ".join(["?"] * len(all_ids))
    query = f"""
        SELECT * FROM CodeInfo
        WHERE id IN ({placeholders})
    """
    db.execute(query, all_ids)
    code_info = {}
    for row in db.fetchall():
        x = dict(row)
        x["keywordPositions"] = parse_keyword_positions_string(x["keywordPositions"])
        code_info[x["id"]] = x

    pprint(code_info)
    pprint(code_info_cols)
    return code_info, code_info_cols


def load_code_info_cols(db, sectionVariants):
    collection_ids = [v["codeInfoColId"] for v in sectionVariants.values()]
    return load_code_info(db, collection_ids)

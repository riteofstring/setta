from collections import defaultdict

from ...schema import db


def load_evcols(ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT EVColId.id, EVCol.objName, EVCol.paramName, EVCol.value
        FROM EVColId
        LEFT JOIN EVCol
        ON EVColId.id = EVCol.idid
        WHERE EVColId.id in ({placeholders})
    """
    db.execute(query, ids)
    output = defaultdict(lambda: defaultdict(dict))
    for row in db.fetchall():
        output[row["id"]][row["objName"]][row["paramName"]] = row["value"]
    for v in output.values():
        v.pop(None, None)
    return output

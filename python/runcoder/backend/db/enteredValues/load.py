from ...schema import db


def load_evcols(ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT EVColId.id, EVCol.codeInfoId, EVCol.type, EVCol.value
        FROM EVColId
        LEFT JOIN EVCol
        ON EVColId.id = EVCol.idid
        WHERE EVColId.id in ({placeholders})
        ORDER BY EVCol."order"
    """
    db.execute(query, ids)
    output = {}
    for row in db.fetchall():
        id = row["id"]
        codeInfoId = row["codeInfoId"]
        if id not in output:
            output[id] = {}
        if codeInfoId not in output[id]:
            output[id][codeInfoId] = []
        output[id][codeInfoId].append({"type": row["type"], "value": row["value"]})
    return output

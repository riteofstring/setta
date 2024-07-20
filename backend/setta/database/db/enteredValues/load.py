def load_evcols(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT EVColId.id, EVColId.name, EVCol.codeInfoId, EVCol.value
        FROM EVColId
        LEFT JOIN EVCol
        ON EVColId.id = EVCol.idid
        WHERE EVColId.id in ({placeholders})
    """
    db.execute(query, ids)
    output = {}
    for row in db.fetchall():
        id = row["id"]
        if id not in output:
            output[id] = {"name": row["name"], "values": {}}
        if row["value"] is not None:
            output[id]["values"][row["codeInfoId"]] = row["value"]

    return output

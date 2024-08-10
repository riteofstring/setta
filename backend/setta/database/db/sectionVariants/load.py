def load_section_variants(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT SectionVariantId.id, SectionVariantId.name, SectionVariantEV.codeInfoId, SectionVariantEV.value
        FROM SectionVariantId
        LEFT JOIN SectionVariantEV
        ON SectionVariantId.id = SectionVariantEV.idid
        WHERE SectionVariantId.id in ({placeholders})
    """
    db.execute(query, ids)
    output = {}
    for row in db.fetchall():
        id = row["id"]
        if id not in output:
            output[id] = {"name": row["name"], "values": {}, "children": []}
        if row["value"] is not None:
            output[id]["values"][row["codeInfoId"]] = row["value"]

    return output

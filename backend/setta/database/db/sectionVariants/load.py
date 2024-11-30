import json


def load_section_variants(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT SectionVariantId.id, SectionVariantId.data, SectionVariantId.selectedItem, SectionVariantId.codeInfoColId, SectionVariantEV.codeInfoId, SectionVariantEV.data as valueData
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
            output[id] = {
                "selectedItem": row["selectedItem"],
                "codeInfoColId": row["codeInfoColId"],
                "values": {},
                "children": [],
                **json.loads(row["data"]),
            }
        if row["valueData"]:
            output[id]["values"][row["codeInfoId"]] = json.loads(row["valueData"])

    placeholders = ", ".join(["?"] * len(output))
    query = f"""
        SELECT SectionVariantId.id, SectionVariantChildren.childId, SectionVariantChildren."order"
        FROM SectionVariantId
        JOIN SectionVariantChildren
        ON SectionVariantId.id = SectionVariantChildren.idid
        WHERE SectionVariantId.id in ({placeholders})
        ORDER BY SectionVariantChildren."order"
    """
    db.execute(query, ids)
    for row in db.fetchall():
        output[row["id"]]["children"].append(row["childId"])
    return output

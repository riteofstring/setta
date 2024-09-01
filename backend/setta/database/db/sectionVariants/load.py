from setta.database.utils import parse_keyword_positions_string


def load_section_variants(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT SectionVariantId.id, SectionVariantId.name, SectionVariantId.selectedItem, SectionVariantId.code, SectionVariantId.keywordPositions as codeAreaKeywordPositions, SectionVariantEV.codeInfoId, SectionVariantEV.value, SectionVariantEV.keywordPositions
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
                "name": row["name"],
                "selectedItem": row["selectedItem"],
                "code": row["code"],
                "keywordPositions": parse_keyword_positions_string(
                    row["codeAreaKeywordPositions"]
                ),
                "values": {},
                "children": [],
            }
        if row["value"] is not None:
            output[id]["values"][row["codeInfoId"]] = {
                "value": row["value"],
                "keywordPositions": parse_keyword_positions_string(
                    row["keywordPositions"]
                ),
            }

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

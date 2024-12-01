import json

from setta.utils.constants import copy_defaults_into_obj


def load_section_variants(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT SectionVariantId.id, SectionVariantId.data, SectionVariantId.selectedItem, SectionVariantId.codeInfoColId, SectionVariantId.runGroup, SectionVariantEV.codeInfoId, SectionVariantEV.data as valueData
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
            output[id] = copy_defaults_into_obj({
                "selectedItem": row["selectedItem"],
                "codeInfoColId": row["codeInfoColId"],
                "runGroup": json.loads(row["runGroup"]),
                "values": {},
                "children": [],
                **json.loads(row["data"]),
            }, "sectionVariant")
        if row["valueData"]:
            output[id]["values"][row["codeInfoId"]] = json.loads(row["valueData"])

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

    query = f"""
        SELECT SectionVariantId.id, SectionVariantParamSweep.selectedItemGroupNum, SectionVariantParamSweep.paramInfoGroupNum, SectionVariantParamSweep.selectedItem, SectionVariantParamSweep.paramInfoId, SectionVariantParamSweep.value
        FROM SectionVariantId
        LEFT JOIN SectionVariantParamSweep
        ON SectionVariantId.id = SectionVariantParamSweep.idid
        WHERE SectionVariantId.id in ({placeholders})
        ORDER BY SectionVariantParamSweep."order"
    """
    db.execute(query, ids)
    for row in db.fetchall():
        id = row["id"]
        if "sweep" not in output[id]:
            output[id]["sweep"] = []
        curr = output[id]["sweep"]

        selectedItemGroupNum = row["selectedItemGroupNum"]
        if selectedItemGroupNum is None:
            continue
        if len(curr) <= selectedItemGroupNum:
            curr.append({"selectedItem": row["selectedItem"], "params": []})
        curr = curr[selectedItemGroupNum]["params"]

        paramInfoGroupNum = row["paramInfoGroupNum"]
        if paramInfoGroupNum is None:
            continue
        if len(curr) <= paramInfoGroupNum:
            curr.append({"paramInfoId": row["paramInfoId"], "values": []})
        curr = curr[paramInfoGroupNum]["values"]

        if row["value"] is not None:
            curr.append(row["value"])

    return output

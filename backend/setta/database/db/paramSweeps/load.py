import json


def load_param_sweeps(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT ParamSweepId.id, ParamSweepId.data, ParamSweep.data as paramSweepData, ParamSweep.selectedItem, ParamSweep.paramInfoId
        FROM ParamSweepId
        LEFT JOIN ParamSweep
        ON ParamSweepId.id = ParamSweep.idid
        WHERE ParamSweepId.id in ({placeholders})
        ORDER BY ParamSweep."order"
    """
    db.execute(query, ids)
    output = {}
    for row in db.fetchall():
        id = row["id"]
        if id not in output:
            output[id] = {"sweep": [], **json.loads(row["data"])}
        curr = output[id]["sweep"]

        sweep_details = json.loads(row["paramSweepData"])
        selectedItemGroupNum = sweep_details["selectedItemGroupNum"]
        if selectedItemGroupNum is None:
            continue
        if len(curr) <= selectedItemGroupNum:
            curr.append({"selectedItem": row["selectedItem"], "params": []})
        curr = curr[selectedItemGroupNum]["params"]

        paramInfoGroupNum = sweep_details["paramInfoGroupNum"]
        if paramInfoGroupNum is None:
            continue
        if len(curr) <= paramInfoGroupNum:
            curr.append({"paramInfoId": row["paramInfoId"], "values": []})
        curr = curr[paramInfoGroupNum]["values"]

        if sweep_details["value"] is not None:
            curr.append(sweep_details["value"])

    return output


def find_matching_and_append(curr, row, key):
    matching = None
    for s in curr:
        if s.get(key) == row[key]:
            matching = s
            break
    return matching

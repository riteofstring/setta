def load_param_sweeps(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT ParamSweepId.id, ParamSweepId.name, ParamSweep.selectedItem, ParamSweep.paramInfoId, ParamSweep.value
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
            output[id] = {
                "name": row["name"],
                "sweep": [],
            }
        curr = output[id]["sweep"]
        if row["selectedItem"] is None and row["paramInfoId"] is None:
            continue
        matching_selected_item = find_matching_and_append(curr, row, "selectedItem")
        if not matching_selected_item:
            curr.append({"selectedItem": row["selectedItem"], "params": []})
            matching_selected_item = curr[-1]

        curr = matching_selected_item["params"]
        matching_param = find_matching_and_append(curr, row, "paramInfoId")
        if not matching_param:
            curr.append({"paramInfoId": row["paramInfoId"], "values": []})
            matching_param = curr[-1]

        curr = matching_param["values"]
        curr.append(row["value"])

    return output


def find_matching_and_append(curr, row, key):
    matching = None
    for s in curr:
        if s.get(key) == row[key]:
            matching = s
            break
    return matching

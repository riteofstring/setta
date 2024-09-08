def load_param_sweeps(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT ParamSweepId.id, ParamSweepId.name, ParamSweepId.selectedItem, ParamSweep.paramInfoId, ParamSweep.value
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
                "selectedItem": row["selectedItem"],
                "sweep": [],
            }
        curr = output[id]["sweep"]
        if row["paramInfoId"] is not None:
            matching_param = None
            for s in curr:
                if s.get("paramInfoId") == row["paramInfoId"]:
                    matching_param = s
            if matching_param:
                matching_param["values"].append(row["value"])
            else:
                curr.append(
                    {"paramInfoId": row["paramInfoId"], "values": [row["value"]]}
                )

    return output

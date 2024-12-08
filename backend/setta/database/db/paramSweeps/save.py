def save_param_sweeps(db, param_sweeps):
    query = """
        INSERT INTO ParamSweepId (id, name, isFrozen)
        VALUES (:id, :name, :isFrozen)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            isFrozen = :isFrozen
    """

    query_params = [
        {"id": id, "name": p["name"], "isFrozen": p["isFrozen"]}
        for id, p in param_sweeps.items()
    ]
    db.executemany(query, query_params)

    placeholders = ", ".join(["?"] * len(param_sweeps))
    query = f"""
        DELETE FROM ParamSweep
        WHERE idid IN ({placeholders})
    """
    query_params = list(param_sweeps.keys())
    db.execute(query, query_params)

    query = """
        INSERT INTO ParamSweep (idid, selectedItemGroupNum, paramInfoGroupNum, selectedItem, paramInfoId, "order", value)
        VALUES (:idid, :selectedItemGroupNum, :paramInfoGroupNum, :selectedItem, :paramInfoId, :order, :value)
    """

    query_params = []
    for id, p in param_sweeps.items():
        order = 0
        for selectedItemGroupNum, s in enumerate(p["sweep"]):
            selected_item = s["selectedItem"]
            if len(s["params"]) == 0:
                query_params.append(
                    generate_query_param(
                        id,
                        selectedItemGroupNum,
                        None,
                        selected_item,
                        None,
                        order,
                        None,
                    )
                )
                order += 1
            else:
                for paramInfoGroupNum, param in enumerate(s["params"]):
                    values = param["values"] or [None]
                    for value in values:
                        query_params.append(
                            generate_query_param(
                                id,
                                selectedItemGroupNum,
                                paramInfoGroupNum,
                                selected_item,
                                param["paramInfoId"],
                                order,
                                value,
                            )
                        )
                        order += 1

    db.executemany(query, query_params)


def generate_query_param(
    id,
    selectedItemGroupNum,
    paramInfoGroupNum,
    selected_item,
    param_info_id,
    order,
    value,
):
    return {
        "idid": id,
        "selectedItemGroupNum": selectedItemGroupNum,
        "paramInfoGroupNum": paramInfoGroupNum,
        "selectedItem": selected_item,
        "paramInfoId": param_info_id,
        "order": order,
        "value": value,
    }

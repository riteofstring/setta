def save_param_sweeps(dbs, param_sweeps):
    db = dbs.default
    query = """
        INSERT INTO ParamSweepId (id, selectedItem, name)
        VALUES (:id, :selectedItem, :name)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            selectedItem = :selectedItem
    """

    query_params = [
        {"id": id, "selectedItem": p["selectedItem"], "name": p["name"]}
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
        INSERT INTO ParamSweep (idid, paramInfoId, "order", value)
        VALUES (:idid, :paramInfoId, :order, :value)
    """

    query_params = []
    for id, p in param_sweeps.items():
        order = 0
        for s in p["sweep"]:
            for v in s["values"]:
                query_params.append(
                    {
                        "idid": id,
                        "paramInfoId": s["paramInfoId"],
                        "order": order,
                        "value": v,
                    }
                )
                order += 1

    from pprint import pprint

    pprint(query_params)

    db.executemany(query, query_params)

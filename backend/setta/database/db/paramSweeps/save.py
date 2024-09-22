def save_param_sweeps(db, param_sweeps):
    query = """
        INSERT INTO ParamSweepId (id, name)
        VALUES (:id, :name)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name
    """

    query_params = [{"id": id, "name": p["name"]} for id, p in param_sweeps.items()]
    db.executemany(query, query_params)

    placeholders = ", ".join(["?"] * len(param_sweeps))
    query = f"""
        DELETE FROM ParamSweep
        WHERE idid IN ({placeholders})
    """
    query_params = list(param_sweeps.keys())
    db.execute(query, query_params)

    query = """
        INSERT INTO ParamSweep (idid, selectedItem, paramInfoId, "order", value)
        VALUES (:idid, :selectedItem, :paramInfoId, :order, :value)
    """

    query_params = []
    for id, p in param_sweeps.items():
        order = 0
        for s in p["sweep"]:
            selectedItem = s["selectedItem"]
            for param in s["params"]:
                for value in param["values"]:
                    query_params.append(
                        {
                            "idid": id,
                            "selectedItem": selectedItem,
                            "paramInfoId": param["paramInfoId"],
                            "order": order,
                            "value": value,
                        }
                    )
                    order += 1

    from pprint import pprint

    pprint(query_params)

    db.executemany(query, query_params)

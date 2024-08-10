def save_param_sweeps(dbs, param_sweeps):
    db = dbs.default
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
        INSERT INTO ParamSweep (idid, paramInfoId, sectionVariantId, "order", value)
        VALUES (:idid, :paramInfoId, :sectionVariantId, :order, :value)
    """

    query_params = []
    for id, p in param_sweeps.items():
        order = 0
        for s in p["sweep"]:
            if "paramInfoId" in s:
                for v in s["values"]:
                    query_params.append(
                        {
                            "idid": id,
                            "paramInfoId": s["paramInfoId"],
                            "sectionVariantId": None,
                            "order": order,
                            "value": v,
                        }
                    )
                    order += 1
            else:
                query_params.append(
                    {
                        "idid": id,
                        "paramInfoId": None,
                        "sectionVariantId": s["sectionVariantId"],
                        "order": order,
                        "value": None,
                    }
                )
                order += 1

    db.executemany(query, query_params)

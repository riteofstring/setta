def save_run_groups(db, run_groups):
    query = """
        INSERT INTO RunGroupId (id, name, projectConfigId, "order", selected)
        VALUES (:id, :name, :projectConfigId, :order, :selected)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            "order" = :order,
            selected = :selected
    """

    query_params = []
    for order, (id, r) in enumerate(run_groups.items()):
        query_params.append(
            {
                "id": id,
                "name": r["name"],
                "projectConfigId": r["projectConfigId"],
                "order": order,
                "selected": r["selected"],
            }
        )
    db.executemany(query, query_params)

    placeholders = ", ".join(["?"] * len(run_groups))
    query = f"""
        DELETE FROM RunGroup
        WHERE idid IN ({placeholders})
    """
    query_params = list(run_groups.keys())
    db.execute(query, query_params)

    query = """
        INSERT INTO RunGroup (idid, sectionId, paramSweepId)
        VALUES (:idid, :sectionId, :paramSweepId)
    """
    query_params = []
    for id, r in run_groups.items():
        curr = []
        for sid, paramSweepDict in r["sections"].items():
            if len(paramSweepDict) == 0:
                curr.extend([{"idid": id, "sectionId": sid, "paramSweepId": None}])
            else:
                curr.extend(
                    [
                        {"idid": id, "sectionId": sid, "paramSweepId": pid}
                        for pid in paramSweepDict.keys()
                    ]
                )
        query_params.extend(curr)

    db.executemany(query, query_params)

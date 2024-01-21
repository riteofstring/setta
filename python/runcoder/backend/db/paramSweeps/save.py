def save_param_sweeps(db, param_sweeps):
    query = """
        INSERT INTO ParamSweep (id, name)
        VALUES (:id, :name)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name
    """

    query_params = [{"id": id, "name": p["name"]} for id, p in param_sweeps.items()]
    db.executemany(query, query_params)

def save_ev_cols(dbs, ev_cols):
    for dbSource,ev_cols_for_one_db in ev_cols.items():
        print("save_ev_cols", dbSource, flush=True)
        save_ev_cols_to_one_db(dbs[dbSource], ev_cols_for_one_db)





def save_ev_cols_to_one_db(db, ev_cols):
    query = """
        INSERT INTO EVColId (id, name)
        VALUES (:id, :name)
        ON CONFLICT (id)
        DO UPDATE SET name = :name
    """

    query_params = [{"id": k, "name": v["name"]} for k, v in ev_cols.items()]
    db.executemany(query, query_params)

    placeholders = ", ".join(["?"] * len(ev_cols))
    query = f"""
        DELETE FROM EVCol
        WHERE idid IN ({placeholders})
    """
    query_params = list(ev_cols.keys())
    db.execute(query, query_params)

    query = """
        INSERT INTO EVCol (idid, codeInfoId, value)
        VALUES (:idid, :codeInfoId, :value)
    """
    query_params = []
    for idid, ev_col in ev_cols.items():
        for code_info_id, value in ev_col["values"].items():
            query_params.append(
                {"idid": idid, "codeInfoId": code_info_id, "value": value}
            )
    db.executemany(query, query_params)
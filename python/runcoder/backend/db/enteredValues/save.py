from ...schema import db


def save_ev_cols(ev_cols):
    with db:
        query = """
            INSERT INTO EVColId (id)
            VALUES (:id)
            ON CONFLICT (id)
            DO NOTHING
        """

        query_params = [{"id": k} for k in ev_cols.keys()]
        db.executemany(query, query_params)

        placeholders = ", ".join(["?"] * len(ev_cols))
        query = f"""
            DELETE FROM EVCol
            WHERE idid IN ({placeholders})
        """
        query_params = list(ev_cols.keys())
        db.execute(query, query_params)

        query = """
            INSERT INTO EVCol (idid, objName, paramName, value)
            VALUES (:idid, :objName, :paramName, :value)
        """
        query_params = []
        for idid, ev_col in ev_cols.items():
            for objName, param_to_value in ev_col.items():
                query_params.extend(
                    [
                        {
                            "idid": idid,
                            "objName": objName,
                            "paramName": paramName,
                            "value": value,
                        }
                        for paramName, value in param_to_value.items()
                    ]
                )
        db.executemany(query, query_params)

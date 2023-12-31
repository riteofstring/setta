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
            INSERT INTO EVCol (idid, codeInfoId, value)
            VALUES (:idid, :codeInfoId, :value)
        """
        query_params = []
        for idid, ev_col in ev_cols.items():
            for code_info_id, value in ev_col.items():
                query_params.append(
                    {"idid": idid, "codeInfoId": code_info_id, "value": value}
                )
        db.executemany(query, query_params)

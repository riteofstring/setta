import json

from setta.utils.utils import replace_null_keys_with_none


def save_code_info(db, codeInfo):
    query = """
        INSERT INTO CodeInfo (id, data)
        VALUES (:id, :data)
        ON CONFLICT (id)
        DO UPDATE SET
            data = :data
    """

    # insert into codeinfo table
    query_params = []
    for codeInfoId, c in codeInfo.items():
        query_params.append(
            {
                "id": codeInfoId,
                "data": json.dumps({k: v for k, v in c.items() if k != "id"}),
            }
        )

    db.executemany(query, query_params)


def save_code_info_col(db, codeInfoCols):
    codeInfoCols = replace_null_keys_with_none(codeInfoCols)

    query = """
        INSERT INTO CodeInfoColId (id)
        VALUES (:id)
        ON CONFLICT (id)
        DO NOTHING
    """

    query_params = [{"id": k} for k in codeInfoCols.keys()]
    db.executemany(query, query_params)

    placeholders = ", ".join(["?"] * len(codeInfoCols))
    query = f"""
        DELETE FROM CodeInfoCol
        WHERE idid IN ({placeholders})
    """
    query_params = list(codeInfoCols.keys())
    db.execute(query, query_params)

    # add children
    query = """
        INSERT INTO CodeInfoCol (idid, parentId, childId, "order")
        VALUES (:idid, :parentId, :childId, :order)
    """
    query_params = []
    for idid, c in codeInfoCols.items():
        for parentId, children in c["children"].items():
            order = 0
            for childId in children:
                query_params.append(
                    {
                        "idid": idid,
                        "parentId": parentId,
                        "childId": childId,
                        "order": order,
                    }
                )
                order += 1
    db.executemany(query, query_params)

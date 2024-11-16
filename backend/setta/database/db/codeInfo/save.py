from setta.database.utils import dump_keyword_positions_as_string
from setta.utils.utils import null_str_to_none


def save_code_info(db, codeInfo):
    query = """
        INSERT INTO CodeInfo (id, name, editable, rcType, defaultVal, description, positionalOnly, isPinned, isFrozen, keywordPositions)
        VALUES (:id, :name, :editable, :rcType, :defaultVal, :description, :positionalOnly, :isPinned, :isFrozen, :keywordPositions)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            editable = :editable,
            rcType = :rcType,
            defaultVal = :defaultVal,
            description = :description,
            positionalOnly = :positionalOnly,
            isPinned = :isPinned,
            isFrozen = :isFrozen,
            keywordPositions = :keywordPositions
    """

    # insert into codeinfo table
    query_params = []
    for c in codeInfo.values():
        query_params.append(
            {
                **c,
                "keywordPositions": dump_keyword_positions_as_string(
                    c["keywordPositions"]
                ),
            }
        )

    db.executemany(query, query_params)


def save_code_info_col(db, codeInfoCols):
    query = """
        INSERT INTO CodeInfoColId (id)
        VALUES (:id)
        ON CONFLICT (id)
        DO NOTHING
    """

    query_params = [{"id": null_str_to_none(k)} for k in codeInfoCols.keys()]
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
    for c in codeInfoCols.values():
        idid = c["id"]
        for parentId, children in c["children"].items():
            order = 0
            for childId in children:
                query_params.append(
                    {
                        "idid": idid,
                        "parentId": null_str_to_none(parentId),
                        "childId": childId,
                        "order": order,
                    }
                )
                order += 1
    db.executemany(query, query_params)

from setta.database.utils import dump_keyword_positions_as_string


def save_code_info(dbs, codeInfo):
    db = dbs.default
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

    # delete children
    placeholders = ", ".join(["?"] * len(codeInfo))
    query = f"""
        DELETE FROM CodeInfoCol
        WHERE parentId IN ({placeholders});
    """
    query_params = list(codeInfo.keys())
    db.execute(query, query_params)

    # add children
    query = """
        INSERT INTO CodeInfoCol (parentId, childId, "order")
        VALUES (:parentId, :childId, :order)
    """
    query_params = []
    for c in codeInfo.values():
        order = 0
        for x in c["children"]:
            query_params.append({"parentId": c["id"], "childId": x, "order": order})
            order += 1
    db.executemany(query, query_params)

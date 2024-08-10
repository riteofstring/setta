def save_code_info(dbs, codeInfo):
    db = dbs.default
    query = """
        INSERT INTO CodeInfo (id, name, editable, rcType, defaultVal, description, positionalOnly, isPinned, isFrozen, isSelected)
        VALUES (:id, :name, :editable, :rcType, :defaultVal, :description, :positionalOnly, :isPinned, :isFrozen, :isSelected)
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
            isSelected = :isSelected
    """

    # insert into codeinfo table
    query_params = list(codeInfo.values())
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
        query_params.extend(
            [
                {"parentId": c["id"], "childId": x, "order": i}
                for i, x in enumerate(c["children"])
            ]
        )
    db.executemany(query, query_params)

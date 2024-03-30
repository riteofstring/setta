def save_code_info(dbs, codeInfo, ev_cols):
    already_saved = set()
    for dbSource, ev_cols_for_one_db in ev_cols.items():
        codeInfoIds = set().union(*[x["values"] for x in ev_cols_for_one_db.values()])
        save_code_info_to_one_db(
            dbs[dbSource],
            {k: v for k, v in codeInfo.items() if k in codeInfoIds},
        )
        already_saved = already_saved.union(codeInfoIds)
    
    save_code_info_to_one_db(dbs.default, {k: v for k, v in codeInfo.items() if k not in already_saved})


def save_code_info_to_one_db(db, codeInfo):
    query = """
        INSERT INTO CodeInfo (id, name, editable, rcType, defaultVal, description, isPinned, isFrozen, isSelected)
        VALUES (:id, :name, :editable, :rcType, :defaultVal, :description, :isPinned, :isFrozen, :isSelected)
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            editable = :editable,
            rcType = :rcType,
            defaultVal = :defaultVal,
            description = :description,
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

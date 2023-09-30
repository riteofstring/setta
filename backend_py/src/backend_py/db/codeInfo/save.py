from ...schema import db


def save_code_info(codeInfo):
    query = """
        INSERT INTO CodeInfo (id, name, editable, rcType, defaultVal)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (id)
        DO NOTHING
    """

    # insert into codeinfo table
    query_params = [
        (x["id"], x["name"], x["editable"], x["rcType"], x["defaultVal"])
        for x in codeInfo.values()
    ]
    db.executemany(query, query_params)
    db.commit()

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
        VALUES (?, ?, ?)
    """
    query_params = []
    for c in codeInfo.values():
        query_params.extend([(c["id"], x, i) for i, x in enumerate(c["children"])])
    db.executemany(query, query_params)

    db.commit()

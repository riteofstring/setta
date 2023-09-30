from ...schema import db


def save_code_info(codeInfo):
    query = """
        INSERT INTO CodeInfo (id, name, editable, rcType, defaultVal) 
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (id)
        DO NOTHING
    """

    codeInfo = [
        (x["id"], x["name"], x["editable"], x["rcType"], x["defaultVal"])
        for x in codeInfo.values()
    ]
    db.executemany(query, codeInfo)
    db.commit()

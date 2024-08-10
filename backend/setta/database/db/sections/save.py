def save_sections(dbs, sections):
    db = dbs.default
    query = """
        INSERT INTO Section (
            id,
            name,
            uiTypeId,
            uiTypeColId,
            social,
            outputGroupId,
            description,
            code,
            codeLanguage,
            isFrozen,
            dbSource
        )
        VALUES (
            :id,
            :name,
            :uiTypeId,
            :uiTypeColId,
            :social,
            :outputGroupId,
            :description,
            :code,
            :codeLanguage,
            :isFrozen,
            :dbSource
        )
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            uiTypeId = :uiTypeId,
            uiTypeColId = :uiTypeColId,
            social = :social,
            outputGroupId = :outputGroupId,
            description = :description,
            code = :code,
            codeLanguage = :codeLanguage,
            isFrozen = :isFrozen,
            dbSource = :dbSource
    """

    query_params = [
        {
            "id": s["id"],
            "name": s["name"],
            "uiTypeId": s["uiTypeId"],
            "uiTypeColId": s["uiTypeColId"],
            "social": s["social"],
            "outputGroupId": s["outputGroup"],
            "description": s["description"],
            "code": s["code"],
            "codeLanguage": s["codeLanguage"],
            "isFrozen": s["isFrozen"],
            "dbSource": s.get("dbSource"),
        }
        for s in sections.values()
    ]

    db.executemany(query, query_params)

    ids = [s["id"] for s in sections.values()]
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        UPDATE UIType
        SET asNonPresetForSectionId = null
        WHERE asNonPresetForSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE UIType
        SET asNonPresetForSectionId = :sectionId
        WHERE id = :uiTypeId
    """
    query_params = []
    for s in sections.values():
        for uiTypeId in s["nonPresetUITypeIds"]:
            query_params.append({"uiTypeId": uiTypeId, "sectionId": s["id"]})
    db.executemany(query, query_params)

    query = f"""
        UPDATE ParamSweepId
        SET originSectionId = null
        WHERE originSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE ParamSweepId
        SET originSectionId = :sectionId
        WHERE id = :paramSweepId
    """
    query_params = []
    for s in sections.values():
        for paramSweepId in s["paramSweepIds"]:
            query_params.append({"paramSweepId": paramSweepId, "sectionId": s["id"]})
    db.executemany(query, query_params)

    query = """
        UPDATE Section
        SET paramSweepSectionId = :paramSweepSectionId
        WHERE id = :id
    """
    db.executemany(
        query,
        [
            {"id": s["id"], "paramSweepSectionId": s["paramSweepSectionId"]}
            for s in sections.values()
        ],
    )

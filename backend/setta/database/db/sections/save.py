def save_sections(dbs, sections):
    db = dbs.default
    query = """
        INSERT INTO Section (
            id,
            name,
            uiTypeId,
            uiTypeColId,
            social,
            description,
            code,
            codeLanguage,
            isFrozen,
            dbSource,
            codeInfoId
        )
        VALUES (
            :id,
            :name,
            :uiTypeId,
            :uiTypeColId,
            :social,
            :description,
            :code,
            :codeLanguage,
            :isFrozen,
            :dbSource,
            :codeInfoId
        )
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            uiTypeId = :uiTypeId,
            uiTypeColId = :uiTypeColId,
            social = :social,
            description = :description,
            code = :code,
            codeLanguage = :codeLanguage,
            isFrozen = :isFrozen,
            dbSource = :dbSource,
            codeInfoId = :codeInfoId
    """

    query_params = [
        {
            "id": s["id"],
            "name": s["name"],
            "uiTypeId": s["uiTypeId"],
            "uiTypeColId": s["uiTypeColId"],
            "social": s["social"],
            "description": s["description"],
            "code": s["code"],
            "codeLanguage": s["codeLanguage"],
            "isFrozen": s["isFrozen"],
            "dbSource": s.get("dbSource"),
            "codeInfoId": s["codeInfoId"],
        }
        for s in sections.values()
    ]

    db.executemany(query, query_params)

    ids = [s["id"] for s in sections.values()]
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        UPDATE SectionVariantId
        SET originSectionId = null
        WHERE originSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE SectionVariantId
        SET originSectionId = :sectionId
        WHERE id = :variantId
    """
    query_params = []
    for s in sections.values():
        for variantId in s["variantIds"]:
            query_params.append({"variantId": variantId, "sectionId": s["id"]})
    db.executemany(query, query_params)

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

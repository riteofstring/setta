def save_sections(db, sections):
    query = """
        INSERT INTO Section (
            id,
            name,
            width,
            height,
            chainedFromId,
            evColId,
            uiTypeId,
            uiTypeColId,
            selectedItemId,
            social,
            outputGroupId,
            description,
            descriptionHeight,
            descriptionVisible,
            script,
            code,
            varControl,
            isFrozen,
            paramSweepId
        )
        VALUES (
            :id,
            :name,
            :width,
            :height,
            :chainedFromId,
            :evColId,
            :uiTypeId,
            :uiTypeColId,
            :selectedItemId,
            :social,
            :outputGroupId,
            :description,
            :descriptionHeight,
            :descriptionVisible,
            :script,
            :code,
            :varControl,
            :isFrozen,
            :paramSweepId
        )
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            width = :width,
            height = :height,
            chainedFromId = :chainedFromId,
            evColId = :evColId,
            uiTypeId = :uiTypeId,
            uiTypeColId = :uiTypeColId,
            selectedItemId = :selectedItemId,
            social = :social,
            outputGroupId = :outputGroupId,
            description = :description,
            descriptionHeight = :descriptionHeight,
            descriptionVisible = :descriptionVisible,
            script = :script,
            code = :code,
            varControl = :varControl,
            isFrozen = :isFrozen,
            paramSweepId = :paramSweepId
    """

    query_params = [
        {
            "id": s["id"],
            "name": s["name"],
            "width": convert_size(s["size"]["width"]),
            "height": convert_size(s["size"]["height"]),
            "chainedFromId": s["chainedFrom"],
            "evColId": s["evColId"],
            "uiTypeId": s["uiTypeId"],
            "uiTypeColId": s["uiTypeColId"],
            "selectedItemId": s["selectedItem"],
            "social": s["social"],
            "outputGroupId": s["outputGroup"],
            "description": s["description"],
            "descriptionHeight": s["descriptionHeight"],
            "descriptionVisible": s["descriptionVisible"],
            "script": s["script"],
            "code": s["code"],
            "varControl": s["varControl"],
            "isFrozen": s["isFrozen"],
            "paramSweepId": s["paramSweepId"],
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
        UPDATE EVColId
        SET originSectionId = null
        WHERE originSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE EVColId
        SET originSectionId = :sectionId
        WHERE id = :evColId
    """
    query_params = []
    for s in sections.values():
        for evColId in s["evColIds"]:
            query_params.append({"evColId": evColId, "sectionId": s["id"]})
    db.executemany(query, query_params)

    query = f"""
        UPDATE ParamSweep
        SET originSectionId = null
        WHERE originSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE ParamSweep
        SET originSectionId = :sectionId
        WHERE id = :paramSweepId
    """
    query_params = []
    for s in sections.values():
        for paramSweepId in s["paramSweepIds"]:
            query_params.append({"paramSweepId": paramSweepId, "sectionId": s["id"]})
    db.executemany(query, query_params)

    # delete children
    placeholders = ", ".join(["?"] * len(sections))
    query = f"""
        DELETE FROM SectionChildren
        WHERE parentId IN ({placeholders});
    """
    query_params = list(sections.keys())
    db.execute(query, query_params)

    # add children
    query = """
        INSERT INTO SectionChildren (parentId, childId, "order")
        VALUES (:parentId, :childId, :order)
    """
    query_params = []
    for s in sections.values():
        query_params.extend(
            [
                {"parentId": s["id"], "childId": x, "order": i}
                for i, x in enumerate(s["children"])
            ]
        )
    db.executemany(query, query_params)


def convert_size(x):
    return -1 if x == "auto" else x

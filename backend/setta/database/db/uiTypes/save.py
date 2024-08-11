from setta.utils.constants import C, is_section_ui_type


def save_ui_types(dbs, uiTypes):
    db = dbs.default
    uiTypes = list(uiTypes.values())

    query = """
        INSERT INTO UIType (id, type, name, presetType)
        VALUES (:id, :type, :name, :presetType)
        ON CONFLICT (id)
        DO UPDATE SET
            type = :type,
            name = :name,
            presetType = :presetType
    """

    query_parameters = uiTypes
    db.executemany(query, query_parameters)

    save_section_types(db, uiTypes)
    save_slider_types(db, uiTypes)


def save_section_types(db, uiTypes):
    uiTypes = [x for x in uiTypes if is_section_ui_type(x["type"])]
    query = """
        UPDATE UIType
        SET sectionConfigCodeInfoId = :sectionConfigCodeInfoId,
            sectionConfigChildUITypeId = :sectionConfigChildUITypeId
        WHERE id = :id
    """
    query_parameters = [{"id": x["id"], **parse_section_config(x)} for x in uiTypes]
    db.executemany(query, query_parameters)


def parse_section_config(uiType):
    config = uiType["config"]
    return {
        "sectionConfigCodeInfoId": config.get("codeInfoId"),
        "sectionConfigChildUITypeId": config.get("childUITypeId"),
    }


def save_slider_types(db, uiTypes):
    uiTypes = [x for x in uiTypes if x["type"] == C.SLIDER]
    query = """
        UPDATE UIType
        SET sliderConfigMin = :sliderConfigMin,
            sliderConfigMax = :sliderConfigMax,
            sliderConfigStep = :sliderConfigStep
        WHERE id = :id
    """
    query_parameters = [{"id": x["id"], **parse_slider_config(x)} for x in uiTypes]
    db.executemany(query, query_parameters)


def parse_slider_config(uiType):
    config = uiType["config"]
    return {
        "sliderConfigMin": config.get("min"),
        "sliderConfigMax": config.get("max"),
        "sliderConfigStep": config.get("step"),
    }


def save_ui_type_cols(dbs, uitype_cols):
    db = dbs.default
    query = """
        INSERT INTO UITypeColId (id)
        VALUES (:id)
        ON CONFLICT (id)
        DO NOTHING
    """

    query_params = [{"id": k} for k in uitype_cols.keys()]
    db.executemany(query, query_params)

    query_params = []
    for idid in uitype_cols.keys():
        for code_info_id in uitype_cols[idid].keys():
            query_params.extend([idid, code_info_id])
    placeholders = ", ".join(["(?, ?)"] * (len(query_params) // 2))
    query = f"""
        UPDATE UIType
        SET asNonPresetForUITypeColId = null,
            asNonPresetForCodeInfoId = null
        WHERE (asNonPresetForUITypeColId, asNonPresetForCodeInfoId) IN ({placeholders})
    """
    db.execute(query, query_params)

    placeholders = ", ".join(["?"] * len(uitype_cols))
    query = f"""
        DELETE FROM UITypeCol
        WHERE idid IN ({placeholders})
    """
    query_params = list(uitype_cols.keys())
    db.execute(query, query_params)

    query = """
        INSERT INTO UITypeCol (idid, codeInfoId, uiTypeId)
        VALUES (:idid, :codeInfoId, :uiTypeId)
    """
    query_params = []
    for idid in uitype_cols.keys():
        for code_info_id, ui_info in uitype_cols[idid].items():
            query_params.append(
                {
                    "idid": idid,
                    "codeInfoId": code_info_id,
                    "uiTypeId": ui_info["uiTypeId"],
                }
            )

    db.executemany(query, query_params)

    query = """
        UPDATE UIType
        SET asNonPresetForUITypeColId = :uiTypeColId,
            asNonPresetForCodeInfoId = :codeInfoId
        WHERE id = :nonPresetUITypeId
    """
    query_params = []
    for idid in uitype_cols.keys():
        for code_info_id, ui_info in uitype_cols[idid].items():
            query_params.extend(
                [
                    {
                        "uiTypeColId": idid,
                        "codeInfoId": code_info_id,
                        "nonPresetUITypeId": x,
                    }
                    for x in ui_info["nonPresetUITypeIds"]
                ]
            )

    db.executemany(query, query_params)

from ...schema import db


def save_ui_types(uiTypes):
    with db:
        uiTypes = list(uiTypes.values())

        query = """
            INSERT OR REPLACE INTO UIType (id, type, name, presetType)
            VALUES (:id, :type, :name, :presetType)
        """

        query_parameters = uiTypes
        db.executemany(query, query_parameters)

        save_section_types(uiTypes)
        save_slider_types(uiTypes)


def save_section_types(uiTypes):
    uiTypes = [x for x in uiTypes if x["type"] in ["SECTION", "LIST_ROOT", "DICT_ROOT"]]
    query = """
        UPDATE UIType
        SET sectionConfigSubType = :sectionConfigSubType,
            sectionConfigChildUITypeId = :sectionConfigChildUITypeId
        WHERE id = :id
    """
    query_parameters = [{"id": x["id"], **parse_section_config(x)} for x in uiTypes]
    db.executemany(query, query_parameters)

    placeholders = ", ".join(["?"] * len(uiTypes))
    query = f"""
        DELETE FROM SectionConfigCollections
        WHERE uiTypeId IN ({placeholders})
    """
    query_params = [x["id"] for x in uiTypes]
    db.execute(query, query_params)

    query = """
        INSERT INTO SectionConfigCollections (uiTypeId, codeInfoId)
        VALUES (:uiTypeId, :codeInfoId)
    """
    query_params = []
    for x in uiTypes:
        query_params.extend(
            [{"uiTypeId": x["id"], "codeInfoId": c} for c in x["config"]["collections"]]
        )

    db.executemany(query, query_params)


def parse_section_config(uiType):
    config = uiType["config"]
    return {
        "sectionConfigSubType": config.get("subType"),
        "sectionConfigChildUITypeId": config.get("childUITypeId"),
    }


def save_slider_types(uiTypes):
    uiTypes = [x for x in uiTypes if x["type"] == "SLIDER"]
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


def save_ui_type_cols(uitype_cols):
    with db:
        query = """
            INSERT OR REPLACE INTO UITypeColId (id)
            VALUES (:id)
            ON CONFLICT (id)
            DO NOTHING
        """

        query_params = [{"id": k} for k in uitype_cols.keys()]
        db.executemany(query, query_params)

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

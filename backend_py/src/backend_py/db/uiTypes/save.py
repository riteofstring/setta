from ...schema import db


def save_ui_types(uiTypes):
    with db:
        uiTypes = list(uiTypes.values())

        query = """
            INSERT INTO UIType (id, type, name, presetType)
            VALUES (:id, :type, :name, :presetType)
        """

        query_parameters = uiTypes
        db.executemany(query, query_parameters)

        query = """
            UPDATE UIType
            SET sliderConfigMin = :sliderConfigMin,
                sliderConfigMax = :sliderConfigMax,
                sliderConfigStep = :sliderConfigStep
            WHERE id = :id
        """
        query_parameters = [
            {"id": x["id"], **process_config(x)}
            for x in uiTypes
            if x["type"] == "SLIDER"
        ]
        db.executemany(query, query_parameters)


def process_config(ui_type):
    config, type_ = ui_type["config"], ui_type["type"]
    # TODO
    # if is_section_ui_type(ui_type):
    #     return {
    #         "sectionConfigSubType": config.get('subType'),
    #         "sectionConfigCollections": {
    #             "set": [{"id": x} for x in config.get('collections', [])]
    #         },
    #         "sectionConfigChildUITypeId": config.get('childUITypeId')
    #     }
    if type_ == "SLIDER":
        return {
            "sliderConfigMin": config.get("min"),
            "sliderConfigMax": config.get("max"),
            "sliderConfigStep": config.get("step"),
        }
    else:
        return {}


def save_ui_type_cols(uitype_cols):
    with db:
        query = """
            INSERT INTO UITypeColId (id)
            VALUES (:id)
            ON CONFLICT (id)
            DO NOTHING
        """

        query_params = [{"id": k} for k in uitype_cols.keys()]
        db.executemany(query, query_params)

        placeholders = ", ".join(["?"] * len(uitype_cols))
        query = f"""
            DELETE FROM EVCol
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

from ...schema import db


def save_ui_types(uiTypes):
    uiTypes = list(uiTypes.values())

    query = """
        INSERT INTO UIType (id, ownerId, type, name, presetType)
        VALUES (:id, :ownerId, :type, :name, :presetType)
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
        {"id": x["id"], **process_config(x)} for x in uiTypes if x["type"] == "SLIDER"
    ]
    db.executemany(query, query_parameters)

    db.commit()


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

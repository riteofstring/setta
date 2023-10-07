from ...schema import db


def load_base_uitypes():
    return load_uitypes_by_preset_type(["BASE", "USER"])


def load_uitypes_by_preset_type(preset_types):
    placeholders = ", ".join(["?"] * len(preset_types))
    query = f"""
        SELECT UIType.*, GROUP_CONCAT(SectionConfigCollections.codeInfoId) as collections
        FROM UIType
        LEFT JOIN SectionConfigCollections
        ON UIType.id = SectionConfigCollections.uiTypeId
        WHERE presetType in ({placeholders})
        GROUP BY UIType.id
    """

    db.execute(query, preset_types)
    output = {}
    for row in db.fetchall():
        row = dict(row)
        output[row["id"]] = process_uitype(row)
    return output


def process_uitype(uitype):
    output = {
        "id": uitype["id"],
        "name": uitype["name"],
        "type": uitype["type"],
        "presetType": uitype["presetType"],
        "config": {},
    }
    if uitype["type"] in ["SECTION", "LIST_ROOT", "DICT_ROOT"]:
        output["config"] = load_section_config(uitype)
    if uitype["type"] == "SLIDER":
        output["config"] = load_slider_config(uitype)
    return output


def load_section_config(uitype):
    return {
        "subType": uitype["sectionConfigSubType"],
        "collections": uitype["collections"].split(",")
        if uitype["collections"]
        else [],
        "childUITypeId": uitype["sectionConfigChildUITypeId"],
    }


def load_slider_config(uitype):
    return {
        "min": uitype["sliderConfigMin"],
        "max": uitype["sliderConfigMax"],
        "step": uitype["sliderConfigStep"],
    }


def load_uitypecols(ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT UITypeCol.*, GROUP_CONCAT(UIType.id) as nonPresetUITypeIds
        FROM UITypeCol
        LEFT JOIN UIType
        ON
            UITypeCol.idid = UIType.asNonPresetForUITypeColId
        AND
            UITypeCol.codeInfoId = UIType.asNonPresetForCodeInfoId
        WHERE UITypeCol.idid in ({placeholders})
    """
    db.execute(query, ids)
    output = {}
    for row in db.fetchall():
        row = dict(row)
        if row["idid"]:
            output[row["idid"]] = {
                row["codeInfoId"]: {
                    "uiTypeId": row["uiTypeId"],
                    "nonPresetUITypeIds": row["nonPresetUITypeIds"].split(",")
                    if row["nonPresetUITypeIds"]
                    else [],
                }
            }
    return output

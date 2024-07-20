from runcoder.utils.constants import C, is_section_ui_type


def load_uitypes_by_condition(db, preset_types=None, ids=None):
    if preset_types and ids:
        raise ValueError
    if preset_types:
        query_params = preset_types
        placeholders = ", ".join(["?"] * len(preset_types))
        where = f"WHERE UIType.presetType in ({placeholders})"
    elif ids:
        query_params = ids
        placeholders = ", ".join(["?"] * len(ids))
        where = f"WHERE UIType.id in ({placeholders})"
    else:
        return {}

    query = f"""
        SELECT *
        FROM UIType
        {where}
    """

    db.execute(query, query_params)
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
    if is_section_ui_type(uitype["type"]):
        output["config"] = load_section_config(uitype)
    if uitype["type"] == C.SLIDER:
        output["config"] = load_slider_config(uitype)
    return output


def load_section_config(uitype):
    return {
        "subType": uitype["sectionConfigSubType"],
        "codeInfoId": uitype["sectionConfigCodeInfoId"],
        "childUITypeId": uitype["sectionConfigChildUITypeId"],
    }


def load_slider_config(uitype):
    return {
        "min": uitype["sliderConfigMin"],
        "max": uitype["sliderConfigMax"],
        "step": uitype["sliderConfigStep"],
    }


def load_uitypecols(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT UITypeColId.id, UITypeCol.codeInfoId, UITypeCol.uiTypeId, GROUP_CONCAT(UIType.id) as nonPresetUITypeIds
        FROM UITypeColId
        LEFT JOIN UITypeCol
        ON UITypeColId.id = UITypeCol.idid
        LEFT JOIN UIType
        ON
            UITypeColId.id = UIType.asNonPresetForUITypeColId
        AND
            UITypeCol.codeInfoId = UIType.asNonPresetForCodeInfoId
        WHERE UITypeColId.id in ({placeholders})
        GROUP BY UITypeColId.id, UITypeCol.codeInfoId
    """
    db.execute(query, ids)
    output = {}
    for row in db.fetchall():
        row = dict(row)
        if row["id"] not in output:
            output[row["id"]] = {}
        output[row["id"]][row["codeInfoId"]] = {
            "uiTypeId": row["uiTypeId"],
            "nonPresetUITypeIds": row["nonPresetUITypeIds"].split(",")
            if row["nonPresetUITypeIds"]
            else [],
        }
    for v in output.values():
        v.pop(None, None)
    return output

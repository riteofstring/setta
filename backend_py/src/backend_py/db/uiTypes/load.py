from ast import literal_eval

from ...schema import db


def load_base_uitypes():
    return load_uitypes_by_preset_type("BASE")


def load_uitypes_by_preset_type(preset_type):
    query = """
        SELECT UIType.*, GROUP_CONCAT(SectionConfigCollections.codeInfoId) as collections
        FROM UIType
        LEFT JOIN SectionConfigCollections
        ON UIType.id = SectionConfigCollections.uiTypeId
        WHERE presetType = :presetType
        GROUP BY UIType.id
    """

    db.execute(query, {"presetType": preset_type})
    return {row["id"]: process_uitype(dict(row)) for row in db.fetchall()}


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
    print(uitype["collections"])
    return {
        "subType": uitype["sectionConfigSubType"],
        "collections": literal_eval(uitype["collections"]) if uitype["collections"] else [],
        "childUITypeId": uitype["sectionConfigChildUITypeId"],
    }


def load_slider_config(uitype):
    return {
        "min": uitype["sliderConfigMin"],
        "max": uitype["sliderConfigMax"],
        "step": uitype["sliderConfigStep"],
    }

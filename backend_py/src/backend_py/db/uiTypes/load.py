from ...schema import db
from ...utils.utils import aggregate_results


def load_base_uitypes():
    return load_uitypes_by_preset_type(["BASE", "USER"])


def load_uitypes_by_preset_type(preset_types):
    placeholders = ", ".join(["?"] * len(preset_types))
    query = f"""
        SELECT UIType.*, SectionConfigCollections.codeInfoId
        FROM UIType
        LEFT JOIN SectionConfigCollections
        ON UIType.id = SectionConfigCollections.uiTypeId
        WHERE presetType in ({placeholders})
    """

    db.execute(query, preset_types)
    output = aggregate_results(db.fetchall(), "id", ["codeInfoId"])
    return {x["id"]: process_uitype(x) for x in output.values()}


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
        "collections": [x for x in uitype["codeInfoId"] if x],
        "childUITypeId": uitype["sectionConfigChildUITypeId"],
    }


def load_slider_config(uitype):
    return {
        "min": uitype["sliderConfigMin"],
        "max": uitype["sliderConfigMax"],
        "step": uitype["sliderConfigStep"],
    }

import json

from setta.utils.constants import (
    DEFAULT_VALUES,
    SECTION_VARIANT_EV_TABLE_DATA_JSON_FIELDS,
    SECTION_VARIANT_ID_TABLE_DATA_JSON_FIELDS,
)
from setta.utils.utils import filter_dict


def save_section_variants(db, section_variants):
    query = """
        INSERT INTO SectionVariantId (id, data, selectedItem, codeInfoColId, runGroup)
        VALUES (:id, :data, :selectedItem, :codeInfoColId, :runGroup)
        ON CONFLICT (id)
        DO UPDATE SET
        data = :data,
        selectedItem = :selectedItem,
        codeInfoColId = :codeInfoColId,
        runGroup = :runGroup
    """

    query_params = [
        {
            "id": k,
            "selectedItem": v["selectedItem"],
            "codeInfoColId": v["codeInfoColId"],
            "runGroup": json.dumps(v["runGroup"]),
            "data": json.dumps(v["data"]),
        }
        for k, v in section_variants.items()
    ]
    db.executemany(query, query_params)

    # delete entered values
    placeholders = ", ".join(["?"] * len(section_variants))
    query = f"""
        DELETE FROM SectionVariantEV
        WHERE idid IN ({placeholders})
    """
    query_params = list(section_variants.keys())
    db.execute(query, query_params)

    # add entered values
    query = """
        INSERT INTO SectionVariantEV (idid, codeInfoId, data)
        VALUES (:idid, :codeInfoId, :data)
    """
    query_params = []
    for idid, variant in section_variants.items():
        for code_info_id, value_info in variant["values"].items():
            query_params.append(
                {
                    "idid": idid,
                    "codeInfoId": code_info_id,
                    "data": json.dumps(value_info["data"])
                }
            )
    db.executemany(query, query_params)

    query = f"""
        DELETE FROM SectionVariantParamSweep
        WHERE idid IN ({placeholders})
    """
    query_params = list(section_variants.keys())
    db.execute(query, query_params)

    query = """
        INSERT INTO SectionVariantParamSweep (idid, selectedItemGroupNum, paramInfoGroupNum, selectedItem, paramInfoId, "order", value)
        VALUES (:idid, :selectedItemGroupNum, :paramInfoGroupNum, :selectedItem, :paramInfoId, :order, :value)
    """

    query_params = []
    for id, variant in section_variants.items():
        order = 0
        for selectedItemGroupNum, s in enumerate(variant["sweep"]):
            selected_item = s["selectedItem"]
            if len(s["params"]) == 0:
                query_params.append(
                    generate_query_param(
                        id,
                        selectedItemGroupNum,
                        None,
                        selected_item,
                        None,
                        order,
                        None,
                    )
                )
                order += 1
            else:
                for paramInfoGroupNum, param in enumerate(s["params"]):
                    values = param["values"] or [None]
                    for value in values:
                        query_params.append(
                            generate_query_param(
                                id,
                                selectedItemGroupNum,
                                paramInfoGroupNum,
                                selected_item,
                                param["paramInfoId"],
                                order,
                                value,
                            )
                        )
                        order += 1

    db.executemany(query, query_params)


def generate_query_param(
    id,
    selectedItemGroupNum,
    paramInfoGroupNum,
    selected_item,
    param_info_id,
    order,
    value,
):
    return {
        "idid": id,
        "selectedItemGroupNum": selectedItemGroupNum,
        "paramInfoGroupNum": paramInfoGroupNum,
        "selectedItem": selected_item,
        "paramInfoId": param_info_id,
        "order": order,
        "value": value,
    }

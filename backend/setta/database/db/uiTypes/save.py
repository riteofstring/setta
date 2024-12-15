import json

from setta.database.utils import uuid_str_to_blob
from setta.utils.constants import DEFAULT_VALUES, UI_TYPE_TABLE_DATA_JSON_FIELDS
from setta.utils.utils import filter_dict


def prepare_ui_types(ui_types):
    return {
        uuid_str_to_blob(key): {**value, "id": uuid_str_to_blob(value["id"])}
        for key, value in ui_types.items()
    }


def save_ui_types(db, uiTypes):
    uiTypes = prepare_ui_types(uiTypes)

    query = """
        INSERT INTO UIType (id, type, data)
        VALUES (:id, :type, :data)
        ON CONFLICT (id)
        DO UPDATE SET
            type = :type,
            data = :data
    """

    query_parameters = [
        {
            "id": v["id"],
            "type": v["type"],
            "data": json.dumps(
                filter_dict(v, UI_TYPE_TABLE_DATA_JSON_FIELDS, DEFAULT_VALUES["uiType"])
            ),
        }
        for v in uiTypes.values()
    ]
    db.executemany(query, query_parameters)


def prepare_ui_type_cols(uitype_cols: dict) -> dict:
    return {
        uuid_str_to_blob(uiTypeColId): {
            uuid_str_to_blob(codeInfoId): {
                "uiTypeId": uuid_str_to_blob(data["uiTypeId"]),
                "nonPresetUITypeIds": [
                    uuid_str_to_blob(uuid_str)
                    for uuid_str in data["nonPresetUITypeIds"]
                ],
            }
            for codeInfoId, data in colDetails.items()
        }
        for uiTypeColId, colDetails in uitype_cols.items()
    }


def save_ui_type_cols(db, uitype_cols):
    uitype_cols = prepare_ui_type_cols(uitype_cols)

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

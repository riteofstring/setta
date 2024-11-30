import json

from setta.database.utils import dump_keyword_positions_as_string
from setta.utils.constants import SECTION_VARIANT_TABLE_DATA_JSON_FIELDS
from setta.utils.utils import filter_dict


def save_section_variants(db, section_variants):
    query = """
        INSERT INTO SectionVariantId (id, data, selectedItem, codeInfoColId)
        VALUES (:id, :data, :selectedItem, :codeInfoColId)
        ON CONFLICT (id)
        DO UPDATE SET
        data = :data,
        selectedItem = :selectedItem,
        codeInfoColId = :codeInfoColId
    """

    query_params = [
        {
            "id": k,
            "selectedItem": v["selectedItem"],
            "codeInfoColId": v["codeInfoColId"],
            "data": json.dumps(filter_dict(v, SECTION_VARIANT_TABLE_DATA_JSON_FIELDS)),
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
        INSERT INTO SectionVariantEV (idid, codeInfoId, value, keywordPositions)
        VALUES (:idid, :codeInfoId, :value, :keywordPositions)
    """
    query_params = []
    for idid, variant in section_variants.items():
        for code_info_id, value_info in variant["values"].items():
            query_params.append(
                {
                    "idid": idid,
                    "codeInfoId": code_info_id,
                    "value": value_info["value"],
                    "keywordPositions": dump_keyword_positions_as_string(
                        value_info["keywordPositions"]
                    ),
                }
            )
    db.executemany(query, query_params)

from setta.database.utils import dump_keyword_positions_as_string


def save_section_variants(dbs, section_variants):
    for dbSource, variants_for_one_db in section_variants.items():
        save_section_variants_to_one_db(dbs[dbSource], variants_for_one_db)


def save_section_variants_to_one_db(db, section_variants):
    query = """
        INSERT INTO SectionVariantId (id, name, selectedItem, code, keywordPositions)
        VALUES (:id, :name, :selectedItem, :code, :keywordPositions)
        ON CONFLICT (id)
        DO UPDATE SET
        name = :name,
        selectedItem = :selectedItem,
        code = :code,
        keywordPositions = :keywordPositions
    """

    query_params = [
        {
            "id": k,
            "name": v["name"],
            "selectedItem": v["selectedItem"],
            "code": v["code"],
            "keywordPositions": dump_keyword_positions_as_string(v["keywordPositions"]),
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

    # delete children
    placeholders = ", ".join(["?"] * len(section_variants))
    query = f"""
        DELETE FROM SectionVariantChildren
        WHERE idid IN ({placeholders});
    """
    query_params = list(section_variants.keys())
    db.execute(query, query_params)

    # add children
    query = """
        INSERT INTO SectionVariantChildren (idid, childId, "order")
        VALUES (:idid, :childId, :order)
    """
    query_params = []
    for idid, variant in section_variants.items():
        query_params.extend(
            [
                {"idid": idid, "childId": x, "order": i}
                for i, x in enumerate(variant["children"])
            ]
        )
    db.executemany(query, query_params)

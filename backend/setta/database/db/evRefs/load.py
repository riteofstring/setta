def load_ev_refs_into_data_structures(db, section_variants, code_info):
    variant_placeholders = ", ".join(["?"] * len(section_variants))
    codeinfo_placeholders = ", ".join(["?"] * len(code_info))

    query = f"""
        SELECT *
        FROM EVRefs
        WHERE variantId IN ({variant_placeholders})
        OR codeInfoId IN ({codeinfo_placeholders})
    """

    parameters = list(section_variants.keys()) + list(code_info.keys())
    db.execute(query, parameters)

    for row in db.fetchall():
        row = dict(row)
        row["isArgsObj"] = bool(row["isArgsObj"])
        variantId = row.pop("variantId")
        codeInfoId = row.pop("codeInfoId")
        referringParamInfoId = row.pop("referringParamInfoId")
        if codeInfoId:
            code_info[codeInfoId]["evRefs"].append(row)
        elif referringParamInfoId:
            section_variants[variantId]["values"][referringParamInfoId][
                "evRefs"
            ].append(row)
        else:
            section_variants[variantId]["evRefs"].append(row)

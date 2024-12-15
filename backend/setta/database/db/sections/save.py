import json

from setta.utils.constants import (
    DEFAULT_VALUES,
    SECTION_ARTIFACTS_TABLE_DATA_JSON_FIELDS,
    SECTION_TABLE_DATA_JSON_FIELDS,
)
from setta.utils.utils import filter_dict, replace_null_keys_with_none


def save_sections(db, sections, section_variants):
    query = """
        INSERT INTO Section (
            id,
            name,
            data,
            uiTypeId,
            uiTypeColId
        )
        VALUES (
            CAST(:id AS BLOB),
            :name,
            :data,
            CAST(:uiTypeId AS BLOB),
            CAST(:uiTypeColId AS BLOB)
        )
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            data = :data,
            uiTypeId = CAST(:uiTypeId AS BLOB),
            uiTypeColId = CAST(:uiTypeColId AS BLOB)
    """

    query_params = [
        {
            "id": s["id"],
            "name": s["name"],
            "data": json.dumps(
                filter_dict(
                    s, SECTION_TABLE_DATA_JSON_FIELDS, DEFAULT_VALUES["section"]
                )
            ),
            "uiTypeId": s["uiTypeId"],
            "uiTypeColId": s["uiTypeColId"],
        }
        for s in sections.values()
    ]

    db.executemany(query, query_params)

    ids = [s["id"] for s in sections.values()]
    placeholders = ", ".join([f"CAST(? AS BLOB)"] * len(ids))
    query = f"""
        UPDATE SectionVariantId
        SET originSectionId = null
        WHERE originSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE SectionVariantId
        SET originSectionId = CAST(:sectionId AS BLOB)
        WHERE id = CAST(:variantId AS BLOB)
    """
    query_params = []
    for s in sections.values():
        for variantId in s["variantIds"]:
            query_params.append({"variantId": variantId, "sectionId": s["id"]})
    db.executemany(query, query_params)

    query = f"""
        UPDATE UIType
        SET asNonPresetForSectionId = null
        WHERE asNonPresetForSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE UIType
        SET asNonPresetForSectionId = CAST(:sectionId AS BLOB)
        WHERE id = CAST(:uiTypeId AS BLOB)
    """
    query_params = []
    for s in sections.values():
        for uiTypeId in s["nonPresetUITypeIds"]:
            query_params.append({"uiTypeId": uiTypeId, "sectionId": s["id"]})
    db.executemany(query, query_params)

    query = """
        UPDATE Section
        SET paramSweepSectionId = CAST(:paramSweepSectionId AS BLOB)
        WHERE id = CAST(:id AS BLOB)
    """
    db.executemany(
        query,
        [
            {"id": s["id"], "paramSweepSectionId": s["paramSweepSectionId"]}
            for s in sections.values()
        ],
    )

    query = f"""
        DELETE FROM SectionArtifacts
        WHERE sectionId IN ({placeholders});
    """
    db.execute(query, ids)

    # add children
    query = """
        INSERT INTO SectionArtifacts (sectionId, artifactPath, data)
        VALUES (CAST(:sectionId AS BLOB), :artifactPath, :data)
    """
    query_params = []
    for s in sections.values():
        for a in s["artifacts"]:
            query_params.append(
                {
                    "sectionId": s["id"],
                    "artifactPath": a["path"],
                    "data": json.dumps(
                        filter_dict(a, SECTION_ARTIFACTS_TABLE_DATA_JSON_FIELDS)
                    ),
                }
            )
    db.executemany(query, query_params)

    # delete children
    placeholders = ", ".join([f"CAST(? AS BLOB)"] * len(section_variants))
    query = f"""
        DELETE FROM SectionVariantChildren
        WHERE idid IN ({placeholders});
    """
    query_params = list(section_variants.keys())
    db.execute(query, query_params)

    # add children
    query = """
        INSERT INTO SectionVariantChildren (idid, childId, "order")
        VALUES (CAST(:idid AS BLOB), CAST(:childId AS BLOB), :order)
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

    placeholders = ", ".join([f"CAST(? AS BLOB)"] * len(section_variants))
    query = f"""
        DELETE FROM SectionVariantRunGroup
        WHERE idid IN ({placeholders})
    """
    query_params = list(section_variants.keys())
    db.execute(query, query_params)

    run_group_query_params = []
    run_group_versions_query_params = []
    run_group_param_sweeps_query_params = []
    for idid, variant in section_variants.items():
        variant = replace_null_keys_with_none(variant)
        for sectionId, detailsForSection in variant["runGroup"].items():
            for parentVariantId, detailsForParentVariant in detailsForSection.items():
                base_query_params = {
                    "idid": idid,
                    "sectionId": sectionId,
                    "parentVariantId": parentVariantId,
                }
                run_group_query_params.append(
                    {
                        **base_query_params,
                        "selected": detailsForParentVariant["selected"],
                    }
                )
                for versionId, selected in detailsForParentVariant["versions"].items():
                    run_group_versions_query_params.append(
                        {
                            **base_query_params,
                            "versionId": versionId,
                            "selected": selected,
                        }
                    )
                for sweepId, selected in detailsForParentVariant["paramSweeps"].items():
                    run_group_param_sweeps_query_params.append(
                        {**base_query_params, "sweepId": sweepId, "selected": selected}
                    )

    query = """
        INSERT INTO SectionVariantRunGroup (idid, sectionId, parentVariantId, selected)
        VALUES (CAST(:idid AS BLOB), CAST(:sectionId AS BLOB), CAST(:parentVariantId AS BLOB), :selected)
    """
    db.executemany(query, run_group_query_params)

    query = """
        INSERT INTO SectionVariantRunGroupVersions (idid, sectionId, parentVariantId, versionId, selected)
        VALUES (CAST(:idid AS BLOB), CAST(:sectionId AS BLOB), CAST(:parentVariantId AS BLOB), CAST(:versionId AS BLOB), :selected)
    """
    db.executemany(query, run_group_versions_query_params)

    query = """
        INSERT INTO SectionVariantRunGroupParamSweeps (idid, sectionId, parentVariantId, sweepId, selected)
        VALUES (CAST(:idid AS BLOB), CAST(:sectionId AS BLOB), CAST(:parentVariantId AS BLOB), CAST(:sweepId AS BLOB), :selected)
    """
    db.executemany(query, run_group_param_sweeps_query_params)

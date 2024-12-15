import json

from setta.database.db.sectionVariants.save import prepare_section_variants
from setta.database.utils import uuid_str_to_blob
from setta.utils.constants import (
    DEFAULT_VALUES,
    SECTION_ARTIFACTS_TABLE_DATA_JSON_FIELDS,
    SECTION_TABLE_DATA_JSON_FIELDS,
)
from setta.utils.utils import filter_dict, replace_null_keys_with_none


def prepare_sections(sections):
    return {
        uuid_str_to_blob(key): {
            **value,
            "id": uuid_str_to_blob(value["id"]),
            "uiTypeId": uuid_str_to_blob(value["uiTypeId"]),
            "uiTypeColId": uuid_str_to_blob(value["uiTypeColId"]),
            "parentId": uuid_str_to_blob(value["parentId"]),
            "variantId": uuid_str_to_blob(value["variantId"]),
            "variantIds": [uuid_str_to_blob(v) for v in value["variantIds"]],
            "paramSweepSectionId": uuid_str_to_blob(value["paramSweepSectionId"]),
            "nonPresetUITypeIds": [
                uuid_str_to_blob(v) for v in value["nonPresetUITypeIds"]
            ],
            "selectedVariantIds": {
                uuid_str_to_blob(k): v for k, v in value["selectedVariantIds"].items()
            },
        }
        for key, value in sections.items()
    }


def save_sections(db, sections, section_variants):
    section_variants = replace_null_keys_with_none(section_variants)
    sections = prepare_sections(sections)
    section_variants = prepare_section_variants(section_variants)

    query = """
        INSERT INTO Section (
            id,
            name,
            data,
            uiTypeId,
            uiTypeColId
        )
        VALUES (
            :id,
            :name,
            :data,
            :uiTypeId,
            :uiTypeColId
        )
        ON CONFLICT (id)
        DO UPDATE SET
            name = :name,
            data = :data,
            uiTypeId = :uiTypeId,
            uiTypeColId = :uiTypeColId
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
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        UPDATE SectionVariantId
        SET originSectionId = null
        WHERE originSectionId IN ({placeholders})
    """
    db.execute(query, ids)

    query = """
        UPDATE SectionVariantId
        SET originSectionId = :sectionId
        WHERE id = :variantId
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
        SET asNonPresetForSectionId = :sectionId
        WHERE id = :uiTypeId
    """
    query_params = []
    for s in sections.values():
        for uiTypeId in s["nonPresetUITypeIds"]:
            query_params.append({"uiTypeId": uiTypeId, "sectionId": s["id"]})
    db.executemany(query, query_params)

    query = """
        UPDATE Section
        SET paramSweepSectionId = :paramSweepSectionId
        WHERE id = :id
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
        VALUES (:sectionId, :artifactPath, :data)
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

    placeholders = ", ".join(["?"] * len(section_variants))
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
        VALUES (:idid, :sectionId, :parentVariantId, :selected)
    """
    db.executemany(query, run_group_query_params)

    query = """
        INSERT INTO SectionVariantRunGroupVersions (idid, sectionId, parentVariantId, versionId, selected)
        VALUES (:idid, :sectionId, :parentVariantId, :versionId, :selected)
    """
    db.executemany(query, run_group_versions_query_params)

    query = """
        INSERT INTO SectionVariantRunGroupParamSweeps (idid, sectionId, parentVariantId, sweepId, selected)
        VALUES (:idid, :sectionId, :parentVariantId, :sweepId, :selected)
    """
    db.executemany(query, run_group_param_sweeps_query_params)

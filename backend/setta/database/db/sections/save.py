import json

from setta.utils.constants import (
    DEFAULT_VALUES,
    SECTION_ARTIFACTS_TABLE_DATA_JSON_FIELDS,
    SECTION_TABLE_DATA_JSON_FIELDS,
)
from setta.utils.utils import filter_dict


def save_sections(db, sections, section_variants):
    for k, v in sections.items():
        sections[k] = {**DEFAULT_VALUES["section"], **v}

    query = """
        INSERT INTO Section (
            id,
            data,
            uiTypeId,
            uiTypeColId
        )
        VALUES (
            :id,
            :data,
            :uiTypeId,
            :uiTypeColId
        )
        ON CONFLICT (id)
        DO UPDATE SET
            data = :data,
            uiTypeId = :uiTypeId,
            uiTypeColId = :uiTypeColId
    """

    query_params = [
        {
            "id": s["id"],
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

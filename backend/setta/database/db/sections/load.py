import copy
import glob
import itertools
import json
from collections import defaultdict

from setta.database.db.sectionVariants.utils import new_section_variant
from setta.database.utils import create_new_id
from setta.utils.constants import C
from setta.utils.utils import filter_dict

from ..sectionVariants.load import load_section_variants
from ..uiTypes.load import load_uitypecols, load_uitypes


def load_sections(db, ids):
    all_ids, child_to_parent_id = get_section_ids(db, ids)

    section_id_to_config_count = num_projects_each_section_exists_in(db, all_ids)

    placeholders = ", ".join(["?"] * len(all_ids))
    query = f"""
        SELECT
            S.*,
            U.nonPresetUITypeIds,
            E.variantIds,
            A.artifacts
        FROM
            Section S
        LEFT JOIN
            (
                SELECT
                    asNonPresetForSectionId,
                    GROUP_CONCAT(id) AS nonPresetUITypeIds
                FROM
                    UIType
                GROUP BY
                    asNonPresetForSectionId
            ) AS U ON S.id = U.asNonPresetForSectionId
        LEFT JOIN
            (
                SELECT
                    originSectionId,
                    GROUP_CONCAT(id) AS variantIds
                FROM
                    SectionVariantId
                GROUP BY
                    originSectionId
            ) AS E ON S.id = E.originSectionId
        LEFT JOIN
            (
                SELECT
                    sectionId,
                    GROUP_CONCAT(artifactPath) AS artifacts
                FROM
                    SectionArtifacts
                GROUP BY
                    sectionId
            ) AS A ON S.id = A.sectionId
        WHERE
            S.id IN ({placeholders})
        GROUP BY
            S.id;
    """
    db.execute(query, all_ids)

    sections = {}
    for v in db.fetchall():
        sections[v["id"]] = {
            **filter_dict(v, discard_keys=["data"]),
            **json.loads(v["data"]),
            "isInOtherProjectConfigs": section_id_to_config_count[v["id"]] > 1,
            "parentId": child_to_parent_id.get(v["id"], None),
            "variantIds": v["variantIds"].split(",") if v["variantIds"] else [],
            "artifacts": v["artifacts"].split(",") if v["artifacts"] else [],
            "nonPresetUITypeIds": (
                v["nonPresetUITypeIds"].split(",") if v["nonPresetUITypeIds"] else []
            ),
        }

    variantIds = list(
        itertools.chain.from_iterable([s["variantIds"] for s in sections.values()])
    )
    sectionVariants = load_section_variants(db, variantIds)

    uiTypeCols = load_uitypecols(db, [s["uiTypeColId"] for s in sections.values()])

    nonPresetUITypeIds = []
    for s in sections.values():
        nonPresetUITypeIds.extend(s["nonPresetUITypeIds"])
    for u in uiTypeCols.values():
        for c in u.values():
            nonPresetUITypeIds.extend(c["nonPresetUITypeIds"])

    nonPresetUITypes = load_uitypes(db, nonPresetUITypeIds)

    return {
        "sections": sections,
        "sectionVariants": sectionVariants,
        "uiTypeCols": uiTypeCols,
        "nonPresetUITypes": nonPresetUITypes,
    }


# TODO: try using a recursive sql query for this
def get_section_ids(db, top_level_ids):
    section_id_to_variants = defaultdict(list)
    variant_id_to_children = defaultdict(list)

    db.execute("SELECT id, originSectionId FROM SectionVariantId")
    for row in db.fetchall():
        section_id_to_variants[row["originSectionId"]].append(row["id"])

    db.execute("SELECT idid, childId FROM SectionVariantChildren")
    for row in db.fetchall():
        variant_id_to_children[row["idid"]].append(row["childId"])

    ids = copy.deepcopy(top_level_ids)
    output = copy.deepcopy(top_level_ids)
    child_to_parent_id = {}
    visited = set()

    while len(ids) > 0:
        id = ids.pop()
        if id in visited:
            continue
        variantIds = section_id_to_variants[id]
        for vid in variantIds:
            for c in variant_id_to_children[vid]:
                if c not in visited:
                    ids.append(c)
                    output.append(c)
                    child_to_parent_id[c] = id
        visited.add(id)

    return output, child_to_parent_id


def load_section_configs(db, project_config_id):
    query = """
       SELECT s.sectionId, s.variantId, s.data, v.variantId as selectedVariantId
       FROM SectionConfig s
       LEFT JOIN SectionConfigSelectedVariants v
           ON s.sectionId = v.sectionId
           AND s.projectConfigId = v.projectConfigId
       WHERE s.projectConfigId = :projectConfigId
   """

    db.execute(query, {"projectConfigId": project_config_id})
    output = {}
    for row in db.fetchall():
        section_id = row["sectionId"]
        if section_id not in output:
            output[section_id] = {
                "id": section_id,
                "variantId": row["variantId"],
                "selectedVariantIds": {},
                **json.loads(row["data"]),
            }
        if row["selectedVariantId"]:
            output[section_id]["selectedVariantIds"][row["selectedVariantId"]] = True

    return output


def num_projects_each_section_exists_in(db, section_ids):
    placeholders = ", ".join(["?"] * len(section_ids))
    query = f"""
        SELECT sectionId, COUNT(DISTINCT projectConfigId) as projectConfigCount
        FROM SectionConfig
        WHERE sectionId IN ({placeholders})
        GROUP BY sectionId
    """

    db.execute(query, section_ids)
    output = {}
    for row in db.fetchall():
        output[row[0]] = row[1]

    return output


def load_artifact_metadata(db, section_id, artifact_paths):
    query_params = []
    for a in artifact_paths:
        query_params.extend([section_id, a])
    placeholders = ", ".join(["(?, ?)"] * (len(query_params) // 2))
    query = f"""
        SELECT artifactPath as path, data
        FROM SectionArtifacts
        WHERE (sectionId, artifactPath) IN ({placeholders})
    """
    db.execute(query, query_params)

    output = []
    for row in db.fetchall():
        output.append({"path": row["path"], **json.loads(row["data"])})
    return output


def load_json_sources_into_data_structures(
    sections, codeInfo, codeInfoCols, sectionVariants, section_ids=None
):
    jsonSourceMissing = {}
    filenames_loaded = set()
    sections = {
        k: v
        for k, v in sections.items()
        if v["jsonSource"] and ((not section_ids) or k in section_ids)
    }
    for s in sections.values():
        new_data = load_json_source(s["jsonSource"])
        for filename, data in new_data.items():
            codeInfo.update(data["codeInfo"])
            variantId = None
            for vid in s["variantIds"]:
                if sectionVariants[vid]["name"] == filename:
                    variantId = vid
                    break
            if variantId:
                sectionVariants[variantId]["values"] = data["sectionVariantValues"]
                codeInfoColId = sectionVariants[variantId]["codeInfoColId"]
                codeInfoCols[codeInfoColId]["children"] = data["codeInfoColChildren"]
            else:
                variantId = create_new_id()
                codeInfoColId = create_new_id()
                s["variantIds"].append(variantId)
                sectionVariants[variantId] = new_section_variant(
                    id=variantId,
                    name=filename,
                    codeInfoColId=codeInfoColId,
                    values=data["sectionVariantValues"],
                )
                codeInfoCols[codeInfoColId] = {
                    "children": data["codeInfoColChildren"],
                }

            s["configLanguage"] = "json"
            filenames_loaded.add(filename)

    # delete variants that aren't associated with a loaded file
    to_delete = []
    for s in sections.values():
        for vid in s["variantIds"]:
            if sectionVariants[vid]["name"] not in filenames_loaded:
                to_delete.append(vid)

    for vid in to_delete:
        del codeInfoCols[sectionVariants[vid]["codeInfoColId"]]
        del sectionVariants[vid]

    for s in sections.values():
        s["variantIds"] = [v for v in s["variantIds"] if v in sectionVariants]
        if len(s["variantIds"]) == 0:
            variant = new_section_variant()
            s["configLanguage"] = "python"
            s["variantIds"].append(variant["id"])
            sectionVariants[variant["id"]] = variant
            codeInfoCols[variant["codeInfoColId"]] = {
                "children": {None: []},
            }
            jsonSourceMissing[s["id"]] = True
        elif s["variantId"] not in s["variantIds"]:
            s["variantId"] = s["variantIds"][0]

    return jsonSourceMissing


def load_json_source(filename_glob):
    new_data = {}

    def process_object(obj, filename, current_path=[]):
        if not isinstance(obj, dict):
            return

        children_keys = []
        for k, v in obj.items():
            path = current_path + [k]
            key = json.dumps({"filenameGlob": filename_glob, "key": path})
            full_key = f"{C.JSON_SOURCE_PREFIX}{key}"
            children_keys.append(full_key)

            # Create code info entry
            new_data[filename]["codeInfo"][full_key] = {
                "id": full_key,
                "name": k,
                "rcType": C.PARAMETER,
                "editable": False,
                "defaultVal": None,
                "description": "",
                "positionalOnly": False,
                "isPinned": False,
                "isFrozen": False,
                "keywordPositions": [],
            }

            new_data[filename]["codeInfoColChildren"][full_key] = []

            # Create variant value entry
            if isinstance(v, dict):
                # For objects, store empty value and process children
                new_data[filename]["sectionVariantValues"][full_key] = {
                    "value": "",
                    "keywordPositions": [],
                }
                # Recursively process nested object
                process_object(v, filename, path)
            else:
                # For non-objects, store the value directly
                new_data[filename]["sectionVariantValues"][full_key] = {
                    "value": json.dumps(v),
                    "keywordPositions": [],
                }

        parent_id = None
        if len(current_path) > 0:
            parent_path = json.dumps(
                {"filenameGlob": filename_glob, "key": current_path}
            )
            parent_id = f"{C.JSON_SOURCE_PREFIX}{parent_path}"

        new_data[filename]["codeInfoColChildren"][parent_id] = children_keys

    filenames = glob.glob(filename_glob)
    for filename in filenames:
        try:
            with open(filename, "r") as f:
                jsonSourceData = json.load(f)
        except:
            continue

        new_data[filename] = {
            "codeInfo": {},
            "codeInfoColChildren": {},
            "sectionVariantValues": {},
        }
        process_object(jsonSourceData, filename, [])

    return new_data

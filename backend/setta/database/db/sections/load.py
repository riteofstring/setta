import copy
import glob
import itertools
import json
from collections import defaultdict

from setta.utils.constants import C
from setta.utils.utils import recursive_dict_merge

from ..paramSweeps.load import load_param_sweeps
from ..sectionVariants.load import load_section_variants
from ..uiTypes.load import load_uitypecols, load_uitypes_by_condition


def load_sections(db, ids):
    all_ids, child_to_parent_id = get_section_ids(db, ids)

    section_id_to_config_count = num_projects_each_section_exists_in(db, all_ids)

    placeholders = ", ".join(["?"] * len(all_ids))
    query = f"""
        SELECT
            S.*,
            U.nonPresetUITypeIds,
            E.variantIds,
            P.paramSweepIds,
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
                    originSectionId,
                    GROUP_CONCAT(id) AS paramSweepIds
                FROM
                    ParamSweepId
                GROUP BY
                    originSectionId
            ) AS P ON S.id = P.originSectionId
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
        v = dict(v)
        sections[v["id"]] = {
            **v,
            "isInOtherProjectConfigs": section_id_to_config_count[v["id"]] > 1,
            "parentId": child_to_parent_id.get(v["id"], None),
            "variantIds": v["variantIds"].split(",") if v["variantIds"] else [],
            "artifacts": v["artifacts"].split(",") if v["artifacts"] else [],
            "nonPresetUITypeIds": (
                v["nonPresetUITypeIds"].split(",") if v["nonPresetUITypeIds"] else []
            ),
            "paramSweepIds": v["paramSweepIds"].split(",")
            if v["paramSweepIds"]
            else [],
            "canvasSettings": json.loads(v["canvasSettings"])
            if v["canvasSettings"]
            else {},
        }

    variantIds = list(
        itertools.chain.from_iterable([s["variantIds"] for s in sections.values()])
    )
    sectionVariants = load_section_variants(db, variantIds)

    uiTypeCols = load_uitypecols(db, [s["uiTypeColId"] for s in sections.values()])
    paramSweeps = load_param_sweeps(
        db,
        list(
            itertools.chain.from_iterable(
                [s["paramSweepIds"] for s in sections.values()]
            )
        ),
    )

    nonPresetUITypeIds = []
    for s in sections.values():
        nonPresetUITypeIds.extend(s["nonPresetUITypeIds"])
    for u in uiTypeCols.values():
        for c in u.values():
            nonPresetUITypeIds.extend(c["nonPresetUITypeIds"])

    nonPresetUITypes = load_uitypes_by_condition(db, ids=nonPresetUITypeIds)

    return {
        "sections": sections,
        "sectionVariants": sectionVariants,
        "uiTypeCols": uiTypeCols,
        "paramSweeps": paramSweeps,
        "nonPresetUITypes": nonPresetUITypes,
    }


# TODO: try using a recursive sql query for this
def get_section_ids(db, top_level_ids):
    section_id_to_variants = defaultdict(list)
    variant_id_to_children = defaultdict(list)

    db.execute("SELECT id, originSectionId FROM SectionVariantId")
    for row in db.fetchall():
        row = dict(row)
        section_id_to_variants[row["originSectionId"]].append(row["id"])

    db.execute("SELECT idid, childId FROM SectionVariantChildren")
    for row in db.fetchall():
        row = dict(row)
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
    query = """SELECT sectionId, width, height, variantId, paramSweepId, isHorizontalOrientation, pinnedAreaHeight, isMinimized
        FROM SectionConfig
        WHERE projectConfigId = :projectConfigId
    """
    db.execute(query, {"projectConfigId": project_config_id})

    output = {}
    for row in db.fetchall():
        row = dict(row)
        output[row["sectionId"]] = {
            "id": row["sectionId"],
            "size": {
                "width": convert_size(row["width"]),
                "height": convert_size(row["height"]),
            },
            "variantId": row["variantId"],
            "paramSweepId": row["paramSweepId"],
            "isHorizontalOrientation": row["isHorizontalOrientation"],
            "pinnedAreaHeight": convert_size(row["pinnedAreaHeight"]),
            "isMinimized": row["isMinimized"],
        }

    return output


def convert_size(x):
    return "auto" if x == -1 else x


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
        SELECT artifactPath as path, value, type, displayName
        FROM SectionArtifacts
        WHERE (sectionId, artifactPath) IN ({placeholders})
    """
    db.execute(query, query_params)

    output = []
    for row in db.fetchall():
        curr_output = dict(row)
        if curr_output["value"]:
            curr_output["value"] = json.loads(curr_output["value"])
        output.append(curr_output)
    return output


def load_json_sources_into_data_structures(
    sections, codeInfo, codeInfoCols, sectionVariants
):
    jsonSourceMissing = {}
    for id, s in sections.items():
        if not s["jsonSource"]:
            continue
        (
            new_code_infos,
            new_code_info_col_children,
            new_variant_values,
            _jsonSourceMissing,
        ) = load_json_source(s["jsonSource"])
        if _jsonSourceMissing:
            jsonSourceMissing[id] = True
            continue
        codeInfo.update(new_code_infos)
        # json section should only have 1 variantId since versions exist as files
        # but just to be safe for now, iterate through variantIds
        for variantId in s["variantIds"]:
            sectionVariant = sectionVariants[variantId]
            sectionVariant["values"].update(new_variant_values)
            codeInfoColId = sectionVariant["codeInfoColId"]
            codeInfoCol = codeInfoCols[codeInfoColId]
            codeInfoCol["children"] = recursive_dict_merge(
                codeInfoCol["children"], new_code_info_col_children
            )

    return jsonSourceMissing


def load_json_source(filename_glob):
    new_code_infos = {}
    new_code_info_col_children = {}
    new_variant_values = {}

    def process_object(obj, filename, current_path=[]):
        if not isinstance(obj, dict):
            return

        children_keys = []
        for k, v in obj.items():
            path = current_path + [k]
            key = json.dumps({"filename": filename, "key": path})
            full_key = f"{C.JSON_SOURCE_PREFIX}{key}"
            children_keys.append(full_key)

            # Create code info entry
            new_code_infos[full_key] = {
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

            new_code_info_col_children[full_key] = []

            # Create variant value entry
            if isinstance(v, dict):
                # For objects, store empty value and process children
                new_variant_values[full_key] = {
                    "value": "",
                    "keywordPositions": [],
                }
                # Recursively process nested object
                process_object(v, path)
            else:
                # For non-objects, store the value directly
                new_variant_values[full_key] = {
                    "value": json.dumps(v),
                    "keywordPositions": [],
                }

        parent_id = None
        if len(current_path) > 0:
            parent_path = json.dumps({"filename": filename, "key": current_path})
            parent_id = f"{C.JSON_SOURCE_PREFIX}{parent_path}"

        new_code_info_col_children[parent_id] = children_keys

    filenames = glob.glob(filename_glob)
    num_opened = 0
    for filename in filenames:
        try:
            with open(filename, "r") as f:
                jsonSourceData = json.load(f)
            num_opened += 1
        except:
            pass

        # Start processing from root level
        process_object(jsonSourceData, filename, [])

    jsonSourceMissing = num_opened == 0
    return (
        new_code_infos,
        new_code_info_col_children,
        new_variant_values,
        jsonSourceMissing,
    )

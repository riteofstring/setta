import itertools
from collections import defaultdict

from runcoder.backend.db_path import DEFAULT_DB_ALIAS

from ...utils.utils import get_children_recursively
from ..enteredValues.load import load_evcols
from ..paramSweeps.load import load_param_sweeps
from ..uiTypes.load import load_uitypecols, load_uitypes_by_condition


def load_sections(dbs, ids):
    db = dbs.default

    query = """
        WITH RECURSIVE DESCENDANTS AS (
            SELECT parentId, childId, "order"
            FROM SectionChildren
            WHERE parentId = :parentId
        UNION
            SELECT X.parentId, X.childId, X."order"
            FROM SectionChildren X
            JOIN DESCENDANTS ON X.parentId = DESCENDANTS.childId
        )
        SELECT * FROM DESCENDANTS
        ORDER BY "order";
    """

    all_ids, parent_to_children = get_children_recursively(db, ids, query)
    child_to_parent = {
        v: k for k, children in parent_to_children.items() for v in children
    }

    placeholders = ", ".join(["?"] * len(all_ids))
    query = f"""
        SELECT
            S.*,
            U.nonPresetUITypeIds,
            E.evColIds,
            P.paramSweepIds
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
                    GROUP_CONCAT(id) AS evColIds
                FROM
                    EVColId
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
        WHERE
            S.id IN ({placeholders})
        GROUP BY
            S.id;
    """
    db.execute(query, all_ids)

    sections = {}
    for v in db.fetchall():
        v = dict(v)
        width = v.pop("width")
        height = v.pop("height")
        chainedFrom = v.pop("chainedFromId")
        selectedItem = v.pop("selectedItemId")
        outputGroup = v.pop("outputGroupId")
        sections[v["id"]] = {
            **v,
            "parentId": child_to_parent.get(v["id"], None),
            "chainedFrom": chainedFrom,
            "selectedItem": selectedItem,
            "outputGroup": outputGroup,
            "children": parent_to_children[v["id"]],
            "size": {
                "width": convert_size(width),
                "height": convert_size(height),
            },
            "evColIds": v["evColIds"].split(",") if v["evColIds"] else [],
            "nonPresetUITypeIds": (
                v["nonPresetUITypeIds"].split(",") if v["nonPresetUITypeIds"] else []
            ),
            "paramSweepIds": v["paramSweepIds"].split(",")
            if v["paramSweepIds"]
            else [],
        }

    sections_by_db_source, missing_dbs = get_sections_by_db_source(dbs, sections)
    evCols = {}
    # TODO: order of loading matters here
    for k, dbq in dbs.items():
        print("loading values from", k, flush=True)
        curr_sections = sections_by_db_source[k]
        if len(curr_sections) == 0:
            continue
        evCols[k] = load_evcols(
            dbq,
            list(itertools.chain.from_iterable([s["evColIds"] for s in curr_sections])),
        )

    print(evCols, flush=True)

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
        "evCols": evCols,
        "uiTypeCols": uiTypeCols,
        "paramSweeps": paramSweeps,
        "nonPresetUITypes": nonPresetUITypes,
        "missing_dbs": missing_dbs,
    }


def convert_size(x):
    return "auto" if x == -1 else x


# maps db source to list of sections
def get_sections_by_db_source(dbs, sections):
    output = defaultdict(list)
    missing_dbs = []
    for v in sections.values():
        dbSource = v["dbSource"]
        if not dbSource:
            output[DEFAULT_DB_ALIAS].append(v)
        elif dbSource not in dbs:
            output[DEFAULT_DB_ALIAS].append(v)
            missing_dbs.append(dbSource)
        else:
            output[dbSource].append(v)
    return output, missing_dbs

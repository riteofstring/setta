import itertools

from runcoder.backend.db.enteredValues.load import load_evcols
from runcoder.backend.db.paramSweeps.load import load_param_sweeps
from runcoder.backend.db.uiTypes.load import load_uitypecols, load_uitypes_by_condition
from runcoder.backend.utils.utils import get_children_recursively


def load_sections(db, ids):
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
    evCols = load_evcols(
        db,
        list(itertools.chain.from_iterable([s["evColIds"] for s in sections.values()])),
    )
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
    }


def convert_size(x):
    return "auto" if x == -1 else x

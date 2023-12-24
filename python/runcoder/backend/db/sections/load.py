from ...schema import db
from ...utils.utils import get_children_recursively
from ..enteredValues.load import load_evcols
from ..uiTypes.load import load_uitypecols, load_uitypes_by_condition


def load_sections(ids):
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
        SELECT Section.*, GROUP_CONCAT(UIType.id) as nonPresetUITypeIds
        FROM Section
        LEFT JOIN UIType
        ON Section.id = UIType.asNonPresetForSectionId
        WHERE Section.id IN ({placeholders})
        GROUP BY Section.id
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
            "nonPresetUITypeIds": (
                v["nonPresetUITypeIds"].split(",") if v["nonPresetUITypeIds"] else []
            ),
        }
    evCols = load_evcols([s["evColId"] for s in sections.values()])
    uiTypeCols = load_uitypecols([s["uiTypeColId"] for s in sections.values()])

    nonPresetUITypeIds = []
    for s in sections.values():
        nonPresetUITypeIds.extend(s["nonPresetUITypeIds"])
    for u in uiTypeCols.values():
        for c in u.values():
            nonPresetUITypeIds.extend(c["nonPresetUITypeIds"])

    nonPresetUITypes = load_uitypes_by_condition(ids=nonPresetUITypeIds)

    return {
        "sections": sections,
        "evCols": evCols,
        "uiTypeCols": uiTypeCols,
        "nonPresetUITypes": nonPresetUITypes,
    }


def convert_size(x):
    return "auto" if x == -1 else x

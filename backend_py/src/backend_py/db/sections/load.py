from pprint import pprint

from ...schema import db
from ...utils.utils import aggregate_results, get_children_recursively
from ..enteredValues.load import load_evcols


def load_sections(ids):
    query = """
        WITH RECURSIVE DESCENDANTS AS (
            SELECT parentId, childId
            FROM SectionChildren
            WHERE parentId = :parentId
        UNION
            SELECT X.parentId, X.childId
            FROM SectionChildren X
            JOIN DESCENDANTS ON X.parentId = DESCENDANTS.childId
        )
        SELECT * FROM DESCENDANTS
        ORDER BY "order";
    """

    all_ids, parent_to_children = get_children_recursively(db, ids, query)

    placeholders = ", ".join(["?"] * len(all_ids))
    query = f"""
        SELECT Section.*, UIType.id as nonPresetUITypeId
        FROM Section
        LEFT JOIN UIType
        ON Section.id = UIType.asNonPresetForSectionId
        WHERE Section.id IN ({placeholders})
    """
    db.execute(query, all_ids)

    sections = aggregate_results(db.fetchall(), "id", ["nonPresetUITypeId"])
    for v in sections.values():
        v["children"] = parent_to_children[v["id"]]
        v["size"] = {
            "width": convert_size(v.pop("width")),
            "height": convert_size(v.pop("height")),
        }
        v["nonPresetUITypeIds"] = [
            uitypeid for uitypeid in v.pop("nonPresetUITypeId") if uitypeid
        ]

    evCols = load_evcols([s["evColId"] for s in sections.values()])



def convert_size(x):
    return "auto" if x == -1 else x

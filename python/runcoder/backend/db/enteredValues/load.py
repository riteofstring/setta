from ...schema import db
from ...utils.utils import aggregate_results


def load_evcols(ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT EVColId.id, EVCol.codeInfoId, EVCol.value
        FROM EVColId
        LEFT JOIN EVCol
        ON EVColId.id = EVCol.idid
        WHERE EVColId.id in ({placeholders})
    """
    db.execute(query, ids)
    output = aggregate_results(db.fetchall(), "id", ["codeInfoId", "value"])
    output = {k: dict(zip(v["codeInfoId"], v["value"])) for k, v in output.items()}
    for v in output.values():
        v.pop(None, None)
    return output

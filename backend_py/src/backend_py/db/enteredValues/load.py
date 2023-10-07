from ...schema import db
from ...utils.utils import aggregate_results


def load_evcols(ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT * FROM EVCol
        WHERE idid in ({placeholders})
    """
    db.execute(query, ids)
    output = aggregate_results(db.fetchall(), "idid", ["codeInfoId", "value"])
    return {k: dict(zip(v["codeInfoId"], v["value"])) for k, v in output.items()}

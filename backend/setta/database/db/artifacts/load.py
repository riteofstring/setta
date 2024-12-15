import json

from setta.database.db.artifacts.utils import with_artifact_defaults


def load_artifacts(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT id, data
        FROM Artifact
        WHERE id IN ({placeholders})
    """

    db.execute(query, ids)

    output = {}
    for row in db.fetchall():
        output[row["id"]] = with_artifact_defaults(**json.loads(row["data"]))

    return output

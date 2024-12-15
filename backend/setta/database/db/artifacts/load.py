import json

from setta.database.db.artifacts.utils import with_artifact_defaults


def load_artifacts(db, ids):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT id, name, path, value, type
        FROM Artifact
        WHERE id IN ({placeholders})
    """

    db.execute(query, ids)

    output = {}
    for row in db.fetchall():
        output[row["id"]] =  {
                "name": row["name"],
                "path": row["path"],
                "value": json.loads(row["value"]),
                "type": row["type"],
            }

    return output

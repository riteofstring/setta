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


def load_available_artifacts(db, sectionType):
    allowed_types = SECTION_TYPE_TO_ALLOWED_ARTIFACT_TYPES.get(sectionType, [])
    
    placeholders = ", ".join(["?"] * len(allowed_types))
    query = f"""
        SELECT id, name, path, type
        FROM Artifact
        WHERE type IN ({placeholders})
    """

    db.execute(query, allowed_types)

    output = {}
    for row in db.fetchall():
        output[row["id"]] =  {
                "name": row["name"],
                "path": row["path"],
                "type": row["type"],
            }

    return output



SECTION_TYPE_TO_ALLOWED_ARTIFACT_TYPES = {"DRAW": ["img", "brushStrokes"], "LINE_PLOT": ["list"]}
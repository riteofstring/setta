import json

from setta.database.db_objs import DB
from setta.types.artifact import Artifact


def save_artifacts(db: DB, artifacts: dict[str, Artifact]):
    query = """
        INSERT INTO Artifact (id, name, path, value, type)
        VALUES (:id, :name, :path, :value, :type)
        ON CONFLICT (id)
        DO UPDATE SET
        name = :name,
        path = :path,
        value = :value,
        type = :type
    """

    query_params = []

    for id, artifact in artifacts.items():
        if artifact.path:
            # set value to null if path is specified
            artifact.value = None
        query_params.append(
            {
                "id": id,
                "name": artifact.name,
                "path": artifact.path,
                "value": json.dumps(artifact.value),
                "type": artifact.type,
            }
        )

    db.executemany(query, query_params)

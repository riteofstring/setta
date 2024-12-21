import json

from setta.utils.constants import DEFAULT_VALUES


def save_artifacts(db, artifacts):
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

    for id, data in artifacts.items():
        if data["path"]:
            # set value to null if path is specified
            data["value"] = DEFAULT_VALUES["artifact"]["value"]
        query_params.append(
            {
                "id": id,
                "name": data["name"],
                "path": data["path"],
                "value": json.dumps(data["value"]),
                "type": data["type"],
            }
        )

    db.executemany(query, query_params)

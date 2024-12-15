import json

from setta.utils.constants import ARTIFACTS_TABLE_DATA_JSON_FIELDS, DEFAULT_VALUES
from setta.utils.utils import filter_dict


def save_artifacts(db, artifacts):
    query = """
        INSERT INTO Artifact (id, data)
        VALUES (:id, :data)
        ON CONFLICT (id)
        DO UPDATE SET
        data = :data
    """

    query_params = []

    for id, data in artifacts.items():
        if data["path"]:
            # set value to null if path is specified
            data["value"] = DEFAULT_VALUES["artifact"]["value"]
        data = json.dumps(
            filter_dict(
                data, ARTIFACTS_TABLE_DATA_JSON_FIELDS, DEFAULT_VALUES["artifact"]
            )
        )
        query_params.append({"id": id, "data": data})

    db.executemany(query, query_params)

import json

from setta.utils.constants import ARTIFACTS_TABLE_DATA_JSON_FIELDS
from setta.utils.utils import filter_dict


def save_artifacts(db, artifacts):
    query = """
        INSERT INTO Artifact (id, data)
        VALUES (:id, :data)
        ON CONFLICT (id)
        DO UPDATE SET
        data = :data
    """

    query_params = [
        {
            "id": id,
            "data": json.dumps(filter_dict(data, ARTIFACTS_TABLE_DATA_JSON_FIELDS)),
        }
        for id, data in artifacts.items()
    ]
    db.executemany(query, query_params)

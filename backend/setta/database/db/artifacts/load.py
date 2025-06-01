from pathlib import Path

from setta.api.data_wrappers import get_wrapper_for_loading
from setta.database.db_objs import DB
from setta.types.artifact import Artifact, ArtifactType, ArtifactWithoutValue
from setta.utils.constants import C
from setta.utils.utils import try_json


def load_artifacts(db: DB, ids: list[str]):
    placeholders = ", ".join(["?"] * len(ids))
    query = f"""
        SELECT id, name, path, value, type
        FROM Artifact
        WHERE id IN ({placeholders})
    """

    db.execute(query, ids)

    output: dict[str, Artifact] = {}
    for row in db.fetchall():
        output[row["id"]] = Artifact(
            name=row["name"],
            path=row["path"],
            value=try_json(row["value"]),
            type=row["type"],
        )

    return output


def load_available_artifacts(db: DB, sectionType):
    allowed_types = C.ALLOWED_ARTIFACT_TYPES[sectionType]

    placeholders = ", ".join(["?"] * len(allowed_types))
    query = f"""
        SELECT id, name, path, type
        FROM Artifact
        WHERE type IN ({placeholders})
    """

    db.execute(query, allowed_types)

    output: dict[str, ArtifactWithoutValue] = {}
    for row in db.fetchall():
        output[row["id"]] = ArtifactWithoutValue(
            name=row["name"],
            path=row["path"],
            type=row["type"],
        )

    return output


def load_artifact_metadata_and_maybe_value_from_disk(db: DB, artifactIds: list[str]):
    artifacts = load_artifacts(db, artifactIds)
    for a in artifacts.values():
        if a.path:
            a.update(load_artifact_from_disk(a.path, a.type))
    return artifacts


def load_artifact_from_disk(filepath: Path, type: ArtifactType):
    wrapper = get_wrapper_for_loading(type)
    wrapper.load(filepath)
    return wrapper.serialize()

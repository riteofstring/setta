from setta.project_state.artifacts import Artifacts
from setta.types.generated.unions import (
    BaseArtifactUnion,
    BaseArtifactUnionWithDiscriminator,
)
from setta.utils.utils import normalize_path


class ListenerArtifactUpdateError(ValueError):
    """Raised when listener artifact updates cannot be applied."""


def apply_listener_artifact_updates(
    *,
    artifacts: Artifacts,
    updates: list[BaseArtifactUnionWithDiscriminator],
) -> list[BaseArtifactUnion]:
    applied: list[BaseArtifactUnion] = []
    for update in updates:
        try:
            normalized_path = normalize_path(update.id)
        except Exception as exc:
            raise ListenerArtifactUpdateError(
                f"failed to normalize artifact path {update.id}"
            ) from exc
        normalized_id = str(normalized_path)
        if normalized_id != update.id:
            artifact = update.model_copy(update={"id": normalized_id})
        else:
            artifact = update
        artifacts.cache_artifact_in_memory(
            artifact,
            compute_last_read_hash=False,
            reset_conflict=True,
        )
        applied.append(artifact)
    return applied

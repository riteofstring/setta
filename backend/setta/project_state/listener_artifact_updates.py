from __future__ import annotations

from setta.project_state.artifacts import Artifacts
from setta.types.listener import ListenerFrontendEmitArtifactUpdate


class ListenerArtifactUpdateError(ValueError):
    """Raised when listener artifact updates cannot be applied."""


def apply_listener_artifact_updates(
    *,
    artifacts: Artifacts,
    updates: list[ListenerFrontendEmitArtifactUpdate],
) -> None:
    del artifacts  # silence unused arg until integration lands
    del updates
    raise ListenerArtifactUpdateError(
        "listener artifact updates are not implemented yet"
    )


from pydantic import TypeAdapter
from setta.types.generated.go_shared_types import BaseArtifactUnion

__all__ = ["BaseArtifactTypeAdapter", "BaseArtifactUnion"]

BaseArtifactTypeAdapter = TypeAdapter(BaseArtifactUnion)

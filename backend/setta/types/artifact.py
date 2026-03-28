from typing import Annotated, Any

from pydantic import Discriminator, Tag, TypeAdapter
from setta.types.generated.go_shared_types import (
    ArtifactType,
)
from setta.types.generated.go_shared_types import (
    BrushStrokeArtifact as GoBrushStrokeArtifact,
)
from setta.types.generated.go_shared_types import (
    ChartDataArtifact as GoChartDataArtifact,
)
from setta.types.generated.go_shared_types import (
    DrawAreaLayerItemTransformArtifact as GoDrawAreaLayerItemTransformArtifact,
)
from setta.types.generated.go_shared_types import (
    FileArtifact as GoFileArtifact,
)
from setta.types.generated.go_shared_types import (
    ImageArtifact as GoImageArtifact,
)


def _artifact_type(value: Any) -> str | None:
    raw_type = value.get("type") if isinstance(value, dict) else getattr(value, "type", None)
    if isinstance(raw_type, ArtifactType):
        return raw_type.value
    if isinstance(raw_type, str):
        return raw_type
    return None


BaseArtifactUnion = Annotated[
    Annotated[GoImageArtifact, Tag(ArtifactType.Image.value)]
    | Annotated[GoBrushStrokeArtifact, Tag(ArtifactType.BrushStroke.value)]
    | Annotated[
        GoDrawAreaLayerItemTransformArtifact,
        Tag(ArtifactType.DrawAreaLayerItemTransform.value),
    ]
    | Annotated[GoChartDataArtifact, Tag(ArtifactType.ChartData.value)]
    | Annotated[GoFileArtifact, Tag(ArtifactType.File.value)],
    Discriminator(_artifact_type),
]

BaseArtifactUnionWithDiscriminator = BaseArtifactUnion

BaseArtifactTypeAdapter = TypeAdapter(BaseArtifactUnionWithDiscriminator)

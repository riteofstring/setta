from typing import Literal

from pydantic import BaseModel

from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator


class UpdateArtifactMsgContent(BaseModel):
    artifacts: list[BaseArtifactUnionWithDiscriminator]
    updateType: Literal["update", "delete"]

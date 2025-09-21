import base64
from typing import TYPE_CHECKING, Literal

from setta.types.artifact import (
    BrushStrokeMapping,
    ChartDataMapping,
    DrawAreaLayerItemTransformMapping,
    ImageArtifact,
    ImageMapping,
)
from setta.types.generated.unions import BaseArtifactUnion

if TYPE_CHECKING:
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class Artifacts:
    def __init__(self, websocket_msg_handler: "WMHFrontendSender"):
        self.websocket_msg_handler = websocket_msg_handler
        self.images: ImageMapping = {}
        self.brushStrokes: BrushStrokeMapping = {}
        self.chartData: ChartDataMapping = {}
        self.drawAreaLayerItemTransforms: DrawAreaLayerItemTransformMapping = {}

    async def load_image(self, imagePath: str):
        if imagePath in self.images:
            return
        with open(imagePath, "rb") as f:
            img = f.read()
        b64_str = base64.b64encode(img).decode("utf-8")
        artifact = ImageArtifact(id=imagePath, value=f"data:image/png;base64,{b64_str}")
        self.images[imagePath] = artifact
        await self.broadcast_update(artifact, "update")

    async def broadcast_update(
        self, artifact: BaseArtifactUnion, updateType: Literal["update", "delete"]
    ):
        await self.websocket_msg_handler.broadcast_artifact_update(
            artifact=artifact, updateType=updateType
        )

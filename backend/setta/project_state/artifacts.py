from setta.types.artifact import (
    BrushStrokeMapping,
    ChartDataMapping,
    DrawAreaLayerItemTransformMapping,
    ImageMapping,
)


class Artifacts:
    def __init__(self):
        self.images: ImageMapping = {}
        self.brushStrokes: BrushStrokeMapping = {}
        self.chartData: ChartDataMapping = {}
        self.drawAreaLayerItemTransforms: DrawAreaLayerItemTransformMapping = {}

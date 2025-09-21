from setta.types.chart import ChartDataMapping
from setta.types.draw_area import (
    BrushStrokeMapping,
    DrawAreaTransformMapping,
    ImageMapping,
)


class Artifacts:
    def __init__(self):
        self.images: ImageMapping = {}
        self.brushStrokes: BrushStrokeMapping = {}
        self.chartData: ChartDataMapping = {}
        self.drawAreaTransforms: DrawAreaTransformMapping = {}

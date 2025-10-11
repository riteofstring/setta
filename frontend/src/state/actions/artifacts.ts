import {
  useBrushStrokes,
  useChartData,
  useDrawAreaLayerItemTransform,
  useImages,
} from "state/definitions";
import {
  ArtifactTypeEnum,
  UpdateArtifactMsgContent,
} from "utils/generatedTypes";

export function updateArtifacts(artifactUpdate: UpdateArtifactMsgContent) {
  for (const artifact of artifactUpdate.artifacts) {
    switch (artifact.type) {
      case ArtifactTypeEnum.Image:
        return useImages.setState((state) => ({
          x: { ...state.x, [artifact.id]: artifact },
        }));
      case ArtifactTypeEnum.BrushStroke:
        return useBrushStrokes.setState((state) => ({
          x: {
            ...state.x,
            [artifact.id]: artifact,
          },
        }));
      case ArtifactTypeEnum.DrawAreaLayerItemTransform:
        return useDrawAreaLayerItemTransform.setState((state) => ({
          x: {
            ...state.x,
            [artifact.id]: artifact,
          },
        }));
      case ArtifactTypeEnum.ChartData:
        return useChartData.setState((state) => ({
          x: {
            ...state.x,
            [artifact.id]: artifact,
          },
        }));
      default:
        return artifact satisfies never;
    }
  }
}

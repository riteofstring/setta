import { createRandomName } from "utils/idNameCreation";

export function newLayer({ name, ...props }) {
  return {
    name: name ?? createRandomName(),
    artifactTransforms: [],
    visible: true,
    layerOpacity: 0.5,
    brushOpacity: 1,
    ...props,
  };
}

export function newArtifactTransform(
  artifactId,
  sectionTypeName,
  artifactType,
) {
  return {
    artifactId,
    ...specificArtifactTransformProps(sectionTypeName, artifactType),
  };
}

function specificArtifactTransformProps(sectionTypeName, artifactType) {
  switch (sectionTypeName) {
    case UITypeNameEnum.DRAW:
      return {
        transform: [1, 0, 0, 1, 0, 0],
        eraserStrokes: artifactType === ArtifactTypeEnum.IMG ? [] : {},
      };
    case UITypeNameEnum.IMAGE:
    case UITypeNameEnum.CHART:
    case UITypeNameEnum.CHAT:
      return {};
    default:
      return {};
  }
}

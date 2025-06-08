import { UITypeNameSchema } from "utils/generatedTypes";
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
    case UITypeNameSchema.enum.DRAW:
      return {
        transform: [1, 0, 0, 1, 0, 0],
        eraserStrokes: artifactType === ArtifactTypeSchema.enum.IMG ? [] : {},
      };
    case UITypeNameSchema.enum.IMAGE:
    case UITypeNameSchema.enum.CHART:
    case UITypeNameSchema.enum.CHAT:
      return {};
    default:
      return {};
  }
}

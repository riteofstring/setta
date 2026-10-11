import type { WorkspaceNormalizedStroke } from "@riteofstring/setta";

export type ArtifactAnnotationStroke = WorkspaceNormalizedStroke;

export type AnnotationBounds = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validBounds(bounds: AnnotationBounds): boolean {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    positiveFinite(bounds.width) &&
    positiveFinite(bounds.height)
  );
}

export function containedImageBounds(
  bounds: AnnotationBounds,
  naturalWidth: number,
  naturalHeight: number,
): AnnotationBounds | null {
  if (
    !validBounds(bounds) ||
    !positiveFinite(naturalWidth) ||
    !positiveFinite(naturalHeight)
  ) {
    return null;
  }
  const scale = Math.min(
    bounds.width / naturalWidth,
    bounds.height / naturalHeight,
  );
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    height,
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
  };
}

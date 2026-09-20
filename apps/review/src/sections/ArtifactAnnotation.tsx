import {
  WorkspaceNormalizedStrokeSurface,
  type WorkspaceNormalizedPoint,
} from "@setta/workspace";
import type { CSSProperties } from "react";
import type { ArtifactAnnotationStroke } from "./artifactAnnotationModel";

export type ArtifactAnnotationProps = Readonly<{
  artifactId: string;
  artifactLabel?: string;
  className?: string;
  drawMode: boolean;
  onClear: (artifactId: string) => void;
  onStrokeComplete: (
    artifactId: string,
    points: readonly WorkspaceNormalizedPoint[],
  ) => void;
  strokeColor?: string;
  strokeWidth?: number;
  strokes: readonly ArtifactAnnotationStroke[];
  style?: CSSProperties;
}>;

export function ArtifactAnnotation({
  artifactId,
  artifactLabel = artifactId,
  className,
  drawMode,
  onClear,
  onStrokeComplete,
  strokeColor = "#5ee693",
  strokeWidth = 3,
  strokes,
  style,
}: ArtifactAnnotationProps) {
  return (
    <WorkspaceNormalizedStrokeSurface
      ariaLabel={`Annotation canvas for ${artifactLabel}`}
      className={className}
      enabled={drawMode}
      onClear={() => onClear(artifactId)}
      onStrokeComplete={(points) => onStrokeComplete(artifactId, points)}
      resetKey={artifactId}
      strokeColor={strokeColor}
      strokeWidth={strokeWidth}
      strokes={strokes}
      style={style}
    />
  );
}

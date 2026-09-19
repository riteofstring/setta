import type { WorkspaceSection } from "@setta/workspace";

import { useReview } from "../app/reviewContext";
import { findRequestSnapshot } from "../app/reviewModel";
import type { ArtifactAnnotation as ArtifactAnnotationContract } from "../backend/generatedContract";
import { ArtifactAnnotation } from "./ArtifactAnnotation";
import type { ArtifactAnnotationStroke } from "./artifactAnnotationModel";
import {
  evidenceReference,
  resolvedEvidence,
  sectionEvidenceId,
  sectionRequestId,
} from "./sectionModel";

function artifactStrokes(
  annotations: readonly ArtifactAnnotationContract[],
  evidenceId: string,
): ArtifactAnnotationStroke[] {
  return annotations
    .filter((annotation) => annotation.artifactEvidenceId === evidenceId)
    .flatMap((annotation) =>
      annotation.paths.map((path, index) => ({
        color: path.color,
        id: `${annotation.id}:${index}`,
        points: path.points,
        width: Math.max(1, path.width * 420),
      })),
    );
}

function ArtifactPreview({
  label,
  mediaType,
  route,
}: {
  label: string;
  mediaType: string;
  route: string;
}) {
  if (mediaType.startsWith("image/")) {
    return <img alt={label} draggable={false} src={route} />;
  }
  if (mediaType.startsWith("video/")) {
    return <video aria-label={label} controls src={route} />;
  }
  if (mediaType.startsWith("audio/")) {
    return <audio aria-label={label} controls src={route} />;
  }
  return <iframe sandbox="" src={route} title={label} />;
}

export function ArtifactSection({ section }: { section: WorkspaceSection }) {
  const review = useReview();
  const requestId = sectionRequestId(section);
  const evidenceId = sectionEvidenceId(section);
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const reference = evidenceReference(snapshot, evidenceId);
  const resolved = resolvedEvidence(snapshot, evidenceId);
  if (reference.kind !== "artifact") {
    throw new Error(`Evidence ${evidenceId} is not an artifact.`);
  }
  if (resolved.status === "failed") {
    return (
      <div className="review-evidence-failure" role="alert">
        <strong>Artifact unavailable</strong>
        <p>{resolved.error.message}</p>
      </div>
    );
  }
  if (resolved.content.kind !== "artifact") {
    throw new Error(
      `Evidence ${evidenceId} resolved to the wrong content kind.`,
    );
  }
  const option =
    snapshot.request.type === "choice"
      ? (snapshot.request.choice.options.find(
          (candidate) => candidate.artifactEvidenceId === evidenceId,
        ) ?? null)
      : null;
  const selected = option
    ? review.selectedOptions[requestId] === option.id
    : review.selectedEvidenceId === evidenceId;
  const drawMode =
    review.drawing?.requestId === requestId &&
    review.drawing.evidenceId === evidenceId;
  const annotations = review.annotationsByRequest[requestId] ?? [];
  const strokes = artifactStrokes(annotations, evidenceId);
  const drawable = resolved.content.mediaType.startsWith("image/");

  return (
    <div className="review-artifact" data-selected={selected || undefined}>
      <div className="review-artifact-toolbar">
        {option ? (
          <button
            aria-pressed={selected}
            onClick={() => review.actions.selectOption(requestId, option.id)}
            type="button"
          >
            {selected ? "Selected" : "Select candidate"}
          </button>
        ) : (
          <button
            onClick={() => review.actions.selectEvidence(requestId, evidenceId)}
            type="button"
          >
            Focus evidence
          </button>
        )}
        {drawable ? (
          <button
            aria-pressed={drawMode}
            onClick={() =>
              review.actions.setDrawing(requestId, drawMode ? null : evidenceId)
            }
            type="button"
          >
            {drawMode ? "Finish drawing" : "Draw feedback"}
          </button>
        ) : null}
        {strokes.length > 0 ? (
          <button
            onClick={() =>
              review.actions.clearAnnotations(requestId, evidenceId)
            }
            type="button"
          >
            Clear drawing
          </button>
        ) : null}
        <a href={resolved.content.route} rel="noreferrer" target="_blank">
          Open original
        </a>
      </div>
      <div className="review-artifact-stage">
        <ArtifactPreview
          label={section.name}
          mediaType={resolved.content.mediaType}
          route={resolved.content.route}
        />
        {drawable ? (
          <ArtifactAnnotation
            artifactId={evidenceId}
            artifactLabel={section.name}
            className="review-artifact-annotation"
            drawMode={drawMode}
            onClear={() =>
              review.actions.clearAnnotations(requestId, evidenceId)
            }
            onStrokeComplete={(_, points) =>
              review.actions.addAnnotationStroke(requestId, evidenceId, points)
            }
            strokes={strokes}
          />
        ) : null}
      </div>
    </div>
  );
}

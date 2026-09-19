import type { WorkspaceSection } from "@setta/workspace";
import { useLayoutEffect, useState, type CSSProperties } from "react";

import { useReview, type ReviewContextValue } from "../app/reviewContext";
import { findRequestSnapshot } from "../app/reviewModel";
import type {
  ArtifactAnnotation as ArtifactAnnotationContract,
  ChoiceOption,
  RequestSnapshot,
  ResolvedEvidenceContent,
} from "../backend/generatedContract";
import { ArtifactAnnotation } from "./ArtifactAnnotation";
import {
  containedImageBounds,
  type AnnotationBounds,
  type ArtifactAnnotationStroke,
} from "./artifactAnnotationModel";
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

type ArtifactPreviewKind = "audio" | "image" | "video";

const ARTIFACT_PREVIEW_KINDS: Readonly<Record<string, ArtifactPreviewKind>> = {
  "audio/aac": "audio",
  "audio/flac": "audio",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
  "audio/webm": "audio",
  "image/avif": "image",
  "image/gif": "image",
  "image/jpeg": "image",
  "image/png": "image",
  "image/svg+xml": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/ogg": "video",
  "video/webm": "video",
};

function artifactPreviewKind(mediaType: string): ArtifactPreviewKind | null {
  return ARTIFACT_PREVIEW_KINDS[mediaType] ?? null;
}

function ArtifactFileCard({
  byteLength,
  label,
  mediaType,
}: Readonly<{
  byteLength: number;
  label: string;
  mediaType: string;
}>) {
  return (
    <div className="review-artifact-file-card" role="group">
      <span aria-hidden="true" className="review-artifact-file-mark">
        FILE
      </span>
      <strong>{label}</strong>
      <span>{mediaType}</span>
      <span>{new Intl.NumberFormat("en-US").format(byteLength)} bytes</span>
    </div>
  );
}

function ArtifactPreview({
  content,
  label,
  onImageElement,
  previewKind,
}: Readonly<{
  content: ResolvedArtifactContent;
  label: string;
  onImageElement: (element: HTMLImageElement | null) => void;
  previewKind: ArtifactPreviewKind | null;
}>) {
  if (previewKind === "image") {
    return (
      <img
        alt={label}
        draggable={false}
        key={content.route}
        ref={onImageElement}
        src={content.route}
      />
    );
  }
  if (previewKind === "video") {
    return <video aria-label={label} controls src={content.route} />;
  }
  if (previewKind === "audio") {
    return <audio aria-label={label} controls src={content.route} />;
  }
  return (
    <ArtifactFileCard
      byteLength={content.byteLength}
      label={label}
      mediaType={content.mediaType}
    />
  );
}

type ResolvedArtifactContent = Extract<
  ResolvedEvidenceContent,
  { kind: "artifact" }
>;

type ArtifactModel =
  | Readonly<{ message: string; status: "failed" }>
  | Readonly<{
      content: ResolvedArtifactContent;
      drawable: boolean;
      drawMode: boolean;
      option: ChoiceOption | null;
      previewKind: ArtifactPreviewKind | null;
      selected: boolean;
      status: "ready";
      strokes: readonly ArtifactAnnotationStroke[];
    }>;

function artifactOption(
  snapshot: RequestSnapshot,
  evidenceId: string,
): ChoiceOption | null {
  if (snapshot.request.type !== "choice") {
    return null;
  }
  return (
    snapshot.request.choice.options.find(
      (candidate) => candidate.artifactEvidenceId === evidenceId,
    ) ?? null
  );
}

function artifactSelected(
  review: ReviewContextValue,
  requestId: string,
  evidenceId: string,
  option: ChoiceOption | null,
): boolean {
  if (option) {
    return review.selectedOptions[requestId] === option.id;
  }
  return review.selectedEvidenceId === evidenceId;
}

function artifactDrawMode(
  review: ReviewContextValue,
  requestId: string,
  evidenceId: string,
): boolean {
  return (
    review.drawing?.requestId === requestId &&
    review.drawing.evidenceId === evidenceId
  );
}

function buildArtifactModel(
  review: ReviewContextValue,
  snapshot: RequestSnapshot,
  requestId: string,
  evidenceId: string,
): ArtifactModel {
  const reference = evidenceReference(snapshot, evidenceId);
  const resolved = resolvedEvidence(snapshot, evidenceId);
  if (reference.kind !== "artifact") {
    throw new Error(`Evidence ${evidenceId} is not an artifact.`);
  }
  if (resolved.status === "failed") {
    return { message: resolved.error.message, status: "failed" };
  }
  if (resolved.content.kind !== "artifact") {
    throw new Error(
      `Evidence ${evidenceId} resolved to the wrong content kind.`,
    );
  }
  const option = artifactOption(snapshot, evidenceId);
  const annotations = review.annotationsByRequest[requestId] ?? [];
  const previewKind = artifactPreviewKind(resolved.content.mediaType);
  return {
    content: resolved.content,
    drawable: previewKind === "image",
    drawMode: artifactDrawMode(review, requestId, evidenceId),
    option,
    previewKind,
    selected: artifactSelected(review, requestId, evidenceId, option),
    status: "ready",
    strokes: artifactStrokes(annotations, evidenceId),
  };
}

function ArtifactToolbar({
  evidenceId,
  model,
  requestId,
  review,
}: Readonly<{
  evidenceId: string;
  model: Extract<ArtifactModel, { status: "ready" }>;
  requestId: string;
  review: ReviewContextValue;
}>) {
  const { drawable, drawMode, option, selected, strokes } = model;
  return (
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
          onClick={() => review.actions.clearAnnotations(requestId, evidenceId)}
          type="button"
        >
          Clear drawing
        </button>
      ) : null}
      <a download href={`${model.content.route}?download=1`}>
        Download original
      </a>
    </div>
  );
}

function sameBounds(
  first: AnnotationBounds | null,
  second: AnnotationBounds | null,
): boolean {
  return (
    first === second ||
    (first !== null &&
      second !== null &&
      first.height === second.height &&
      first.left === second.left &&
      first.top === second.top &&
      first.width === second.width)
  );
}

function imageAnnotationBounds(
  stage: HTMLDivElement,
  image: HTMLImageElement,
): AnnotationBounds | null {
  if (image.offsetParent !== stage) {
    return null;
  }
  const imageBounds = containedImageBounds(
    {
      height: image.offsetHeight,
      left: image.offsetLeft,
      top: image.offsetTop,
      width: image.offsetWidth,
    },
    image.naturalWidth,
    image.naturalHeight,
  );
  return imageBounds;
}

function useImageAnnotationBounds(route: string) {
  const [bounds, setBounds] = useState<AnnotationBounds | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const measured =
        stage && image ? imageAnnotationBounds(stage, image) : null;
      setBounds((current) =>
        sameBounds(current, measured) ? current : measured,
      );
    };
    measure();
    if (!stage || !image) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(image);
    image.addEventListener("load", measure);
    return () => {
      image.removeEventListener("load", measure);
      observer.disconnect();
    };
  }, [image, route, stage]);
  return { bounds, imageRef: setImage, stageRef: setStage };
}

function annotationPosition(bounds: AnnotationBounds): CSSProperties {
  return {
    height: bounds.height,
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
  };
}

function ArtifactStage({
  evidenceId,
  model,
  requestId,
  review,
  sectionName,
}: Readonly<{
  evidenceId: string;
  model: Extract<ArtifactModel, { status: "ready" }>;
  requestId: string;
  review: ReviewContextValue;
  sectionName: string;
}>) {
  const annotation = useImageAnnotationBounds(model.content.route);
  return (
    <div className="review-artifact-stage" ref={annotation.stageRef}>
      <ArtifactPreview
        content={model.content}
        label={sectionName}
        onImageElement={annotation.imageRef}
        previewKind={model.previewKind}
      />
      {model.drawable && annotation.bounds ? (
        <ArtifactAnnotation
          artifactId={evidenceId}
          artifactLabel={sectionName}
          className="review-artifact-annotation"
          drawMode={model.drawMode}
          onClear={() => review.actions.clearAnnotations(requestId, evidenceId)}
          onStrokeComplete={(_, points) =>
            review.actions.addAnnotationStroke(requestId, evidenceId, points)
          }
          style={annotationPosition(annotation.bounds)}
          strokes={model.strokes}
        />
      ) : null}
    </div>
  );
}

function ResolvedArtifactSection({
  evidenceId,
  model,
  requestId,
  review,
  sectionName,
}: Readonly<{
  evidenceId: string;
  model: Extract<ArtifactModel, { status: "ready" }>;
  requestId: string;
  review: ReviewContextValue;
  sectionName: string;
}>) {
  return (
    <div
      className="review-artifact"
      data-selected={model.selected || undefined}
    >
      <ArtifactToolbar
        evidenceId={evidenceId}
        model={model}
        requestId={requestId}
        review={review}
      />
      <ArtifactStage
        evidenceId={evidenceId}
        model={model}
        requestId={requestId}
        review={review}
        sectionName={sectionName}
      />
    </div>
  );
}

export function ArtifactSection({ section }: { section: WorkspaceSection }) {
  const review = useReview();
  const requestId = sectionRequestId(section);
  const evidenceId = sectionEvidenceId(section);
  const snapshot = findRequestSnapshot(review.snapshot.requests, requestId);
  const model = buildArtifactModel(review, snapshot, requestId, evidenceId);
  if (model.status === "failed") {
    return (
      <div className="review-evidence-failure" role="alert">
        <strong>Artifact unavailable</strong>
        <p>{model.message}</p>
      </div>
    );
  }

  return (
    <ResolvedArtifactSection
      evidenceId={evidenceId}
      model={model}
      requestId={requestId}
      review={review}
      sectionName={section.name}
    />
  );
}

type GpuFlowCommittedSurfaceActorRepresentationRole =
  | "browser-dom-island"
  | "browser-text-control"
  | "gpu-native-visual"
  | "html-texture"
  | "retained-page";

export type GpuFlowCommittedSurfaceCanonicalActorId = string;

export type GpuFlowCommittedSurfaceActorGenerationClassification = {
  readonly contentGenerationId: string;
  readonly projectionGenerationId: string;
  readonly representationGenerationId: string;
  readonly representationRole: GpuFlowCommittedSurfaceActorRepresentationRole;
  readonly semanticGenerationId: string;
  readonly visualGenerationId: string;
};

export function createGpuFlowCanonicalActorId({
  actorFamily,
  actorId,
  controlId,
  islandId,
  ownerSurfaceId,
  representationRole,
  rowId,
}: {
  readonly actorFamily: string;
  readonly actorId: string;
  readonly controlId: string | null;
  readonly islandId: string | null;
  readonly ownerSurfaceId: string;
  readonly representationRole: GpuFlowCommittedSurfaceActorRepresentationRole;
  readonly rowId: string | null;
}): GpuFlowCommittedSurfaceCanonicalActorId {
  return JSON.stringify({
    actorFamily,
    ownerIdentity: rowId ?? controlId ?? islandId ?? actorId,
    ownerSurfaceId,
    representationRole,
  });
}

export function getGpuFlowCommittedSurfaceActorRepresentationRole({
  actorFamily,
  kind,
}: {
  readonly actorFamily: string;
  readonly kind: string;
}): GpuFlowCommittedSurfaceActorRepresentationRole {
  if (actorFamily === "text-like-dom-control") {
    return "browser-text-control";
  }
  switch (kind) {
    case "dom-island":
      return "browser-dom-island";
    case "gpu-native-visual":
      return "gpu-native-visual";
    case "html-texture":
      return "html-texture";
    case "retained-page":
      return "retained-page";
    case "dom-control":
      return "browser-text-control";
  }
  throw new Error(`Unknown GPU Flow committed actor kind "${kind}".`);
}

export function createGpuFlowCommittedSurfaceActorGenerationClassification({
  browserVisualRepresentationKind,
  contentGenerationId,
  layoutProjectionGenerationId,
  readinessGenerationId,
  representationRole,
  semanticGenerationId,
  visualGenerationId,
}: {
  readonly browserVisualRepresentationKind: string | null;
  readonly contentGenerationId: string;
  readonly layoutProjectionGenerationId: string;
  readonly readinessGenerationId: string;
  readonly representationRole: GpuFlowCommittedSurfaceActorRepresentationRole;
  readonly semanticGenerationId: string;
  readonly visualGenerationId: string;
}): GpuFlowCommittedSurfaceActorGenerationClassification {
  return Object.freeze({
    contentGenerationId,
    projectionGenerationId: layoutProjectionGenerationId,
    representationGenerationId: [
      representationRole,
      browserVisualRepresentationKind ?? "none",
      visualGenerationId,
      readinessGenerationId,
    ].join("|"),
    representationRole,
    semanticGenerationId,
    visualGenerationId,
  });
}

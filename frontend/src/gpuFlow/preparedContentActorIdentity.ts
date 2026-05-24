type GpuFlowPreparedContentActorRepresentationRole =
  | "browser-dom-island"
  | "browser-text-control"
  | "gpu-native-visual"
  | "html-texture"
  | "retained-page";

export type GpuFlowPreparedContentCanonicalActorId = string;

export type GpuFlowPreparedContentActorGenerationClassification = {
  readonly contentGenerationId: string;
  readonly projectionGenerationId: string;
  readonly representationGenerationId: string;
  readonly representationRole: GpuFlowPreparedContentActorRepresentationRole;
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
  readonly representationRole: GpuFlowPreparedContentActorRepresentationRole;
  readonly rowId: string | null;
}): GpuFlowPreparedContentCanonicalActorId {
  return JSON.stringify({
    actorFamily,
    ownerIdentity: rowId ?? controlId ?? islandId ?? actorId,
    ownerSurfaceId,
    representationRole,
  });
}

export function getGpuFlowPreparedContentActorRepresentationRole({
  actorFamily,
  kind,
}: {
  readonly actorFamily: string;
  readonly kind: string;
}): GpuFlowPreparedContentActorRepresentationRole {
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
  throw new Error(`Unknown GPU Flow prepared actor kind "${kind}".`);
}

export function createGpuFlowPreparedContentActorGenerationClassification({
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
  readonly representationRole: GpuFlowPreparedContentActorRepresentationRole;
  readonly semanticGenerationId: string;
  readonly visualGenerationId: string;
}): GpuFlowPreparedContentActorGenerationClassification {
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

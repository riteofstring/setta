/**
 * Renderer telemetry for artifact documents that fail after acceptance.
 *
 * Setta's Go compiler is the only acceptance authority, and the pinned parser
 * agreed with it on the whole conformance corpus, so a document that reaches
 * the renderer and then fails identity matching, parsing, surface loading, or
 * rendering is a Setta fault. The reader is shown a generic failure; this is
 * where the fault itself is recorded, in the same one-line JSON shape the
 * renderer's other observations use.
 */
type ArtifactDocumentFaultObservation =
  | {
      readonly artifactId: string;
      readonly catalogId: string;
      readonly errors: readonly string[];
      readonly stage: "identity" | "parse" | "render";
    }
  | {
      readonly artifactId: string;
      readonly errors: readonly string[];
      readonly stage: "surface";
    };

export function reportArtifactDocumentFault(observation: ArtifactDocumentFaultObservation): void {
  console.error(JSON.stringify({ type: "artifact_document_fault", ...observation }));
}

/** The message text of one upstream OpenUI error, without its internals. */
export function artifactFaultText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "unknown artifact document error";
}

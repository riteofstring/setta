import type { ArtifactDocument } from "@generated/backend";
import { Renderer } from "@openuidev/react-lang";
import { useCallback, useMemo } from "react";

import { createArtifactLibrary } from "./artifact-library";
import { artifactFaultText, reportArtifactDocumentFault } from "./artifact-telemetry";
import { artifactCatalogId } from "./generated/artifact-catalog";

/**
 * Renders one stored artifact document.
 *
 * The backend is the only acceptance authority, so this does not re-validate a
 * document: it selects the catalog by exact identity, then hands the source to
 * the pinned parser and the generated library. A document written against a
 * catalog this build does not register is a fault worth seeing, not something
 * to render around.
 *
 * The parser's `onError` callback is telemetry and defence only. Everything it
 * can report — an unknown component, a missing required property — was already
 * rejected before the document became durable, so an error here is recorded as
 * a Setta fault rather than shown to the reader as something to fix.
 */
export function SettaArtifactRenderer({
  artifactId,
  document,
}: {
  artifactId: string;
  document: ArtifactDocument;
}) {
  const library = useMemo(() => createArtifactLibrary(), []);
  const onError = useCallback(
    (errors: readonly unknown[]) => {
      if (errors.length === 0) {
        return;
      }
      reportArtifactDocumentFault({
        artifactId,
        catalogId: document.catalogId,
        errors: errors.map(artifactFaultText),
        stage: "render",
      });
    },
    [artifactId, document.catalogId],
  );
  if (document.catalogId !== artifactCatalogId) {
    throw new Error(
      `artifact document uses catalog ${document.catalogId}, which this build does not render`,
    );
  }
  return <Renderer library={library} onError={onError} response={document.source} />;
}

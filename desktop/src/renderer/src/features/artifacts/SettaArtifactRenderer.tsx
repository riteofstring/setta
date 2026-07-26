import type { ArtifactDocument } from "@generated/backend";
import { Renderer } from "@openuidev/react-lang";
import { useMemo } from "react";

import { createArtifactLibrary } from "./artifact-library";
import { artifactCatalogId } from "./generated/artifact-catalog";

/**
 * Renders one stored artifact document.
 *
 * The backend is the only acceptance authority, so this does not re-validate a
 * document: it selects the catalog by exact identity, then hands the source to
 * the pinned parser and the generated library. A document written against a
 * catalog this build does not register is a fault worth seeing, not something
 * to render around.
 */
export function SettaArtifactRenderer({ document }: { document: ArtifactDocument }) {
  const library = useMemo(() => createArtifactLibrary(), []);
  if (document.catalogId !== artifactCatalogId) {
    throw new Error(
      `artifact document uses catalog ${document.catalogId}, which this build does not render`,
    );
  }
  return <Renderer library={library} response={document.source} />;
}

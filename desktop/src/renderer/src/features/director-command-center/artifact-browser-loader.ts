import type { SettaArtifactRenderer } from "../artifacts/SettaArtifactRenderer";

interface ArtifactRendererModule {
  readonly SettaArtifactRenderer: typeof SettaArtifactRenderer;
}

let rendererRequest: Promise<ArtifactRendererModule> | null = null;

/**
 * Loads the document renderer with one automatic retry for a transient chunk
 * read. The reading surface itself is part of the command center's initial
 * chunk, so opening an artifact never waits for interface code.
 */
export function loadArtifactRenderer(): Promise<ArtifactRendererModule> {
  rendererRequest ??= import("../artifacts/SettaArtifactRenderer")
    .catch(() => import("../artifacts/SettaArtifactRenderer"))
    .catch((error: unknown) => {
      rendererRequest = null;
      throw error;
    });
  return rendererRequest;
}

/** Prepares every lazy boundary an artifact open could otherwise expose. */
export async function prepareArtifactBrowserUi(): Promise<void> {
  await loadArtifactRenderer();
}

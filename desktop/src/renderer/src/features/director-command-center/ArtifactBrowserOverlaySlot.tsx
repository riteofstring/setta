import { Suspense, lazy } from "react";

import type { DirectorArtifactBrowser } from "./director-artifact-browser";

/**
 * The artifact browser's chunk boundary.
 *
 * The overlay is the only consumer of the Dialog and Scroll Area primitives, and
 * it mounts nothing until a reader opens an artifact, so the command center has
 * no reason to carry it on first paint. This module holds no primitive itself:
 * the overlay, its Dialog, and the artifact renderer behind it all arrive when
 * the browser opens.
 */
const ArtifactBrowserOverlay = lazy(async () => ({
  default: (await import("./ArtifactBrowserOverlay")).ArtifactBrowserOverlay,
}));

export function ArtifactBrowserOverlaySlot({ browser }: { browser: DirectorArtifactBrowser }) {
  if (browser.activeArtifact === null) {
    return null;
  }
  // Focus stays on the expand control that opened the artifact until the Dialog
  // mounts and claims it, so this renders nothing rather than a placeholder the
  // Dialog would immediately replace.
  return (
    <Suspense fallback={null}>
      <ArtifactBrowserOverlay artifact={browser.activeArtifact} browser={browser} />
    </Suspense>
  );
}

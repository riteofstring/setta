import {
  Component,
  Suspense,
  lazy,
  useId,
  useLayoutEffect,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from "react";

import { Button } from "@renderer/components/ui/button";

import { artifactFaultText, reportArtifactDocumentFault } from "../artifacts/artifact-telemetry";
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
  default: (await loadArtifactBrowserOverlay()).ArtifactBrowserOverlay,
}));

export function ArtifactBrowserOverlaySlot({ browser }: { browser: DirectorArtifactBrowser }) {
  const artifact = browser.activeArtifact;
  if (artifact === null) {
    return null;
  }
  return (
    <ArtifactBrowserOverlayBoundary artifactId={artifact.id} browser={browser}>
      <Suspense fallback={<ArtifactBrowserFallbackDialog browser={browser} state="loading" />}>
        <ArtifactBrowserOverlay artifact={artifact} browser={browser} />
      </Suspense>
    </ArtifactBrowserOverlayBoundary>
  );
}

async function loadArtifactBrowserOverlay() {
  try {
    return await import("./ArtifactBrowserOverlay");
  } catch {
    // A transient chunk read gets one automatic retry before the browser shows
    // its contained failure surface.
    return import("./ArtifactBrowserOverlay");
  }
}

class ArtifactBrowserOverlayBoundary extends Component<
  {
    readonly artifactId: string;
    readonly browser: DirectorArtifactBrowser;
    readonly children: ReactNode;
  },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportArtifactDocumentFault({
      artifactId: this.props.artifactId,
      errors: [artifactFaultText(error), info.componentStack ?? ""].filter(Boolean),
      stage: "overlay",
    });
  }

  override render(): ReactNode {
    return this.state.failed ? (
      <ArtifactBrowserFallbackDialog browser={this.props.browser} state="failed" />
    ) : (
      this.props.children
    );
  }
}

/**
 * A lightweight modal for the time before the official Dialog chunk is ready,
 * and for the contained failure path when that chunk cannot load.
 *
 * The native modal keeps focus outside the shell content that becomes inert as
 * soon as the browser opens. It disappears when the official shadcn/Base UI
 * Dialog mounts, so none of the browser primitives return to the initial chunk.
 */
function ArtifactBrowserFallbackDialog({
  browser,
  state,
}: {
  browser: DirectorArtifactBrowser;
  state: "failed" | "loading";
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const descriptionId = useId();
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  const failed = state === "failed";
  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="director-artifact-browser-fallback"
      data-artifact-browser-fallback={state}
      onCancel={(event) => {
        event.preventDefault();
        browser.close();
      }}
      ref={dialogRef}
    >
      <h2 id={titleId}>{failed ? "Artifact unavailable" : "Opening artifact"}</h2>
      <p id={descriptionId} role={failed ? "alert" : "status"}>
        {failed
          ? "Setta could not open this artifact. Close the browser to continue."
          : "Loading artifact."}
      </p>
      <div className="director-artifact-browser-fallback-actions">
        <Button autoFocus className="h-10" onClick={browser.close} type="button" variant="outline">
          Close
        </Button>
      </div>
    </dialog>
  );
}

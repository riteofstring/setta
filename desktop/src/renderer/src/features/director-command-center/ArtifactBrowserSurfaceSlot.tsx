import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from "react";

import { Button } from "@renderer/components/ui/button";

import { artifactFaultText, reportArtifactDocumentFault } from "../artifacts/artifact-telemetry";
import type { GraphArtifactParticleStyle } from "../director-graph/render/graph-artifact-presentation";
import { ArtifactBrowserSurface } from "./ArtifactBrowserSurface";
import { prepareArtifactBrowserUi } from "./artifact-browser-loader";
import type { DirectorArtifactBrowser } from "./director-artifact-browser";

/** Keeps the lightweight in-place surface ready; only document rendering is lazy. */
export function ArtifactBrowserSurfaceSlot({
  browser,
  onParticleStyleChange,
  particleStyle,
  showParticleStyleControls,
}: {
  browser: DirectorArtifactBrowser;
  onParticleStyleChange: (style: GraphArtifactParticleStyle) => void;
  particleStyle: GraphArtifactParticleStyle;
  showParticleStyleControls: boolean;
}) {
  const artifact = browser.activeArtifact;
  usePrefetchArtifactBrowserChunks();
  if (artifact === null) {
    return null;
  }
  return (
    <ArtifactBrowserSurfaceBoundary artifactId={artifact.id} browser={browser} key={artifact.id}>
      <ArtifactBrowserSurface
        artifact={artifact}
        browser={browser}
        onParticleStyleChange={onParticleStyleChange}
        particleStyle={particleStyle}
        showParticleStyleControls={showParticleStyleControls}
      />
    </ArtifactBrowserSurfaceBoundary>
  );
}

/** Uses guaranteed idle time because the continuously moving graph rarely becomes idle itself. */
function usePrefetchArtifactBrowserChunks(): void {
  useEffect(() => {
    const prepare = (): void => {
      void prepareArtifactBrowserUi().catch(() => undefined);
    };
    if (typeof globalThis.requestIdleCallback === "function") {
      const handle = globalThis.requestIdleCallback(prepare, { timeout: 600 });
      return () => globalThis.cancelIdleCallback(handle);
    }
    const handle = globalThis.setTimeout(prepare, 200);
    return () => globalThis.clearTimeout(handle);
  }, []);
}

class ArtifactBrowserSurfaceBoundary extends Component<
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
      stage: "surface",
    });
  }

  override render(): ReactNode {
    return this.state.failed ? (
      <ArtifactBrowserFailureSurface browser={this.props.browser} />
    ) : (
      this.props.children
    );
  }
}

function ArtifactBrowserFailureSurface({ browser }: { browser: DirectorArtifactBrowser }) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <article
      aria-labelledby="director-artifact-failure-title"
      className="director-artifact-browser"
      data-artifact-load-state="failed"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          browser.close();
        }
      }}
    >
      <section className="director-artifact-browser-fallback" role="alert">
        <h1 id="director-artifact-failure-title" ref={titleRef} tabIndex={-1}>
          Artifact unavailable
        </h1>
        <p>Setta could not open this artifact.</p>
        <Button className="h-10" onClick={browser.close} type="button" variant="outline">
          Back to Director
        </Button>
      </section>
    </article>
  );
}

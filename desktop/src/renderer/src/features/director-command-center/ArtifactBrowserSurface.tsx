import type { WorkstreamArtifact } from "@generated/backend";
import caretLeftFillIcon from "@phosphor-icons/core/fill/caret-left-fill.svg";
import caretRightFillIcon from "@phosphor-icons/core/fill/caret-right-fill.svg";
import xFillIcon from "@phosphor-icons/core/fill/x-fill.svg";
import {
  Component,
  Suspense,
  lazy,
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ErrorInfo,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@renderer/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

import { useAppWindowDragHandlers } from "../../app-window-drag";
import { artifactFaultText, reportArtifactDocumentFault } from "../artifacts/artifact-telemetry";
import type { GraphArtifactParticleStyle } from "../director-graph/render/graph-artifact-presentation";
import { loadArtifactRenderer } from "./artifact-browser-loader";
import { useArtifactDocument, type DirectorArtifactBrowser } from "./director-artifact-browser";

const SettaArtifactRenderer = lazy(async () => ({
  default: (await loadArtifactRenderer()).SettaArtifactRenderer,
}));

/**
 * An artifact occupies the command center itself. The graph canvas stays
 * mounted underneath and morphs particle systems; only the surrounding app UI
 * becomes inert and fades away. This is page navigation, not a modal dialog.
 */
export function ArtifactBrowserSurface({
  artifact,
  browser,
  particleStyle,
  onParticleStyleChange,
  showParticleStyleControls,
}: {
  artifact: WorkstreamArtifact;
  browser: DirectorArtifactBrowser;
  particleStyle: GraphArtifactParticleStyle;
  onParticleStyleChange: (style: GraphArtifactParticleStyle) => void;
  showParticleStyleControls: boolean;
}) {
  const document = useArtifactDocument({ artifact, documents: browser.documents, enabled: true });
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const windowDragHandlers = useAppWindowDragHandlers();
  const total = browser.browsable.length;
  const position = `${browser.activePosition} / ${total}`;
  const hasPrevious = browser.activePosition > 1;
  const hasNext = browser.activePosition < total;
  const preparing = browser.pendingArtifactId !== null;

  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [artifact.id]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      browser.close();
      return;
    }
    if (!artifactBrowserTakesArrowKey(event.target)) {
      return;
    }
    if (event.key === "ArrowLeft" && hasPrevious) {
      event.preventDefault();
      browser.showPrevious();
      return;
    }
    if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault();
      browser.showNext();
    }
  };

  return (
    <TooltipProvider delay={180}>
      <article
        aria-busy={preparing || undefined}
        aria-labelledby={titleId}
        className="director-artifact-browser"
        data-artifact-id={artifact.id}
        data-artifact-load-state={document?.status ?? "loading"}
        data-particle-style={particleStyle}
        onKeyDown={onKeyDown}
      >
        <header
          className="director-artifact-browser-header app-drag"
          data-setta-shell-title-bar="true"
          {...windowDragHandlers}
        >
          <p className="director-artifact-browser-position" data-preparing={preparing || undefined}>
            Artifact {position}
          </p>
          {showParticleStyleControls ? (
            <fieldset
              aria-label="Artifact background style"
              className="director-artifact-particle-switch app-no-drag"
            >
              <legend className="sr-only">Artifact background style</legend>
              <ParticleStyleControl
                active={particleStyle === "particle-flow"}
                label="Particle flow"
                onActivate={() => onParticleStyleChange("particle-flow")}
              />
              <ParticleStyleControl
                active={particleStyle === "fluid"}
                label="Large fluid"
                onActivate={() => onParticleStyleChange("fluid")}
              />
            </fieldset>
          ) : null}
          <nav
            aria-label="Artifact navigation"
            className="director-artifact-browser-controls app-no-drag"
          >
            <ArtifactBrowserControl
              disabled={preparing || !hasPrevious}
              icon={caretLeftFillIcon}
              label="Previous artifact"
              onActivate={browser.showPrevious}
            />
            <ArtifactBrowserControl
              disabled={preparing || !hasNext}
              icon={caretRightFillIcon}
              label="Next artifact"
              onActivate={browser.showNext}
            />
            <ArtifactBrowserControl
              icon={xFillIcon}
              label="Close artifact browser"
              onActivate={browser.close}
              tooltip="Back to Director"
            />
          </nav>
        </header>
        <span aria-live="polite" className="sr-only" role="status">
          {preparing ? "Preparing artifact." : `${artifact.title}, artifact ${position}`}
        </span>
        <section
          aria-label={`Artifact document: ${artifact.title}`}
          className="director-artifact-browser-scroll"
          key={artifact.id}
          tabIndex={0}
        >
          <div className="director-artifact-browser-document" data-artifact-document={artifact.id}>
            <header className="director-artifact-title-block">
              <p className="director-artifact-kicker">{artifact.kind}</p>
              <h1 id={titleId} ref={titleRef} tabIndex={-1}>
                {artifact.title}
              </h1>
              <p className="director-artifact-standfirst">{artifact.summary}</p>
            </header>
            <ArtifactBrowserDocument artifact={artifact} document={document} />
          </div>
        </section>
      </article>
    </TooltipProvider>
  );
}

function ArtifactBrowserDocument({
  artifact,
  document,
}: {
  artifact: WorkstreamArtifact;
  document: ReturnType<typeof useArtifactDocument>;
}) {
  switch (document?.status) {
    case "ready":
      return (
        <section className="director-artifact-browser-body" data-ready="true">
          <ArtifactBrowserRenderBoundary
            artifactId={artifact.id}
            catalogId={document.entry.artifact.document.catalogId}
            key={artifact.id}
          >
            <Suspense fallback={null}>
              <SettaArtifactRenderer
                artifactId={artifact.id}
                document={document.entry.artifact.document}
              />
            </Suspense>
          </ArtifactBrowserRenderBoundary>
        </section>
      );
    case "failed":
      return <ArtifactBrowserFailure />;
    default:
      return null;
  }
}

function ArtifactBrowserFailure() {
  return (
    <p className="director-artifact-browser-status" role="alert">
      Setta could not open this artifact.
    </p>
  );
}

class ArtifactBrowserRenderBoundary extends Component<
  {
    readonly artifactId: string;
    readonly catalogId: string;
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
      catalogId: this.props.catalogId,
      errors: [artifactFaultText(error), info.componentStack ?? ""].filter(Boolean),
      stage: "render",
    });
  }

  override render(): ReactNode {
    return this.state.failed ? <ArtifactBrowserFailure /> : this.props.children;
  }
}

function ParticleStyleControl({
  active,
  label,
  onActivate,
}: {
  active: boolean;
  label: string;
  onActivate: () => void;
}) {
  return (
    <button aria-pressed={active} onClick={onActivate} type="button">
      {label}
    </button>
  );
}

function ArtifactBrowserControl({
  disabled = false,
  icon,
  label,
  onActivate,
  tooltip = label,
}: {
  disabled?: boolean;
  icon: string;
  label: string;
  onActivate: () => void;
  tooltip?: string;
}) {
  const button = (
    <Button
      aria-label={label}
      className="director-artifact-browser-control"
      disabled={disabled}
      onClick={onActivate}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <span
        aria-hidden="true"
        className="director-artifact-browser-control-icon"
        style={
          {
            WebkitMaskImage: `url("${icon}")`,
            maskImage: `url("${icon}")`,
          } satisfies CSSProperties
        }
      />
    </Button>
  );
  if (disabled) {
    return button;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Leaves arrow keys to controls and independently scrollable document areas. */
function artifactBrowserTakesArrowKey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return true;
  }
  if (target.matches(".director-artifact-browser-scroll")) {
    return false;
  }
  return (
    target.closest(
      [
        "a",
        "button",
        "input",
        "textarea",
        "select",
        "summary",
        "[contenteditable]:not([contenteditable='false'])",
        "[tabindex]:not([tabindex='-1'])",
        "[role='tab']",
        "[role='slider']",
        "[data-slot='table-container']",
        "[data-slot='scroll-area-scrollbar']",
      ].join(", "),
    ) === null
  );
}

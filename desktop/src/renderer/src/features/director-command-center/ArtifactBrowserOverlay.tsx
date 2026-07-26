import type { WorkstreamArtifact } from "@generated/backend";
import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import {
  Component,
  Suspense,
  lazy,
  type ErrorInfo,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { ScrollArea } from "@renderer/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";

import { artifactFaultText, reportArtifactDocumentFault } from "../artifacts/artifact-telemetry";
import { useArtifactDocument, type DirectorArtifactBrowser } from "./director-artifact-browser";

const SettaArtifactRenderer = lazy(async () => ({
  default: (await import("../artifacts/SettaArtifactRenderer")).SettaArtifactRenderer,
}));

/**
 * The artifact browser.
 *
 * One overlay holds every available artifact in the rail's own order: opening a
 * preview makes that artifact active, and previous and next move through the
 * rest without the Dialog closing and reopening. Only the active document is
 * mounted; the neighbours either side are read ahead into the bounded cache the
 * previews already share.
 *
 * The WebGL command center stays mounted behind the Dialog's backdrop, so
 * closing the browser returns to the same graph.
 */
export function ArtifactBrowserOverlay({
  artifact,
  browser,
}: {
  artifact: WorkstreamArtifact;
  browser: DirectorArtifactBrowser;
}) {
  const document = useArtifactDocument({ artifact, documents: browser.documents, enabled: true });
  const total = browser.browsable.length;
  const position = `${browser.activePosition} of ${total}`;
  const hasPrevious = browser.activePosition > 1;
  const hasNext = browser.activePosition < total;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.defaultPrevented || !artifactBrowserTakesArrowKey(event.target)) {
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          browser.close();
        }
      }}
    >
      <TooltipProvider>
        <DialogContent
          className="director-artifact-browser"
          data-artifact-id={artifact.id}
          data-artifact-load-state={document?.status ?? "loading"}
          finalFocus={browser.triggerRef}
          onKeyDown={onKeyDown}
          showCloseButton={false}
        >
          <DialogHeader className="director-artifact-browser-header">
            <div className="director-artifact-browser-identity">
              <DialogTitle className="sr-only">{artifact.title}</DialogTitle>
              <p className="director-artifact-browser-position">{position}</p>
            </div>
            <div className="director-artifact-browser-controls">
              <ArtifactBrowserControl
                disabled={!hasPrevious}
                icon={ChevronLeft}
                label="Previous artifact"
                onActivate={browser.showPrevious}
              />
              <ArtifactBrowserControl
                disabled={!hasNext}
                icon={ChevronRight}
                label="Next artifact"
                onActivate={browser.showNext}
              />
              {/* The Dialog's own close part, so the primitive keeps the
                  escape route it gives touch screen readers. */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DialogClose
                      render={
                        <Button
                          aria-label="Close artifact browser"
                          className="size-10"
                          size="icon-sm"
                          variant="ghost"
                        />
                      }
                    />
                  }
                >
                  <X aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>Close artifact browser</TooltipContent>
              </Tooltip>
            </div>
          </DialogHeader>
          <span aria-live="polite" className="sr-only" role="status">
            {`${artifact.title}, ${position}`}
          </span>
          <ScrollArea className="director-artifact-browser-scroll" key={artifact.id}>
            <div
              className="director-artifact-browser-document"
              data-artifact-document={artifact.id}
            >
              {/*
               * The title block. A document deserves the top of its own page,
               * and this is the only place the artifact is named now.
               */}
              <header className="director-artifact-title-block">
                <p className="director-artifact-kicker">{artifact.kind}</p>
                <h1>{artifact.title}</h1>
              </header>
              <ArtifactBrowserDocument artifact={artifact} document={document} />
            </div>
          </ScrollArea>
        </DialogContent>
      </TooltipProvider>
    </Dialog>
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
        <ArtifactBrowserRenderBoundary
          artifactId={artifact.id}
          catalogId={document.entry.artifact.document.catalogId}
        >
          <Suspense fallback={<ArtifactBrowserStatus text="Loading artifact." />}>
            <SettaArtifactRenderer
              artifactId={artifact.id}
              document={document.entry.artifact.document}
            />
          </Suspense>
        </ArtifactBrowserRenderBoundary>
      );
    case "failed":
      return <ArtifactBrowserFailure />;
    default:
      return <ArtifactBrowserStatus text="Loading artifact." />;
  }
}

function ArtifactBrowserStatus({ text }: { text: string }) {
  return (
    <p className="director-artifact-browser-status" role="status">
      {text}
    </p>
  );
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

function ArtifactBrowserControl({
  disabled = false,
  icon: Icon,
  label,
  onActivate,
}: {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onActivate: () => void;
}) {
  const button = (
    <Button
      aria-label={label}
      className="size-10"
      disabled={disabled}
      onClick={onActivate}
      size="icon-sm"
      variant="ghost"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
  return (
    <Tooltip>
      {disabled ? (
        <TooltipTrigger render={<span className="director-artifact-tooltip-anchor" />}>
          {button}
        </TooltipTrigger>
      ) : (
        <TooltipTrigger
          render={
            <Button
              aria-label={label}
              className="size-10"
              onClick={onActivate}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <Icon aria-hidden="true" />
        </TooltipTrigger>
      )}
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Whether an arrow key belongs to the browser rather than to the document.
 *
 * The header's own controls answer arrow keys as navigation. Inside the
 * rendered artifact, a tab list, a link, or any other focusable control owns
 * its arrow keys, so the browser leaves them alone.
 */
function artifactBrowserTakesArrowKey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return true;
  }
  if (target.closest("[data-artifact-document]") === null) {
    return !(
      target.matches("[data-slot='scroll-area-viewport']") ||
      target.closest("[data-slot='scroll-area-scrollbar']") !== null
    );
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

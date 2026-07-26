import type { WorkstreamArtifact } from "@generated/backend";
import { ChevronLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { Suspense, lazy, type KeyboardEvent } from "react";

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

import { useArtifactDocument, type DirectorArtifactBrowser } from "./director-artifact-browser";

const SettaArtifactRenderer = lazy(async () => ({
  default: (await import("../artifacts/SettaArtifactRenderer")).SettaArtifactRenderer,
}));

export function ArtifactBrowserOverlaySlot({ browser }: { browser: DirectorArtifactBrowser }) {
  if (browser.activeArtifact === null) {
    return null;
  }
  return <ArtifactBrowserOverlay artifact={browser.activeArtifact} browser={browser} />;
}

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
function ArtifactBrowserOverlay({
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
              <DialogTitle className="director-artifact-browser-title">
                {artifact.title}
              </DialogTitle>
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
                          size="icon-sm"
                          variant="ghost"
                        />
                      }
                    />
                  }
                >
                  <X />
                </TooltipTrigger>
                <TooltipContent>Close artifact browser</TooltipContent>
              </Tooltip>
            </div>
          </DialogHeader>
          <span aria-live="polite" className="sr-only" role="status">
            {`${artifact.title}, ${position}`}
          </span>
          <ScrollArea className="director-artifact-browser-scroll">
            <div className="director-artifact-browser-document" data-artifact-document="true">
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
        <Suspense fallback={<ArtifactBrowserStatus text="Loading artifact." />}>
          <SettaArtifactRenderer
            artifactId={artifact.id}
            document={document.entry.artifact.document}
          />
        </Suspense>
      );
    case "failed":
      return (
        <p className="director-artifact-browser-status" role="alert">
          Setta could not open this artifact. Try again.
        </p>
      );
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
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            disabled={disabled}
            onClick={onActivate}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Icon />
      </TooltipTrigger>
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
    return true;
  }
  return (
    target.closest(
      "a, button, input, textarea, select, [contenteditable='true'], [role='tab'], [role='slider']",
    ) === null
  );
}

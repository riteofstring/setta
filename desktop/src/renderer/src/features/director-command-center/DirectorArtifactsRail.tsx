import type {
  ApprovalRequest,
  ArtifactStatus,
  ResourceRequest,
  WorkstreamArtifact,
} from "@generated/backend";
import { PreviewCard } from "@base-ui/react/preview-card";
import arrowUpRightFillIcon from "@phosphor-icons/core/fill/arrow-up-right-fill.svg";
import fileTextFillIcon from "@phosphor-icons/core/fill/file-text-fill.svg";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import { Button } from "@renderer/components/ui/button";
import { TooltipProvider } from "@renderer/components/ui/tooltip";

import { DirectorArtifactPreviewCard } from "./DirectorArtifactPreviewCard";
import { directorRailArtifacts, type DirectorArtifactBrowser } from "./director-artifact-browser";
import { useDirectorRailArrivalKeys } from "./director-rail-arrivals";

const artifactArrivalLabels = {
  available: "Artifact ready",
  declared: "Artifact declared",
  unresolved: "Artifact pending",
} as const satisfies Record<ArtifactStatus, string>;

/**
 * The Artifacts rail lists what the work produced, and nothing else.
 *
 * Approvals and resource requests used to sit above the list. They are things
 * the Director is waiting on, not things it made, and stacking them here both
 * buried the newest artifact and turned the rail into a general panel. They now
 * live above the composer; see `DirectorPendingActions`.
 *
 * An empty rail is empty. The mockup has no "no artifacts yet" line, because a
 * rail with nothing in it already says so.
 */
export function ArtifactsRail({
  approvals,
  artifactBrowser,
  artifacts,
  requests,
  visible,
}: {
  approvals: readonly ApprovalRequest[];
  artifactBrowser: DirectorArtifactBrowser;
  artifacts: readonly WorkstreamArtifact[];
  requests: readonly ResourceRequest[];
  visible: boolean;
}) {
  const railArtifacts = directorRailArtifacts(artifacts);
  const arrivingIds = useDirectorRailArrivalKeys(railArtifacts.map((artifact) => artifact.id));
  return (
    <aside aria-label="Artifacts" className="director-artifacts-rail" id="director-artifacts-rail">
      <span aria-atomic="true" className="sr-only" role="status">
        {directorRailArrivalAnnouncement(approvals, requests, artifacts)}
      </span>
      <TooltipProvider delay={120}>
        <div
          aria-hidden={!visible || undefined}
          className="director-rail-expanded-content"
          inert={!visible || undefined}
        >
          <p
            aria-hidden={railArtifacts.length === 0 || undefined}
            className="director-rail-kicker"
            data-visible={railArtifacts.length > 0 ? "true" : "false"}
          >
            Artifacts
          </p>
          <div className="director-artifact-gallery">
            {railArtifacts.map((artifact) => (
              <DirectorArtifactPreviewCard
                artifact={artifact}
                arriving={arrivingIds.has(artifact.id)}
                documents={artifactBrowser.documents}
                isActive={artifactBrowser.activeArtifact?.id === artifact.id}
                isOpening={artifactBrowser.pendingArtifactId === artifact.id}
                key={artifact.id}
                onOpen={artifactBrowser.open}
                onPrepare={artifactBrowser.prepare}
              />
            ))}
          </div>
        </div>
        <div
          aria-hidden={visible || undefined}
          aria-label="Recent artifacts"
          className="director-rail-minimized director-artifacts-minimized"
          inert={visible || undefined}
          role="group"
        >
          {railArtifacts.map((artifact, index) => (
            <DirectorMinimizedArtifact
              artifact={artifact}
              artifactBrowser={artifactBrowser}
              arriving={arrivingIds.has(artifact.id)}
              key={artifact.id}
              latest={index === 0}
            />
          ))}
        </div>
      </TooltipProvider>
    </aside>
  );
}

/**
 * A minimized artifact is a real preview card rather than an interactive
 * control smuggled into a tooltip. Hover or focus reveals it; clicking either
 * the marker or its explicit action opens the prepared document.
 */
function DirectorMinimizedArtifact({
  artifact,
  artifactBrowser,
  arriving,
  latest,
}: {
  artifact: WorkstreamArtifact;
  artifactBrowser: DirectorArtifactBrowser;
  arriving: boolean;
  latest: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const canOpen = artifact.status === "available" && artifactBrowser.documents !== null;
  const opening = artifactBrowser.pendingArtifactId === artifact.id;
  const openDisabled = artifactOpenDisabled(canOpen, opening);
  useEffect(() => {
    if (opening) {
      setPreviewOpen(false);
    }
  }, [opening]);
  const openArtifact = (): void => {
    if (canOpen && !opening && triggerRef.current !== null) {
      setPreviewOpen(false);
      artifactBrowser.open(artifact, triggerRef.current);
    }
  };
  const label = minimizedArtifactLabel(artifact, canOpen);

  return (
    <PreviewCard.Root onOpenChange={setPreviewOpen} open={previewOpen} triggerId={triggerId}>
      <PreviewCard.Trigger
        closeDelay={160}
        delay={120}
        id={triggerId}
        render={
          <button
            aria-busy={optionalTrue(opening)}
            aria-label={label}
            className="director-rail-minimized-marker director-artifact-minimized-marker"
            data-artifact-opening={optionalTrue(opening)}
            data-artifact-status={artifact.status}
            data-rail-arriving={arriving ? "true" : undefined}
            data-rail-latest={latest ? "true" : "false"}
            onFocus={() => artifactBrowser.prepare(artifact)}
            onClick={openArtifact}
            onPointerEnter={() => artifactBrowser.prepare(artifact)}
            ref={triggerRef}
            type="button"
          />
        }
      >
        <span
          aria-hidden="true"
          className="director-artifact-minimized-icon"
          style={
            {
              WebkitMaskImage: `url("${fileTextFillIcon}")`,
              maskImage: `url("${fileTextFillIcon}")`,
            } satisfies CSSProperties
          }
        />
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          align="start"
          className="director-artifact-peek-positioner"
          collisionPadding={16}
          side="left"
          sideOffset={12}
        >
          <PreviewCard.Popup className="director-artifact-peek">
            <DirectorArtifactPreviewCard
              artifact={artifact}
              arriving={false}
              documents={artifactBrowser.documents}
              isActive={false}
              isOpening={opening}
              onOpen={artifactBrowser.open}
              onPrepare={artifactBrowser.prepare}
              previewOnly
            />
            <footer className="director-artifact-peek-footer">
              <Button
                className="director-artifact-peek-open"
                disabled={openDisabled}
                onClick={openArtifact}
                size="sm"
                type="button"
                variant="ghost"
              >
                <span>{minimizedArtifactActionLabel(canOpen, opening)}</span>
                <span
                  aria-hidden="true"
                  className="director-artifact-peek-open-icon"
                  style={
                    {
                      WebkitMaskImage: `url("${arrowUpRightFillIcon}")`,
                      maskImage: `url("${arrowUpRightFillIcon}")`,
                    } satisfies CSSProperties
                  }
                />
              </Button>
            </footer>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

function artifactOpenDisabled(canOpen: boolean, opening: boolean): boolean {
  return !canOpen || opening;
}

function minimizedArtifactLabel(artifact: WorkstreamArtifact, canOpen: boolean): string {
  return canOpen
    ? `Open artifact: ${artifact.title}`
    : `Preview unavailable artifact: ${artifact.title}`;
}

function minimizedArtifactActionLabel(canOpen: boolean, opening: boolean): string {
  if (opening) {
    return "Preparing…";
  }
  return canOpen ? "Open artifact" : "Not available";
}

function optionalTrue(value: boolean): true | undefined {
  return value ? true : undefined;
}

export function directorRailArrivalAnnouncement(
  approvals: readonly ApprovalRequest[],
  requests: readonly ResourceRequest[],
  artifacts: readonly WorkstreamArtifact[],
): string {
  const arrivals = [
    ...approvals.map((approval) => ({
      announcedAt: approval.requestedAt,
      text: `Approval waiting: ${approval.publicSummary}`,
    })),
    ...requests.map((request) => ({
      announcedAt: request.requestedAt,
      text: `Resource waiting: ${request.publicSummary}`,
    })),
    ...artifacts.map((artifact) => ({
      announcedAt: artifact.updatedAt,
      text: `${artifactArrivalLabels[artifact.status]}: ${artifact.title}`,
    })),
  ];
  let latest: (typeof arrivals)[number] | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  for (const arrival of arrivals) {
    const timestamp = Date.parse(arrival.announcedAt);
    if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
      latest = arrival;
      latestTimestamp = timestamp;
    }
  }
  return latest?.text ?? "";
}

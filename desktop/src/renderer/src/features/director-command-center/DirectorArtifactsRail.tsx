import type {
  ApprovalRequest,
  ArtifactStatus,
  ResourceRequest,
  WorkstreamArtifact,
} from "@generated/backend";

import { TooltipProvider } from "@renderer/components/ui/tooltip";

import { DirectorArtifactPreviewCard } from "./DirectorArtifactPreviewCard";
import { directorRailArtifacts, type DirectorArtifactBrowser } from "./director-artifact-browser";

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
}: {
  approvals: readonly ApprovalRequest[];
  artifactBrowser: DirectorArtifactBrowser;
  artifacts: readonly WorkstreamArtifact[];
  requests: readonly ResourceRequest[];
}) {
  return (
    <aside aria-label="Artifacts" className="director-artifacts-rail" id="director-artifacts-rail">
      <span aria-atomic="true" className="sr-only" role="status">
        {directorRailArrivalAnnouncement(approvals, requests, artifacts)}
      </span>
      <p className="director-rail-kicker">Artifacts</p>
      <TooltipProvider>
        <div className="director-artifact-gallery">
          {directorRailArtifacts(artifacts).map((artifact) => (
            <DirectorArtifactPreviewCard
              artifact={artifact}
              documents={artifactBrowser.documents}
              isActive={artifactBrowser.activeArtifact?.id === artifact.id}
              isOpening={artifactBrowser.pendingArtifactId === artifact.id}
              key={artifact.id}
              onOpen={artifactBrowser.open}
            />
          ))}
        </div>
      </TooltipProvider>
    </aside>
  );
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

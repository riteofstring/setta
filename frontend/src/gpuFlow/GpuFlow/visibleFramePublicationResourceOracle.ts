import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { SurfaceResourceHandle } from "../surfaceCompositor/surfaceCoverage";
import type { GpuFlowBlockedVisibleReason } from "./visibleFramePublicationTokens";

export type GpuFlowVisiblePublicationResourceProtectionReport = {
  readonly missingResourceKeys: readonly string[];
  readonly protected: boolean;
  readonly protectedResourceKeys: readonly string[];
  readonly requiredResourceKeys: readonly string[];
};

export function createGpuFlowVisiblePublicationResourceProtectionReport(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
): GpuFlowVisiblePublicationResourceProtectionReport {
  if (committedFrame === null) {
    return createGpuFlowVisiblePublicationResourceProtectionReportFromKeys({
      protectedResourceKeys: [],
      requiredResourceKeys: [],
    });
  }
  return createGpuFlowVisiblePublicationResourceProtectionReportFromKeys({
    protectedResourceKeys:
      createGpuFlowVisiblePublicationProtectedResourceKeys(committedFrame),
    requiredResourceKeys:
      createGpuFlowVisiblePublicationRequiredResourceKeys(committedFrame),
  });
}

export function createGpuFlowVisiblePublicationResourceBlockedReasons(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly GpuFlowBlockedVisibleReason[] {
  return Object.freeze(
    createGpuFlowVisiblePublicationResourceProtectionReport(committedFrame)
      .missingResourceKeys.map((resourceKey) =>
        Object.freeze({
          actorId: null,
          family: "resource-protection",
          reason: `missing-protected-resource:${resourceKey}`,
        }),
      ),
  );
}

export function assertGpuFlowVisiblePublicationResourcesProtected(
  report: GpuFlowVisiblePublicationResourceProtectionReport,
): void {
  if (report.protected) {
    return;
  }
  throw new Error(
    `GPU Flow visible publication oracle requires protected resources for all actor proofs: ${report.missingResourceKeys.join(
      ", ",
    )}.`,
  );
}

function createGpuFlowVisiblePublicationResourceProtectionReportFromKeys({
  protectedResourceKeys,
  requiredResourceKeys,
}: {
  readonly protectedResourceKeys: readonly string[];
  readonly requiredResourceKeys: readonly string[];
}): GpuFlowVisiblePublicationResourceProtectionReport {
  const protectedResourceKeySet = new Set(protectedResourceKeys);
  const missingResourceKeys = [
    ...new Set(
      requiredResourceKeys.filter(
        (resourceKey) => !protectedResourceKeySet.has(resourceKey),
      ),
    ),
  ];
  return Object.freeze({
    missingResourceKeys: Object.freeze(missingResourceKeys),
    protected: missingResourceKeys.length === 0,
    protectedResourceKeys: Object.freeze([...new Set(protectedResourceKeys)]),
    requiredResourceKeys: Object.freeze([...new Set(requiredResourceKeys)]),
  });
}

function createGpuFlowVisiblePublicationRequiredResourceKeys(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return createGpuFlowVisiblePublicationResourceKeys(
    getGpuFlowVisiblePublicationRequiredResourceHandles(committedFrame),
  );
}

function createGpuFlowVisiblePublicationProtectedResourceKeys(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return createGpuFlowVisiblePublicationResourceKeys([
    ...(committedFrame.surfaceTransaction?.protectedResourceHandles ?? []),
    ...(committedFrame.surfaceTransaction?.coverageProof
      .protectedResourceHandles ?? []),
  ]);
}

function getGpuFlowVisiblePublicationRequiredResourceHandles(
  committedFrame: GpuFlowCommittedSurfaceFrame,
): readonly SurfaceResourceHandle[] {
  return [
    ...committedFrame.actorGenerations.flatMap((actor) => [
      ...(actor.browserVisual?.resourceHandles ?? []),
      ...(actor.textCoverageProof?.projectionCoverage === "compatible-previous"
        ? actor.textCoverageProof.compatiblePreviousProof.resourceHandles
        : []),
    ]),
    ...(committedFrame.surfaceTransaction?.coverageProof.exactCoverage.flatMap(
      (entry) => entry.resourceHandles,
    ) ?? []),
    ...(committedFrame.surfaceTransaction?.coverageProof.compatibleCoverage.flatMap(
      (entry) => entry.resourceHandles,
    ) ?? []),
  ];
}

function createGpuFlowVisiblePublicationResourceKeys(
  resourceHandles: readonly SurfaceResourceHandle[],
): readonly string[] {
  return resourceHandles.map(createGpuFlowVisiblePublicationResourceKey);
}

function createGpuFlowVisiblePublicationResourceKey(
  handle: SurfaceResourceHandle,
): string {
  return `${handle.kind}:${handle.id}`;
}

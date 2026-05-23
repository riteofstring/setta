import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  ProtectedSurfaceResourceHandle,
  SurfaceResourceHandle,
} from "../surfaceCompositor/surfaceCoverage";
import {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisiblePublicationResourceBlockedReasons,
  createGpuFlowVisiblePublicationResourceProtectionDigest,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceRegistry";

describe("GPU Flow visible frame resource registry proofs", () => {
  it("reports null frames as protected empty resource sets", () => {
    expect(
      createGpuFlowVisiblePublicationResourceProtectionReport(null),
    ).toEqual({
      missingResourceKeys: [],
      protected: true,
      protectedResourceKeys: [],
      requiredResourceKeys: [],
    });
  });

  it("derives required and protected resources from one transaction oracle surface", () => {
    const actorTexture = resourceHandle("texture", "actor-texture");
    const previousSource = resourceHandle("source", "previous-source");
    const exactPage = resourceHandle("page", "exact-page");
    const compatiblePage = resourceHandle("page", "compatible-page");
    const frame = committedSurfaceFrame({
      actorResourceHandles: [actorTexture],
      compatiblePreviousResourceHandles: [previousSource],
      compatibleSurfaceResourceHandles: [compatiblePage],
      exactSurfaceResourceHandles: [exactPage],
      protectedResourceHandles: [
        protectedResource(actorTexture),
        protectedResource(previousSource),
        protectedResource(exactPage),
      ],
    });

    expect(
      createGpuFlowVisiblePublicationResourceProtectionReport(frame),
    ).toEqual({
      missingResourceKeys: ["page:compatible-page"],
      protected: false,
      protectedResourceKeys: [
        "texture:actor-texture",
        "source:previous-source",
        "page:exact-page",
      ],
      requiredResourceKeys: [
        "texture:actor-texture",
        "source:previous-source",
        "page:exact-page",
        "page:compatible-page",
      ],
    });
  });

  it("turns missing protected resources into blocked visible reasons", () => {
    const frame = committedSurfaceFrame({
      actorResourceHandles: [resourceHandle("texture", "actor-texture")],
      protectedResourceHandles: [],
    });

    expect(createGpuFlowVisiblePublicationResourceBlockedReasons(frame)).toEqual([
      {
        actorId: null,
        family: "resource-protection",
        reason: "missing-protected-resource:texture:actor-texture",
      },
    ]);
  });

  it("rejects commit protection reports with missing resources", () => {
    const report = createGpuFlowVisiblePublicationResourceProtectionReport(
      committedSurfaceFrame({
        actorResourceHandles: [resourceHandle("source", "source-a")],
        protectedResourceHandles: [],
      }),
    );

    expect(() =>
      assertGpuFlowVisiblePublicationResourcesProtected(report),
    ).toThrow(/requires protected resources.*source:source-a/);
  });

  it("creates stable resource protection digests for oracle commit proofs", () => {
    const report = createGpuFlowVisiblePublicationResourceProtectionReport(
      committedSurfaceFrame({
        actorResourceHandles: [resourceHandle("source", "source-b")],
        protectedResourceHandles: [
          protectedResource(resourceHandle("source", "source-b")),
          protectedResource(resourceHandle("texture", "extra-texture")),
        ],
      }),
    );

    expect(createGpuFlowVisiblePublicationResourceProtectionDigest(report)).toBe(
      JSON.stringify({
        missingResourceKeys: [],
        protected: true,
        protectedResourceKeys: ["source:source-b", "texture:extra-texture"],
        requiredResourceKeys: ["source:source-b"],
      }),
    );
  });
});

function committedSurfaceFrame({
  actorResourceHandles = [],
  compatiblePreviousResourceHandles = [],
  compatibleSurfaceResourceHandles = [],
  exactSurfaceResourceHandles = [],
  protectedResourceHandles = [],
}: {
  readonly actorResourceHandles?: readonly SurfaceResourceHandle[] | undefined;
  readonly compatiblePreviousResourceHandles?:
    | readonly SurfaceResourceHandle[]
    | undefined;
  readonly compatibleSurfaceResourceHandles?:
    | readonly SurfaceResourceHandle[]
    | undefined;
  readonly exactSurfaceResourceHandles?: readonly SurfaceResourceHandle[] | undefined;
  readonly protectedResourceHandles?:
    | readonly ProtectedSurfaceResourceHandle[]
    | undefined;
}): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [
      {
        browserVisual: {
          resourceHandles: actorResourceHandles,
        },
        textCoverageProof: {
          compatiblePreviousProof: {
            resourceHandles: compatiblePreviousResourceHandles,
          },
          projectionCoverage: "compatible-previous",
        },
      },
    ],
    surfaceTransaction: {
      coverageProof: {
        compatibleCoverage: [
          {
            resourceHandles: compatibleSurfaceResourceHandles,
          },
        ],
        exactCoverage: [
          {
            resourceHandles: exactSurfaceResourceHandles,
          },
        ],
        protectedResourceHandles,
      },
      protectedResourceHandles,
    },
  } as unknown as GpuFlowCommittedSurfaceFrame;
}

function resourceHandle(
  kind: SurfaceResourceHandle["kind"],
  id: string,
): SurfaceResourceHandle {
  return { id, kind };
}

function protectedResource(
  handle: SurfaceResourceHandle,
): ProtectedSurfaceResourceHandle {
  return {
    ...handle,
    reason: "published-transaction",
  };
}

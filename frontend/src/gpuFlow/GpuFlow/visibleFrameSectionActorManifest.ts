import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import { createSectionStructureActors } from "../committedSurfaceSectionActors";
import {
  getGpuFlowBrowserStyleVisibleFrameActorFamily,
  type GpuFlowBrowserStyleVisibleFrameActorFamily,
} from "./visibleFrameActorRegistry";

export type GpuFlowMissingSectionStructureActorManifestEntry = {
  readonly actorId: string;
  readonly family: GpuFlowBrowserStyleVisibleFrameActorFamily;
  readonly reason: "missing-section-structure-actor";
};

export function createGpuFlowMissingSectionStructureActorManifestEntries(
  frame: GpuFlowCommittedSurfaceFrame,
): readonly GpuFlowMissingSectionStructureActorManifestEntry[] {
  const retainedRuntimeFrame = frame.retainedRuntimeFrame;
  if (!retainedRuntimeFrame) {
    return Object.freeze([]);
  }
  const existingActorKeys = new Set(
    frame.actorGenerations.map((actor) =>
      createGpuFlowSectionStructureActorManifestKey({
        actorFamily: actor.actorFamily,
        actorId: actor.actorId,
      }),
    ),
  );
  return Object.freeze(
    createSectionStructureActors(retainedRuntimeFrame)
      .filter((actor) => actor.visibleNonempty)
      .filter(
        (actor) =>
          !existingActorKeys.has(
            createGpuFlowSectionStructureActorManifestKey({
              actorFamily: actor.actorFamily,
              actorId: actor.actorId,
            }),
          ),
      )
      .map((actor) =>
        Object.freeze({
          actorId: actor.actorId,
          family: getGpuFlowBrowserStyleVisibleFrameActorFamily(actor),
          reason: "missing-section-structure-actor" as const,
        }),
      ),
  );
}

function createGpuFlowSectionStructureActorManifestKey({
  actorFamily,
  actorId,
}: {
  readonly actorFamily: string;
  readonly actorId: string;
}): string {
  return `${actorFamily}:${actorId}`;
}

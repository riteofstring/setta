import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";
import type { GpuEdgeScene } from "../edges/edgeSources";

export function resolveGpuFlowEdgeDrawInputs({
  edgeScene,
  edges,
}: {
  readonly edgeScene?: GpuEdgeScene | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
}): readonly GpuEdgeBufferInput[] | undefined {
  if (edgeScene && edges) {
    throw new Error(
      "Setta GPU flow accepts either edgeScene or edges, not both.",
    );
  }
  return edgeScene?.edges ?? edges;
}

export function validateGpuFlowEdgeInput({
  edgeInteraction,
  edgeReconnect,
  edgeScene,
  edges,
}: {
  readonly edgeInteraction: unknown;
  readonly edgeReconnect: unknown;
  readonly edgeScene?: GpuEdgeScene | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
}) {
  resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
  if (edgeInteraction && !edgeScene) {
    throw new Error("Setta GPU flow edge interaction requires a GpuEdgeScene.");
  }
  if (edgeReconnect && !edgeScene) {
    throw new Error("Setta GPU flow edge reconnect requires a GpuEdgeScene.");
  }
}

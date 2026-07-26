import { useCallback, useMemo } from "react";

import type { DirectorIntent, DirectorReceipt, DirectorSnapshot } from "@generated/backend";
import { emptyPackedGraphSnapshot } from "../director-graph/packed-graph-snapshot";
import {
  directorPresentationFor,
  packSemanticGraphComposition,
  semanticGraphTimeOriginSeconds,
  type SemanticGraphPresentation,
} from "../director-graph/semantic-graph-packer";
import { selectViewIntent } from "./DirectorWorkstreamNavigation";

/**
 * The Director's own lane. It is a graph in the composition but not a
 * workstream, so clicking it means "no workstream in focus" rather than a
 * thread to open.
 */
const directorGraphLaneId = "director";

/**
 * How the canvas should draw what it was given, and what a click on it does.
 *
 * Both answers come from the same fact — whether a workstream is selected — so
 * they are decided together rather than rediscovered at each call site.
 */
export function useDirectorGraphPresentation({
  columnCount,
  dispatch,
  snapshot,
}: {
  columnCount: number;
  dispatch: (intent: DirectorIntent) => Promise<DirectorReceipt>;
  snapshot: DirectorSnapshot | null;
}): {
  openWorkstream: (workstreamId: string) => void;
  presentation: SemanticGraphPresentation;
} {
  const selectedWorkstreamId = snapshot === null ? null : snapshot.selectedWorkstreamId;
  const presentation = useMemo(
    () => directorPresentationFor(columnCount, selectedWorkstreamId),
    [columnCount, selectedWorkstreamId],
  );
  const openWorkstream = useCallback(
    (workstreamId: string) => {
      void dispatch(selectViewIntent(workstreamId === directorGraphLaneId ? null : workstreamId));
    },
    [dispatch],
  );
  return { openWorkstream, presentation };
}

/*
 * The canvas draws the view you are on.
 *
 * The Director's view is the whole constellation — every workstream at once,
 * and its own lane with them — because that is what the Director sees. A
 * workstream's view is that workstream alone.
 *
 * The composition used to be permanent, which is why selection had no visible
 * consequence here and why the canvas failing to follow it had no agreed fix:
 * there was no answer to what it should show.
 */
/*
 * What the canvas is currently drawing, named.
 *
 * The canvas resets its camera when this changes and keeps it when it does not,
 * which is right: a camera should follow new content rather than stay pointed
 * where the last content was. Every view used to pack under one constant name,
 * which was harmless while the composition never changed — and wrong the moment
 * it started following selection, because switching views left the camera
 * framing a region the new view has nothing in.
 */
function directorGraphCompositionId(selectedWorkstreamId: string | null): string {
  return selectedWorkstreamId === null
    ? "director-command-center"
    : `director-command-center:${selectedWorkstreamId}`;
}

export function packDirectorGraphs(
  graphs: DirectorSnapshot["graphs"] | undefined,
  selectedWorkstreamId: string | null,
) {
  const composed = graphs ?? [];
  const visible =
    selectedWorkstreamId === null
      ? composed
      : composed.filter((graph) => graph.workstreamId === selectedWorkstreamId);
  const compositionId = directorGraphCompositionId(selectedWorkstreamId);
  if (visible.length === 0) {
    return emptyPackedGraphSnapshot(compositionId);
  }
  return packSemanticGraphComposition({
    graphs: visible,
    presentation: directorPresentationFor(visible.length, selectedWorkstreamId),
    workstreamId: compositionId,
  });
}

export function directorGraphTimeSecondsAt(
  snapshot: DirectorSnapshot | null,
  frameAnchorMs = globalThis.performance?.now() ?? 0,
): (timestampMs: number) => number {
  const graphs = snapshot?.graphs ?? [];
  const origin = semanticGraphTimeOriginSeconds(graphs);
  if (snapshot === null || origin === null) {
    return (timestampMs) => Math.max(0, timestampMs - frameAnchorMs) / 1000;
  }
  const committedAt = latestDirectorGraphTimeSeconds(snapshot, origin);
  const relativeAtAnchor = Math.max(0, committedAt - origin);
  return (timestampMs) => relativeAtAnchor + (timestampMs - frameAnchorMs) / 1000;
}

function latestDirectorGraphTimeSeconds(snapshot: DirectorSnapshot, fallback: number): number {
  let latest = timestampSeconds(snapshot.connection.lastEventAt) ?? fallback;
  for (const graph of snapshot.graphs) {
    for (const node of graph.nodes) {
      latest = Math.max(
        latest,
        timestampSeconds(node.createdAt) ?? fallback,
        timestampSeconds(node.updatedAt) ?? fallback,
        timestampSeconds(node.completedAt) ?? fallback,
      );
    }
  }
  return latest;
}

function timestampSeconds(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

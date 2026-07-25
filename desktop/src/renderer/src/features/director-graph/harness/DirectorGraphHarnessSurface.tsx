/**
 * The harness page's only component: a fullscreen graph and nothing else.
 *
 * Deliberately not the app shell. Phase 2 measures the standalone renderer, so
 * anything else on the page — a store, a rail, a composer — would land in the
 * frame samples and in the pixel check without being part of what is being
 * measured. The Phase 4 shell mounts the same `DirectorGraphSurface` next to
 * the rails; this mounts it alone.
 */

import { useCallback, useEffect, useState } from "react";

import { DirectorGraphSurface } from "../render/DirectorGraphSurface";
import type { DirectorGraphCanvas } from "../render/director-graph-canvas";
import type { GraphReplayClock } from "./director-graph-harness";

export interface DirectorGraphHarnessSurfaceProps {
  readonly clock: GraphReplayClock;
  readonly onCanvas: (canvas: DirectorGraphCanvas | null) => void;
}

export function DirectorGraphHarnessSurface({
  clock,
  onCanvas,
}: DirectorGraphHarnessSurfaceProps): React.JSX.Element {
  const [mounted, setMounted] = useState(false);
  const timeSecondsAt = useCallback((timestampMs: number) => clock.secondsAt(timestampMs), [clock]);
  const onReady = useCallback(
    (canvas: DirectorGraphCanvas | null) => {
      onCanvas(canvas);
      setMounted(canvas !== null);
    },
    [onCanvas],
  );
  useEffect(() => {
    document.title = "Setta";
  }, []);
  return (
    <main className="director-graph-harness" data-harness-ready={mounted ? "true" : "false"}>
      <DirectorGraphSurface
        timeSecondsAt={timeSecondsAt}
        onReady={onReady}
        label="Director graph fixture harness"
      />
    </main>
  );
}

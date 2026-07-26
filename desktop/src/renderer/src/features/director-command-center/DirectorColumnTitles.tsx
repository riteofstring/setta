import type { DirectorSnapshot } from "@generated/backend";
import { useEffect, useRef, useState } from "react";

import { graphFitFrame, graphWarpToScreen } from "../director-graph/render/graph-visual-language";
import { workstreamLane } from "../director-graph/semantic-graph-packer";
import { directorGraphLaneId } from "./director-graph-presentation";

/**
 * The mockup's column titles: each thread named above its column, tracked and
 * quiet, with the Director's own lane in its role colour. They are DOM over
 * the canvas like every label, positioned with the packer's own lane formula
 * and the shared barrel warp so a title sits over the column it names at any
 * viewport.
 *
 * Columns only. A conversation has its name in the top bar, and the grid's
 * tiles move in world space where a fixed DOM row would detach from them.
 */
export function DirectorColumnTitles({
  graphs,
  snapshot,
}: {
  graphs: DirectorSnapshot["graphs"];
  snapshot: DirectorSnapshot | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const measure = (): void => {
      setSize({ width: host.clientWidth, height: host.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => {
      observer.disconnect();
    };
  }, []);

  const titles = graphs.map((graph) => columnTitle(graph.workstreamId, snapshot));
  return (
    <div aria-hidden="true" className="director-column-titles" ref={hostRef}>
      {size === null
        ? null
        : titles.map((title, index) => {
            const fit = graphFitFrame(size.width, size.height);
            const laneClip = workstreamLane(index, titles.length);
            const x = (laneClip * fit.fitX * 0.5 + 0.5) * size.width;
            const warped = graphWarpToScreen(x, columnTitleTopPx, size.width, size.height);
            /*
             * A title owns its column's width and no more. Neighbouring lanes
             * sit one lane-spacing apart, so a name longer than that pitch
             * ellipsises instead of running into the next column's name.
             */
            const pitchPx =
              titles.length > 1 ? Math.max(64, laneSpacingPx(fit.fitX, size.width) - 20) : 320;
            return (
              <span
                className="director-column-title"
                data-self={index === 0 ? "true" : "false"}
                key={`${index}-${title}`}
                style={{
                  left: `${warped.x}px`,
                  maxInlineSize: `${pitchPx}px`,
                  top: `${warped.y}px`,
                }}
              >
                {title}
              </span>
            );
          })}
    </div>
  );
}

/** Where the title row sits; the mockup hangs its column titles just below the bar. */
const columnTitleTopPx = 64;

/** One lane's pitch on screen — the room a column title may occupy. */
function laneSpacingPx(fitX: number, width: number): number {
  const spacingClip = workstreamLane(1, 2) - workstreamLane(0, 2);
  return spacingClip * fitX * 0.5 * width;
}

function columnTitle(workstreamId: string, snapshot: DirectorSnapshot | null): string {
  if (workstreamId === directorGraphLaneId) {
    return "Director";
  }
  const entry = snapshot?.workstreams.find((candidate) => candidate.workstream.id === workstreamId);
  return entry?.workstream.title ?? workstreamId;
}

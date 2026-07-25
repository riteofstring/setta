import { useCallback, useEffect, useMemo, useState } from "react";

import { projectionGalleryFixtures } from "../projection-gallery-fixtures";
import { packSemanticGraphComposition } from "../semantic-graph-packer";
import { DirectorGraphSurface } from "../render/DirectorGraphSurface";
import type { DirectorGraphCanvas } from "../render/director-graph-canvas";

const galleryClock = {
  secondsAt: (timestampMs: number) => timestampMs / 1000,
};

export function DirectorGraphGallerySurface(): React.JSX.Element {
  const [selectedName, setSelectedName] = useState(projectionGalleryFixtures[0]?.name ?? "");
  const [canvas, setCanvas] = useState<DirectorGraphCanvas | null>(null);
  const selectedFixture =
    projectionGalleryFixtures.find((fixture) => fixture.name === selectedName) ??
    projectionGalleryFixtures[0];
  const snapshot = useMemo(() => {
    if (selectedFixture === undefined) {
      return null;
    }
    return packSemanticGraphComposition({
      workstreamId: selectedFixture.name,
      graphs: selectedFixture.graphs,
    });
  }, [selectedFixture]);

  const onReady = useCallback((host: DirectorGraphCanvas | null) => {
    setCanvas(host);
  }, []);

  useEffect(() => {
    document.title = "Setta Director Graph Gallery";
  }, []);

  useEffect(() => {
    if (canvas === null || snapshot === null) {
      return;
    }
    canvas.setSnapshot(snapshot);
  }, [canvas, snapshot]);

  return (
    <main className="director-graph-gallery">
      <aside className="director-graph-gallery-rail" aria-label="Projection fixtures">
        <div className="director-graph-gallery-heading">Projection Gallery</div>
        <div className="director-graph-gallery-tabs" role="tablist" aria-orientation="vertical">
          {projectionGalleryFixtures.map((fixture) => (
            <button
              aria-selected={fixture.name === selectedFixture?.name}
              className="director-graph-gallery-tab"
              key={fixture.name}
              onClick={() => setSelectedName(fixture.name)}
              role="tab"
              type="button"
            >
              <span>{fixture.name.replaceAll("_", " ")}</span>
              <span>{fixture.graphs.reduce((count, graph) => count + graph.nodes.length, 0)}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="director-graph-gallery-stage" aria-label="Selected projection fixture">
        <DirectorGraphSurface
          timeSecondsAt={galleryClock.secondsAt}
          onReady={onReady}
          label="Director semantic graph projection fixture"
        />
      </section>
    </main>
  );
}
